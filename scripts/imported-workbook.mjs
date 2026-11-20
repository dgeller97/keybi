import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {art,capture,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

const workbook=resolve("web/datasets/budget/PurchaseReview.xlsx");
export async function verifyWorkbook() {
  const name="Workbook purchase review",total="Purchase total",chart="Purchases by department",ledger="Order ledger";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    await rename(p,name,"How much was authorized by each cost center?");
    async function choose() {
      const picking=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
      const chooser=await picking;assert.match(await chooser.element().getAttribute("accept"),/\.xlsx/);await chooser.setFiles(workbook);
    }
    const d=p.getByRole("dialog");
    await choose();await d.getByRole("checkbox",{name:"Import Purchase lines",exact:true}).waitFor();
    await d.getByRole("button",{name:"Cancel",exact:true}).click();assert.equal(await p.locator("#data .tree").count(),0);
    await choose();await d.getByRole("checkbox",{name:"Import Purchase lines",exact:true}).check();
    await d.getByRole("checkbox",{name:"Import Cost centers",exact:true}).check();
    await d.getByRole("button",{name:"Preview Purchase lines",exact:true}).click();
    assert.deepEqual(await d.locator("tbody tr").first().locator("td").allTextContents(),["P-01","001","2026-04-01","3","41.5","124.5"]);
    await capture(p,"workbook-worksheet-preview");
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    assert.equal(await p.locator("#data .tree").count(),2);await p.getByTitle("Purchase lines.Line amount",{exact:true}).waitFor();
    await p.locator(".ribbon [data-action=relationship]").click();
    await d.getByLabel("One-side key").selectOption({label:"Cost centers · Center"});
    await d.getByLabel("Many-side key").selectOption({label:"Purchase lines · Center"});await d.getByRole("button",{name:"Create",exact:true}).click();
    await d.waitFor({state:"hidden"});
    await visual(p,"card",total,[],["Purchase lines · Line amount"],[15,12,365,105],"currency");
    await visual(p,"clusteredColumn",chart,["Cost centers · Department"],["Purchase lines · Line amount"],[15,130,430,245],"currency");
    await visual(p,"table",ledger,["Purchase lines · Order","Purchase lines · Center","Purchase lines · Ordered on"],["Purchase lines · Line amount"],[462,130,497,245],"currency");
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$225.75");
    const values=await art(p,chart).locator("[data-point][data-metric='0']").evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[JSON.parse(n.dataset.selectionKey)[0],Number(n.dataset.value)])));
    assert.deepEqual(values,{Facilities:112.25,Imaging:33.5,Surgery:80});
    await art(p,chart).locator('[data-selection-key=\'["Facilities"]\']').press("Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$112.25");await save(p);
  });
  await studio(async p=>{
    await open(p,name);assert.equal(await art(p,total).locator(".kpi").innerText(),"$112.25");
    const rows=await art(p,ledger).locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
    assert.deepEqual(rows.map(r=>r.slice(0,3)),[["P-01","001","2026-04-01"],["P-03","001","2026-04-02"],["P-04","001","2026-04-03"]]);
    await writeFile("portfolio-evidence/workbook-import.json",JSON.stringify({sheets:["Purchase lines","Cost centers"],
      excluded:"Notes",total:225.75,facilities:112.25,rows},null,2));
    async function update(file,mode,invalid=false) {
      await p.locator('[data-action="model"]').click();
      const picking=p.waitForEvent("filechooser");await p.locator(".modelcard").filter({has:p.getByRole("heading",{name:"Purchase lines",exact:true})}).getByRole("button",{name:"Update from file"}).click();
      await (await picking).setFiles(file);
      const d=p.getByRole("dialog");
      assert.equal(await d.getByLabel("Workbook item",{exact:true}).locator("option:checked").innerText(),"Purchase lines");
      if (invalid) await d.getByLabel("Workbook item",{exact:true}).selectOption({label:"Read me"});
      await d.getByLabel("Load mode",{exact:true}).selectOption(mode);await d.getByRole("button",{name:"Apply update"}).click();
      if (invalid) {
        await d.getByRole("alert").filter({hasText:"Missing model column"}).waitFor();
        await d.getByRole("button",{name:"Cancel"}).click();
      }
      await d.waitFor({state:"hidden"});await p.locator('[data-action="report"]').click();await settled(p);
    }
    const changes=resolve("web/datasets/budget/PurchaseChanges.xlsx"),amount=()=>art(p,total).locator(".kpi").innerText();
    await update(changes,"append",true);assert.equal(await amount(),"$112.25");
    await update(changes,"append");assert.equal(await amount(),"$126.75");
    await update(changes,"replace");assert.equal(await amount(),"$14.50");
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);assert.equal(await amount(),"$126.75");
    await save(p);
  });
  await studio(async p=>{
    await open(p,name);assert.equal(await art(p,total).locator(".kpi").innerText(),"$126.75");
    await art(p,chart).locator("[data-clear]").click();await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$235.25");
    await writeFile("portfolio-evidence/workbook-update.json",JSON.stringify({worksheet:"Purchase lines",reorderedColumns:true,
      originalFacilities:112.25,invalidSheet:112.25,appendedFacilities:126.75,replacedFacilities:14.50,
      undoAndReopen:126.75,allAfterAppend:235.25},null,2));
  });
  console.log("Verified a multi-sheet workbook, typed identifiers and dates, cached formula amounts, a credit, zero, relationship and saved Facilities selection.");
}
