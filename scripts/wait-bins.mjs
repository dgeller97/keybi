import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { addPage, art, capture, currentPageLink, open, position, save, settled, studio, visual } from "./portfolio-ui.mjs";
import { formatChart } from "./reference-geometry.mjs";

const pageName = "Wait intervals", chart = "Visits by ten-minute wait", table = "Visits in the selected interval";
const source = (await readFile("web/datasets/wait/Visit.csv","utf8")).trim().split(/\r?\n/).slice(1)
  .map(line => { const [id,service,,wait] = line.split(","); return [id,service,Number(wait)]; });
const expected = source.filter(([, ,wait]) => wait >= 60 && wait < 70);
const counts = new Map();
for (const [, ,wait] of source) {
  const lower = Math.floor(wait / 10) * 10;
  counts.set(lower,(counts.get(lower) || 0) + 1);
}
let link;
await studio(async p => {
  await open(p,"Wait-Time Performance");
  const origin = await p.locator("#pages .active").getAttribute("data-page");
  const tab = p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (!await tab.count()) {
    await addPage(p,pageName);
    await visual(p,"clusteredColumn",chart,["Visit · Wait"],["Visit · Visits"],[18,16,968,268]);
    await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Replace Wait",exact:true}).click();
    await p.getByRole("button",{name:"Create numeric bins"}).click();
    await p.getByLabel("Bin field name").fill("Wait interval");
    await p.getByLabel("Bin size").fill("10");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Visit.Wait interval",{exact:true}).waitFor();
    await visual(p,"table",table,["Visit · Record","Visit · Service","Visit · Wait"],[],[18,300,968,250]);
    await save(p);
  } else {await tab.click();await settled(p);}
  await formatChart(p,chart);
  await p.getByLabel("Show empty intervals").check();await settled(p);
  await position(p,[18,16,968,208]);
  await formatChart(p,table);await position(p,[18,236,968,310]);
  await save(p);
  link = (await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p => {
  await p.goto(link);await art(p,chart).waitFor();await settled(p);
  const bars = art(p,chart).locator(".plot-mark");
  const displayed = await bars.evaluateAll(es => es.map(e => [JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)]));
  assert.deepEqual(displayed,[...counts].sort((a,b)=>a[0]-b[0]));
  const labels = await art(p,chart).locator("[data-axis-pick]").evaluateAll(es => es.map(e =>
    ({start:JSON.parse(e.dataset.axisPick)[0],x:Number(e.getAttribute("x")),text:e.textContent})));
  assert.deepEqual(labels.map(d=>d.start),[0,10,20,30,40,50,60,70]);
  assert.ok(labels.every((d,i) => Math.abs(d.x-labels[0].x-i*(labels[1].x-labels[0].x)) < 1e-8));
  const empty=art(p,chart).locator('[data-axis-pick="[50]"]');
  await empty.press("Enter");await settled(p);
  assert.equal(await art(p,table).locator("tbody tr").count(),0);
  await empty.press("Enter");await settled(p);
  const interval = art(p,chart).locator('[data-selection-key="[60]"]');
  assert.match(await interval.getAttribute("aria-label"),/60–<70/);
  await interval.press("Enter");await settled(p);
  const rows = await art(p,table).locator("tbody tr").evaluateAll(es => es.map(e =>
    [...e.querySelectorAll("td")].map(td=>td.textContent)));
  assert.deepEqual(rows,expected.map(([id,service,wait]) => [id,service,String(wait)]));
  await capture(p,"wait-intervals");
  await interval.press("Enter");await settled(p);
  assert.ok(await art(p,table).locator("tbody tr").count() > expected.length);
  await writeFile("portfolio-evidence/wait-intervals.json",JSON.stringify({link,visits:source.length,displayed,labels,emptyIntervalRows:0,selected:rows},null,2));
  console.log("Verified interval counts and selected records",rows,link);
});
