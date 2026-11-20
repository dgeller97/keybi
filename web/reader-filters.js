import {valueCaption} from "./numeric-bins.js";
import {columnBounds} from "./filter-operators.js";
import {mountValueList,parseBinFilter} from "./filter-values.js";

export function readerFilters({report,page,visual,disabled,lookup,fieldname,valname,ruleFormat,display,readerAccess,comparisons,dialog,esc,loadValues,apply}) {
  const columns=[], measures=[];
  const groups = [["All pages",report],["This page",page],...(visual ? [["This visual",visual]] : [])];
  const sections = groups.map(([name,owner]) => {
    const visible=rule=>readerAccess(owner,rule)!=="hidden";
    const locked=(label,value)=>`<p class="locked-filter">${label} · <b>${esc(value)}</b> <small>Locked</small></p>`;
    const rows = (owner.filters || []).filter(visible).map(rule => {
      const bound=columnBounds[rule.op];
      const label=esc(fieldname(rule.field)+(bound ? " "+bound : ""));
      const column=lookup(rule.field);
      if(readerAccess(owner,rule)==="locked") return locked(label,(rule.op==="in" ? rule.value : [rule.value]).map(v=>valueCaption(v,column)).join(", "));
      if (rule.op && rule.op !== "eq" && rule.op !== "in" && !bound)
        return `<p>${label} · ${esc(rule.op)} · ${esc(JSON.stringify(rule.value))}</p>`;
      const index=columns.length;
      columns.push({rule,column,numeric:column?.numeric,width:column?.binSize,bound});
      if (rule.op==="in") return `<fieldset class="reader-filter"><legend>${label}</legend><div data-filter-values="${index}"></div></fieldset>`;
      return `<div class="reader-filter"><label class="formlabel" for="reader-filter-${index}">${label}</label><select class="control" id="reader-filter-${index}" name="filter-${index}"></select>
        <label class="formlabel" hidden>Exact value for ${label}<input class="control" name="value-${index}"></label></div>`;
    });
    if (owner===visual) for (const rule of (visual.measureFilters || []).filter(visible)) {
      const caption=esc(valname(rule.binding)+" "+comparisons[rule.op]);
      if(readerAccess(owner,rule)==="locked") { rows.push(locked(caption,Number.isFinite(rule.value)?display(rule.value,ruleFormat(rule.binding)):""));continue; }
      if (!Number.isFinite(rule.value)) { rows.push(`<p>${caption}</p>`); continue; }
      const format=ruleFormat(rule.binding), factor=["percent","points"].includes(format) ? 100 : 1;
      const unit=format==="percent" ? " (%)" : format==="points" ? " (pp)" : "";
      const initial=String(Number((rule.value*factor).toPrecision(15)));
      const index=measures.length;measures.push({rule,factor,initial});
      rows.push(`<label class="formlabel">${caption}${unit}<input class="control" type="number" step="any" required name="measure-${index}" value="${initial}"></label>`);
    }
    return rows.length ? `<fieldset><legend>${name}</legend>${rows.join("")}</fieldset>` : "";
  }).join("");
  if (!sections) return dialog("Filters","<p>No filters are available here.</p>");
  const controls=`<div class="reader-filters">${sections}</div>`;
  if (!columns.length && !measures.length) return dialog("Filters",controls);
  dialog("Filters",controls,"Apply",async fd=>{
    const values=await Promise.all(columns.map(async ({numeric,width,options,read,bound},i)=>{
      if (read) return read();
      const key=fd.get("filter-"+i);
      if (key!=="exact") return {all:key==="all",value:options[Number(key)]};
      const raw=fd.get("value-"+i);
      if (width) {
        const value=parseBinFilter(raw,width);
        if (bound && value===null) throw Error("Enter a nonblank bound.");
        return {value};
      }
      const value=numeric ? Number(raw) : raw;
      if (numeric && (!raw.trim() || !Number.isFinite(value))) throw Error("Enter a numeric filter value.");
      return {value};
    }));
    for (const [i,{rule}] of columns.entries()) {
      if (values[i].all) disabled.add(rule);
      else { disabled.delete(rule); rule.value=values[i].value; }
    }
    measures.forEach(({rule,factor,initial},i)=>{
      const value=fd.get("measure-"+i);
      if (value!==initial) rule.value=Number(value)/factor;
    });
    return apply();
  });
  const form=document.querySelector("#dlgform");
  function populate(entry,i,extra=[]) {
    const select=form.elements["filter-"+i],input=form.elements["value-"+i];
    const previous=select.value;
    entry.options=[...new Set([entry.rule.value,null,...extra])].filter(v=>!entry.bound || v!=null);
    select.replaceChildren(new Option("All values","all"),...entry.options.map((v,j)=>
      new Option(valueCaption(v,entry.column),String(j))),new Option("Enter exact value…","exact"));
    select.value=previous || (disabled.has(entry.rule) ? "all" : "0");
    function edit() { input.parentElement.hidden=select.value!=="exact";input.disabled=select.value!=="exact"; }
    select.onchange=edit;edit();
  }
  columns.forEach((entry,i)=>{
    if (entry.rule.op==="in") {
      const {rule,column}=entry;
      entry.read=mountValueList(form.querySelector(`[data-filter-values="${i}"]`),
        {column,values:rule.value,reader:true,all:disabled.has(rule),load:async (offset,search)=>(await loadValues([rule.field],offset,search))[0]});
    } else populate(entry,i);
  });
  const simple=columns.filter(e=>!e.read);
  if (simple.length) {
    const fields=new Map(simple.map(({rule})=>[JSON.stringify([rule.field.t,rule.field.c]),rule.field]));
    const keys=[...fields.keys()];
    loadValues([...fields.values()]).then(results=>{
      if (!form.isConnected) return;
      columns.forEach((entry,i)=>{
        if (entry.read) return;
        const result=results[keys.indexOf(JSON.stringify([entry.rule.field.t,entry.rule.field.c]))];
        if (result?.rows) populate(entry,i,result.rows.map(r=>r[0]));
      });
    }).catch(()=>{}); // Exact entry remains available when suggestions cannot be loaded.
  }
}
