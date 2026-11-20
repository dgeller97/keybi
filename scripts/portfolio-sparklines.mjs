import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {configureSpark,sparkValues} from "./row-sparklines.mjs";

async function reportPage(report,pageName,edit,verify) {
  let link;
  await studio(async p=>{
    await open(p,report);const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page"),tab=pages.getByRole("button",{name:pageName,exact:true});
    const exists=!!await tab.count();
    if(exists){await tab.click();await settled(p);}else await addPage(p,pageName);
    await edit(p,exists);await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
    await pages.locator('[data-page="'+origin+'"]').click();await save(p);
  });
  return await studio(async p=>{await p.goto(link);await p.locator("#paper article").first().waitFor();await settled(p);await verify(p,link);});
}
const trend="Monthly revenue",rate="Monthly attainment",name="Revenue and attainment by region";
await reportPage("Visual Gallery","Regional trends",async(p,exists)=>{
  if(!exists){
    await visual(p,"dropdown","Channel to compare",["Dispatch · Channel"],[],[18,12,450,120]);
    await visual(p,"card","Revenue across regions",[],["Dispatch revenue"],[488,12,490,120],"currency");
    await visual(p,"table",name,["Dispatch · Region"],["Dispatch revenue","Revenue attainment"],[18,150,960,185]);
    await configureSpark(p,{name:trend});await configureSpark(p,{name:rate,source:"Revenue attainment",format:"auto",type:"columns",markers:"high"});
    await visual(p,"matrix","Orders by channel and region",["Dispatch · Region"],["Dispatch orders"],[18,354,960,232],"number");
    await p.locator("[data-tab=Build]").click();await p.locator("[data-pick=columns]").selectOption({label:"Dispatch · Channel"});
    await configureSpark(p,{name:"Orders by month",source:"Dispatch orders",format:"number",markers:"high"});
  }
},async(p,link)=>{
  const table=art(p,name),matrix=art(p,"Orders by channel and region");
  const first=await sparkValues(p,table.locator("tbody tr").first(),trend);assert.deepEqual(first.map(r=>r[1]),["$216.00","$298.00","$349.00"]);
  const grand=await sparkValues(p,matrix.locator('tr[data-path="[]"]'),"Total / Orders by month");assert.deepEqual(grand.map(r=>r[1]),["36","46","55"]);
  await capture(p,"gallery-regional-trends");
  await art(p,"Channel to compare").locator("select").selectOption({label:"Online"});await settled(p);
  const online=await sparkValues(p,table.locator("tbody tr").last(),trend);assert.deepEqual(online.map(r=>r[1]),["$84.00","$154.00","$240.00"]);
  await writeFile("portfolio-evidence/gallery-sparklines.json",JSON.stringify({link,east:first,orders:grand,westOnline:online},null,2));
});

const csv=async file=>(await readFile("web/datasets/hospital/"+file+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const dates=new Map((await csv("Calendar")).map(r=>[r[0],r[2]])),encounters=(await csv("Encounter")).filter(r=>r[3]==="Routine" && r[4]==="Closed"),expected={};
for(const row of encounters){
  const byMonth=expected[row[2]]??={},month=dates.get(row[1]),counts=byMonth[month]??=[0,0];
  counts[0]+=Number(row[7]);counts[1]+=Number(row[6]);
}
const pct=n=>new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2}).format(n);
const ledger="Closed visits by site",spark="Monthly target attainment";
await reportPage("Hospital Operations","Harbor and Ridge",async(p)=>{
  const table=art(p,ledger);await table.locator(".vhead strong").click();await p.locator("[data-tab=Build]").click();
  if(!await p.getByRole("button",{name:"Edit "+spark,exact:true}).count())
    await configureSpark(p,{name:spark,source:"Within 45 minutes",axis:"Calendar · Month",format:"auto",markers:"high"});
},async(p,link)=>{
  const table=art(p,ledger),seen={};
  for(const [site,months] of Object.entries(expected)){
    const row=table.locator("tbody tr").filter({hasText:site}),actual=await sparkValues(p,row,spark);
    const pairs=Object.entries(months).sort(([a],[b])=>a.localeCompare(b)).map(([m,[visits,met]])=>[m,pct(met/visits)]);
    assert.deepEqual(actual,pairs);seen[site]=actual;
  }
  await capture(p,"hospital-site-sparklines");
  await art(p,"Harbor monthly trend").locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]').press("Enter");await settled(p);
  const march=await sparkValues(p,table.locator("tbody tr").filter({hasText:"Harbor"}),spark);assert.deepEqual(march,[["2026-03","53.85%"]]);
  await writeFile("portfolio-evidence/hospital-sparklines.json",JSON.stringify({link,months:seen,march},null,2));
});

