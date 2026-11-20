import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,position,save,setInput,settled,studio} from "./portfolio-ui.mjs";
import {defineParameter} from "./imported-field-parameter.mjs";

const parameter = "Measures to compare", revenue = "Dispatch revenue", orders = "Dispatch orders";
const chart = "Dispatch by selected group", table = "Dispatch totals";
async function enter(p) {
  await open(p,"Visual Gallery");
  await p.getByRole("button",{name:"Compare groupings",exact:true}).click();
  await settled(p);
}
await studio(async p => {
  await enter(p);
  if (await art(p,parameter).count()) return;
  await defineParameter(p,parameter,[revenue,orders],revenue,false,"measure",true);
  await art(p,"Operating measure").locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-parameter-binding]").selectOption({label:parameter});
  await p.locator("[data-tab=Format]").click();
  await setInput(p,"#vtitle",parameter);
  for (const name of [chart,table]) {
    await art(p,name).locator(".vhead strong").click();
    await p.locator("[data-tab=Build]").click();
    await p.getByTitle(parameter,{exact:true}).dragTo(p.locator("[data-well=metrics] .wellrow"));
    await p.locator("[data-tab=Format]").click();
    if (name === chart) await p.getByLabel("Data labels",{exact:true}).check();
    await position(p,name === chart ? [20,150,530,320] : [562,150,412,320]);
  }
  await art(p,parameter).getByLabel(orders,{exact:true}).check();
  await settled(p);
  assert.deepEqual(await art(p,table).locator("th").allTextContents(),["Region",revenue,orders]);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const lines = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const columns = lines.shift().split(",");
const amounts = (group,member) => {
  const key = columns.indexOf(group), val = columns.indexOf(member === orders ? "Orders" : "Revenue"), sums = new Map();
  for (const line of lines) {
    const row = line.split(",");
    sums.set(row[key],(sums.get(row[key]) || 0) + Number(row[val]));
  }
  return sums;
};
await studio(async p => {
  await enter(p);
  const selector = art(p,parameter), plot = art(p,chart), detail = art(p,table);
  const checks = [];
  const colors = new Map();
  async function check(group,members) {
    assert.deepEqual(await detail.locator("th").allTextContents(),[group,...members]);
    assert.deepEqual(await plot.locator("[data-series-color]").allTextContents(),members);
    for (const member of members) {
      const color = await plot.locator('[data-series-color="'+member+'"]').getAttribute("data-color");
      if (colors.has(member)) assert.equal(color,colors.get(member));
      colors.set(member,color);
    }
    const sums = members.map(member => amounts(group,member));
    const rows = [];
    for (const key of [...sums[0].keys()].sort()) {
      const row = [key];
      for (const [i,member] of members.entries()) {
        const n = sums[i].get(key), formatted = member === revenue ? "$"+n.toFixed(2) : String(n);
        const mark = plot.locator('[data-point][aria-label^="'+group+' '+key+' · '+member+':"]');
        assert.equal(Number(await mark.getAttribute("data-value")),n);
        assert.equal(await mark.locator("text").textContent(),formatted);
        row.push(formatted);
      }
      rows.push(row);
    }
    assert.deepEqual(await detail.locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent))),rows);
    checks.push({group,members,rows});
  }
  await check("Region",[revenue,orders]);
  await capture(p,"gallery-multi-measure");
  await art(p,"Group dispatch by").getByRole("combobox").selectOption({label:"Channel"});
  await settled(p);
  await check("Channel",[revenue,orders]);
  await selector.getByLabel(revenue).uncheck();
  await settled(p);
  await check("Channel",[orders]);
  await selector.getByLabel(revenue).check();
  await settled(p);
  await check("Channel",[orders,revenue]);
  await writeFile("portfolio-evidence/gallery-multi-measure.json",JSON.stringify({url:await currentPageLink(p),checks},null,2)+"\n");
});
