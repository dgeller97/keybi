import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,filter,open,pageName,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

export async function verifySyncedSlicers() {
  const name="Depot transfers",first="Overview",second="Receiving",third="Ledger",card="Units";
  const lines=["Depot,Day,Units,Team","Alpha,2026-02-01,2,P","Alpha,2026-02-04,5,Q","Bravo,2026-02-02,11,Q",
    "Bravo,2026-02-05,13,P",",2026-02-03,17,Q","(Blank),2026-02-06,19,Q"];
  const go=async(p,title)=>{await p.locator("#pages").getByRole("button",{name:title,exact:true}).click();await settled(p);};
  const check=async(p,value)=>assert.equal(await art(p,card).locator(".kpi").innerText(),String(value));
  async function sync(p,source,page,peer,hidden=false) {
    await formatChart(p,source);await p.getByRole("button",{name:"Sync slicers",exact:true}).click();
    const d=p.getByRole("dialog");await d.getByLabel(page,{exact:true}).selectOption({label:peer});
    if (hidden) await d.getByLabel(third,{exact:true}).selectOption({label:"Filter page only"});
    await d.getByRole("button",{name:"Apply"}).click();await settled(p);
  }
  async function build(p,kind,depot,day) {
    await visual(p,"card",card,[],["Transfers · Units"],[10,10,250,150]);
    await visual(p,kind,depot,["Transfers · Depot"],[],[290,10,420,150]);
    await visual(p,"dateRange",day,["Transfers · Day"],[],[10,190,480,180]);
  }
  const select=async(p,site)=>{await art(p,"Receive from").locator("select").selectOption({label:site});await settled(p);};
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which depots supplied the selected team?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Transfers.csv",mimeType:"text/csv",buffer:Buffer.from(lines.join("\n"))});
    await p.getByTitle("Transfers.Units",{exact:true}).waitFor();
    await pageName(p,first);await build(p,"list","Shipping depot","Ship dates");
    await addPage(p,second);await build(p,"dropdown","Receive from","Receive dates");
    await filter(p,"page","Transfers · Team","Q");await check(p,52);
    await addPage(p,third);await visual(p,"card",card,[],["Transfers · Units"],[10,10,250,150]);await go(p,second);
    await sync(p,"Receive from",first,"Shipping depot",true);await sync(p,"Receive dates",first,"Ship dates",true);
    await select(p,"Bravo");await check(p,11);await go(p,first);await check(p,24);
    await art(p,"Ship dates").locator("[data-range='0']").fill("2026-02-02");await settled(p);
    await art(p,"Ship dates").locator("[data-range='1']").fill("2026-02-02");await settled(p);await check(p,11);
    await go(p,second);await check(p,11);assert.equal(await art(p,"Receive dates").locator("[data-range='1']").inputValue(),"2026-02-02");
    await go(p,third);await check(p,11);assert.equal(await p.locator("#other-selections button").count(),2);
    await go(p,second);await save(p);
  });
  await studio(async p=>{
    await open(p,name);await check(p,11);
    await art(p,"Receive dates").locator("[data-clear]").click();await settled(p);await select(p,"Alpha");
    await go(p,third);await check(p,7);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("Alpha across dates");await p.getByRole("button",{name:"Add current view"}).click();
    await go(p,second);await select(p,"Bravo");
    await art(p,"Receive dates").locator("[data-range='0']").fill("2026-02-02");await settled(p);
    await art(p,"Receive dates").locator("[data-range='1']").fill("2026-02-02");await settled(p);
    await go(p,third);await check(p,11);
    await p.locator("header [data-action=library]").click();await p.getByRole("button",{name:"Save dashboard",exact:true}).click();
    await p.locator("dialog [data-open]").filter({hasText:name+" dashboard"}).waitFor();
  });
  await studio(async p=>{
    await open(p,name+" dashboard");const dashboard=Number(await art(p,card).locator(".kpi").innerText());
    assert.equal(dashboard,11);
    await p.locator("[data-tab=Filters]").click();
    await p.locator("[data-edit-column-filter]").filter({hasText:"Day ≤"}).click();
    const d=p.getByRole("dialog");
    assert.equal(await d.getByLabel("Condition",{exact:true}).inputValue(),"lte");
    await d.getByLabel("Upper bound").fill("2026-02-05");await d.getByRole("button",{name:"Apply"}).click();await settled(p);await check(p,24);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await p.locator("[data-action=reader-filters]").click();
    await d.getByLabel("Day ≥",{exact:true}).selectOption({label:"2026-02-05"});await d.getByRole("button",{name:"Apply"}).click();
    await d.waitFor({state:"hidden"});await settled(p);await check(p,13);
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);await check(p,24);
    await p.locator(".ribbon [data-action=bookmarks]").click();await p.getByRole("button",{name:"Alpha across dates"}).click();
    await settled(p);await check(p,7);
    await writeFile("portfolio-evidence/synced-dashboard.json",JSON.stringify({source:11,dashboard,extendedThroughFeb5:24,
      readerFeb5Only:13,bookmark:"Alpha across dates",restored:7},null,2));
  });
  await studio(async p=>{
    await open(p,name);await check(p,11);
    await art(p,"Receive dates").locator("[data-clear]").click();await settled(p);await go(p,first);await check(p,24);
    assert.equal(await art(p,"Ship dates").locator("[data-range='0']").inputValue(),"");
    const list=art(p,"Shipping depot");await list.getByRole("button",{name:"Paste values"}).click();
    const d=p.getByRole("dialog");await d.getByLabel("Values, one per line").fill('(Blank)\n"(Blank)"');
    await d.getByRole("button",{name:"Apply"}).click();await d.waitFor({state:"hidden"});await settled(p);await check(p,36);
    await go(p,second);await check(p,36);
    assert.equal(await art(p,"Receive from").locator("option:checked").innerText(),"2 selected");
    await p.locator(".ribbon [data-action=bookmarks]").click();await p.getByLabel("New bookmark name").fill("Both blank labels");
    await p.getByRole("button",{name:"Add current view"}).click();
    await select(p,"Alpha");await check(p,5);await go(p,first);await check(p,7);
    await list.locator(".vhead").click();await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="dropdown"]').click();
    await settled(p);await check(p,7);assert.equal(await list.locator("option:checked").innerText(),"Alpha");
    await p.locator(".ribbon [data-action=bookmarks]").click();await d.getByRole("button",{name:"Both blank labels"}).click();
    await settled(p);await check(p,36);await go(p,first);await check(p,36);
    await sync(p,"Shipping depot",second,"Do not sync");await go(p,second);await select(p,"Bravo");
    await go(p,first);await check(p,36);await go(p,third);await check(p,36);
    await p.locator("#other-selections button").click();await settled(p);await check(p,67);
    await go(p,second);await check(p,11);await go(p,first);await check(p,67);await save(p);
  });
  console.log("Verified bidirectional categorical and date-range slicers, independent page filters, CSV totals, blank labels, conversion, bookmark restore, unlink and reopen.");
}
