const tokenPattern=/\{\{([^{}\r\n]+)\}\}/g;
export const tokens=text=>[...text.matchAll(tokenPattern)];
export const token=name=>"{{"+name+"}}";
export function nextValueName(proposed,metrics) {
  const stem=(String(proposed||"Value").replace(/[{}\r\n]/g," ").trim()||"Value").slice(0,60);
  let name=stem,index=1;
  while(metrics.some(m=>m.narrativeLabel===name)) name=stem+" "+(++index);
  return name;
}
export function addNarrativeValue(v,binding,proposed) {
  const name=nextValueName(proposed,v.metrics);
  v.metrics.push({...binding,narrativeLabel:name,narrativeFormat:"auto"});
  v.narrativeText=(v.narrativeText ? v.narrativeText+"\n" : "")+name+" "+token(name);
}
function style(v) {
  return {size:Number.isFinite(v.narrativeSize)?Math.max(10,Math.min(60,v.narrativeSize)):20,
    align:["left","center","right"].includes(v.narrativeAlign)?v.narrativeAlign:"left",
    color:/^#[a-f\d]{6}$/i.test(v.narrativeColor)?v.narrativeColor:"#293e34"};
}
export function narrativeBody(v,result,{esc,format}) {
  if(!v.narrativeText)return '<div class="vempty">Write a narrative in Build.</div>';
  if(v.metrics.length && !result)return '<div class="vempty">Loading…</div>';
  if(result?.error)return '<div class="vempty err">'+esc(result.error)+'</div>';
  const byName=new Map(v.metrics.map((m,i)=>[m.narrativeLabel,format(m,result?.rows?.[0]?.[i])]));
  let html="",start=0;
  for(const match of tokens(v.narrativeText)) {
    html+=esc(v.narrativeText.slice(start,match.index))+"<strong>"+esc(byName.get(match[1])??"—")+"</strong>";
    start=match.index+match[0].length;
  }
  const s=style(v);
  return '<div class="narrative-text" style="font-size:'+s.size+'px;color:'+s.color+';text-align:'+s.align+'">'+html+esc(v.narrativeText.slice(start))+'</div>';
}
export function narrativeFormat(v) {
  const s=style(v);
  return '<label class="formlabel">Text size (px)<input class="control" type="number" min="10" max="60" data-opt="narrativeSize" value="'+s.size+'"></label>'+
    '<label class="formlabel">Text color<input type="color" data-opt="narrativeColor" value="'+s.color+'"></label>'+
    '<label class="formlabel">Alignment<select class="control" data-opt="narrativeAlign">'+["left","center","right"].map(a=>'<option value="'+a+'"'+(s.align===a?" selected":"")+'>'+a[0].toUpperCase()+a.slice(1)+'</option>').join("")+'</select></label>';
}

