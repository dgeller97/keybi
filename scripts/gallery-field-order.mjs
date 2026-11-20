import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { addPage, art, capture, currentPageLink, open, save, settled, studio, visual } from "./portfolio-ui.mjs";
import { dragBinding } from "./field-order.mjs";

const report = "Visual Gallery", page = "Channel performance";
const chart = "Revenue by channel and region", matrix = "Channel operating results", card = "Revenue for selection";
const records = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim()
  .split(/\r?\n/).slice(1).map(line => line.split(","));
const tabs = p => p.locator("#pages .page").filter({hasText:page});
const build = async (p,title) => {
  await art(p,title).locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
};
const fields = (...names) => names.map(name => "Dispatch · " + name);
const expected = new Map();
for (const [,region,channel,,revenue] of records) {
  const key = JSON.stringify([channel,region]);
  expected.set(key,(expected.get(key) || 0) + Number(revenue));
}
async function checkMarks(p,title) {
  const plot = art(p,title);
  assert.deepEqual(await plot.locator("[data-axis-parent]").allTextContents(),["Online","Retail"]);
  assert.deepEqual(await plot.locator("[data-axis-child]").allTextContents(),["East","West","East","West"]);
  for (const [key,revenue] of expected) {
    const [channel,region] = JSON.parse(key);
    const mark = plot.locator('[data-point][aria-label^="Channel ' + channel + ', Region ' + region + '"]');
    assert.equal(Number(await mark.getAttribute("data-value")),revenue);
  }
}
await studio(async p => {
  await open(p,report);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:"Revenue by region and channel",exact:true}).click();
  await settled(p);
  await build(p,"Revenue by region");
  await art(p,"Revenue by region").locator('[data-point][aria-label^="Region East, Channel Online"]').press("Enter");
  await settled(p);
  await dragBinding(p,"groups",1,0);
  await checkMarks(p,"Revenue by region");
  assert.equal(await art(p,"Selected revenue").locator(".kpi").innerText(),"$409.00");
});
await studio(async p => {
  await open(p,report);
  if (!(await tabs(p).count())) {
    await addPage(p,page);
    await visual(p,"card",card,[],fields("Revenue"),[675,18,300,125],"currency");
    await visual(p,"card","Revenue attainment for selection",[],["Revenue attainment"],[675,162,300,181],"percent");
    await visual(p,"matrix",matrix,fields("Channel","Region"),fields("Revenue","Orders"),[18,369,957,245]);
    await build(p,matrix);
    await p.getByRole("button",{name:"Move Orders up",exact:true}).click();
    await settled(p);
    await visual(p,"clusteredColumn",chart,fields("Region","Channel"),fields("Revenue"),[18,18,635,325],"currency");
    await p.getByLabel("Data labels",{exact:true}).check();
    await art(p,chart).locator("[data-drill=expand]").click();
    await settled(p);
    await build(p,chart);
    await dragBinding(p,"groups",1,0);
    await checkMarks(p,chart);
    await p.locator('[data-page="0"]').click();
    await save(p);
  }
});
await studio(async p => {
  await open(p,report);
  await tabs(p).click();
  await settled(p);
  const url = await currentPageLink(p);
  await checkMarks(p,chart);
  const plot = art(p,chart);
  for (const [key,revenue] of expected) {
    const [channel,region] = JSON.parse(key);
    await plot.locator('[data-point][aria-label^="Channel ' + channel + ', Region ' + region + '"]').press("Enter");
    await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"$"+revenue+".00");
    const target = records.filter(([,r,c]) => r===region && c===channel).reduce((s,r) => s+Number(r[5]),0);
    assert.equal(await art(p,"Revenue attainment for selection").locator(".kpi").innerText(),
      (revenue/target).toLocaleString("en-US",{style:"percent",maximumFractionDigits:2}));
    const totals = await art(p,matrix).locator("tr.matrix-total td").allTextContents();
    const orders = records.filter(([,r,c]) => r===region && c===channel).reduce((s,r) => s+Number(r[3]),0);
    assert.deepEqual(totals,["Grand total",String(orders),String(revenue)]);
  }
  await build(p,chart);
  assert.equal(await plot.locator('[aria-pressed="true"] text').evaluate(t => getComputedStyle(t).stroke),"none");
  await capture(p,"gallery-field-order");
  await writeFile("portfolio-evidence/gallery-field-order.json",JSON.stringify({url,axis:["Channel","Region"],results:Object.fromEntries(expected)},null,2)+"\n");
  console.log("Both axis orders reconciled. Reopened Channel performance with matching orders and revenue for all four selections.");
});
