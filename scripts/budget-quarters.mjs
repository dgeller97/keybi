import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const name = "Quarterly spending", chart = "Actual and budget by calendar quarter";
const ledger = "Monthly reconciliation", metrics = ["Transaction · Actual","Budget · Budget"];
const money = n => n.toLocaleString("en-US",{style:"currency",currency:"USD"});
const csv = async name => (await readFile("web/datasets/budget/"+name+".csv","utf8"))
  .trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
const periods = new Map(await csv("Period"));
const rows = [...periods].map(([key,month])=>({key,month,actual:0,budget:0}));
for (const [,period,,value] of await csv("Transaction")) rows.find(r=>r.key===period).actual+=Number(value);
for (const [period,,value] of await csv("Budget")) rows.find(r=>r.key===period).budget+=Number(value);
const quarters = new Map();
for (const row of rows) {
  const date = new Date(row.month+"-01T00:00:00Z");
  date.setUTCMonth(3*Math.floor(date.getUTCMonth()/3));
  const key = date.toISOString();
  if (!quarters.has(key)) quarters.set(key,[]);
  quarters.get(key).push(row);
}
const totals = entries => entries.reduce(([a,b],r)=>[a+r.actual,b+r.budget],[0,0]);
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const existing=p.locator("#pages").getByRole("button",{name,exact:true});
  if (await existing.count()) {await existing.click();await settled(p);}
  else {
    await addPage(p,name);
    await p.getByTitle("Period.Period",{exact:true}).click({button:"right"});
    await p.getByLabel("Interval unit").selectOption({label:"Quarters"});
    await p.getByLabel("Bin field name").fill("Calendar quarter");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Period.Calendar quarter",{exact:true}).waitFor();
    await visual(p,"card","Posted actual",[],[metrics[0]],[18,10,306,84],"currency");
    await visual(p,"card","Authorized budget",[],[metrics[1]],[343,10,306,84],"currency");
    await visual(p,"card","Actual less budget",[],["Variance"],[668,10,306,84],"currency");
    await visual(p,"clusteredColumn",chart,["Period · Calendar quarter"],metrics,[18,104,956,204],"currency");
    await p.getByLabel("Data labels",{exact:true}).check();await settled(p);
    await visual(p,"table",ledger,["Period · Period"],[...metrics,"Variance"],[18,320,956,232],"currency");
  }
  await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
const observed=[];
await studio(async p=>{
  await p.goto(link);await art(p,chart).waitFor();await settled(p);
  const plot=art(p,chart);
  async function check(entries) {
    const [a,b]=totals(entries);
    const cards=await Promise.all(["Posted actual","Authorized budget","Actual less budget"].map(t=>art(p,t).locator(".kpi").innerText()));
    assert.deepEqual(cards,[a,b,a-b].map(money));
    const lines=await art(p,ledger).locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
    assert.deepEqual(lines,entries.map(r=>[r.month,...[r.actual,r.budget,r.actual-r.budget].map(money)]));
    return {cards,lines};
  }
  await check(rows);
  const labels=await plot.locator("[data-axis-pick]").allTextContents();
  assert.deepEqual(labels,["2026 Q1","2026 Q2"]);
  for (const [key,entries] of quarters) {
    const data=plot.locator(".plot-mark[data-selection-key='"+JSON.stringify([key])+"']");
    const values=await data.evaluateAll(es=>es.map(e=>Number(e.dataset.value)));
    assert.deepEqual(values,totals(entries));
    await data.first().press("Enter");await settled(p);
    observed.push({key,values,...await check(entries)});
  }
  await capture(p,"budget-quarterly-spending");
  await plot.locator("[data-clear]").click();await settled(p);await check(rows);
  await writeFile("portfolio-evidence/calendar-quarter.json",JSON.stringify({link,labels,observed},null,2));
  console.log("Reconciled both quarters, all monthly detail, variance and clearing across two fact tables",link);
});
