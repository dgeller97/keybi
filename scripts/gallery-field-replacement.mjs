import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const title = "Regional contribution by channel", metric = "Dispatch revenue";
const legacy = "Regional contribution to channel revenue";
const values = p => p.locator('[data-well="metrics"] .wellrow');
const ledger = new Map();
for (const row of (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1)) {
  const [,region,channel,orders,revenue] = row.split(",");
  const pair = channel+"/"+region, totals = ledger.get(pair) || {orders:0,revenue:0};
  totals.orders += Number(orders);
  totals.revenue += Number(revenue);
  ledger.set(pair,totals);
}
async function enter(p) {
  await open(p,"Visual Gallery");
  await p.locator("#pages .page").filter({hasText:"Channel performance"}).click();
  await settled(p);
  const chart = await art(p,title).count() ? art(p,title) : art(p,legacy);
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
}
async function replace(p,field) {
  await values(p).locator("[data-replace-field]").press("Enter");
  await p.getByLabel("Replacement field").selectOption({label:field});
  await p.getByRole("button",{name:"Replace",exact:true}).click();
  await settled(p);
}
async function check(p,key) {
  const chart = art(p,title);
  assert.equal(await values(p).count(),1);
  assert.equal(await chart.locator("[data-point]").count(),4);
  for (const [pair,totals] of ledger) {
    const [channel,region] = pair.split("/");
    const mark = chart.locator('[data-point][aria-label^="Channel '+channel+', Region '+region+'"]');
    const label = key === "revenue" ? "$"+totals.revenue+".00" : String(totals.orders);
    assert.equal(await mark.getAttribute("data-value"),String(totals[key]));
    assert.equal(await mark.locator("text").textContent(),label);
  }
}
async function labelContrast(plot) {
  const pairs = await plot.locator("[data-point]").evaluateAll(marks => marks.map(mark => ({
    foreground:getComputedStyle(mark.querySelector("text")).fill,
    background:getComputedStyle(mark.querySelector("rect")).fill
  })));
  function luminance(color) {
    const linear = color.match(/\d+/g).map(value => Number(value)/255)
      .map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
    return linear[0]*.2126 + linear[1]*.7152 + linear[2]*.0722;
  }
  return pairs.map(pair => {
    const [low,high] = [luminance(pair.foreground),luminance(pair.background)].sort((a,b) => a-b);
    const ratio = (high+.05)/(low+.05);
    assert.ok(ratio >= 4.5,JSON.stringify(pair));
    return {...pair,ratio};
  });
}
await studio(async p => {
  await enter(p);
  if (await p.locator("[data-parameter-choice]").count()) return;
  if (!await p.locator("#data .field").filter({hasText:metric}).count())
    await formula(p,metric,"SUM('Dispatch'[Revenue])","currency");
  if (await values(p).locator("span").innerText() !== metric) await replace(p,metric);
  await p.locator("[data-tab=Format]").click();
  await setInput(p,"#vtitle",title);
  await p.locator("#vformat").selectOption("auto");
  await p.locator("[data-tab=Build]").click();
  await check(p,"revenue");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async p => {
  await enter(p);
  await check(p,"revenue");
  const plot = art(p,title), west = plot.locator('[data-point][aria-label^="Channel Online, Region West"]');
  await west.press("Enter");
  await settled(p);
  await p.getByTitle("Dispatch.Orders",{exact:true}).dragTo(values(p).first());
  await settled(p);
  await check(p,"orders");
  assert.equal(await values(p).locator("span").innerText(),"Orders");
  assert.equal(await west.getAttribute("aria-pressed"),"true");
  assert.equal(await art(p,"Revenue for selection").locator(".kpi").innerText(),"$478.00");
  assert.deepEqual(await art(p,"Channel operating results").locator("tr.matrix-total td").allTextContents(),["Grand total","33","478"]);
  await plot.scrollIntoViewIfNeeded();
  const contrast = await labelContrast(plot);
  await capture(p,"gallery-field-replacement");
  await p.locator("[data-tab=Format]").click();
  await p.locator('[data-color-key="East"]').fill("#142748");
  await p.locator('[data-color-key="West"]').fill("#f4d98a");
  await settled(p);
  const custom = await labelContrast(plot);
  assert.deepEqual(new Set(custom.map(c => c.foreground)),new Set(["rgb(0, 0, 0)","rgb(255, 255, 255)"]));
  await p.locator("[data-tab=Build]").click();
  await replace(p,metric);
  await check(p,"revenue");
  assert.equal(await west.getAttribute("aria-pressed"),"true");
  const url = await currentPageLink(p);
  await writeFile("portfolio-evidence/gallery-field-replacement.json",JSON.stringify({url,chart:title,measure:metric,selected:"Online/West",pairs:Object.fromEntries(ledger),contrast,custom},null,2)+"\n");
  console.log("Replaced revenue with Orders by drag, restored the currency measure by keyboard, and reconciled every label and the selected pair.");
});
