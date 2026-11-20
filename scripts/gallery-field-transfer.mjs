import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const pageName = "Channel performance";
const chart = "Revenue by channel and region", stacked = "Regional contribution by channel";
const field = name => "Dispatch · " + name;
const rows = (p,well) => p.locator('[data-well="'+well+'"] .wellrow');
const records = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1);
const ledger = new Map();
for (const line of records) {
  const [,region,channel,orders,revenue,target] = line.split(",");
  const key = channel + "/" + region, previous = ledger.get(key) || [0,0,0];
  ledger.set(key,previous.map((n,i) => n + Number([orders,revenue,target][i])));
}
async function enter(p) {
  await open(p,"Visual Gallery");
  await p.locator("#pages .page").filter({hasText:pageName}).click();
  await settled(p);
}
async function build(p,name) {
  await art(p,name).locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
}
async function drag(p,from,index,to) {
  await rows(p,from).nth(index).dragTo(p.locator('[data-pick="'+to+'"]'),{sourcePosition:{x:4,y:4}});
  await settled(p);
}
async function checkChart(p,name,swapped=false) {
  const plot = art(p,name);
  assert.deepEqual((await plot.locator("[data-series-color]").allTextContents()).sort(),swapped ? ["Online","Retail"] : ["East","West"]);
  const marks = plot.locator("[data-point]");
  assert.equal(await marks.count(),ledger.size);
  for (const [key,[,revenue]] of ledger) {
    const [channel,region] = key.split("/");
    const label = swapped ? "Region "+region+", Channel "+channel : "Channel "+channel+", Region "+region;
    assert.equal(Number(await plot.locator('[data-point][aria-label^="'+label+'"]').getAttribute("data-value")),revenue);
  }
}
await studio(async p => {
  await enter(p);
  await build(p,chart);
  const plot = art(p,chart);
  await plot.locator('[aria-label^="Channel Online, Region West"]').press("Enter");
  await settled(p);
  await drag(p,"groups",1,"legendFields");
  assert.equal(await rows(p,"groups").locator("span").innerText(),"Channel");
  assert.equal(await rows(p,"legendFields").locator("span").innerText(),"Region");
  await checkChart(p,chart);
  assert.match(await plot.locator('[data-point][aria-pressed=true]').getAttribute("aria-label"),/Online, Region West/);
  await p.getByRole("button",{name:"Move Channel to another well"}).press("Enter");
  await p.getByLabel("Destination well").selectOption({label:"Legend (swap with Region)"});
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
  await checkChart(p,chart,true);
  assert.match(await plot.locator('[data-point][aria-pressed=true]').getAttribute("aria-label"),/West, Channel Online/);
  assert.equal(await art(p,"Revenue for selection").locator(".kpi").innerText(),"$478.00");
});
await studio(async p => {
  await enter(p);
  if (await art(p,stacked).count()) return;
  await visual(p,"stackedBar",stacked,[field("Channel"),field("Region")],[field("Revenue")],[18,635,957,265],"currency");
  await p.getByLabel("Data labels",{exact:true}).check();
  await build(p,stacked);
  await drag(p,"groups",1,"legendFields");
  await checkChart(p,stacked);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async p => {
  await enter(p);
  await checkChart(p,stacked);
  const url = await currentPageLink(p);
  const plot = art(p,stacked);
  assert.ok(await plot.locator('[data-scale="primary"] text').last().evaluate(t => {
    const bounds = t.getBBox(), viewport = t.ownerSVGElement.viewBox.baseVal;
    return bounds.x + bounds.width <= viewport.width;
  }));
  for (const [key,[orders,revenue,target]] of ledger) {
    const [channel,region] = key.split("/");
    await plot.locator('[aria-label^="Channel '+channel+', Region '+region+'"]').press("Enter");
    await settled(p);
    assert.equal(await art(p,"Revenue for selection").locator(".kpi").innerText(),"$"+revenue+".00");
    assert.equal(await art(p,"Revenue attainment for selection").locator(".kpi").innerText(),
      (revenue/target).toLocaleString("en-US",{style:"percent",maximumFractionDigits:2}));
    assert.deepEqual(await art(p,"Channel operating results").locator("tr.matrix-total td").allTextContents(),["Grand total",String(orders),String(revenue)]);
  }
  await build(p,stacked);
  await plot.scrollIntoViewIfNeeded();
  await capture(p,"gallery-field-transfer");
  await writeFile("portfolio-evidence/gallery-field-transfer.json",JSON.stringify({url,axis:"Channel",legend:"Region",columns:["orders","revenue","target"],pairs:Object.fromEntries(ledger)},null,2)+"\n");
  console.log("Transferred Region to Legend, swapped an occupied legend, and reconciled four selectable revenue segments after reopening.");
});
