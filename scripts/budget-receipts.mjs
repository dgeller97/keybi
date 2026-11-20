import assert from "node:assert/strict";
import {resolve} from "node:path";
import {writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
const pageName="Receiving reconciliation",source="Goods receipts",table="Receiving review",ledger="Order and receipt exceptions",delta="Ordered less received";
const field=name=>table+" · "+name;
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page"),tab=pages.getByRole("button",{name:pageName,exact:true});
  if(await tab.count()){await tab.click();await settled(p);}else{
    await addPage(p,pageName);
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles(resolve("web/datasets/budget/Goods receipts.csv"));await p.getByTitle(source+".Receipt order",{exact:true}).waitFor();
    await p.getByRole("button",{name:"Model view",exact:true}).click();await p.getByRole("button",{name:"Merge tables",exact:true}).click();const d=p.getByRole("dialog");
    await d.getByLabel("Left table",{exact:true}).selectOption({label:"Purchase lines"});await d.getByLabel("Right table",{exact:true}).selectOption({label:source});
    await d.getByLabel("Left match column").selectOption({label:"Order"});await d.getByLabel("Right match column").selectOption({label:"Receipt order"});
    await d.getByLabel("Join kind").selectOption("full");await d.getByLabel("Prefix with right table name").uncheck();await d.getByLabel("Output table").fill(table);
    await d.getByRole("button",{name:"Create table",exact:true}).click();await d.waitFor({state:"hidden"});
    await p.locator(".rail [data-action=report]").click();
    const a="SUM('Receiving review'[Line amount])",b="SUM('Receiving review'[Received amount])";
    await formula(p,delta,a+" - "+b,"currency");
    await formula(p,"Receiving status",'IF(ISBLANK('+a+'), "Receipt only", IF(ISBLANK('+b+'), "Order only", IF([Ordered less received] == 0, "Matched", "Difference")))');
    await visual(p,"card","Purchase order amount",[],[field("Line amount")],[14,12,306,110],"currency");
    await visual(p,"card","Receipt amount",[],[field("Received amount")],[340,12,316,110],"currency");
    await visual(p,"card","Unreconciled amount",[],[delta],[675,12,307,110],"currency");
    await visual(p,"table",ledger,[field("Order"),field("Receipt order")],[field("Line amount"),field("Received amount"),delta,"Receiving status"],[14,142,968,348]);
    await p.locator("[data-tab=Format]").click();
    for(const name of ["Line amount","Received amount"])await p.getByLabel("Number format for "+name,{exact:true}).selectOption("currency");
  }
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const grid=art(p,ledger);await grid.locator("tbody tr").first().waitFor();await settled(p);
  const rows=await grid.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
  assert.equal(await art(p,"Purchase order amount").locator(".kpi").innerText(),"$225.75");
  assert.equal(await art(p,"Receipt amount").locator(".kpi").innerText(),"$205.50");
  assert.equal(await art(p,"Unreconciled amount").locator(".kpi").innerText(),"$20.25");
  assert.equal(rows.length,6);const key=row=>row.find(s=>s.startsWith("P-"));
  assert.deepEqual(Object.fromEntries(rows.map(r=>[key(r),[r[4],r[5]]])),
    {"P-01":["$0.00","Matched"],"P-02":["$5.00","Difference"],"P-03":["$0.00","Order only"],"P-04":["$0.00","Matched"],"P-05":["$33.50","Order only"],"P-06":["-$18.25","Receipt only"]});
  await capture(p,"budget-receiving-reconciliation");
  await grid.locator("tbody tr").filter({hasText:"P-06"}).click();await settled(p);
  if(process.env.FOLIO_RECEIPT_BASELINE==="1"){
    assert.equal(await art(p,"Receipt amount").locator(".kpi").innerText(),"$205.50");
    await writeFile("portfolio-evidence/detail-selection-before.json",JSON.stringify({link,clicked:"P-06",selectedAmount:18.25,displayedAfterClick:205.5,rows},null,2));return;
  }
  assert.equal(await art(p,"Receipt amount").locator(".kpi").innerText(),"$18.25");
  assert.equal(await art(p,"Purchase order amount").locator(".kpi").innerText(),"—");
  await writeFile("portfolio-evidence/budget-receiving.json",JSON.stringify({link,rows,orders:225.75,receipts:205.50,outstanding:20.25},null,2));
});

