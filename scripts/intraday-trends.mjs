import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const pageName="Overnight dispatch", trend="Parcels at scan time", total="Parcels scanned";
const series=p=>art(p,trend);
const points=p=>series(p).locator(".plot-mark:has(circle)").evaluateAll(es=>es.map(el=>({
  timestamp:JSON.parse(el.dataset.selectionKey)[0],value:Number(el.dataset.value),x:Number(el.querySelector("circle").getAttribute("cx")),
})).sort((a,b)=>a.x-b.x));
const baseline=process.argv.includes("--baseline");
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const tab=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (!await tab.count()) {
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles(resolve("web/datasets/gallery/Scans.csv"));
    await p.getByTitle("Scans.ScanTime",{exact:true}).waitFor();
    await addPage(p,pageName);
    await visual(p,"card",total,[],["Scans · Parcels"],[22,20,290,120]);
    await visual(p,"line",trend,["Scans · ScanTime"],["Scans · Parcels"],[22,155,944,350]);
    if (baseline) {
      const categorical=await points(p);
      await p.getByLabel("Continuous date axis").check();await settled(p);
      const message=await series(p).locator(".vempty").innerText();
      await writeFile("portfolio-evidence/intraday-before.json",JSON.stringify({categorical,message},null,2));return;
    }
    await p.getByLabel("Continuous date axis").check();await settled(p);
    await save(p);
  } else {await tab.click();await settled(p);}
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);await series(p).waitFor();await settled(p);
  const values=await points(p);
  assert.deepEqual(values.map(d=>d.value),[8,14,16,21]);
  const gaps=values.slice(1).map((d,i)=>d.x-values[i].x);
  assert.ok(Math.abs(gaps[1]/gaps[0]-40/15)<1e-7 && Math.abs(gaps[2]/gaps[0]-80/15)<1e-7);
  assert.equal(await art(p,total).locator(".kpi").innerText(),"59");
  const ticks=await series(p).locator("[data-tick-date]").allTextContents();
  assert.ok(new Set(ticks).size>=3);
  await capture(p,"gallery-overnight-dispatch");
  await series(p).locator('.plot-mark[data-value="14"]').press("Enter");await settled(p);
  assert.equal(await art(p,total).locator(".kpi").innerText(),"14");
  await series(p).getByLabel("Clear selection").click();await settled(p);
  assert.equal(await art(p,total).locator(".kpi").innerText(),"59");
  await writeFile("portfolio-evidence/intraday-trends.json",JSON.stringify({link,values,gaps,ticks,total:59,selected:14},null,2));console.log({link,gaps,ticks});
});
