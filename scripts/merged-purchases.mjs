import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,capture,currentPageLink,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

const original=resolve("web/datasets/budget/PurchaseReview.xlsx"),revision=resolve("web/datasets/budget/PurchaseChanges.xlsx");
const table="Purchase approval review",excess="Excess over limit",ledger="Orders above their approval limit",total="Total above limits",count="Orders requiring approval";
const field=name=>table+" · "+name;
const modelCard=(p,name)=>p.locator(".modelcard").filter({has:p.getByRole("heading",{name,exact:true})});
const readRows=p=>art(p,ledger).locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
const initial=[["P-01","Facilities lead","$124.50","$100.00","$24.50"],["P-02","Surgery lead","$80.00","$75.00","$5.00"]];

async function createMerge(p) {
  await p.getByRole("button",{name:"Model view",exact:true}).click();
  await p.getByRole("button",{name:"Merge tables",exact:true}).click();
  const d=p.getByRole("dialog");
  await d.getByLabel("Left table",{exact:true}).selectOption({label:"Purchase lines"});
  await d.getByLabel("Right table",{exact:true}).selectOption({label:"AuthorizationLimits"});
  assert.equal(await d.getByLabel("Left match column").locator("option:checked").textContent(),"Center");
  assert.equal(await d.getByLabel("Right match column").locator("option:checked").textContent(),"Center");
  await d.getByLabel("Prefix with right table name").uncheck();
  await d.getByLabel("Output table",{exact:true}).fill(table);
  await d.getByRole("button",{name:"Preview rows"}).click();
  await d.locator(".merge-preview tbody tr").first().waitFor();
  const preview=await d.locator(".merge-preview tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
  assert.equal(preview.length,5);
  assert.deepEqual(preview.map(r=>r.slice(-2).join("|")).sort(),["100|Facilities lead","100|Facilities lead","100|Facilities lead","50|Imaging lead","75|Surgery lead"]);
  await d.screenshot({path:"portfolio-evidence/merge-preview.png"});
  await d.getByRole("button",{name:"Create table",exact:true}).click();await d.waitFor({state:"hidden"});
  await modelCard(p,table).getByRole("button",{name:"Refresh merge",exact:true}).waitFor();
  await p.locator('[data-action="report"]').click();
  await p.locator(".ribbon [data-action=calculation]").click();
  await d.getByLabel("Name",{exact:true}).fill(excess);
  await d.getByLabel("Left column").selectOption({label:field("Line amount")});
  await d.getByLabel("Operator").selectOption("-");
  await d.getByLabel("Right column").selectOption({label:field("Single order limit")});
  await d.getByRole("button",{name:"Create",exact:true}).click();await d.waitFor({state:"hidden"});
}
async function authorPage(p) {
  await createMerge(p);
  await visual(p,"card",total,[],[field(excess)],[16,12,476,120],"currency");
  await visual(p,"card",count,[],[[field("Order"),"count"]],[502,12,476,120],"number");
  await visual(p,"table",ledger,[field("Order"),field("Approval owner")],[field("Line amount"),field("Single order limit"),field(excess)],[16,145,962,236],"currency");
  await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
  const d=p.getByRole("dialog");
  await d.getByLabel("Field",{exact:true}).selectOption({label:field(excess)});
  await d.getByLabel("Condition",{exact:true}).selectOption("gt");
  await d.locator("[name=value]").fill("0");await d.getByRole("button",{name:"Apply",exact:true}).click();
  await d.waitFor({state:"hidden"});await settled(p);
}
async function check(p,rows,amount) {
  await settled(p);
  assert.deepEqual(await readRows(p),rows);
  assert.equal(await art(p,total).locator(".kpi").innerText(),amount);
  assert.equal(await art(p,count).locator(".kpi").innerText(),String(rows.length));
}

export async function verifyMergedPurchases() {
  const title="Purchasing merge verification";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"Which orders require approval?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();await (await chooser).setFiles(original);
    const d=p.getByRole("dialog");
    for(const label of ["Import Purchase lines","Import table AuthorizationLimits"]) await d.getByRole("checkbox",{name:label,exact:true}).check();
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    await authorPage(p);await check(p,initial,"$29.50");await save(p);
  });
  const revised=[["P-02","Surgery lead","$80.00","$70.00","$10.00"]];
  await studio(async p=>{
    await open(p,title);await check(p,initial,"$29.50");
    await p.getByRole("button",{name:"Model view",exact:true}).click();
    const chooser=p.waitForEvent("filechooser");await modelCard(p,"AuthorizationLimits").getByRole("button",{name:"Update from file"}).click();
    await (await chooser).setFiles(revision);const d=p.getByRole("dialog");
    await d.getByLabel("Load mode",{exact:true}).selectOption("replace");
    await d.getByRole("button",{name:"Apply update",exact:true}).click();await d.waitFor({state:"hidden"});
    const card=modelCard(p,table);await card.getByText(/Source changed/).waitFor();
    await card.getByRole("button",{name:"Refresh merge",exact:true}).click();
    await card.getByText(/Source changed/).waitFor({state:"hidden"});
    await p.locator('[data-action="report"]').click();await check(p,revised,"$10.00");
    await p.locator('header [data-action=undo]').click();await check(p,initial,"$29.50");
    await p.locator('header [data-action=redo]').click();await check(p,revised,"$10.00");await save(p);
  });
  await studio(async p=>{
    await open(p,title);await check(p,revised,"$10.00");
    const oldHash=new URL(p.url()).hash;
    await p.locator("header [data-action=library]").click();const exporting=p.waitForEvent("download");
    await p.locator("dialog [data-action=export-package]").click();const downloaded=await exporting;
    const buffer=await readFile(await downloaded.path());
    await p.locator("header [data-action=home]").click();
    const chooser=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();
    await (await chooser).setFiles({name:downloaded.suggestedFilename(),mimeType:"application/octet-stream",buffer});
    await art(p,total).waitFor();await check(p,revised,"$10.00");assert.notEqual(new URL(p.url()).hash,oldHash);
    await p.getByRole("button",{name:"Model view"}).click();const card=modelCard(p,table);
    assert.doesNotMatch(await card.innerText(),/Source changed/);
    const refreshed=p.waitForResponse(r=>r.url().endsWith("/api/merge") && r.request().method()==="POST");
    await card.getByRole("button",{name:"Refresh merge"}).click();assert.equal((await refreshed).status(),200);
    await p.locator("#save-state").getByText("Unsaved changes",{exact:true}).waitFor();
    await p.locator('[data-action="report"]').click();await check(p,revised,"$10.00");
  });
  await writeFile("portfolio-evidence/merged-purchases.json",JSON.stringify({initial,revised,beforeTotal:29.5,afterTotal:10,restored:true,refreshedAfterTransfer:true},null,2));
}

export async function saveBudgetExceptions() {
  const pageName="Approval exceptions";let link;
  await studio(async p=>{
    await open(p,"Budget vs. Actual");
    const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
    const page=pages.getByRole("button",{name:pageName,exact:true});
    if(await page.count()){await page.click();await settled(p);}
    else {await addPage(p,pageName);await authorPage(p);}
    await check(p,initial,"$29.50");await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
    await pages.locator('[data-page="'+origin+'"]').click();await save(p);
  });
  await studio(async p=>{
    await p.goto(link);await art(p,total).waitFor();await check(p,initial,"$29.50");
    await capture(p,"budget-approval-exceptions");
    await writeFile("portfolio-evidence/budget-approval-exceptions.json",JSON.stringify({link,orders:initial,total:29.5},null,2));
  });
}

