import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";
import {configureLine,formatChart,verifyGeometry} from "./reference-geometry.mjs";

const pageName="Wait frequency",name="Visits at recorded wait times",total="Visits in selection";
const source=p=>art(p,name);
const minutes=p=>source(p).locator(".plot-mark:has(circle)").evaluateAll(es=>es.map(el=>({
  wait:JSON.parse(el.dataset.selectionKey)[0],visits:Number(el.dataset.value),x:Number(el.querySelector("circle").getAttribute("cx")),
})).sort((a,b)=>a.wait-b.wait));
const baseline=process.argv.includes("--baseline");
let link;
await studio(async p=>{
  await open(p,"Wait-Time Performance");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const tab=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (!await tab.count()) {
    await addPage(p,pageName);
    await visual(p,"card",total,[],["Visit · Visits"],[18,16,280,108]);
    await visual(p,"line",name,["Visit · Wait"],["Visit · Visits"],[18,136,950,316]);
    if (baseline) {
      const pts=await minutes(p);
      await p.getByLabel("Continuous date axis").check();await settled(p);
      const message=await source(p).locator(".vempty").innerText();
      await writeFile("portfolio-evidence/numeric-trend-before.json",JSON.stringify({points:pts,message},null,2));return;
    }
    await p.getByLabel("Continuous numeric axis").check();await settled(p);
    await save(p);
  } else {await tab.click();await settled(p);}
  await formatChart(p,name);
  await setInput(p,'[data-axis-title-input="x"]',"Wait (minutes)");
  if (!await source(p).locator('[data-reference-axis="x"]').count())
    await configureLine(p,"x",{name:"Long wait",value:60,color:"#974524",pattern:"dashed"});
  await setInput(p,'[data-axis-key="x"][data-bound="min"]',55);
  await setInput(p,'[data-axis-key="x"][data-bound="max"]',75);
  assert.equal(await source(p).locator('.plot-mark[data-selection-key="[7]"]').getAttribute("aria-hidden"),"true");
  await verifyGeometry(source(p),"x",60,true,"Long wait");
  assert.equal(await art(p,total).locator(".kpi").innerText(),"108");
  await setInput(p,'[data-axis-key="x"][data-bound="min"]',0);
  await setInput(p,'[data-axis-key="x"][data-bound="max"]',80);
  await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);await source(p).waitFor();await settled(p);
  const data=(await readFile("web/datasets/wait/Visit.csv","utf8")).trim().split(/\r?\n/).slice(1);
  const counts=new Map();
  for (const line of data) {
    const [,,,wait,,visits]=line.split(",").map(Number);
    counts.set(wait,(counts.get(wait)||0)+visits);
  }
  const actual=await minutes(p);
  const threshold=await verifyGeometry(source(p),"x",60,true,"Long wait");
  assert.equal(await source(p).locator('[data-axis-title="x"]').textContent(),"Wait (minutes)");
  assert.equal(actual.length,counts.size);
  const first=actual[0],last=actual.at(-1),scale=(last.x-first.x)/(last.wait-first.wait);
  for (const d of actual) {
    assert.equal(d.visits,counts.get(d.wait));
    assert.ok(Math.abs(d.x-(first.x+(d.wait-first.wait)*scale))<1e-7);
  }
  assert.equal(await art(p,total).locator(".kpi").innerText(),String(data.length));
  const most=actual.reduce((a,b)=>b.visits>a.visits ? b : a);
  await capture(p,"wait-frequency");
  await source(p).locator('[data-selection-key="['+most.wait+']"]').press("Enter");await settled(p);
  assert.equal(await art(p,total).locator(".kpi").innerText(),String(most.visits));
  const result={link,visits:data.length,distinctWaits:counts.size,most,scale,first,last,threshold,
    longWaits:[...counts].filter(([m])=>m>=60).reduce((sum,[,n])=>sum+n,0)};
  await writeFile("portfolio-evidence/wait-frequency.json",JSON.stringify(result,null,2));console.log(result);
});
