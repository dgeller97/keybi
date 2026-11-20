import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const chart="Routine encounters by calendar period", card="Visits in selected period", ledger="Encounters in selected period";
const {link}=JSON.parse(await readFile("portfolio-evidence/calendar-hierarchy.json","utf8"));
const pick=(plot,date)=>plot.locator("[data-axis-pick='"+JSON.stringify([date+"T00:00:00.000Z"])+"']");
const mark=(plot,date)=>plot.locator(".plot-mark[data-selection-key='"+JSON.stringify([date+"T00:00:00.000Z"])+"']");
async function down(p,plot,node) {
  await node.press("Enter");await settled(p);
  await plot.locator('[data-drill="down"]').click();await settled(p);
}
await studio(async p=>{
  await open(p,"Hospital Operations");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:"Calendar review",exact:true}).click();await settled(p);
  await formatChart(p,chart);await p.getByLabel("Show empty intervals").check();await settled(p);
  await art(p,card).locator(".vhead").click();await p.locator("[data-tab=Build]").click();
  const value=p.locator('[data-well="metrics"] [data-replace-field]');
  if (!(await value.getAttribute("aria-label")).includes("Encounter")) {
    await value.click();await p.getByLabel("Replacement field").selectOption({label:"Encounter · Encounter"});
    await p.getByRole("button",{name:"Replace",exact:true}).click();await settled(p);
  }
  await p.locator('[data-agg-well="metrics"]').first().selectOption("count");await settled(p);
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const plot=art(p,chart);await plot.waitFor();await settled(p);
  await down(p,plot,mark(plot,"2026-01-01"));await down(p,plot,mark(plot,"2026-01-01"));
  await down(p,plot,mark(plot,"2026-02-01"));
  const empty=await plot.locator(".empty-interval").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0].slice(0,10)));
  assert.deepEqual(empty,Array.from({length:16},(_,i)=>"2026-02-"+(i+13)));
  assert.equal(await plot.locator(".plot-mark").count(),12);
  const box=await plot.boundingBox(),b=await mark(plot,"2026-02-12").boundingBox();
  const fraction=(b.x+b.width/2-box.x)/box.width;
  assert.ok(fraction>0.36 && fraction<0.5);
  for (const date of ["2026-02-13","2026-02-28"]) {
    const slot=pick(plot,date);
    if (date.endsWith("13")) await slot.locator("rect").click();else await slot.press("Enter");
    await settled(p);
    assert.equal(await slot.getAttribute("aria-pressed"),"true");
    assert.equal(await art(p,card).locator(".kpi").innerText(),"0");
    assert.equal(await art(p,ledger).locator("tbody tr").count(),0);
    assert.equal(await slot.locator("text").textContent(),date);
  }
  await p.mouse.move(16,14);
  const cardBox=await art(p,card).boundingBox();assert.ok(cardBox.y+cardBox.height<box.y);
  await capture(p,"hospital-empty-february");
  await mark(plot,"2026-02-01").press("Enter");await settled(p);
  assert.equal(await art(p,card).locator(".kpi").innerText(),"4");
  await p.reload();await plot.waitFor();await settled(p);
  await down(p,plot,mark(plot,"2026-01-01"));
  await down(p,plot,pick(plot,"2026-07-01"));
  assert.equal(await plot.locator(".empty-interval").count(),3);
  await down(p,plot,pick(plot,"2026-09-01"));
  assert.equal(await plot.locator(".empty-interval").count(),30);
  await pick(plot,"2026-09-30").press("Enter");await settled(p);
  assert.equal(await art(p,card).locator(".kpi").innerText(),"0");
  await writeFile("portfolio-evidence/month-coverage.json",JSON.stringify({link,empty,lastOccupiedFraction:fraction,
    februaryDays:28,februaryFirstDayVisits:4,emptySeptemberDays:30,finalDayVisits:0},null,2));
  console.log("Verified all 28 days in February and all 30 days of an empty September, including pointer and keyboard selection.",link);
});
