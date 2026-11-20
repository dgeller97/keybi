import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
const name="Purchase price check",price="Extended purchase cost",variance="Difference from workbook",ledger="Purchase line reconciliation";
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page"),tab=pages.getByRole("button",{name,exact:true});
  if(await tab.count()){await tab.click();await settled(p);}else{
    await addPage(p,name);
    await formula(p,price,"SUMX('Purchase lines', 'Purchase lines'[Quantity] * 'Purchase lines'[Unit cost])","currency");
    await formula(p,variance,"["+price+"] - SUM('Purchase lines'[Line amount])","currency");
    await formula(p,"Weighted purchase unit cost","DIVIDE([Extended purchase cost], SUM('Purchase lines'[Quantity]))","currency");
    await visual(p,"dropdown","Purchasing department",["Cost centers · Department"],[],[15,12,310,118]);
    await visual(p,"card","Recalculated cost",[],[price],[344,12,310,118]);
    await visual(p,"card","Difference from source",[],[variance],[674,12,307,118]);
    await visual(p,"matrix",ledger,["Purchase lines · Order"],["Purchase lines · Quantity","Weighted purchase unit cost",price,"Purchase lines · Line amount",variance],[15,151,966,350]);
    await p.locator("[data-tab=Build]").click();
    for(const [i,text] of [[0,"Quantity"],[1,"Cost per unit"],[2,"Extended cost"],[3,"Workbook amount"],[4,"Difference"]]){const inp=p.locator('[data-heading="metrics:'+i+'"]');await inp.fill(text);await inp.press("Tab");}
    await p.locator("[data-tab=Format]").click();await p.getByLabel("Number format for Line amount",{exact:true}).selectOption("currency");
  }
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const table=art(p,ledger);await table.locator("tbody tr").last().waitFor();await settled(p);
  const read=()=>table.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
  const original=await read();
  assert.equal(await art(p,"Recalculated cost").locator(".kpi").innerText(),"$225.75");assert.equal(await art(p,"Difference from source").locator(".kpi").innerText(),"$0.00");
  assert.deepEqual(original.map(r=>r[3]),["$124.50","$80.00","$0.00","-$12.25","$33.50","$225.75"]);
  await art(p,"Purchasing department").locator("select").selectOption({label:"Facilities"});await settled(p);
  assert.equal(await art(p,"Recalculated cost").locator(".kpi").innerText(),"$112.25");assert.equal(await art(p,"Difference from source").locator(".kpi").innerText(),"$0.00");
  const selected=await read();await capture(p,"budget-line-price-check");
  await writeFile("portfolio-evidence/budget-line-prices.json",JSON.stringify({link,all:original,facilities:selected},null,2));
});

