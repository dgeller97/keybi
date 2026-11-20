import {axisFields,chartGroups,chartMetrics,selectionRows} from "./visual-types.js";
import {seriesNames,legendMemberName} from "./stacked-area.js";
import {binLabel} from "./numeric-bins.js";

export function panelGrid(v,res,context,render,esc) {
  const page=res.pager;
  const pager=page?.count?'<div class="paging panel-paging"><button data-panel-page="'+Math.max(0,page.offset-page.size)+'" '+(!page.offset?"disabled":"")+'>Previous panels</button><span>Panels '+(page.offset+1)+'–'+(page.offset+page.count)+' · shared axes on this page</span><button data-panel-page="'+(page.offset+page.size)+'" '+(!page.more?"disabled":"")+'>Next panels</button></div>':"";
  if(res.more)return pager+'<div class="vempty">Narrow the category or legend to display the complete panels on this page.</div>';
  if(!res.rows.length)return pager+'<div class="vempty">No matching panels</div>';
  const groups=chartGroups(v),metrics=chartMetrics(v),axis=axisFields(v),f=v.smallMultiples[0],split=groups.length-1;
  const field=context.fieldname(f),bin=v.binWidths?.[split],caption=x=>bin?binLabel(x,bin):legendMemberName(x);
  const panels=new Map(),categories=new Map(),series=new Set(),label=seriesNames(metrics,context.valname,!!v.legendFields?.length,axis.length);
  for(const [i,full] of res.rows.entries()){
    const member=full[split],tuple=full.slice(0,axis.length);
    categories.set(JSON.stringify(tuple),tuple);
    if(!panels.has(member))panels.set(member,{member,rows:[],original:new Map(),indexes:[],highlight:new Map()});
    const p=panels.get(member),row=[...full.slice(0,split),...full.slice(split+1)];
    p.rows.push(row);p.indexes.push(i);p.original.set(row,full);
    metrics.forEach((_,j)=>series.add(label(row,j)));
    if(res.highlight){
      const h=res.highlight.get(JSON.stringify(full.slice(0,groups.length)));
      if(h)p.highlight.set(JSON.stringify(row.slice(0,split)),h);
    }
  }
  const sorted=[...panels.values()].sort((a,b)=>a.member===null?1:b.member===null?-1:typeof a.member==="number"&&typeof b.member==="number"?a.member-b.member:String(a.member).localeCompare(String(b.member),"en",{numeric:true}));
  if(v.panelOrder==="desc")sorted.reverse();
  const columns=Math.min(sorted.length,Math.max(1,Math.min(6,Number(v.panelColumns)||2)));
  const rows=Math.max(1,Math.min(6,Number(v.panelRows)||2));
  const height=Math.max(146,Math.floor((v.h-56)/Math.min(Math.ceil(sorted.length/columns),rows))-8);
  const width=Math.max(210,Math.floor((v.w-28)/columns)-8);
  const labels=[...categories.values()],picked=new Set(selectionRows(v.selection,[f]).map(r=>r[0]));
  const legend=new Map();
  const panes=sorted.map((p,i)=>{
    const pane={...p,categories:labels,groups,legend,field:f,caption:caption(p.member),facetSelected:v.selection?.facet&&picked.has(p.member)};
    const visual={...v,id:v.id+"-panel-"+i,smallMultiples:[],pane,w:width+18,h:height+44,
      seriesOrder:v.seriesOrder||[...series]};
    const data={...res,rows:p.rows,highlight:res.highlight?p.highlight:null};
    const ctx=context.pointColor?{...context,pointColor:(row,j)=>context.pointColor(p.original.get(row),j)}:context;
    return {visual,data,ctx,pane};
  });
  // Reuse the chart's signed-stack, highlight and reference-line domain calculations.
  const domains=panes.map(({visual,data,ctx})=>render({...visual,domainOnly:true},data,ctx)).filter(Array.isArray);
  const domain=domains.length?[Math.min(...domains.map(d=>d[0])),Math.max(...domains.map(d=>d[1]))]:[0,1];
  const cells=panes.map(({visual,data,ctx,pane})=>{
    pane.domain=domain;
    const title=esc(pane.caption),selected=!!pane.facetSelected;
    return '<section class="multiple-panel" role="region" aria-label="'+title+'"><button type="button" class="panel-heading" data-facet-pick="'+esc(JSON.stringify(pane.member))+'" aria-pressed="'+selected+'" aria-label="Select '+esc(field)+' = '+title+'">'+title+'</button>'+render(visual,data,ctx)+'</section>';
  }).join("");
  const sharedLegend=legend.size?'<div class="chart-legend multiple-legend">'+[...legend.values()].join("")+'</div>':"";
  return pager+sharedLegend+'<div class="multiple-grid" style="--panel-columns:'+columns+';--panel-height:'+height+'px">'+cells+'</div>';
}

