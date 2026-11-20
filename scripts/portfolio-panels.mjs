import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,filter,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {addSplit,panel} from "./small-multiples.mjs";
async function make(report,name,build,verify){
  let link;
  await studio(async p=>{
    await open(p,report);const tabs=p.locator("#pages"),origin=await tabs.locator(".active").getAttribute("data-page"),tab=tabs.getByRole("button",{name,exact:true});
    if(await tab.count()){await tab.click();await settled(p);}else{await addPage(p,name);await build(p);}
    await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");await tabs.locator('[data-page="'+origin+'"]').click();await save(p);
  });
  await studio(async p=>{await p.goto(link);await p.locator("#paper .multiple-panel").first().waitFor();await settled(p);await verify(p,link);});
}
const revenue="Monthly revenue by region";
await make("Visual Gallery","Regional panels",async p=>{
  await visual(p,"card","Revenue under selection",[],["Dispatch revenue"],[14,11,463,105]);
  await visual(p,"card","Orders under selection",[],["Dispatch orders"],[496,11,485,105]);
  await visual(p,"stackedColumn",revenue,["Dispatch · Period"],["Dispatch revenue"],[14,132,967,440]);
  await p.locator("[data-tab=Build]").click();await p.locator("[data-pick=legendFields]").selectOption({label:"Dispatch · Channel"});await addSplit(p,"Dispatch · Region");
},async(p,link)=>{
  const chart=art(p,revenue),east=panel(chart,"East"),west=panel(chart,"West");
  const max=async tile=>Number(await tile.locator('[data-scale="primary"]').getAttribute("data-max"));
  assert.equal(await max(east),await max(west));assert.ok(await max(west)>=383);
  await west.locator('.plot-mark[data-value="240"]').press("Enter");await settled(p);
  assert.equal(await art(p,"Revenue under selection").locator(".kpi").innerText(),"$240.00");assert.equal(await art(p,"Orders under selection").locator(".kpi").innerText(),"16");
  await chart.getByRole("button",{name:"Select Region = West",exact:true}).click();await settled(p);
  assert.equal(await art(p,"Revenue under selection").locator(".kpi").innerText(),"$868.00");await capture(p,"gallery-regional-panels");
  await writeFile("portfolio-evidence/gallery-panels.json",JSON.stringify({link,sharedMax:await max(east),westOnlineMarch:240,westOnlineMarchOrders:16,westTotal:868},null,2));
});
const csv=async file=>(await readFile("web/datasets/hospital/"+file+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const dates=new Map((await csv("Calendar")).map(r=>[r[0],r[2]])),expected={};
for(const row of await csv("Encounter")){
  if(row[3]!=="Routine"||row[4]!=="Closed")continue;
  const m=dates.get(row[1]),site=expected[row[2]]??={},month=site[m]??=[0,0];
  month[0]+=Number(row[7]);month[1]+=Number(row[6]);
}
const visits="Monthly volume by site",attainment="Monthly target attainment by site";
await make("Hospital Operations","Site trends",async p=>{
  await visual(p,"card","Visits in selection",[],["Encounter · Visits"],[14,10,465,96],"number");
  await filter(p,"page","Encounter · Status","Closed");
  await visual(p,"card","Attainment in selection",[],["Within 45 minutes"],[498,10,484,96],"percent");
  await visual(p,"clusteredColumn",visits,["Calendar · Month"],["Encounter · Visits"],[14,119,968,218],"number");
  await addSplit(p,"Encounter · Site");await p.locator("[data-tab=Format]").click();await p.getByLabel("Panels per row",{exact:true}).selectOption("3");
  await visual(p,"line",attainment,["Calendar · Month"],["Within 45 minutes"],[14,346,968,229],"percent");
  await addSplit(p,"Encounter · Site");await p.locator("[data-tab=Format]").click();await p.getByLabel("Panels per row",{exact:true}).selectOption("3");
},async(p,link)=>{
  const counts=art(p,visits),rates=art(p,attainment);
  for(const [site,months] of Object.entries(expected)){
    for(const [month,[visits,onTime]] of Object.entries(months)){
      const mark=chart=>panel(chart,site).locator('.plot-mark').filter({}).locator('xpath=self::*[contains(@aria-label,"Month '+month+'")]');
      assert.equal(Number(await mark(counts).getAttribute("data-value")),visits);
      assert.ok(Math.abs(Number(await mark(rates).getAttribute("data-value"))-onTime/visits)<1e-10);
    }
  }
  await capture(p,"hospital-site-panels");
  await panel(rates,"Ridge").locator('.plot-mark[aria-label*="Month 2026-04"]').press("Enter");await settled(p);
  assert.equal(await art(p,"Visits in selection").locator(".kpi").innerText(),"12");assert.equal(await art(p,"Attainment in selection").locator(".kpi").innerText(),"58.33%");
  await writeFile("portfolio-evidence/hospital-panels.json",JSON.stringify({link,expected,ridgeApril:{visits:12,met:7,attainment:"58.33%"}},null,2));
});

