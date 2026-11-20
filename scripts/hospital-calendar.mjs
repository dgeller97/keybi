import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const baseline=process.argv.includes("--baseline"), name="Calendar review", chart="Routine encounters by calendar period";
const levelNames=["Date (year)","Date (quarter)","Date (month)","Date (day)"];
const csv=async n=>(await readFile("web/datasets/hospital/"+n+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const dates=new Map((await csv("Calendar")).map(([id,date])=>[id,date]));
const visits=(await csv("Encounter")).filter(r=>r[3]==="Routine").map(r=>({date:dates.get(r[1]),id:r[0],site:r[2],wait:r[5]}));
const source="Calendar · Date",card="Visits in selected period";
let link;
if (process.argv.includes("--coverage-baseline")) {
  await studio(async p=>{
    await open(p,"Hospital Operations");await p.locator("#pages").getByRole("button",{name,exact:true}).click();await settled(p);
    const plot=art(p,chart);
    await formatChart(p,chart);await p.getByLabel("Show empty intervals").check();await settled(p);
    for (const count of [174,131,44]) {
      await plot.locator('.plot-mark[data-value="'+count+'"]').first().press("Enter");await settled(p);
      await plot.locator('[data-drill="down"]').click();await settled(p);
    }
    const bars=await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.selectionKey)[0]));
    const ticks=await plot.locator("[data-axis-pick]").allTextContents();
    const lastBar=await plot.locator(".plot-mark").last().boundingBox(),chartBox=await plot.boundingBox();
    const lastBarFraction=(lastBar.x+lastBar.width/2-chartBox.x)/chartBox.width;
    assert.ok(lastBarFraction>0.85);
    const last="2026-02-28T00:00:00.000Z";
    const lastDayAvailable=await plot.locator("[data-axis-pick='"+JSON.stringify([last])+"']").count()>0;
    assert.equal(bars.at(-1).slice(0,10),"2026-02-12");assert.equal(lastDayAvailable,false);
    await writeFile("portfolio-evidence/month-coverage-before.json",JSON.stringify({showEmptyIntervals:true,bars,ticks,lastBarFraction,lastDay:last,lastDayAvailable,monthDays:28},null,2));
  });
  process.exit(0);
}
await studio(async p=>{
  await open(p,"Hospital Operations");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const existing=p.locator("#pages").getByRole("button",{name,exact:true});
  if (await existing.count()) {await existing.click();await settled(p);}
  else {
    await addPage(p,name);
    await visual(p,"card",card,[],["Encounter · Visits"],[18,12,460,85]);
    await visual(p,"clusteredColumn",chart,[source],["Encounter · Visits"],[18,108,965,207]);
    await p.getByLabel("Legend",{exact:true}).uncheck();await settled(p);
    await p.getByLabel("Data labels",{exact:true}).check();await settled(p);
    await p.locator("[data-tab=Build]").click();await p.getByRole("button",{name:"Replace Date",exact:true}).click();
    if (baseline) {
      const actions=await p.getByRole("dialog").getByRole("button").allTextContents();
      await p.getByRole("button",{name:"Create time bins",exact:true}).click();
      for (const [i,unit] of ["Years","Quarters","Months","Days"].entries()) {
        if (i) await p.getByTitle("Calendar.Date",{exact:true}).click({button:"right"});
        await p.getByLabel("Interval unit").selectOption({label:unit});
        await p.getByLabel("Bin field name").fill(levelNames[i]);
        await p.getByRole("button",{name:"Create bins",exact:true}).click();
        await p.getByTitle("Calendar."+levelNames[i],{exact:true}).waitFor();
        if (i) await p.locator("[data-pick=groups]").selectOption({label:"Calendar · "+levelNames[i]});
        await settled(p);
      }
      assert.equal(await art(p,chart).locator(".plot-mark").first().getAttribute("data-value"),String(visits.length));
      await writeFile("portfolio-evidence/calendar-hierarchy-before.json",JSON.stringify({actions,binDialogs:4,separateWellAdditions:3,levels:levelNames,visits:visits.length},null,2));
      return;
    }
    await p.getByRole("button",{name:"Use date hierarchy",exact:true}).click();
    await p.getByTitle("Calendar.Date (day)",{exact:true}).waitFor();await settled(p);
    await visual(p,"table","Encounters in selected period",["Encounter · Encounter","Encounter · Site"],["Encounter · Minutes"],[18,326,965,220]);
  }
  for (const [title,box] of [[card,[18,10,460,85]],[chart,[18,104,965,143]],["Encounters in selected period",[18,256,965,282]]]) {
    await formatChart(p,title);await position(p,box);
  }
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);const plot=art(p,chart);await plot.waitFor();await settled(p);
  let branch=visits;
  const levels=[];
  for (const [i,label] of levelNames.entries()) {
    const byDate=new Map();
    function period(date) {
      if (i===0) return date.slice(0,4)+"-01-01";
      if (i===1) return date.slice(0,5)+String(3*Math.floor((Number(date.slice(5,7))-1)/3)+1).padStart(2,"0")+"-01";
      return i===2 ? date.slice(0,7)+"-01" : date;
    }
    for (const row of branch) {const key=period(row.date);byDate.set(key,(byDate.get(key)||0)+1);}
    const bars=await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0].slice(0,10),Number(e.dataset.value)]));
    assert.deepEqual(bars,[...byDate].sort(([a],[b])=>a.localeCompare(b)));
    const [key,count]=bars.reduce((a,b)=>a[1]>=b[1] ? a : b);
    branch=branch.filter(r=>period(r.date)===key);
    await plot.locator(".plot-mark[data-selection-key='"+JSON.stringify([key+"T00:00:00.000Z"])+"']").press("Enter");await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),String(count));
    const path=await plot.locator(".drill-path").innerText();levels.push({label,bars,chosen:key,count,path});
    if (i<3) {await plot.locator('[data-drill="down"]').click();await settled(p);}
  }
  const records=await art(p,"Encounters in selected period").locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
  assert.deepEqual(records,branch.map(r=>[r.id,r.site,r.wait]).sort(([a],[b])=>a.localeCompare(b)));
  const lastRow=await art(p,"Encounters in selected period").locator("tbody tr").last().boundingBox();
  assert.ok(lastRow.y+lastRow.height<=(await p.locator("#pages").boundingBox()).y);
  await capture(p,"hospital-calendar-review");
  await writeFile("portfolio-evidence/calendar-hierarchy.json",JSON.stringify({link,levels,records},null,2));
  console.log("Verified every branch on the busiest year, quarter, month and day path",link);
});
