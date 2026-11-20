import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {openGroupEditor} from "./named-groups.mjs";
const name="Pipeline status",plot="Deals by pipeline status",field="Stage status";
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page"),tab=pages.getByRole("button",{name,exact:true});
  if(await tab.count()){await tab.click();await settled(p);}else{
    await addPage(p,name);
    await visual(p,"dropdown","Sales office",["Pipeline · Office"],[],[14,12,468,112]);
    await visual(p,"card","Deals in view",[],["Pipeline · Deals"],[503,12,477,112]);
    await visual(p,"clusteredBar",plot,["Pipeline · Stage"],["Pipeline · Deals"],[14,145,468,329]);
    await openGroupEditor(p,art(p,plot),"Stage");
    await p.getByLabel("Group field name",{exact:true}).fill(field);
    await p.getByLabel("Group label",{exact:true}).fill("Open");
    for(const value of ["1 · Qualified","2 · Proposal"])await p.getByRole("checkbox",{name:"Include "+value,exact:true}).check();
    await p.getByRole("button",{name:"Add group",exact:true}).click();await p.getByLabel("Group label",{exact:true}).fill("Won");
    await p.getByRole("checkbox",{name:"Include 3 · Won",exact:true}).check();
    await p.getByRole("button",{name:"Save groups",exact:true}).click();await p.locator("dialog").waitFor({state:"hidden"});await settled(p);
    await visual(p,"matrix","Stage contribution by office",["Pipeline · Stage"],["Pipeline · Deals"],[503,145,477,329]);
    await p.locator("[data-tab=Build]").click();await p.locator("[data-pick=columns]").selectOption({label:"Pipeline · Office"});
  }
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  const rows=(await readFile("web/datasets/gallery/Pipeline.csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
  const sum=rows=>rows.reduce((n,r)=>n+Number(r[4]),0), won=rows.filter(r=>r[3]==="3 · Won"),inProgress=rows.filter(r=>r[3]!=="3 · Won");
  await p.goto(link);await p.locator("#paper article").first().waitFor();await settled(p);
  const chart=art(p,plot),card=art(p,"Deals in view").locator(".kpi");
  const mark=category=>chart.locator('[data-selection-key=\'["'+category+'"]\']');
  assert.equal(await card.innerText(),String(sum(rows)));assert.equal(Number(await mark("Open").getAttribute("data-value")),sum(inProgress));assert.equal(Number(await mark("Won").getAttribute("data-value")),sum(won));
  await mark("Open").press("Enter");await settled(p);assert.equal(await card.innerText(),String(sum(inProgress)));
  const ledger=art(p,"Stage contribution by office");
  assert.deepEqual(await ledger.locator("tbody tr:not(.matrix-total) td:first-child").allTextContents(),["1 · Qualified","2 · Proposal"]);
  await art(p,"Sales office").locator("select").selectOption({label:"Toronto"});await settled(p);
  assert.equal(await card.innerText(),String(sum(inProgress.filter(r=>r[0]==="Toronto"))));
  await capture(p,"gallery-stage-groups");
  await mark("Won").press("Enter");await settled(p);assert.equal(await card.innerText(),String(sum(won.filter(r=>r[0]==="Toronto"))));
  await writeFile("portfolio-evidence/gallery-stage-groups.json",JSON.stringify({link,all:sum(rows),open:sum(inProgress),won:sum(won),torontoOpen:78,torontoWon:14},null,2));
});

