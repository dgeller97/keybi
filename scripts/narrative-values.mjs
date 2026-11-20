import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,capture,create,currentPageLink,measure,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";

const narrative="Dispatch summary",period="Dispatch period",total="Dispatch revenue in view";
const template="Dispatches generated {{Revenue}} from {{Orders}} orders against a {{Target}} target ({{Attainment}} of target).";
const expected=(revenue,orders,target,attainment)=>template.replace("{{Revenue}}",revenue).replace("{{Orders}}",orders).replace("{{Target}}",target).replace("{{Attainment}}",attainment);
const all=expected("$1,731.00","137","$1,650.00","104.91%"),march=expected("$732.00","55","$670.00","109.25%");
async function titleAndPosition(p,name,box){
  await p.locator("[data-tab=Format]").click();const title=p.getByLabel("Visual title",{exact:true});await title.fill(name);await title.press("Tab");
  await position(p,box);
}
async function addNarrative(p,baseline) {
  await p.locator(".ribbon [data-action=add]").click();
  if(baseline){assert.equal(await p.locator("[data-create=narrative]").count(),0);await p.locator("[data-create=textBox]").click();
    const text=p.getByLabel("Report text");await text.fill(all);await text.press("Tab");}
  else {
    await p.locator("[data-create=narrative]").click();await p.getByRole("button",{name:"Edit narrative",exact:true}).click();
    const d=p.getByRole("dialog");
    for(const [label,source,format] of [["Revenue","Dispatch · Revenue","currency"],["Orders","Dispatch · Orders","number"],["Target","Dispatch · Target","currency"],["Attainment","Revenue attainment","auto"]]){
      await d.getByLabel("Value source",{exact:true}).selectOption({label:source});
      await d.getByLabel("Value name",{exact:true}).fill(label);await d.getByLabel("Value format",{exact:true}).selectOption(format);
      await d.getByRole("button",{name:"Insert value",exact:true}).click();
    }
    await d.getByLabel("Narrative text",{exact:true}).fill(template);await d.getByRole("button",{name:"Apply narrative",exact:true}).click();await d.waitFor({state:"hidden"});
  }
  await titleAndPosition(p,narrative,[16,153,965,175]);
  if(!baseline){const size=p.getByLabel("Text size (px)",{exact:true});await size.fill("24");await size.press("Tab");}
}
async function pageBody(p,baseline=false){
  await visual(p,"dropdown",period,["Dispatch · Period"],[],[16,14,460,120]);
  await visual(p,"card",total,[],["Dispatch · Revenue"],[494,14,487,120],"currency");
  await addNarrative(p,baseline);
}
async function selectMonth(p,value){await art(p,period).locator("select").selectOption({label:value});await settled(p);}
export async function verifyNarrative(){
  const baseline=process.env.FOLIO_NARRATIVE_BASELINE==="1",title="Narrative verification";
  await studio(async p=>{
    await create(p,title,"How did revenue compare with target in the selected month?","gallery",["Dispatch"]);
    await measure(p,"Revenue attainment","Dispatch · Revenue","Dispatch · Target");
    await pageBody(p,baseline);assert.equal(await art(p,total).locator(".kpi").innerText(),"$1,731.00");
    if(!baseline) assert.equal(await art(p,narrative).locator(".narrative-text").innerText(),all);
    await selectMonth(p,"2026-03-01");assert.equal(await art(p,total).locator(".kpi").innerText(),"$732.00");
    if(baseline) {
      const value=await art(p,narrative).locator(".report-text").innerText();
      assert.equal(value,all);await writeFile("portfolio-evidence/narrative-before.json",JSON.stringify({month:"March",card:732,summary:value},null,2));return;
    }
    assert.equal(await art(p,narrative).locator(".narrative-text").innerText(),march);
    await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,title);const text=art(p,narrative).locator(".narrative-text");
    assert.equal(await text.innerText(),march);await art(p,narrative).locator(".vhead").click();await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Edit narrative",exact:true}).click();const d=p.getByRole("dialog");
    await d.getByRole("button",{name:"Edit Revenue",exact:true}).click();await d.getByLabel("Aggregation",{exact:true}).selectOption("avg");
    await d.getByLabel("Value name",{exact:true}).fill("Average line");await d.getByRole("button",{name:"Update value",exact:true}).click();
    await d.getByLabel("Narrative text",{exact:true}).fill("Average line revenue was {{Average line}}. Attainment was {{Attainment}}.");
    await d.getByRole("button",{name:"Apply narrative",exact:true}).click();await settled(p);
    assert.equal(await text.innerText(),"Average line revenue was $183.00. Attainment was 109.25%.");
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);assert.equal(await text.innerText(),march);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await selectMonth(p,"2026-01-01");assert.equal(await text.innerText(),expected("$430.00","36","$430.00","100%"));
    await writeFile("portfolio-evidence/narrative-values.json",JSON.stringify({all,march,january:await text.innerText(),marchAverage:183,reopened:true},null,2));
  });
}
export async function saveGalleryNarrative(){
  let link;
  await studio(async p=>{
    await open(p,"Visual Gallery");const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
    const page=pages.getByRole("button",{name:"Monthly briefing",exact:true});
    if(await page.count()){await page.click();await settled(p);}
    else {await addPage(p,"Monthly briefing");await pageBody(p);await visual(p,"bar","Revenue in the selected period",["Dispatch · Region"],["Dispatch · Revenue"],[16,345,965,220],"currency");}
    await selectMonth(p,"2026-03-01");assert.equal(await art(p,narrative).locator(".narrative-text").innerText(),march);
    await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");await pages.locator('[data-page="'+origin+'"]').click();await save(p);
  });
  await studio(async p=>{
    await p.goto(link);const text=art(p,narrative).locator(".narrative-text");await text.waitFor();await settled(p);assert.equal(await text.innerText(),march);
    await art(p,"Revenue in the selected period").locator(".barrow").filter({hasText:"West"}).click();await settled(p);
    const west=expected("$383.00","27","$350.00","109.43%");assert.equal(await text.innerText(),west);await capture(p,"gallery-monthly-briefing");
    await writeFile("portfolio-evidence/gallery-monthly-briefing.json",JSON.stringify({link,march,west},null,2));
  });
}

