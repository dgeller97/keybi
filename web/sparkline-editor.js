const operations=[["sum","Sum"],["avg","Average"],["count","Count"],["distinctcount","Distinct count"],["min","Minimum"],["max","Maximum"],["median","Median"],["p90","90th percentile"]];
export function editSparkline({existing,initial,columns,sources,dialog,esc,uid,commit}) {
  const option=([value,label])=>'<option value="'+esc(value)+'">'+esc(label)+'</option>';
  const select=(label,name,choices)=>'<label class="formlabel">'+label+'<select aria-label="'+label+'" class="control" name="'+name+'">'+choices.map(option).join("")+'</select></label>';
  const src=b=>b?.measure?"@"+b.measure:b?.field?b.field.t+"."+b.field.c:"";
  const sourceList=sources.map(s=>[s.key,s.label]),axisChoices=[["","Choose a field"],...columns.map(f=>[f.key,f.label])];
  const body='<label class="formlabel">Column heading<input class="control" aria-label="Column heading" name="heading" maxlength="100" required></label>'+
    '<div class="narrative-fields">'+select("Value source","source",sourceList)+select("Aggregation","op",[])+select("Trend axis","axis",axisChoices)+
    select("Value format","format",[["auto","From measure"],["number","Number"],["currency","Currency"],["percent","Percentage"]])+
    select("Chart type","type",[["line","Line"],["columns","Columns"]])+select("Markers","markers",[["none","None"],["first","First"],["last","Last"],["high","Highest"],["low","Lowest"],["all","All"]])+
    select("Vertical scale","scale",[["row","Each cell"],["shared","Shared across visible cells"]])+
    '<label class="formlabel">Line or column color<input aria-label="Line or column color" name="color" type="color"></label></div>'+
    '<label class="chart-option"><input type="checkbox" name="utc">Sort dates by UTC time</label>';
  dialog(existing?"Edit sparkline":"Add sparkline",body,"Apply sparkline",()=>{
    const source=sources.find(s=>s.key===f.source.value),axis=columns.find(c=>c.key===f.axis.value);
    if(!axis||!source)throw Error("Choose a value and a trend axis.");
    if(!f.heading.value.trim())throw Error("Enter a column heading.");
    const binding={...source.binding,...(source.binding.field?{op:f.op.value}:{})};
    commit({id:existing?.id||uid(),name:f.heading.value.trim(),axis:axis.field,binding,format:f.format.value,type:f.type.value,markers:f.markers.value,
      scale:f.scale.value,color:f.color.value,utc:!axis.numeric&&f.utc.checked});
  });
  const f=document.getElementById("dlgform").elements;
  let generatedName="";
  function populateOps(){
    const source=sources.find(s=>s.key===f.source.value),all=source?.binding.field?operations:[],allowed=source?.numeric?all:all.filter(([key])=>["count","distinctcount"].includes(key));
    f.op.replaceChildren(...(allowed.length?allowed:[["","From measure"]]).map(([k,name])=>new Option(name,k)));f.op.disabled=!allowed.length;
  }
  function refresh(){
    const s=sources.find(c=>c.key===f.source.value),axis=columns.find(c=>c.key===f.axis.value);
    if(!f.heading.value||f.heading.value===generatedName){generatedName=(s?.name||"Value")+" by "+(axis?.name||"period");f.heading.value=generatedName;}
    f.utc.disabled=!!axis?.numeric||!axis;
  }
  const binding=existing?.binding||initial;
  if(binding && sources.some(s=>s.key===src(binding)))f.source.value=src(binding);
  populateOps();if(binding?.op)f.op.value=binding.op;
  if(existing){
    f.axis.value=existing.axis.t+"."+existing.axis.c;f.heading.value=existing.name;
    for(const key of ["type","scale","markers","format"])f[key].value=existing[key];
  }else f.markers.value="last";
  f.color.value=existing?.color||"#39765e";f.utc.checked=!!existing?.utc;
  f.source.onchange=()=>{populateOps();refresh();};f.axis.onchange=refresh;refresh();
}

