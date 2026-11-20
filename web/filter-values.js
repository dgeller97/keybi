import {binLabel,intervalStart,valueCaption} from "./numeric-bins.js";
import {columnBounds} from "./filter-operators.js";
import {mountPastedValues} from "./paste-values.js";

export function parseBinFilter(input,width) {
  const text=input.trim();
  if (text==="(Blank)") return null;
  if (typeof width==="number") {
    const start=text.split("–<")[0],value=Number(start);
    if (!start || !Number.isFinite(value) || (start!==text && binLabel(value,width)!==text))
      throw Error("Enter the interval label or its numeric lower bound.");
    return value;
  }
  const part=text.split("–")[0].replace(/ UTC$/,"");
  let stamp=part;
  const quarter=/^(\d{4}) Q([1-4])$/i.exec(part);
  if (quarter && width.months===3) stamp=quarter[1]+"-"+String(3*Number(quarter[2])-2).padStart(2,"0");
  if (/^\d{4}$/.test(stamp) && width.months===12) stamp+="-01";
  if (/^\d{4}-\d{2}$/.test(stamp)) stamp+="-01";
  if (/^\d{4}-\d{2}-\d{2}$/.test(stamp)) stamp+="T00:00";
  stamp=stamp.replace(" ","T").replace(/Z$/i,"");
  const time=Date.parse(stamp+"Z");
  const date=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(stamp) && Number.isFinite(time)
    ? new Date(time).toISOString() : "";
  const calc={calendarMonths:width.months,timeBinMs:width.ms,weekStart:width.weekStart};
  if (!date || !date.startsWith(stamp) || intervalStart(time,calc)!==time || (text.includes("–") && binLabel(date,width)!==text))
    throw Error("Choose an interval or enter its label or UTC start.");
  return date;
}

export function columnFilterDialog({scope,rule,dialog,selectInput,textInput,fieldOptions,decode,lookup,fkey,load,commit}) {
  let selection;
  const original=rule && fkey(rule.field);
  const operator=rule?.op || (rule?.value===null ? "blank" : "eq");
  dialog((rule ? "Edit " : "Add ")+scope+" filter",
    selectInput("Field","field",fieldOptions)+
    selectInput("Condition","condition",'<option value="eq">Equals</option><option value="in">Is one of</option><option value="gt">Greater than</option><option value="gte">Greater than or equal to</option><option value="lt">Less than</option><option value="lte">Less than or equal to</option><option value="blank">Is blank</option>')+
    '<div data-equals>'+textInput("Equals","value","")+'<datalist id="filter-intervals"></datalist></div><div data-list hidden></div>',
    "Apply",async fd=>{
      const field=decode(fd.get("field")),column=lookup(field),op=fd.get("condition");
      if (op==="in") return commit({field,op,value:(await selection()).value});
      let value=null;
      if (op!=="blank") {
        const raw=fd.get("value");
        value=column.binSize ? parseBinFilter(raw,column.binSize) : column.numeric ? Number(raw) : raw;
        if (column.numeric && value!==null && (!raw.trim() || !Number.isFinite(value))) throw Error("Enter a numeric value.");
        if (op!=="eq" && value===null) throw Error("Enter a nonblank bound.");
      }
      return commit(columnBounds[op] ? {field,op,value} : {field,value});
    });
  const form=document.getElementById("dlgform"),{field,condition,value:input}=form.elements;
  const members=form.querySelector("[data-list]"),suggestions=form.querySelector("datalist");
  if (original) field.value=original;
  condition.value=operator;
  if (rule && operator!=="in" && operator!=="blank") input.value=rule.value==null ? "" : lookup(rule.field).binSize ? binLabel(rule.value,lookup(rule.field).binSize) : rule.value;
  async function update() {
    const key=field.value, column=lookup(decode(key)),mode=condition.value;
    members.hidden=mode!=="in";input.disabled=mode==="in" || mode==="blank";
    input.labels[0].textContent=({gte:"Lower bound",lte:"Upper bound",gt:"Above",lt:"Below"})[mode] || "Equals";
    form.querySelector("[data-equals]").hidden=input.disabled;
    suggestions.replaceChildren();input.removeAttribute("list");members.replaceChildren();
    if (mode==="in") {
      const values=key!==original ? [] : rule.op==="in" ? rule.value : [rule.value];
      selection=mountValueList(members,{column,values,load:(offset,search)=>load(decode(key),offset,search)});
    } else if (!input.disabled && column.binSize) {
      input.setAttribute("list",suggestions.id);if (mode==="eq") suggestions.append(new Option("(Blank)"));
      try {
        const result=await load(decode(key),0);
        if (form.isConnected && field.value===key && condition.value===mode)
          for (const [value] of result.rows || []) if (value!=null) suggestions.append(new Option(binLabel(value,column.binSize)));
      } catch { /* Exact entry is available while the source is offline. */ }
    }
  }
  field.onchange=()=>{input.value="";update();};condition.onchange=update;update();
}

