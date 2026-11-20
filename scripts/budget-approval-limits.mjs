import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const name="Approval limits",ledger="Purchase approval ledger",owner="Approval owner",largest="Largest order";
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");
  const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
  const target=pages.getByRole("button",{name,exact:true});
  if (await target.count()) {await target.click();await settled(p);}
  else {
    await addPage(p,name);
    const choosing=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await choosing).setFiles(resolve("web/datasets/budget/PurchaseReview.xlsx"));
    const d=p.getByRole("dialog");
    await d.getByRole("checkbox",{name:"Import table AuthorizationLimits",exact:true}).check();
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    await p.locator(".ribbon [data-action=relationship]").click();
    await d.getByLabel("One-side key").selectOption({label:"AuthorizationLimits · Center"});
    await d.getByLabel("Many-side key").selectOption({label:"Purchase lines · Center"});
    await d.getByRole("button",{name:"Create",exact:true}).click();await d.waitFor({state:"hidden"});
    await visual(p,"dropdown",owner,["AuthorizationLimits · Approval owner"],[],[18,12,460,112]);
    await visual(p,"card",largest,[],[["Purchase lines · Line amount","max"]],[496,12,476,112],"currency");
    await visual(p,"table",ledger,["Purchase lines · Order","AuthorizationLimits · Approval owner","AuthorizationLimits · Single order limit"],["Purchase lines · Line amount"],[18,140,954,276],"currency");
    await p.locator("[data-tab=Build]").click();
    const heading=p.locator('[data-heading="groups:2"]');
    await heading.fill("Single-order limit (USD)");await heading.press("Tab");
  }
  assert.equal(await art(p,largest).locator(".kpi").innerText(),"$124.50");
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const table=art(p,ledger);await table.locator("tbody tr").first().waitFor();await settled(p);
  const rows=await table.locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
  const exceptions=rows.filter(r=>Number(r.at(-1).replace(/[^\d.-]/g,""))>Number(r[2]));
  assert.deepEqual(exceptions.map(r=>r[0]),["P-01","P-02"]);
  await capture(p,"budget-approval-limits");
  await art(p,owner).locator("select").selectOption({label:"Surgery lead"});await settled(p);
  assert.equal(await art(p,largest).locator(".kpi").innerText(),"$80.00");
  assert.deepEqual(await table.locator("tbody tr").first().locator("td").allTextContents(),["P-02","Surgery lead","75","$80.00"]);
  await writeFile("portfolio-evidence/budget-approval-limits.json",JSON.stringify({link,rows,exceptions:exceptions.map(r=>r[0]),surgery:{order:80,limit:75}},null,2));
});
