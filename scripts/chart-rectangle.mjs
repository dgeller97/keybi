import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const page="Distributions",chartName="Orders and revenue",bookmark="March dispatch points";
const march=["2026-03-01","East"],west=["2026-03-01","West"];
const plot=p=>art(p,chartName);
async function bounds(p,tuples) {
  return plot(p).locator("[data-selection-key] circle").evaluateAll((circles,tuples)=>{
    const keys=tuples.map(t=>JSON.stringify(t));
    const pts=circles.filter(c=>keys.includes(c.parentElement.dataset.selectionKey)).map(c=>{
      const box=c.getBoundingClientRect();return [box.x+box.width/2,box.y+box.height/2];
    });
    return [Math.min(...pts.map(p=>p[0]))-6,Math.min(...pts.map(p=>p[1]))-6,
      Math.max(...pts.map(p=>p[0]))+6,Math.max(...pts.map(p=>p[1]))+6];
  },tuples);
}
async function drag(p,box,{ctrl=false,reverse=false,cancel=false}={}) {
  const [x,y,u,v]=box;
  if(ctrl) await p.keyboard.down("Control");
  await p.mouse.move(reverse?u:x,reverse?v:y); await p.mouse.down();
  await p.mouse.move(reverse?x:u,reverse?y:v,{steps:8});
  if(cancel) await p.keyboard.press("Escape");
  await p.mouse.up(); if(ctrl) await p.keyboard.up("Control");
  await settled(p);
}
const selected=p=>plot(p).locator('[data-selection-key][aria-pressed=true]').evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.selectionKey)).sort());
const amount=p=>art(p,"Revenue in selection").locator(".kpi").innerText();
if (!process.argv.includes("--reopen-only")) await studio(async p=>{
  await open(p,"Visual Gallery"); const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
  const before=await amount(p),box=await bounds(p,[march,west]);
  await drag(p,box);
  if(process.argv.includes("--baseline")) {
    await writeFile("portfolio-evidence/scatter-rectangle-baseline.json",JSON.stringify({before,after:await amount(p),selected:await selected(p),box},null,2));
    return;
  }
  assert.deepEqual(await selected(p),[march,west]); assert.equal(await amount(p),"$732.00");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const saved=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if(await saved.count()) await saved.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
  await plot(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
  await p.locator(`[data-page="${original}"]`).click(); await save(p);
});
if(!process.argv.includes("--baseline")) await studio(async p=>{
  await open(p,"Visual Gallery"); await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
  const proof=[];
  for(const [tuples,options,expect,value] of [
    [[west],{ctrl:true},[march],"$349.00"],
    [[march,west],{reverse:true,cancel:true},[march],"$349.00"],
    [[march,west],{reverse:true},[march,west],"$732.00"],
    [[march,west],{ctrl:true},[],"$1,731.00"]
  ]) {
    await drag(p,await bounds(p,tuples),options);
    assert.deepEqual(await selected(p),expect); assert.equal(await amount(p),value);
    proof.push({options,selection:expect,value});
  }
  await drag(p,await bounds(p,[march,west]));
  const [left,top,right,bottom]=await bounds(p,[march]), x=(left+right)/2, y=(top+bottom)/2;
  await p.mouse.move(x,y); await p.mouse.down(); await p.mouse.move(x-20,y+20,{steps:4});
  await p.keyboard.press("Escape"); await p.mouse.move(x,y); await p.mouse.up(); await settled(p);
  assert.deepEqual(await selected(p),[march,west]); assert.equal(await amount(p),"$732.00");
  proof.push({cancelOnSelectedPoint:true,selection:[march,west],value:await amount(p)});
  await capture(p,"gallery-scatter-rectangle");
  await writeFile("portfolio-evidence/gallery-scatter-rectangle.json",JSON.stringify({bookmark,proof},null,2)+"\n");
});
