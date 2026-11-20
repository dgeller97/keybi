const key=JSON.stringify;
export const hasSparks=v=>["matrix","table"].includes(v.kind) && !!v.sparklines?.length;
export function sparkControls(v,esc) {
  const entries=(v.sparklines||[]).map(s=>'<div class="filteritem"><button class="measure-filter-edit" data-spark-edit="'+esc(s.id)+'" aria-label="Edit '+esc(s.name)+'">'+esc(s.name)+'</button><button data-spark-remove="'+esc(s.id)+'" aria-label="Remove '+esc(s.name)+'">×</button></div>');
  return entries.join("")+'<button class="outline" data-spark-edit=""'+((v.sparklines?.length||0)>=5?" disabled":"")+'>Add sparkline</button>';
}
function geometry(values,s,extent,color) {
  const has=values.filter(Number.isFinite),columns=s.type==="columns";
  if(!has.length)return '<span class="spark-empty">—</span>';
  let [min,max]=s.scale==="shared"?extent:[Math.min(...has),Math.max(...has)];
  if(columns){min=Math.min(0,min);max=Math.max(0,max);}
  const span=max-min,x=i=>4+(i+.5)*124/values.length,y=v=>span?28-(v-min)*24/span:16;
  const w=Math.min(28,Math.max(1,96/values.length)),high=Math.max(...has),low=Math.min(...has);
  const first=values.findIndex(Number.isFinite),last=values.findLastIndex(Number.isFinite);
  const mark=(v,i)=>s.markers==="all" || (s.markers==="high"&&v===high) || (s.markers==="low"&&v===low) || (s.markers==="last"&&i===last) || (s.markers==="first"&&i===first);
  let shapes="",line="",markers="",previous=false;
  for(const [i,v] of values.entries()){
    if(!Number.isFinite(v)){previous=false;continue;}
    const X=x(i),Y=y(v);
    if(columns){
      const h=Math.max(1,Math.abs(Y-y(0)));
      shapes+='<rect x="'+(X-w/2)+'" y="'+Math.min(Y,y(0))+'" width="'+w+'" height="'+h+'" opacity="'+(s.markers==="none"||mark(v,i)?1:.58)+'"/>';
    }else {
      line+=(previous?" L":" M")+X+" "+Y;
      if(mark(v,i)||(!previous&&!Number.isFinite(values[i+1])))markers+='<circle cx="'+X+'" cy="'+Y+'" r="2.5"/>';
      previous=true;
    }
  }
  if(line)shapes='<path d="'+line+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+markers;
  return '<svg viewBox="0 0 132 32" aria-hidden="true" style="color:'+color+'" fill="currentColor">'+shapes+'</svg>';
}
export function sparkCell(s,data,path,pivot,name,{esc,accent,format,preview}) {
  if(data?.error)return '<td class="spark-error" title="'+esc(data.error)+'">'+esc(data.error)+'</td>';
  const coords=key([path,pivot]),cell=data?.cells.get(coords),values=(data?.domain||[]).map(x=>cell?.get(x)??null);
  const color=/^#[a-f0-9]{6}$/i.test(s.color)?s.color:accent;
  const plot=geometry(values,s,data?.extent||[],color);
  if(preview)return '<td class="spark-cell">'+plot+'</td>';
  const valid=values.filter(Number.isFinite);
  const summary=valid.length?valid.length+' values · '+format(s,valid[0])+' to '+format(s,valid.at(-1)):"No values";
  return '<td class="spark-cell"><button type="button" data-spark-detail="'+esc(s.id)+'" data-spark-path="'+esc(coords)+'" aria-label="Inspect '+esc(name)+'" aria-description="'+esc(summary)+'" title="'+esc(summary)+'">'+plot+'</button></td>';
}
export function inspectSpark(s,data,coords,{esc,dialog,heading,context,axisName,axisLabel,format}) {
  const cell=data?.cells.get(coords);
  const rows=(data?.domain||[]).map(k=>'<tr><td>'+esc(axisLabel(k))+'</td><td>'+esc(format(s,cell?.get(k)))+'</td></tr>').join("");
  dialog(heading,(context?'<p>'+esc(context)+'</p>':'')+'<table class="grid spark-detail"><thead><tr><th>'+esc(axisName)+'</th><th>'+esc(s.name)+'</th></tr></thead><tbody>'+rows+'</tbody></table>',null);
}

