import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const baseline=process.argv.includes("--baseline"),pageName="Weekly caseload",
  chart="Routine visits by week",ledger="Site workload in selection",card="Routine visits in selection";
const rows=async name=>(await readFile("web/datasets/hospital/"+name+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(s=>s.split(","));
const dates=new Map((await rows("Calendar")).map(([key,date])=>[key,new Date(date+"T00:00:00Z")]));
const facts=(await rows("Encounter")).filter(r=>r[3]==="Routine");
function groupKey(date,weekday) {
  const d=new Date(date);d.setUTCDate(d.getUTCDate()-(7+d.getUTCDay()-weekday)%7);
  return d.toISOString();
}
const totals=weekday=>{
  const result=new Map();
  for (const r of facts) {
    const key=groupKey(dates.get(r[1]),weekday);
    result.set(key,(result.get(key)||0)+Number(r[7]));
  }
  return [...result].sort(([a],[b])=>a.localeCompare(b));
};
const counts=p=>art(p,chart).locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)]));
let link;
await studio(async p=>{
  await open(p,"Hospital Operations");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const existing=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (baseline || !await existing.count()) {
    await addPage(p,pageName);
    await visual(p,"clusteredColumn",chart,["Calendar · Date"],["Encounter · Visits"],[18,110,966,208]);
    await p.locator("[data-tab=Build]").click();await p.getByRole("button",{name:"Replace Date",exact:true}).click();
    await p.getByRole("button",{name:"Create time bins",exact:true}).click();
    await p.getByLabel("Bin field name").fill("Week of service");
    const unit=p.getByLabel("Interval unit"),choices=await unit.locator("option").allTextContents();
    await unit.selectOption({label:baseline ? "Days" : "Weeks"});
    await p.getByLabel("Bin size").fill(baseline ? "7" : "1");
    if (!baseline) await p.getByLabel("Week starts on").selectOption({label:"Monday"});
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Calendar.Week of service",{exact:true}).waitFor();await settled(p);
    if (baseline) {
      const observed=await counts(p);
      assert.deepEqual(observed,totals(4));assert.notDeepEqual(observed,totals(1));
      await writeFile("portfolio-evidence/calendar-week-before.json",JSON.stringify({choices,observed,expectedMonday:totals(1)},null,2));
      return;
    }
    await formatChart(p,chart);await p.getByLabel("Show empty intervals").check();await settled(p);
    await p.getByLabel("Legend",{exact:true}).uncheck();await settled(p);
    await visual(p,"card",card,[],["Encounter · Visits"],[18,12,440,86]);
    await visual(p,"table",ledger,["Encounter · Site"],["Encounter · Visits",["Encounter · Minutes","median"]],[18,330,966,206]);
    await save(p);
  } else {await existing.click();await settled(p);}
  await formatChart(p,chart);await position(p,[18,108,966,180]);
  await formatChart(p,ledger);await position(p,[18,300,966,238]);
  await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);await art(p,chart).waitFor();await settled(p);
  const displayed=await counts(p);assert.deepEqual(displayed,totals(1));
  assert.equal(await art(p,card).locator(".kpi").innerText(),String(facts.length));
  const [week,visits]=displayed.reduce((a,b)=>b[1]>a[1] ? b : a);
  await art(p,chart).locator("[data-selection-key='"+JSON.stringify([week])+"']").press("Enter");await settled(p);
  assert.equal(await art(p,card).locator(".kpi").innerText(),String(visits));
  assert.equal(await art(p,chart).locator("[data-axis-pick='"+JSON.stringify([week])+"']").textContent(),week.slice(0,10));
  const sites=new Map();
  for (const row of facts.filter(r=>groupKey(dates.get(r[1]),1)===week)) {
    if (!sites.has(row[2])) sites.set(row[2],[]);
    sites.get(row[2]).push(Number(row[5]));
  }
  const expected=[...sites].sort(([a],[b])=>a.localeCompare(b)).map(([site,waits])=>{
    waits.sort((a,b)=>a-b);const mid=(waits.length-1)/2;
    return [site,String(waits.length),String((waits[Math.floor(mid)]+waits[Math.ceil(mid)])/2)];
  });
  const actual=await art(p,ledger).locator("tbody tr").evaluateAll(es=>es.map(e=>[...e.querySelectorAll("td")].map(td=>td.textContent)));
  assert.deepEqual(actual,expected);await capture(p,"hospital-weekly-caseload");
  await writeFile("portfolio-evidence/calendar-week.json",JSON.stringify({link,displayed,total:facts.length,peak:{week,visits,sites:actual}},null,2));
  console.log("Verified Monday caseload, busiest week and median waits by site",link);
});
