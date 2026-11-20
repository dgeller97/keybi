import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,create,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const name="Dispatch publication",chart="Revenue by region",total="Dispatch revenue";
const kpi=p=>art(p,total).locator(".kpi");
async function status(p){await p.locator('header [data-action=library]').click();await p.getByRole("button",{name:"Publish report",exact:true}).click();}
async function getLink(p){
  const d=p.getByRole("dialog");await d.getByLabel("Published link",{exact:true}).waitFor();
  const url=await d.getByLabel("Published link",{exact:true}).inputValue();await p.keyboard.press("Escape");return url;
}
export async function verifyPublishing(){
  const baseline=process.env.FOLIO_PUBLISH_BASELINE==="1";let url,sourceUrl;
  await studio(async p=>{
    await create(p,name,"Which region accounts for dispatch revenue?","gallery",["Dispatch"]);
    await visual(p,"bar",chart,["Dispatch · Region"],["Dispatch · Revenue"],[12,12,470,255],"currency");
    await visual(p,"card",total,[],["Dispatch · Revenue"],[498,12,476,130],"currency");
    await save(p);sourceUrl=p.url();assert.equal(await kpi(p).innerText(),"$1,731.00");
    if(baseline){url=(await currentPageLink(p)).replace("/page/","/read/page/");}
    else {
      await status(p);const d=p.getByRole("dialog");
      await d.getByRole("button",{name:"Publish version",exact:true}).click();url=await getLink(p);
    }
    await art(p,chart).locator(".barrow").filter({hasText:"East"}).click();await settled(p);await save(p);assert.equal(await kpi(p).innerText(),"$863.00");
  });
  await studio(async p=>{
    await p.goto(url);await kpi(p).waitFor();await settled(p);
    if(baseline){
      assert.equal(await kpi(p).innerText(),"$863.00");await writeFile("portfolio-evidence/publication-before.json",JSON.stringify({reviewed:1731,afterDraftSave:863,readerHasEditButton:await p.getByRole("button",{name:"Edit report"}).isVisible()},null,2));return;
    }
    assert.equal(await kpi(p).innerText(),"$1,731.00");assert.equal(await p.getByRole("button",{name:"Edit report"}).count(),0);
    await art(p,chart).locator(".barrow").filter({hasText:"West"}).click();await settled(p);assert.equal(await kpi(p).innerText(),"$868.00");
    await p.getByRole("button",{name:"Reset view",exact:true}).click();await settled(p);assert.equal(await kpi(p).innerText(),"$1,731.00");
    await p.getByRole("button",{name:"Workspace home"}).click();await p.getByRole("button",{name:"Published reports",exact:true}).click();
    await p.getByRole("link",{name:name,exact:true}).click();await kpi(p).waitFor();assert.equal(await kpi(p).innerText(),"$1,731.00");
  });
  if(baseline) return;
  await studio(async p=>{
    await open(p,name);assert.equal(await kpi(p).innerText(),"$863.00");
    await p.getByRole("button",{name:"Model view"}).click();
    const chooser=p.waitForEvent("filechooser");await p.locator(".modelcard").getByRole("button",{name:"Update from file"}).click();
    const header="Period,Region,Channel,Orders,Revenue,Target,Change\n";
    await(await chooser).setFiles({name:"Dispatch.csv",mimeType:"text/csv",buffer:Buffer.from(header+"2026-04-01,East,Online,2,251,200,51\n2026-04-01,West,Online,3,149,150,-1\n")});
    const d=p.getByRole("dialog");await d.getByLabel("Load mode").selectOption("replace");
    await d.getByRole("button",{name:"Apply update",exact:true}).click();await d.waitFor({state:"hidden"});
    await p.locator('[data-action="report"]').click();await settled(p);assert.equal(await kpi(p).innerText(),"$251.00");await save(p);
    const reader=await p.context().browser().newPage();await reader.goto(url);await kpi(reader).waitFor();await settled(reader);assert.equal(await kpi(reader).innerText(),"$1,731.00");
    await status(p);await d.getByRole("button",{name:"Update published version",exact:true}).click();assert.equal(await getLink(p),url);
    await reader.reload();await kpi(reader).waitFor();await settled(reader);assert.equal(await kpi(reader).innerText(),"$251.00");
    await status(p);await d.getByRole("button",{name:"Unpublish",exact:true}).click();
    await d.getByRole("button",{name:"Unpublish version",exact:true}).click();await d.getByText("No published version.",{exact:true}).waitFor();
    await reader.reload();await reader.getByText("This report is no longer published in this workspace.",{exact:true}).waitFor();
    await p.keyboard.press("Escape");assert.equal(await kpi(p).innerText(),"$251.00");await reader.close();
    await writeFile("portfolio-evidence/publication.json",JSON.stringify({initial:1731,draftAfterSelection:863,readerWest:868,draftAfterSourceReplacement:251,publishedBeforeUpdate:1731,updated:251,stableLink:true,withdrawn:true,sourceRetained:true},null,2));
  });
}

