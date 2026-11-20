// A group field belongs to the model. Member choices span every source page,
// independent of filters applied to the visual where the editor was opened.
export function memberGroupsDialog(source,existing,{dialog,esc,caption,fetchMembers,commit,initialMembers=[]}) {
  const groups=structuredClone(existing?.groups || [{name:"Group 1",members:initialMembers}]);
  let active=0,offset=0,rows=[],more=false,ticket=0;
  const input=(id,label,value)=>'<label class="formlabel" for="'+id+'">'+label+'</label><input class="control" id="'+id+'" type="text" maxlength="160" value="'+esc(value)+'">';
  dialog(existing?"Edit named groups":"Create named groups",
    input("group-field","Group field name",existing?.name || source.name+" (groups)")+
    '<div class="picks"><label class="formlabel" for="group-to-edit">Group to edit</label><select class="control" id="group-to-edit"></select></div>'+
    input("group-label","Group label",groups[0].name)+
    '<div class="buttons"><button type="button" class="outline" id="group-add">Add group</button> <button type="button" class="outline" id="group-remove">Remove group</button></div>'+
    '<label class="formlabel" for="group-find">Find members</label><input class="control" type="search" id="group-find" placeholder="Search '+esc(source.name)+'">'+
    '<div id="group-members" class="group-members" aria-label="Group members"></div><div class="group-pages"><button type="button" class="outline" id="group-prev">Previous values</button><span id="group-count" aria-live="polite"></span><button type="button" class="outline" id="group-next">Next values</button></div>'+
    '<label class="chart-option"><input type="checkbox" id="group-combine" '+(existing?.otherLabel!=null?"checked":"")+'>Combine unassigned values</label>'+
    '<div id="group-other-wrap">'+input("group-other","Other label",existing?.otherLabel ?? "Other")+'</div>',
    "Save groups",()=>{
      const otherLabel=el("group-combine").checked?el("group-other").value.trim():null;
      const names=groups.map(g=>g.name.trim().toLowerCase());
      if(otherLabel!==null)names.push(otherLabel.toLowerCase());
      if(names.some(n=>!n) || new Set(names).size!==names.length)throw Error("Give each group a distinct label.");
      if(groups.some(g=>!g.members.length))throw Error("Select at least one source value in every named group.");
      if(groups.reduce((n,g)=>n+g.members.length,0)>1000)throw Error("Choose up to 1,000 named members.");
      const name=el("group-field").value.trim();
      commit(name,{op:"memberGroups",groups:groups.map(g=>({...g,name:g.name.trim()})),...(otherLabel!=null && {otherLabel})});
    });
  const form=document.querySelector("#dlgform"),el=id=>form.querySelector("#"+id);
  const edit=el("group-to-edit"),label=el("group-label"),list=el("group-members"),search=el("group-find");
  function options(){
    edit.innerHTML=groups.map((g,i)=>'<option value="'+i+'" '+(i===active?"selected":"")+'>'+esc(g.name || "Unnamed group")+'</option>').join("");
    el("group-remove").disabled=groups.length===1;
    el("group-add").disabled=groups.length>=100;
  }
  function members(){
    list.innerHTML=rows.map(([value],i)=>{
      const owner=groups.findIndex(g=>g.members.includes(value));
      const name=caption(value);
      return '<label><input type="checkbox" data-member="'+i+'" aria-label="Include '+esc(name)+'" '+(owner===active?"checked":"")+'><span>'+esc(name)+'</span>'+
        (owner>=0 && owner!==active?'<small>'+esc(groups[owner].name)+'</small>':'')+'</label>';
    }).join("") || '<small>No matching values</small>';
    el("group-count").textContent=rows.length?(offset+1)+"–"+(offset+rows.length):"0 values";
    el("group-prev").disabled=!offset;el("group-next").disabled=!more;
  }
  async function load(){
    const current=++ticket;list.textContent="Loading values…";el("group-prev").disabled=true;el("group-next").disabled=true;
    try {
      const data=await fetchMembers(search.value,offset);
      if(!form.isConnected || current!==ticket)return;
      if(data.error)throw Error(data.error);
      rows=data.rows;more=data.more;members();
    }catch(e){if(current===ticket && form.isConnected){list.textContent=e.message;el("group-prev").disabled=!offset;}}
  }
  edit.onchange=()=>{active=Number(edit.value);label.value=groups[active].name;members();};
  label.oninput=()=>{groups[active].name=label.value;options();};
  el("group-add").onclick=()=>{
    let i=groups.length+1;while(groups.some(g=>g.name==="Group "+i))i++;
    groups.push({name:"Group "+i,members:[]});active=groups.length-1;label.value=groups[active].name;options();members();label.select();
  };
  el("group-remove").onclick=()=>{groups.splice(active,1);active=Math.min(active,groups.length-1);label.value=groups[active].name;options();members();};
  list.onchange=e=>{
    if(!e.target.matches("[data-member]"))return;
    const value=rows[Number(e.target.dataset.member)][0];
    for(const group of groups)group.members=group.members.filter(v=>v!==value);
    if(e.target.checked)groups[active].members.push(value);
    e.target.closest("label").querySelector("small")?.remove();
  };
  search.oninput=()=>{offset=0;load();};
  el("group-prev").onclick=()=>{offset=Math.max(0,offset-50);load();};
  el("group-next").onclick=()=>{offset+=50;load();};
  const other=el("group-other-wrap"),combine=el("group-combine");
  combine.onchange=()=>{other.hidden=!combine.checked;};combine.onchange();
  options();load();
}

