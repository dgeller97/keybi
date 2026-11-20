import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,open,settled,studio} from "./portfolio-ui.mjs";

async function clickSpace(p,chart,cancel=false) {
  const svg=chart.locator("svg.analytic-plot");
  const corner=await svg.evaluate(el=>{
    const b=el.getBoundingClientRect();
    for(let y=3;y<25;y+=3) for(let x=3;x<25;x+=3)
      if(document.elementFromPoint(b.x+x,b.y+y)===el) return [b.x+x,b.y+y];
    throw Error("Expected empty space in plot");
  });
  await p.mouse.move(...corner); await p.mouse.down();
  if(cancel) await p.keyboard.press("Escape");
  await p.mouse.up(); await settled(p);
}
const evidence={};
await studio(async p=>{
  await open(p,"Visual Gallery"); await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:"Online across regions",exact:true}).click(); await settled(p);
  const source=art(p,"Regional revenue by channel"),value=()=>art(p,"Revenue in selection").locator(".kpi").innerText();
  await clickSpace(p,art(p,"Channel contribution")); assert.equal(await value(),"$887.00");
  await clickSpace(p,source,true); assert.equal(await value(),"$887.00");
  await clickSpace(p,source); assert.equal(await value(),"$1,731.00");
  assert.equal(await source.locator("[aria-pressed=true]").count(),0);
  evidence.gallery={otherChart:"$887.00",cancel:"$887.00",source:"$1,731.00"};
});
await studio(async p=>{
  await open(p,"Hospital Operations"); await p.getByRole("button",{name:"Site volumes",exact:true}).click(); await settled(p);
  const source=art(p,"Monthly encounter volume by site"),value=()=>art(p,"Closed routine encounters").locator(".kpi").innerText();
  await art(p,"Site focus").locator("select").selectOption({label:"Harbor"}); await settled(p);
  const rows=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
  const count=rows.filter(r=>r[2]==="Harbor" && r[3]==="Routine" && r[4]==="Closed").reduce((sum,r)=>sum+Number(r[7]),0);
  const point=source.locator("[data-selection-key]").first(),month=Number(await point.getAttribute("data-value"));
  await point.click(); await settled(p); assert.equal(await value(),String(month));
  await clickSpace(p,source); assert.equal(await value(),String(count));
  assert.equal(await art(p,"Site focus").locator("option:checked").innerText(),"Harbor");
  evidence.hospital={oneMonth:month,afterClear:count,scope:"Harbor, Routine, Closed"};
});
await writeFile("portfolio-evidence/chart-background.json",JSON.stringify(evidence,null,2)+"\n");
console.log(evidence);
