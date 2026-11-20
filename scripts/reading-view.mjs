import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,filter,open,settled,studio} from "./portfolio-ui.mjs";
import {setReaderAccess} from "./hospital-reading.mjs";

const gallery="Visual Gallery", source="Regional revenue by channel";
const chart=p=>art(p,source);
const total=p=>art(p,"Revenue in selection").locator(".kpi").innerText();
const point=p=>chart(p).locator('.plot-mark[aria-label*="Region East, Channel Retail"]');
const choose=async(p,action)=>{await p.locator(action).click();await settled(p);};
export async function verifyReadingView() {
  let link;
  await studio(async p=>{
    const read=p.getByRole("link",{name:"Read Visual Gallery",exact:true});
    const id=(await read.getAttribute("href")).slice(1).split("/")[0];
    const saved=async()=> (await p.request.get(new URL("/api/reports/"+id,p.url()).href)).json();
    const original=await saved(); let writes=0;
    p.on("request",r=>{if(r.method()==="POST" && r.url().endsWith("/api/reports")) writes++;});
    await read.click();await chart(p).waitFor();await settled(p);
    assert.equal(await total(p),"$1,731.00");
    assert.equal(await p.locator(".ribbon").isVisible(),false);
    assert.equal(await p.locator("header [data-action=save]").isVisible(),false);
    assert.equal(await p.getByRole("button",{name:"Dispatch records",exact:true}).count(),0);
    assert.equal(await p.getByRole("button",{name:"Channel detail tooltip",exact:true}).count(),0);
    await point(p).click();await settled(p);assert.equal(await total(p),"$454.00");
    await chart(p).getByRole("button",{name:"Show as a table"}).click();
    await p.getByRole("dialog").getByRole("table").waitFor();await p.keyboard.press("Escape");
    await chart(p).getByRole("button",{name:"View records"}).click();await settled(p);
    assert.equal(await art(p,"Dispatch ledger").locator("tbody tr").count(),3);
    await choose(p,"[data-action=drill-back]");assert.equal(await total(p),"$454.00");
    await capture(p,"gallery-reading-view");
    await p.keyboard.press("Control+s");await choose(p,"[data-action=reader-reset]");
    assert.equal(await total(p),"$1,731.00");
    await p.getByRole("button",{name:"Bookmarks",exact:true}).click();
    assert.equal(await p.getByRole("dialog").getByRole("textbox").count(),0);
    await p.getByRole("button",{name:"March dispatch detail",exact:true}).click();await settled(p);
    assert.equal(await total(p),"$732.00");
    await p.getByRole("button",{name:"Get reading link"}).click();
    link=await p.locator("#local-page-link").inputValue();assert.match(link,/#r[a-f0-9]+\/read\/page\//);
    await p.keyboard.press("Escape");
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);
    assert.equal(await total(p),"$1,731.00");assert.equal(await p.locator("#save-state").innerText(),"Saved");
    assert.deepEqual(await saved(),original);assert.equal(writes,0);
  });
  await studio(async p=>{
    await p.goto(link);await p.getByRole("button",{name:"Edit report",exact:true}).waitFor();await settled(p);
    assert.equal(await p.locator("#view-info").innerText(),"Detail");
    await p.getByRole("button",{name:"Workspace home"}).click();await p.locator("#home h1").waitFor();
    await open(p,gallery);
    await chart(p).locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
    await p.locator("#vtitle").fill("Draft regional chart");await p.locator("#vtitle").press("Tab");await settled(p);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    const draft=art(p,"Draft regional chart");
    await draft.locator('.plot-mark[aria-label*="Region East, Channel Retail"]').click();await settled(p);
    assert.equal(await total(p),"$454.00");
    await p.getByRole("button",{name:"Workspace home"}).click();await p.getByRole("dialog",{name:"Unsaved changes"}).waitFor();
    await p.keyboard.press("Escape");
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);
    assert.equal(await p.locator("#vtitle").inputValue(),"Draft regional chart");
    assert.equal(await total(p),"$1,731.00");assert.equal(await p.locator("#save-state").innerText(),"Unsaved changes");
  });
  return {link,allRevenue:1731,retailEastRevenue:454,dispatchRecords:3,bookmarkedMarchRevenue:732,savedReportWrites:0,draftTitlePreserved:true};
}
export async function verifyHospitalFilters() {
  const csv=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/);
  const header=csv.shift().split(",");
  const rows=csv.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[header[i],v])));
  const proof=[];
  await studio(async p=>{
    await open(p,"Hospital Operations");
    await p.locator("#pages").getByRole("button",{name:"Site volumes",exact:true}).click();await settled(p);
    await p.locator("[data-tab=Filters]").click();
    await setReaderAccess(p,"report",0,"editable");await setReaderAccess(p,"page",0,"editable");
    await p.locator("[data-action=toggle-reading]").click();await settled(p);
    const count=art(p,"Closed routine encounters").locator(".kpi");
    for(const [cohort,status] of [["Routine","Open"],["Training","Open"],["Training","All values"],["All values","All values"],["Routine","Closed"]]) {
      await p.getByRole("button",{name:"Filters",exact:true}).click();
      const dialog=p.getByRole("dialog");
      await dialog.getByLabel("Cohort",{exact:true}).selectOption({label:cohort});
      await dialog.getByLabel("Status",{exact:true}).selectOption({label:status});
      if(status==="Open" && cohort==="Training") await capture(p,"hospital-reader-filters");
      await dialog.getByRole("button",{name:"Apply"}).click();await settled(p);
      const expected=rows.filter(r=>(r.Cohort===cohort||cohort==="All values")&&(r.Status===status||status==="All values")).reduce((n,r)=>n+Number(r.Visits),0);
      assert.equal(await count.innerText(),String(expected));proof.push({cohort,status,count:expected});
    }
    await p.locator("#pages").getByRole("button",{name:"Attainment exceptions",exact:true}).click();await settled(p);
    const ledger=art(p,"Dates below the review threshold"),chart=art(p,"Attainment on recorded days");
    await ledger.locator("[data-view-filters]").click();
    const dialog=p.getByRole("dialog");
    await dialog.locator('input[type="number"]').fill("70");
    await dialog.getByRole("button",{name:"Apply"}).click();await settled(p);
    assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),4);
    assert.equal(await ledger.locator("tbody tr").count(),4);
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);
    await p.locator("#pages").getByRole("button",{name:"Attainment exceptions",exact:true}).click();await settled(p);
    assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),2);
    await ledger.locator("[data-view-filters]").click();await setReaderAccess(p,"measure",0,"locked");
    await p.locator("[data-action=toggle-reading]").click();await settled(p);
    await ledger.locator("[data-view-filters]").click();
    assert.match(await p.getByRole("dialog").locator(".locked-filter").innerText(),/60%.*Locked/);
    assert.equal(await p.getByRole("dialog").locator('input[type="number"]').count(),0);
    await p.keyboard.press("Escape");await p.locator("[data-action=toggle-reading]").click();await settled(p);
    await setReaderAccess(p,"measure",0,"hidden");
    await p.locator("[data-action=toggle-reading]").click();await settled(p);
    assert.equal(await ledger.locator("[data-view-filters]").count(),0);
    assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),2);
  });
  return proof;
}
export async function benchmarkReading(p,savedUrl,truth,phone=false) {
  const amounts=new Intl.NumberFormat("en-US",{maximumFractionDigits:3}),percent=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  const context=await p.context().browser().newContext({viewport:p.viewportSize()});
  const tab=await context.newPage(),samples=[];
  try {
    await tab.goto(savedUrl);await tab.locator(".barrow.selected").waitFor();await settled(tab);
    await tab.locator(".visual").filter({has:tab.locator(".barrow")}).getByLabel("Clear selection").click();await settled(tab);
    await filter(tab,"page","Product · Category","A");
    if (phone) {
      await tab.locator('[data-action="page-settings"]').click();
      await tab.getByLabel("Use a phone layout").check();
      await tab.getByRole("dialog").getByRole("button",{name:"Save",exact:true}).click();
      await settled(tab);
    }
    await tab.getByRole("button",{name:"Reading view",exact:true}).click();await settled(tab);
    if (phone) {
      await tab.setViewportSize({width:390,height:700});
      await tab.locator("#viewport.phone-page").waitFor();
      assert.equal(await tab.locator("#paper .visual:visible").count(),4);
    }
    const count=[];tab.on("request",r=>{if(r.method()==="POST"&&r.url().endsWith("/api/reports"))count.push(r.url());});
    const pair=key=>truth.map.get(key);
    for (const category of ["B",...([...truth.map.keys()].length>2?["C","D"]:[]),"A","B"]) {
      const [revenue,profit]=pair(category);
      const dates=[...truth.dates.get(category)].sort((a,b)=>a-b).slice(0,100).map(day=> new Date(Date.UTC(2025,0,day)).toISOString().slice(0,10));
      const cells=[category,amounts.format(revenue/100),amounts.format(profit/100),percent.format(profit/revenue)];
      await tab.locator("[data-action=reader-filters]").click();
      await tab.getByLabel("Category",{exact:true}).selectOption({label:category});
      await tab.getByRole("button",{name:"Apply",exact:true}).evaluate(el=>el.addEventListener("click",()=>{window.readerStart=performance.now();},{once:true,capture:true}));
      await tab.getByRole("button",{name:"Apply",exact:true}).click();
      const ms=await tab.evaluate(async({cells,dates})=>{
        const text=selector=>[...document.querySelectorAll(selector)].map(e=>e.textContent);
        for(let i=0;i<600;i++) {
          await new Promise(requestAnimationFrame);
          if(document.querySelector("#paper").dataset.pending==="false" &&
            document.querySelector(".kpi")?.textContent===cells[3] &&
            JSON.stringify(text(".grid tbody td"))===JSON.stringify(cells) &&
            JSON.stringify(text(".slicebtn"))===JSON.stringify(dates) &&
            JSON.stringify(text(".barrow > span:first-child"))===JSON.stringify([cells[0]]) &&
            JSON.stringify(text(".barrow > b"))===JSON.stringify([cells[1]])) {
            await new Promise(requestAnimationFrame);return performance.now()-window.readerStart;
          }
        }
        throw Error("Reading view did not reconcile all four visuals");
      },{cells,dates});
      samples.push({category,revenue:revenue/100,profit:profit/100,margin:cells[3],dates:dates.length,ms});
    }
    await tab.keyboard.press("Control+s"); await tab.locator("[data-action=reader-reset]").click(); await settled(tab);
    assert.equal(await tab.locator(".kpi").innerText(),percent.format(pair("A")[1]/pair("A")[0]));
    await tab.getByRole("button",{name:"Edit report",exact:true}).click();await settled(tab);
    assert.equal(await tab.locator("#save-state").innerText(),"Unsaved changes");
    assert.deepEqual(count,[]);
    return samples;
  } finally {await context.close();}
}
if (process.argv[1]?.endsWith("reading-view.mjs")) {
  const proof=await verifyReadingView();
  proof.hospital=await verifyHospitalFilters();
  await writeFile("portfolio-evidence/reading-view.json",JSON.stringify(proof,null,2)+"\n");console.log(proof);
}
