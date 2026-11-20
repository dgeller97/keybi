// The normal 500-row chart response is sufficient for most grids. For larger
// results, select a bounded page of panels and fetch only their aggregate rows.
export async function loadPanelPage(v,base,offset,query,current) {
  const field=v.smallMultiples[0],size=(v.panelColumns||2)*(v.panelRows||2);
  const memberQuery={groups:[field],metrics:base.metrics,filters:[...base.filters],measureScope:base.measureScope,
    order:v.panelOrder==="desc"?"desc":"asc",sortColumn:0,offset,limit:size};
  // A ranked expanded hierarchy uses tuples, which must stay paired.
  if(base.visibleMembers?.length) {
    const tuple=crypto.randomUUID();
    base.visibleMembers[0].forEach((_,i)=>memberQuery.filters.push({field:base.groups[i],op:"tuple",tuple,value:base.visibleMembers.map(row=>row[i])}));
  }
  const members=await query(memberQuery);
  if(!current()||members.error)return members;
  if(!members.rows.length && offset)return loadPanelPage(v,base,0,query,current);
  const values=members.rows.map(row=>row[0]),filter={field,op:"in",value:values};
  const pager={offset,size,count:values.length,more:members.more,filter};
  if(!values.length)return {rows:[],more:false,pager};
  const spec={...base,filters:[...base.filters,filter],offset:0,limit:500};
  const result=await collectPanelRows(spec,query,current);
  return {...result,pager};
}
export async function collectPanelRows(spec,query,current,first) {
  const result=first||await query(spec);
  if(result.error || !result.more || !current())return result;
  const rows=[...result.rows];
  let more=result.more;
  // Keep the chart responsive even when one panel has a high-cardinality axis.
  while(more && rows.length<5000 && current()){
    const next=await query({...spec,offset:rows.length});
    if(next.error)return next;
    rows.push(...next.rows);more=next.more;
  }
  return {...result,rows,more};
}

