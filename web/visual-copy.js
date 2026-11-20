import {tooltipCanvasSize} from "./page-layout.js";

const interactions=["ignoreTargets","highlightTargets"];

export function copyVisuals(page,ids) {
  const visuals=page.visuals.filter(v=>ids.has(v.id)).map(v=>{
    const {selection,range,slicerSync,...definition}=v;
    return structuredClone(definition);
  });
  return {page:page.id,visuals};
}

export function bindingSignature(snapshot,fields,measures,parameters) {
  const available=new Map(fields.map(f=>[f.t+"."+f.c,f]));
  const dependencies=new Map();
  function visit(value) {
    if (!value || typeof value!=="object") return;
    if (typeof value.t==="string" && Number.isInteger(value.c)) {
      const key=value.t+"."+value.c,field=available.get(key);
      dependencies.set(key,field && [field.name,field.numeric]);
    }
    if (typeof value.measure==="string")
      dependencies.set(value.measure,measures.some(m=>m.id===value.measure) || parameters.some(p=>p.id===value.measure));
    if (typeof value.parameter==="string")
      dependencies.set(value.parameter,parameters.some(p=>p.id===value.parameter));
    for (const child of Object.values(value)) visit(child);
  }
  visit(snapshot.visuals);
  return JSON.stringify([...dependencies]);
}

export function pasteVisuals(page,selection,uid) {
  const samePage=selection.page===page.id;
  const ids=new Map(selection.visuals.map(v=>[v.id,uid()]));
  const visuals=structuredClone(selection.visuals);
  const existing=new Set(page.visuals.map(v=>v.id));
  const fixed=tooltipCanvasSize(page),width=fixed?.width ?? 1000;
  const height=fixed?.height;
  if (visuals.some(v=>v.w>width || (height && v.h>height)))
    throw Error("The selected visuals are larger than the destination canvas.");
  const minX=Math.min(...visuals.map(v=>v.x)),edgeX=Math.max(...visuals.map(v=>v.x+v.w));
  const minY=Math.min(...visuals.map(v=>v.y)),edgeY=Math.max(...visuals.map(v=>v.y+v.h));
  if (edgeX-minX>width || (height && edgeY-minY>height))
    throw Error("The selected layout is larger than the destination canvas.");
  const maxY=height ? height-edgeY : 8000-Math.max(...visuals.map(v=>v.y));
  const occupied=new Set(page.visuals.map(v=>[v.x,v.y,v.w,v.h].join(",")));
  function placement() {
    for (let step=samePage ? 1 : 0;step<=page.visuals.length+1;step++) {
      for (const [sx,sy] of [[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const dx=Math.max(-minX,Math.min(16*step*sx,width-edgeX));
        const dy=Math.max(-minY,Math.min(16*step*sy,maxY));
        if (visuals.every(v=>!occupied.has([v.x+dx,v.y+dy,v.w,v.h].join(",")))) return [dx,dy];
      }
    }
    return [Math.max(-minX,Math.min(0,width-edgeX)),Math.max(-minY,Math.min(0,maxY))];
  }
  const [dx,dy]=placement();
  function remap(link) {
    if (link?.page===selection.page && ids.has(link.visual)) {
      link.page=page.id;link.visual=ids.get(link.visual);
    }
  }
  for (const v of visuals) {
    v.id=ids.get(v.id);v.x+=dx;v.y+=dy;
    for (const key of interactions) {
      if (!v[key]) continue;
      const targets=new Set();
      for (const old of v[key]) {
        if (samePage && existing.has(old)) targets.add(old);
        if (ids.has(old)) targets.add(ids.get(old));
      }
      v[key]=[...targets];
    }
    for (const line of v.referenceLines || []) remap(line.source);
    for (const rules of [v.cellRules,v.calloutRules,v.cellIcons])
      for (const rule of Object.values(rules || {})) remap(rule.thresholdFilter);
  }
  if (samePage) {
    for (const peer of page.visuals) for (const key of interactions) {
      if (peer[key]?.length)
        peer[key]=[...new Set([...peer[key],...peer[key].filter(id=>ids.has(id)).map(id=>ids.get(id))])];
    }
  }
  page.visuals.push(...visuals);
  return visuals;
}
