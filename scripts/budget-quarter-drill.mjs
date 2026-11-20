import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const baseline=process.argv.includes("--baseline");
const {observed,link}=JSON.parse(await readFile("portfolio-evidence/calendar-quarter.json","utf8"));
const chart="Actual and budget by calendar quarter", page="Quarterly spending";
await studio(async p=>{
  await open(p,"Budget vs. Actual");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:page,exact:true}).click();await settled(p);
  const plot=art(p,chart);
  await plot.locator(".vhead").click();await p.locator("[data-tab=Build]").click();
  if (!await plot.locator('[data-drill="expand"]').count()) {
    await p.locator("[data-pick=groups]").selectOption({label:"Period · Period"});await settled(p);
  }
  await plot.locator('[data-drill="expand"]').click();await settled(p);
  const parents=await plot.locator("[data-axis-parent]").allTextContents();
  const leaves=await plot.locator("[data-axis-child]").allTextContents();
  assert.deepEqual(leaves,observed.flatMap(group=>group.lines.map(line=>line[0])));
  const amounts=await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>Number(e.dataset.value)));
  const monthly=observed.flatMap(group=>group.lines.map(line=>line.slice(1,3).map(s=>Number(s.replace(/[^\d.-]/g,"")))));
  assert.deepEqual(amounts,monthly.flat());
  await capture(p,baseline ? "quarter-drill-before" : "budget-quarter-drill");
  await plot.locator('[data-drill="up"]').click();await settled(p);
  await plot.locator('.plot-mark[data-value="16447"]').press("Enter");await settled(p);
  await plot.locator('[data-drill="down"]').click();await settled(p);
  const path=await plot.locator(".drill-path").innerText();
  assert.deepEqual(await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>Number(e.dataset.value))),monthly.slice(0,3).flat());
  if (baseline) {
    assert.ok(parents.some(s=>s.includes("T00:00")));assert.match(path,/T00:00/);
  } else {
    assert.deepEqual(parents,["2026 Q1","2026 Q2"]);assert.equal(path,"2026 Q1 › Period");
    await plot.locator('.plot-mark[data-value="3328"]').press("Enter");await settled(p);
    assert.equal(await art(p,"Actual less budget").locator(".kpi").innerText(),"-$3,272.00");
    await plot.locator('[data-drill="up"]').click();await settled(p);
    if (await plot.locator("[data-clear]").count()) await plot.locator("[data-clear]").click();
    await p.locator('[data-page="'+origin+'"]').click();await save(p);
  }
  await writeFile("portfolio-evidence/"+(baseline ? "quarter-drill-before" : "quarter-drill")+".json",JSON.stringify({parents,leaves,path,monthly,link},null,2));
});
