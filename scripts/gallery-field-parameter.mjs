import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const title = "Visual Gallery", page = "Channel performance", parameter = "Operating measure";
const chart = "Regional contribution by channel", table = "Channel and region detail";
const revenue = "Dispatch revenue", orders = "Dispatch orders";
async function enter(p) {
  await open(p,title);
  await p.locator("#pages .page").filter({hasText:page}).click();
  await settled(p);
}
async function layout(p,name,box) {
  await art(p,name).locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  await position(p,box);
}
await studio(async p => {
  await enter(p);
  if (await art(p,table).count()) return;
  await formula(p,orders,"SUM('Dispatch'[Orders])","number");
  await layout(p,"Revenue by channel and region",[18,450,515,310]);
  await layout(p,"Channel operating results",[548,450,428,310]);
  await layout(p,"Revenue for selection",[356,18,300,111]);
  await layout(p,"Revenue attainment for selection",[672,18,304,111]);
  await layout(p,chart,[18,147,565,286]);
  await p.locator(".ribbon [data-action=new-parameter]").click();
  const form = p.locator("dialog");
  await form.getByLabel("Parameter name").fill(parameter);
  await form.getByLabel(revenue,{exact:true}).check();
  await form.getByLabel(orders,{exact:true}).check();
  await form.getByLabel("Default measure").selectOption({label:revenue});
  await form.getByRole("button",{name:"Create parameter"}).click();
  await p.locator("[data-tab=Format]").click();
  await position(p,[18,18,322,111]);
  await art(p,chart).locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.getByTitle(parameter,{exact:true}).dragTo(p.locator("[data-well=metrics] .wellrow"));
  await settled(p);
  assert.equal(await p.locator("[data-well=metrics] .bound-name span").innerText(),parameter);
  await visual(p,"table",table,["Dispatch · Channel","Dispatch · Region"],[parameter],[600,147,376,286]);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const raw = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1);
const ledger = new Map();
for (const line of raw) {
  const [,region,channel,count,amount] = line.split(",");
  const key = channel+"/"+region, pair = ledger.get(key) || [0,0];
  ledger.set(key,[pair[0]+Number(amount),pair[1]+Number(count)]);
}
await studio(async p => {
  await enter(p);
  const selector = art(p,parameter).getByRole("combobox");
  const plot = art(p,chart), detail = art(p,table);
  const rows = () => detail.locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
  for (const choice of [revenue,orders,revenue,orders]) {
    await selector.selectOption({label:choice});
    await settled(p);
    assert.equal(await detail.locator("th").last().innerText(),choice);
    const actual = await rows();
    assert.equal(actual.length,4);
    for (const [key,pair] of ledger) {
      const [channel,region] = key.split("/"), value = pair[choice === revenue ? 0 : 1];
      const display = choice === revenue ? "$"+value+".00" : String(value);
      const mark = plot.locator('[data-point][aria-label^="Channel '+channel+', Region '+region+'"]');
      assert.equal(await mark.locator("text").textContent(),display);
      assert.ok(actual.some(r => r.join("/") === key+"/"+display));
    }
  }
  const west = plot.locator('[aria-label^="Channel Online, Region West"]');
  await west.press("Enter");
  await settled(p);
  assert.deepEqual(await rows(),[["Online","West","33"]]);
  await selector.selectOption({label:revenue});
  await settled(p);
  assert.equal(await west.getAttribute("aria-pressed"),"true");
  assert.deepEqual(await rows(),[["Online","West","$478.00"]]);
  await selector.selectOption({label:orders});
  await settled(p);
  const url = await currentPageLink(p);
  await plot.getByRole("button",{name:"Clear selection"}).click();
  await settled(p);
  await capture(p,"gallery-field-parameter");
  await writeFile("portfolio-evidence/gallery-field-parameter.json",JSON.stringify({url,parameter,chart,table,default:revenue,members:[revenue,orders],totals:Object.fromEntries(ledger)},null,2)+"\n");
  console.log("A reader switched the saved chart and table together. Every formatted pair and the West/Online cross-filter reconciled.");
});
