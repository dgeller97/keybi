const kinds = {left:"Left outer · all left rows",right:"Right outer · all right rows",full:"Full outer · all rows from both tables",
  inner:"Inner · matching rows",anti:"Left anti · unmatched left rows",rightanti:"Right anti · unmatched right rows"};
const version = t => t.storageId || t.id;
const revision = t => t.dataRevision || t.id;
const find = (report,id) => report.tables.find(t=>t.id===id);

export function mergeSummary(report,t,esc) {
  const m=t.merge, left=find(report,m.left), right=find(report,m.right);
  if (!left || !right) return '<small class="last-load">Merge source unavailable</small>';
  const changed = revision(left)!==m.revisions[0] || revision(right)!==m.revisions[1];
  const keys = m.keys.map(([a,b])=>left.columns[a]?.name+" = "+right.columns[b]?.name);
  return '<button class="outline" data-refresh-merge="'+esc(t.id)+'">Refresh merge</button>'+
    '<small class="last-load">'+esc(left.name)+' + '+esc(right.name)+' · '+t.rows.toLocaleString()+' rows'+(changed?' · Source changed':'')+'</small>'+
    '<details><summary>Applied steps</summary><p>'+esc(kinds[m.kind])+'</p><p>'+keys.map(esc).join(", ")+'</p>'+
    (m.kind==="anti"?"":"<p>Expand "+m.expand.map(i=>esc(right.columns[i]?.name)).join(", ")+"</p>")+'</details>';
}

export function mergeRequest(owner,spec,name) {
  const left=find(owner,spec.left),right=find(owner,spec.right);
  if (!left || !right || left.source || right.source) throw Error("An imported source is unavailable.");
  return {left:version(left),right:version(right),kind:spec.kind,keys:spec.keys,expand:spec.expand,prefix:spec.prefix,name};
}

export async function applyMerge(owner,spec,name,old,{api,current,change,notify,offsets}) {
  const request=mergeRequest(owner,spec,name);
  const sources=[find(owner,spec.left),find(owner,spec.right)];
  const unchanged=()=>current() && sources.every(t=>owner.tables.includes(t)) && (!old || owner.tables.includes(old));
  const nameTaken=()=>owner.tables.some(t=>t!==old && t.name.toLowerCase()===name.toLowerCase());
  if (!unchanged()) throw Error("Reopen the merge to use the latest source tables.");
  if (nameTaken()) throw Error("Choose a distinct output table name.");
  const next=await api("/api/merge",request);
  const merge={...spec,revisions:sources.map(revision)};
  const replacement={...next,merge};
  if (old) {
    if (old.columns.length!==next.columns.length || old.columns.some((c,i)=>c.name!==next.columns[i].name || c.numeric!==next.columns[i].numeric))
      throw Error("The merged columns changed. Create a new merged table for this schema.");
    Object.assign(replacement,{id:old.id, storageId:next.id, dataRevision:next.id});
    const proposed=owner.tables.map(t=>t===old?replacement:t);
    await Promise.all(owner.links.filter(l=>l.one.t===old.id || l.many.t===old.id).map(l=>api("/api/relationship",l,proposed)));
  }
  if (!unchanged() || nameTaken()) throw Error("The model changed during the merge. Reopen the merge and try again.");
  if (old) owner.tables[owner.tables.indexOf(old)]=replacement;
  else owner.tables.push(replacement);
  offsets.clear();change();
  notify(name+" · "+next.rows.toLocaleString()+" merged rows");
}

