import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {art,capture,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

const source=resolve("web/datasets/budget/PurchaseReview.xlsx"),change=resolve("web/datasets/budget/PurchaseChanges.xlsx");
const name="Purchasing limits",ledger="Orders and approval limits";
async function rows(p) {
  return art(p,ledger).locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
}
const expected=[
  ["P-01","Facilities lead","100","$124.50"],["P-02","Surgery lead","75","$80.00"],
  ["P-03","Facilities lead","100","$0.00"],["P-04","Facilities lead","100","-$12.25"],
  ["P-05","Imaging lead","50","$33.50"],
];
export async function verifyNamedTables() {
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which purchases exceed the single-order approval limit?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();await(await chooser).setFiles(source);
    const d=p.getByRole("dialog");await d.getByRole("button",{name:"Preview Notes",exact:true}).click();
    if (process.env.FOLIO_TABLE_BASELINE==="1") {
      const choices=await d.getByRole("checkbox").evaluateAll(els=>els.map(el=>el.getAttribute("aria-label")));
      assert.deepEqual(choices,["Import Purchase lines","Import Cost centers","Import Notes"]);
      const note=await d.locator(".workbook-preview").innerText();assert.match(note,/no header/);
      await writeFile("portfolio-evidence/named-table-before.json",JSON.stringify({choices,worksheetError:note,requested:"AuthorizationLimits"},null,2));return;
    }
    await d.getByRole("checkbox",{name:"Import table PurchaseLines",exact:true}).check();
    await d.getByRole("checkbox",{name:"Import table AuthorizationLimits",exact:true}).check();
    const preview=await d.locator(".workbook-preview tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
    assert.deepEqual(preview,[["001","100","Facilities lead"],["002","75","Surgery lead"],["003","50","Imaging lead"]]);
    await capture(p,"named-table-preview");
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    await p.locator(".ribbon [data-action=relationship]").click();
    await d.getByLabel("One-side key").selectOption({label:"AuthorizationLimits · Center"});
    await d.getByLabel("Many-side key").selectOption({label:"PurchaseLines · Center"});await d.getByRole("button",{name:"Create",exact:true}).click();await d.waitFor({state:"hidden"});
    await visual(p,"table",ledger,["PurchaseLines · Order","AuthorizationLimits · Approval owner","AuthorizationLimits · Single order limit"],["PurchaseLines · Line amount"],[15,16,950,355],"currency");
    assert.deepEqual(await rows(p),expected);await save(p);
  });
  if (process.env.FOLIO_TABLE_BASELINE==="1") return;
  await studio(async p=>{
    await open(p,name);assert.deepEqual(await rows(p),expected);
    async function update(mode) {
      await p.locator('[data-action="model"]').click();
      const card=p.locator(".modelcard").filter({has:p.getByRole("heading",{name:"AuthorizationLimits",exact:true})});
      const chooser=p.waitForEvent("filechooser");await card.getByRole("button",{name:"Update from file"}).click();await(await chooser).setFiles(change);
      const d=p.getByRole("dialog");await d.locator("#update-sheet option:checked").filter({hasText:"AuthorizationLimits"}).waitFor({state:"attached"});
      assert.match(await d.locator(".workbook-preview").innerText(),/Policy changes/);
      await d.getByLabel("Load mode",{exact:true}).selectOption(mode);await d.getByRole("button",{name:"Apply update"}).click();
      if (mode==="append") {
        await d.getByRole("alert").filter({hasText:/duplicate|unique/i}).waitFor();
        await d.getByRole("button",{name:"Cancel",exact:true}).click();
      }
      await d.waitFor({state:"hidden"});await p.locator('[data-action="report"]').click();await settled(p);
    }
    await update("append");assert.deepEqual(await rows(p),expected);
    await update("replace");const updated=await rows(p);
    assert.deepEqual(updated.map(r=>r[2]),["125","70","125","125","50"]);
    const exceptions=rs=>rs.filter(([, ,limit,amount])=>Number(amount.replace(/[^\d.-]/g,""))>Number(limit)).map(r=>r[0]);
    assert.deepEqual(exceptions(expected),["P-01","P-02"]);assert.deepEqual(exceptions(updated),["P-02"]);
    await save(p);
    await writeFile("portfolio-evidence/named-tables.json",JSON.stringify({selected:["PurchaseLines","AuthorizationLimits"],original:expected,updated,excludedTotals:true,duplicateUpdateRejected:true,originalExceptions:exceptions(expected),revisedExceptions:exceptions(updated)},null,2));
  });
  await studio(async p=>{await open(p,name);assert.equal((await rows(p))[0][2],"125");});
}
