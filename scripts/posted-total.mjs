import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const card="Posted departments variance";
const expression="SUMX(VALUES('Department'[Department]), [Posted variance])";
const ledger=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
const dollars=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
async function review(p) {
  await open(p,"Budget vs. Actual");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:"Forecast review",exact:true}).click(); await settled(p);
  return original;
}
await studio(async p=>{
  const original=await review(p);
  if (await art(p,card).count()) return;
  await formula(p,card,expression,"currency");
  for (const [name,x,w] of [["Forecast period",18,197],["Monthly forecast",227,230],["Above forecast",469,230]]) {
    await art(p,name).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await position(p,[x,18,w,118]);
  }
  await visual(p,"card",card,[],[card],[711,18,267,118]);
  await p.locator(`[data-page="${original}"]`).click(); await save(p);
});
await studio(async p=>{
  await review(p);
  const result={};
  for (const [period,{departments,totals}] of Object.entries(ledger)) {
    await art(p,"Forecast period").locator("select").selectOption({label:period}); await settled(p);
    const posted=departments.filter(d=>d[1]!=null).reduce((s,d)=>s+d[3],0);
    assert.equal(await art(p,card).locator(".kpi").innerText(),dollars.format(posted));
    assert.equal(await art(p,"Above forecast").locator(".kpi").innerText(),dollars.format(totals[2]));
    result[period]={posted,ledger:totals[2]};
    if(period==="2026-02") await capture(p,"budget-posted-total");
  }
  await writeFile("portfolio-evidence/budget-posted-total.json",JSON.stringify({expression,months:result},null,2)+"\n");
});
