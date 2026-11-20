import {nextValueName,token,tokens} from "./narrative.js";

const aggregates=[["sum","Sum"],["avg","Average"],["min","Minimum"],["max","Maximum"],["count","Count"],["distinctcount","Distinct count"],["median","Median"],["p90","90th percentile"]];
const formats=[["auto","From measure"],["number","Number"],["currency","Currency"],["percent","Percentage"]];
export function editNarrative(v,{dialog,esc,sources,commit}) {
  const bindings=structuredClone(v.metrics);
  const sourceFor=b=>b.measure?"@"+b.measure:b.field.t+"."+b.field.c;
  const options=choices=>choices.map(([key,label])=>'<option value="'+esc(key)+'">'+esc(label)+'</option>').join("");
  const sourceOptions='<option value="">Choose a field or measure</option>'+options(sources.map(s=>[s.key,s.label]));
  const body='<label class="formlabel">Narrative text<textarea class="control" rows="4" maxlength="16000" aria-label="Narrative text" name="story">'+esc(v.narrativeText||"")+'</textarea></label>'+
    '<div class="narrative-values" aria-label="Saved values"></div>'+
    '<div class="narrative-fields"><label class="formlabel">Value source<select class="control" aria-label="Value source" name="source">'+sourceOptions+'</select></label>'+
    '<label class="formlabel">Aggregation<select class="control" aria-label="Aggregation" name="aggregation"></select></label>'+
    '<label class="formlabel">Value name<input class="control" aria-label="Value name" name="valueName" maxlength="80"></label>'+
    '<label class="formlabel">Value format<select class="control" aria-label="Value format" name="format">'+options(formats)+'</select></label></div>'+
    '<button type="button" class="outline" data-store>Insert value</button> <button type="button" class="outline" data-reset hidden>Cancel value edit</button>';
  dialog("Edit narrative",body,"Apply narrative",()=>{
    if(dirty)store();
    const missing=tokens(story.value).find(m=>!bindings.some(b=>b.narrativeLabel===m[1]));
    if(missing)throw Error('Choose a source for “'+missing[1]+'” or remove its placeholder.');
    commit(story.value,bindings);
  });
  const form=document.getElementById("dlgform"),{story,source,aggregation,valueName,format}=form.elements;
  const save=form.querySelector("[data-store]"),reset=form.querySelector("[data-reset]"),values=form.querySelector(".narrative-values"),error=form.querySelector("[role=alert]");
  let editing=-1,dirty=false;
  const current=()=>sources.find(s=>s.key===source.value);
  function updateSource() {
    const src=current();
    aggregation.replaceChildren();
    const allowed=src?.binding.field?(src.numeric?aggregates:aggregates.filter(([id])=>["count","distinctcount"].includes(id))):[];
    for(const [id,label] of allowed)aggregation.add(new Option(label,id));
    aggregation.disabled=!allowed.length;
    save.disabled=!src;
    if(!allowed.length)aggregation.add(new Option("From measure",""));
    return src;
  }
  function clear() {
    editing=-1;source.value="";valueName.value="";format.value="auto";updateSource();
    dirty=false;save.textContent="Insert value";reset.hidden=true;
  }
  function insert(label) {
    story.setRangeText(token(label),story.selectionStart,story.selectionEnd,"end");story.focus();
  }
  function refresh() {
    values.innerHTML=bindings.map((b,i)=>{
      const name=esc(b.narrativeLabel);
      return '<span class="value-actions"><button type="button" class="outline" data-insert="'+i+'" aria-label="Insert '+name+'">'+name+'</button>'+
        '<button type="button" class="outline" data-edit="'+i+'" aria-label="Edit '+name+'" title="Edit '+name+'">Edit</button>'+
        '<button type="button" class="outline" data-remove="'+i+'" aria-label="Remove '+name+'" title="Remove '+name+'">×</button></span>';
    }).join("");
  }
  function store() {
    const src=current(),name=valueName.value.trim();
    if(!src)throw Error("Choose a field or measure.");
    if(!name || /[{}\r\n]/.test(name))throw Error("Enter a value name without braces or line breaks.");
    if(bindings.some((b,i)=>i!==editing && b.narrativeLabel===name))throw Error("Choose a distinct name for each value.");
    const binding={...src.binding,...(src.binding.field?{op:aggregation.value}:{}),narrativeLabel:name,narrativeFormat:format.value};
    if(editing>=0){
      story.value=story.value.replaceAll(token(bindings[editing].narrativeLabel),()=>token(name));
      bindings[editing]=binding;
    }else{
      if(bindings.length>=32)throw Error("Use at most 32 values in a narrative.");
      bindings.push(binding);insert(name);
    }
    error.textContent="";clear();refresh();
  }
  source.onchange=()=>{
    const src=updateSource();dirty=!!src;reset.hidden=!dirty && editing<0;
    if(editing<0 && src)valueName.value=nextValueName(src.name,bindings);
  };
  for(const field of [aggregation,valueName,format])field.oninput=()=>{dirty=true;};
  save.onclick=()=>{try{store();}catch(e){error.textContent=e.message;}};
  reset.onclick=clear;
  values.onclick=e=>{
    const button=e.target.closest("button");
    if(!button)return;
    if(dirty){error.textContent="Finish the current value or cancel its edit first.";reset.hidden=false;return;}
    if(button.dataset.insert!==undefined){insert(bindings[Number(button.dataset.insert)].narrativeLabel);return;}
    if(button.dataset.remove!==undefined){
      const [b]=bindings.splice(Number(button.dataset.remove),1);
      story.value=story.value.replaceAll(token(b.narrativeLabel),"");clear();refresh();return;
    }
    editing=Number(button.dataset.edit);
    const b=bindings[editing];source.value=sourceFor(b);updateSource();aggregation.value=b.op||"";
    valueName.value=b.narrativeLabel;format.value=b.narrativeFormat||"auto";
    save.textContent="Update value";reset.hidden=false;valueName.focus();
  };
  clear();refresh();
}

