const key=JSON.stringify;
const sameField=(a,b)=>a.t===b.t && a.c===b.c;
const isCollapsed=(v,axis,path)=>path.some((_,i)=>v.collapsed?.[axis]?.includes(key(path.slice(0,i))));

function cellGroups(v,result) {
  if(v.kind==="table")return [{fields:v.groups,depth:v.groups.length,paths:result.rows.map(r=>r.slice(0,v.groups.length))}];
  return result.parts.map(({depth,columnDepth,rows})=>{
    const cols=v.columns||[],fields=[...v.groups.slice(0,depth),...cols.slice(0,columnDepth)];
    const paths=rows.flatMap(row=>{
      const path=row.slice(0,depth),pivot=row.slice(depth,depth+columnDepth);
      if(isCollapsed(v,"rows",path) || isCollapsed(v,"columns",pivot))return [];
      return [row.slice(0,fields.length)];
    });
    return {fields,depth,paths};
  });
}

// The ordinary visual query determines the rows on the current page. Restrict
// trend queries to those exact paths, including matrix subtotal coordinates.
export async function loadSparkSeries(visuals,results,{queryMetric,spec,fetchBatch,current}) {
  const tasks=[];
  for(const v of visuals) {
    const res=results.get(v.id);
    if(!res || res.error || !["table","matrix"].includes(v.kind) || !v.sparklines?.length)continue;
    const {filters,measureScope}=spec(v),groups=cellGroups(v,res);
    res.sparks=new Map();
    for(const spark of v.sparklines) {
      const data={domain:[],cells:new Map()};
      res.sparks.set(spark.id,data);
      tasks.push({spark,data,groups,base:{metrics:[queryMetric(spark.binding)],filters,measureScope}});
    }
  }
  if(!tasks.length)return;
  async function run(items,makeQuery,consume) {
    for(let i=0;i<items.length && current();i+=12) {
      const part=items.slice(i,i+12),out=await fetchBatch(part.map(makeQuery));
      if(!current())return;
      part.forEach((item,j)=>consume(item,out[j]));
    }
  }
  await run(tasks,t=>({...t.base,groups:[t.spark.axis],order:t.spark.utc?"asc":"category",...(t.spark.utc?{sortColumn:0,utcSortColumns:[0]}:{}),limit:52}),({data},r)=>{
    if(r.error)data.error=r.error;
    else if(r.more)data.error="Filter the trend axis to 52 values or fewer.";
    else data.domain=r.rows.map(row=>row[0]);
  });
  const chunks=[];
  for(const task of tasks) {
    const {data,groups,spark}=task;
    if(data.error || !data.domain.length)continue;
    const maxPaths=Math.floor(500/data.domain.length);
    for(const {fields,depth,paths} of groups) {
      const existing=fields.findIndex(f=>sameField(f,spark.axis));
      const groupBy=existing<0?[...fields,spark.axis]:fields;
      for(let i=0;i<paths.length;i+=maxPaths)chunks.push({task,depth,fields,groupBy,axis:existing<0?fields.length:existing,paths:paths.slice(i,i+maxPaths)});
    }
  }
  await run(chunks,c=>({...c.task.base,groups:c.groupBy,visibleMembers:c.fields.length?c.paths:undefined,limit:500}),({task,fields,groupBy,depth,axis},r)=>{
    const {data}=task;
    if(r.error || r.more){data.error=r.error||"Filter this trend to display its complete series.";return;}
    for(const row of r.rows) {
      const cell=key([row.slice(0,depth),row.slice(depth,fields.length)]);
      if(!data.cells.has(cell))data.cells.set(cell,new Map());
      data.cells.get(cell).set(row[axis],row[groupBy.length]);
    }
  });
  for(const {data} of tasks) {
    let min=Infinity,max=-Infinity;
    for(const cell of data.cells.values())for(const v of cell.values())if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}
    data.extent=[min,max];
  }
}

