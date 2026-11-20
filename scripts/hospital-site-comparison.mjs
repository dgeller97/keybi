import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,filter,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";

const source="Monthly encounter volume and target attainment",name="Harbor and Ridge",sites=["Harbor","Ridge"];
const title=site=>site+" monthly trend";
const csv=async file=>(await readFile("web/datasets/hospital/"+file+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const months=new Map((await csv("Calendar")).map(r=>[r[0],r[2]]));
const encounter=(await csv("Encounter")).filter(r=>r[3]==="Routine" && r[4]==="Closed");
const expected=Object.fromEntries(sites.map(site=>{
  const values={};
  for (const r of encounter.filter(r=>r[2]===site)) {
    const m=months.get(r[1]);values[m]??={visits:0,onTarget:0};values[m].visits++;values[m].onTarget+=Number(r[6]);
  }
  return [site,values];
}));
let link;
await studio(async p=>{
  await open(p,"Hospital Operations");
  const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
  const target=pages.getByRole("button",{name,exact:true});
  if (await target.count()) {await target.click();await settled(p);}
  else {
    await pages.getByRole("button",{name:"Volume and attainment",exact:true}).click();await settled(p);
    await art(p,source).locator(".vhead strong").click();
    await p.keyboard.press("Control+c");await addPage(p,name);
    await p.keyboard.press("Control+v");await settled(p);
    if (process.env.FOLIO_COPY_BASELINE==="1") {
      assert.equal(await p.locator("#paper .visual").count(),0);
      await writeFile("portfolio-evidence/copy-page-before.json",JSON.stringify({source,from:"Volume and attainment",destination:name,gesture:"Ctrl+C, new page, Ctrl+V",copied:0},null,2));
      return;
    }
    await art(p,source).waitFor();
    await filter(p,"page","Encounter · Status","Closed");
    async function configure(site,x) {
      await p.locator("[data-tab=Format]").click();
      const input=p.getByLabel("Visual title",{exact:true});await input.fill(title(site));await input.press("Tab");
      await position(p,[x,15,470,270]);await settled(p);
    }
    await configure("Harbor",18);
    await art(p,title("Harbor")).locator(".vhead strong").click();
    await p.locator("[data-tab=Build]").click();await p.getByRole("button",{name:"Duplicate visual",exact:true}).click();await settled(p);
    await configure("Ridge",508);
    for (const site of sites) {
      await art(p,title(site)).locator(".vhead strong").click();await filter(p,"visual","Encounter · Site",site);
    }
    await visual(p,"table","Closed visits by site",["Encounter · Site"],["Encounter · Visits","Encounter · MetTarget"],[18,300,960,182],"number");
  }
  for (const [i,site] of sites.entries()) {
    const old=art(p,site+" volume and attainment");
    if (!await old.count()) continue;
    await old.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
    const input=p.getByLabel("Visual title",{exact:true});await input.fill(title(site));await input.press("Tab");
    await position(p,[i?508:18,15,470,270]);
  }
  const ledger=art(p,"Closed visits by site");await ledger.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();await position(p,[18,300,960,182]);
  await p.locator("[data-tab=Build]").click();
  const heading=p.locator('[data-heading="metrics:1"]');await heading.fill("Within 45 minutes");await heading.press("Tab");
  async function verify() {
    for (const site of sites) {
      const plot=art(p,title(site));
      assert.equal(await plot.locator('[data-scale="secondary"]').getAttribute("data-max"),"1");
      for (const [month,{visits,onTarget}] of Object.entries(expected[site])) {
        const mark=i=>plot.locator('[data-point][data-metric="'+i+'"][aria-label^="Month '+month+'"]');
        assert.equal(Number(await mark(0).getAttribute("data-value")),visits);
        assert.ok(Math.abs(Number(await mark(1).getAttribute("data-value"))-onTarget/visits)<1e-9);
      }
    }
  }
  await verify();await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (process.env.FOLIO_COPY_BASELINE!=="1") await studio(async p=>{
  await p.goto(link);const plot=art(p,title("Harbor"));
  await plot.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]').press("Enter");await settled(p);
  const rows=await art(p,"Closed visits by site").locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
  for (const [site,count,onTarget] of rows) {
    const source=encounter.filter(r=>r[2]===site && months.get(r[1])==="2026-03");
    assert.equal(Number(count),source.length);assert.equal(Number(onTarget),source.reduce((a,r)=>a+Number(r[6]),0));
  }
  assert.equal(rows.length,3);
  await p.keyboard.press("Escape");await p.mouse.move(5,5);
  await capture(p,"hospital-compared-sites");
  await writeFile("portfolio-evidence/hospital-compared-sites.json",JSON.stringify({link,monthly:expected,marchLedger:rows},null,2));
});