// Values are held in their source type. Display text can coincide with the
// blank label, and selections can span several result pages.
export function mountValueList(host,{column,values=[],all=false,reader=false,slicer=false,searchable=true,load,initialText}) {
  const chosen=new Set(all ? [] : values);
  const root=document.createElement("div");root.className="filter-values";
  root.innerHTML='<details class="paste-values"><summary>Paste values</summary>'+
    '<label>Values, one per line<textarea class="control" rows="4" spellcheck="false"></textarea></label>'+
    '<div role="status"></div><div data-unmatched></div><button type="button" class="outline" data-review-paste hidden>Review matches</button></details><div data-browse>'+
    (reader ? '<label><input type="checkbox" data-all> All values</label>' : "")+
    (searchable && !column.numeric && !column.binSize ? '<input type="search" class="control" aria-label="Search values" placeholder="Search values">' : "")+
    '<button type="button" class="outline" data-review aria-pressed="false" hidden>Show selected</button>'+
    '<div data-members></div><div class="filter-paging"><button type="button" class="outline" data-prev>Previous values</button>'+
    '<span data-status aria-live="polite"></span><button type="button" class="outline" data-next>Next values</button></div>'+
    (slicer ? "" : '<div class="filter-exact"><input class="control" aria-label="Exact value" placeholder="Exact value">'+
    '<button class="outline" type="button" data-add>Add value</button></div>')+'<div data-error role="status"></div></div>';
  host.replaceChildren(root);
  const q=s=>root.querySelector(s), allBox=q("[data-all]"), list=q("[data-members]"), input=q(".filter-exact input"),search=q('[type="search"]');
  if (allBox) allBox.checked=all;
  const review=q("[data-review]"),pageSize=150;
  let offset=0,rows=[],more=false,busy=false,version=0,timer;
  let selectedOnly=false,selectedOffset=0,selectedCount=0,sourceSearch="";
  function status() {
    const start=selectedOnly ? selectedOffset : offset;
    const hasNext=selectedOnly ? start+pageSize<selectedCount : more;
    q("[data-status]").textContent=selectedOnly && selectedCount ? (start+1)+"–"+Math.min(start+pageSize,selectedCount)+" of "+selectedCount : chosen.size+" selected";
    q("[data-prev]").disabled=(!selectedOnly && busy) || start===0;
    q("[data-next]").disabled=(!selectedOnly && busy) || !hasNext;
    q("[data-prev]").hidden=q("[data-next]").hidden=!start && !hasNext;
    q(".filter-paging").hidden=!start && !hasNext && !chosen.size;
    review.hidden=!chosen.size && !selectedOnly;
    review.textContent=selectedOnly ? "Show available values" : "Show selected ("+chosen.size+")";
    review.setAttribute("aria-pressed",String(selectedOnly));
  }
  function render(){
    const term=search?.value.toLowerCase() || "";
    const matches=v=>!term || valueCaption(v,column).toLowerCase().includes(term);
    let entries;
    if (selectedOnly) {
      const found=[...chosen].filter(matches);
      selectedCount=found.length;
      selectedOffset=Math.min(selectedOffset,Math.floor(Math.max(0,found.length-1)/pageSize)*pageSize);
      entries=found.slice(selectedOffset,selectedOffset+pageSize);
    } else {
      const pinned=chosen.size<=pageSize ? [...chosen].filter(matches) : [];
      const blank=!slicer && "(blank)".includes(term) ? [null] : [];
      entries=[...new Set([...rows,...blank])];
      const visible=new Set(entries);
      entries.unshift(...pinned.filter(v=>!visible.has(v)));
    }
    list.replaceChildren(...entries.map(value=>{
      const label=document.createElement("label"),box=document.createElement("input");
      box.type="checkbox";box.checked=chosen.has(value);
      box.onchange=()=>{
        if (allBox) allBox.checked=false;
        if (box.checked) chosen.add(value);else chosen.delete(value);
        if (selectedOnly) {
          const index=Array.prototype.indexOf.call(list.children,label);
          render();
          (list.children[Math.min(index,list.children.length-1)]?.firstChild || review).focus();
        } else status();
      };
      label.append(box,document.createTextNode(valueCaption(value,column)));return label;
    }));
    if (!entries.length) list.textContent=busy && !selectedOnly ? "Searching…" : "No matching values";
    status();
  }
  async function page(next) {
    if (!root.isConnected) return;
    const request=++version;
    busy=true;status();q("[data-error]").textContent="";
    try {
      const res=await load(next,sourceSearch);
      if (!root.isConnected || request!==version) return;
      if (res.error) throw Error(res.error);
      rows=res.rows.map(r=>r[0]);more=!!res.more;offset=next;list.scrollTop=0;
    } catch (err) {if (request===version) q("[data-error]").textContent=err.message;}
    finally {if (request===version && root.isConnected) {busy=false;render();}}
  }
  if (search) {
    search.oninput=()=>{
      if (selectedOnly) {selectedOffset=0;render();return;}
      sourceSearch=search.value;
      ++version;clearTimeout(timer);
      busy=true;rows=[];more=false;offset=0;render();
      timer=setTimeout(()=>page(0),120);
    };
    search.onkeydown=e=>{if (e.key==="Enter") e.preventDefault();};
  }
  if (allBox) allBox.onchange=()=>{
    if (allBox.checked) {chosen.clear();reviewSelected(false);return;}
    render();
  };
  function reviewSelected(enable) {
    selectedOnly=enable;selectedOffset=0;
    if (search) search.value=enable ? "" : sourceSearch;
    list.scrollTop=0;render();
  }
  review.onclick=()=>reviewSelected(!selectedOnly);
  function turnPage(step) {
    if (!selectedOnly) return page(Math.max(0,offset+step));
    selectedOffset=Math.max(0,selectedOffset+step);list.scrollTop=0;render();
  }
  q("[data-prev]").onclick=()=>turnPage(-pageSize);
  q("[data-next]").onclick=()=>turnPage(pageSize);
  function addExact() {
    const raw=input.value;
    try {
      if (!raw.length) throw Error("Enter a value to add.");
      const value=column.binSize ? parseBinFilter(raw,column.binSize) : column.numeric ? Number(raw) : raw;
      if (column.numeric && value!==null && (!raw.trim() || !Number.isFinite(value))) throw Error("Enter a numeric value.");
      chosen.add(value);if (allBox) allBox.checked=false;
      input.value="";q("[data-error]").textContent="";render();
    } catch(err) {q("[data-error]").textContent=err.message;}
  }
  if (input) {
    q("[data-add]").onclick=addExact;
    input.onkeydown=e=>{if (e.key==="Enter"){e.preventDefault();addExact();}};
  }
  const readPaste=mountPastedValues(root,{load,initialText,reviewMatches:matches=>{
    chosen.clear();for (const value of matches) chosen.add(value);
    if (allBox) allBox.checked=false;
    reviewSelected(true);review.focus();
  },parse:line=>{
    if (line==="(Blank)") return null;
    if (column.binSize) return parseBinFilter(line,column.binSize);
    if (column.numeric) {
      const value=Number(line);
      if (!line.trim() || !Number.isFinite(value)) throw Error("Invalid number.");
      return value;
    }
    if (line.startsWith('"') && line.endsWith('"')) {
      try {return JSON.parse(line);} catch { /* A text key can contain literal quotes. */ }
    }
    return line;
  }});
  render();page(0);
  return async()=>{
    const pasted=await readPaste();
    if (pasted) return pasted;
    if (allBox?.checked || (slicer && !chosen.size)) return {all:true};
    if (!chosen.size) throw Error("Select at least one value.");
    return {value:[...chosen]};
  };
}
