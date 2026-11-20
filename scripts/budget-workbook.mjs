import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";

const pageName="Purchase authorizations",chart="Authorized amount by department",card="Authorized amount",table="Purchase lines for review";
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const target=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (await target.count()) {await target.click();await settled(p);}
  else {
    await addPage(p,pageName);
    const picking=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await picking).setFiles(resolve("web/datasets/budget/PurchaseReview.xlsx"));
    const d=p.getByRole("dialog");
    for (const sheet of ["Purchase lines","Cost centers"]) await d.getByRole("checkbox",{name:"Import "+sheet,exact:true}).check();
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    await p.locator(".ribbon [data-action=relationship]").click();
    await d.getByLabel("One-side key").selectOption({label:"Cost centers · Center"});
    await d.getByLabel("Many-side key").selectOption({label:"Purchase lines · Center"});
    await d.getByRole("button",{name:"Create",exact:true}).click();await d.waitFor({state:"hidden"});
    await visual(p,"card",card,[],["Purchase lines · Line amount"],[18,14,365,115],"currency");
    await visual(p,"clusteredBar",chart,["Cost centers · Department"],["Purchase lines · Line amount"],[18,147,430,270],"currency");
    await visual(p,"table",table,["Purchase lines · Order","Cost centers · Department","Purchase lines · Ordered on"],["Purchase lines · Line amount"],[462,147,497,270],"currency");
  }
  const count="Purchase line count",average="Average line amount";
  if (!await art(p,count).count())
    await visual(p,"card",count,[],[["Purchase lines · Line amount","count"]],[405,40,222,115],"number");
  if (!await art(p,average).count())
    await visual(p,"card",average,[],[["Purchase lines · Line amount","avg"]],[699,22,260,115],"currency");
  for (const [i,title] of [card,count,average].entries())
    await art(p,title).locator(".vhead strong").click({modifiers:i?["Control"]:[]});
  await p.getByRole("button",{name:"Align top",exact:true}).click();
  await p.getByRole("button",{name:"Distribute horizontally",exact:true}).click();
  await capture(p,"budget-arrange-cards");
  if (!await art(p,"Purchase summary background").count()) {
    await p.locator('.ribbon [data-action="add"]').click();await p.locator("[data-create=shape]").click();
    await p.getByLabel("Shape type",{exact:true}).selectOption("rounded");
    await p.locator("[data-tab=Format]").click();
    const title=p.getByLabel("Visual title",{exact:true});await title.fill("Purchase summary background");await title.press("Tab");
    await position(p,[7,4,965,135]);
    await p.getByLabel("Fill color",{exact:true}).fill("#dae8df");
    await p.getByLabel("Outline color",{exact:true}).fill("#9fbaaa");
    await p.getByRole("button",{name:"Arrange",exact:true}).click();
    await p.getByRole("button",{name:"Send to back",exact:true}).click();
  }
  assert.equal(await art(p,card).locator(".kpi").innerText(),"$225.75");
  assert.equal(await art(p,count).locator(".kpi").innerText(),"5");
  assert.equal(await art(p,average).locator(".kpi").innerText(),"$45.15");
  await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const plot=art(p,chart);await plot.locator('[data-selection-key=\'["Facilities"]\']').press("Enter");await settled(p);
  assert.equal(await art(p,card).locator(".kpi").innerText(),"$112.25");
  assert.equal(await art(p,"Purchase line count").locator(".kpi").innerText(),"3");
  assert.equal(await art(p,"Average line amount").locator(".kpi").innerText(),"$37.42");
  assert.equal(await art(p,"Purchase summary background").locator("svg[data-shape]").getAttribute("data-shape"),"rounded");
  assert.equal(await art(p,"Purchase summary background").locator(".vhead").isVisible(),false);
  const rows=await art(p,table).locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
  assert.deepEqual(rows.map(r=>r[0]),["P-01","P-03","P-04"]);
  const amounts=rows.map(r=>Number(r.at(-1).replace(/[^\d.-]/g,"")));
  assert.deepEqual(amounts,[124.5,0,-12.25]);
  await capture(p,"budget-workbook-authorizations");
  await writeFile("portfolio-evidence/budget-workbook.json",JSON.stringify({link,workbook:"PurchaseReview.xlsx",total:225.75,allCount:5,allAverage:45.15,facilities:112.25,facilityCount:3,facilityAverage:37.42,rows},null,2));
});