export function mergeDialog(owner,{dialog,selectInput,textInput,option,esc,api,commit}) {
  const tables=owner.tables.filter(t=>!t.source);
  const tableOptions=(selected)=>tables.map(t=>option(t.id,t.name,t===selected)).join("");
  const sources='<div class="merge-pair"><div>'+selectInput("Left table","left",tableOptions(tables[0]))+'</div><div>'+
    selectInput("Right table","right",tableOptions(tables[1]||tables[0]))+'</div></div>';
  const body=sources+'<fieldset><legend>Match columns</legend><div data-merge-keys></div><button type="button" class="outline" data-add-key>Add match column</button></fieldset>'+
    selectInput("Join kind","kind",Object.entries(kinds).map(([k,v])=>option(k,v)).join(""))+
    '<fieldset data-expand><legend>Expand from right table</legend><div class="merge-checks"></div><label><input type="checkbox" name="prefix" checked> Prefix with right table name</label></fieldset>'+
    textInput("Output table","output","Merged table")+'<button type="button" class="outline merge-preview-button" data-merge-preview>Preview rows</button><div class="merge-preview" aria-live="polite"></div>';
  dialog("Merge tables",'<div class="merge-form">'+body+'</div>',"Create table",()=>commit(spec(),form.elements.output.value.trim()));
  const form=document.getElementById("dlgform"), controls=form.elements, keys=form.querySelector("[data-merge-keys]");
  const output=form.querySelector(".merge-preview");
  const source=side=>find(owner,controls[side].value);
  let ticket=0;
  const invalidate=()=>{ticket++;output.replaceChildren();};
  function spec() {
    const pairs=[...keys.children].map(row=>[...row.querySelectorAll("select")].map(s=>Number(s.value)));
    return {left:source("left").id,right:source("right").id,keys:pairs,kind:controls.kind.value,
      expand:controls.kind.value==="anti"?[]:[...form.querySelectorAll("[name=expanded]:checked")].map(c=>Number(c.value)),prefix:controls.prefix.checked};
  }
  function addPair() {
    const left=source("left").columns,right=source("right").columns;
    const used=spec().keys,available=left.map((_,i)=>i).filter(i=>!used.some(p=>p[0]===i));
    const free=right.map((_,i)=>i).filter(i=>!used.some(p=>p[1]===i));
    if (!available.length || !free.length) return;
    let a=available.find(i=>free.some(j=>left[i].name.toLowerCase()===right[j].name.toLowerCase() && left[i].numeric===right[j].numeric))??available[0];
    let b=free.find(j=>left[a].name.toLowerCase()===right[j].name.toLowerCase() && left[a].numeric===right[j].numeric)??free.find(j=>left[a].numeric===right[j].numeric)??free[0];
    const options=(cols,chosen)=>cols.map((c,i)=>option(i,c.name,i===chosen)).join("");
    const row=document.createElement("div");row.className="merge-pair key";
    row.innerHTML='<label>Left match column<select>'+options(left,a)+'</select></label><label>Right match column<select>'+options(right,b)+'</select></label>'+
      '<button type="button" class="outline" aria-label="Remove match column">×</button>';
    keys.append(row);
    row.querySelector("button").onclick=()=>{row.remove();keyButtons();invalidate();};
    keyButtons();
  }
  function keyButtons() {
    keys.querySelectorAll("button").forEach(b=>b.disabled=keys.children.length===1);
    form.querySelector("[data-add-key]").disabled=keys.children.length>=Math.min(source("left").columns.length,source("right").columns.length);
  }
  function resetSources() {
    keys.replaceChildren();addPair();
    const right=source("right"), match=spec().keys[0][1];
    form.querySelector(".merge-checks").innerHTML=right.columns.map((c,i)=>'<label><input type="checkbox" name="expanded" value="'+i+'"'+(i!==match?' checked':'')+'> '+esc(c.name)+'</label>').join("");
    invalidate();
  }
  form.oninput=invalidate;
  controls.left.onchange=controls.right.onchange=resetSources;
  controls.kind.onchange=()=>{
    form.querySelector("[data-expand]").hidden=controls.kind.value==="anti";
    if (["right","rightanti","full"].includes(controls.kind.value))
      for (const [,index] of spec().keys) form.querySelector('[name=expanded][value="'+index+'"]').checked=true;
  };
  form.querySelector("[data-add-key]").onclick=()=>{addPair();invalidate();};
  form.querySelector("[data-merge-preview]").onclick=async()=>{
    const n=++ticket;output.textContent="Loading preview…";
    try {
      const request=mergeRequest(owner,spec(),controls.output.value.trim() || "Merged table");
      const data=await api("/api/merge",{...request,preview:true});
      if (n!==ticket || !form.closest("dialog[open]")) return;
      const headings=data.columns.map(c=>'<th>'+esc(c.name)+'</th>').join("");
      const rows=data.rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v??"(Blank)")+'</td>').join("")+'</tr>').join("");
      output.innerHTML='<table class="grid"><caption>'+ (data.rows.length?(data.more?"First 5 rows":data.rows.length+" rows"):"No matching rows")+'</caption><thead><tr>'+headings+'</tr></thead><tbody>'+rows+'</tbody></table>';
    } catch(error) {if(n===ticket) output.textContent=error.message;}
  };
  resetSources();
}
