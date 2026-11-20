import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const name="Posted variance";
const expression="IF(ISBLANK(SUM('Transaction'[Actual])), BLANK(), [Actual less forecast])";
const ledger=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
const currency=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
async function review(p) {
  await open(p,"Budget vs. Actual");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:"Forecast review",exact:true}).click();
  await settled(p);
  return original;
}
const grid=p=>art(p,"Department forecast review");
await studio(async p=>{
  const original=await review(p);
  await grid(p).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({label:"Actual"});
  if (!(await p.getByLabel("Base icons on").getByRole("option",{name,exact:true}).count())) {
    await formula(p,name,expression,"currency");
    await settled(p);
  }
  await p.getByLabel("Base icons on").selectOption({label:name}); await settled(p);
  await p.getByLabel("Apply to measure").selectOption({label:"Actual less forecast"});
  await p.getByLabel("Base colors on").selectOption({label:name}); await settled(p);
  await p.locator(`[data-page="${original}"]`).click();
  await save(p);
});
await studio(async p=>{
  await review(p);
  const months={};
  for (const [month,{departments,totals}] of Object.entries(ledger)) {
    await art(p,"Forecast period").locator("select").selectOption({label:month}); await settled(p);
    const rows=await grid(p).locator("tbody tr").evaluateAll(trs=>trs.map(tr=>{
      const icon=tr.cells[1].querySelector("[data-icon-band]");
      return {department:tr.cells[0].textContent.trim(),actual:tr.cells[1].textContent,
        variance:tr.cells[3].textContent,icon:icon?.getAttribute("aria-label")??null,
        background:tr.cells[3].style.backgroundColor};
    }));
    const expected=[...departments,["Grand total",...totals]];
    assert.equal(rows.length,expected.length);
    for(const [i,[department,actual,,variance]] of expected.entries()) {
      assert.equal(rows[i].department,department);
      assert.equal(rows[i].actual,actual==null?"—":currency.format(actual));
      assert.equal(rows[i].variance,currency.format(variance));
      assert.equal(Boolean(rows[i].background),actual!=null);
      if(actual==null) assert.equal(rows[i].icon,null);
      else assert.ok(rows[i].icon.startsWith(name+" "+currency.format(variance)+" · "));
    }
    months[month]=rows;
    if(month==="2026-02") await capture(p,"budget-posted-variance");
  }
  await writeFile("portfolio-evidence/budget-posted-variance.json",JSON.stringify({expression,months},null,2)+"\n");
});
