import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

const budget=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
async function csv(name) {
  const [header,...lines]=(await readFile("web/datasets/hospital/"+name+".csv","utf8")).trim().split(/\r?\n/);
  const fields=header.split(",");
  return lines.map(line=>Object.fromEntries(line.split(",").map((value,i)=>[fields[i],value])));
}
const dates=new Map((await csv("Calendar")).map(r=>[r.CalendarKey,r.Date]));
const visits=(await csv("Encounter")).filter(r=>r.Status==="Closed"&&r.Cohort==="Routine");
for (const [report,page,title,file] of [
  ["Hospital Operations","Attainment exceptions","Attainment on recorded days","hospital-attainment-fills"],
  ["Budget vs. Actual","Forecast review","Actual and forecast by department","budget-variance-fills"],
]) {
  const hospital=report==="Hospital Operations",proof=[];
  async function check(p,filter,threshold=0.60) {
    const marks=await art(p,title).locator('[data-point][data-metric="0"]').evaluateAll(es=>es.map(g=>({
      key:JSON.parse(g.dataset.selectionKey)[0],value:Number(g.dataset.value),color:g.querySelector("rect").getAttribute("fill")
    })));
    if(hospital) {
      const byDay=new Map();
      for(const row of visits) {
        const day=dates.get(row.CalendarKey); if(!day.startsWith("2026-03")||row.Site!==filter) continue;
        const sum=byDay.get(day)||[0,0];sum[0]+=Number(row.MetTarget);sum[1]+=Number(row.Visits);byDay.set(day,sum);
      }
      assert.equal(marks.length,byDay.size);
      for(const m of marks) {
        const [passed,count]=byDay.get(m.key);assert.equal(m.value,passed/count);
        assert.equal(m.color,threshold!=null && m.value<threshold?"#a63e31":"#43856b");
      }
    } else {
      const departments=budget[filter].departments.filter(r=>r[1]!=null);
      assert.equal(marks.length,departments.length);
      for(const [key,actual,forecast] of departments) {
        const m=marks.find(m=>m.key===key);assert.equal(m.value,actual);
        assert.equal(m.color,actual>forecast?"#a63e31":"#43856b");
      }
      assert.equal(await art(p,title).locator('[data-metric="1"] rect[fill="#773e82"]').count(),1);
    }
    proof.push({filter,...(hospital?{threshold}:{}),marks});
  }
  await studio(async p=>{
    await open(p,report);const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click();await settled(p);
    await art(p,title).locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Apply to measure").selectOption({label:hospital?"Within 45 minutes":"Actual"});
    await p.getByLabel("Set fill color by value").check();
    if(!hospital) {await p.getByLabel("Base colors on").selectOption({label:"Actual less forecast"});await settled(p);}
    if(hospital) await p.getByLabel("Threshold source",{exact:true}).selectOption({label:"Fixed value"});
    await setInput(p,"[data-cell-setting=threshold]",hospital?60:0);
    if(hospital) {
      const source=p.getByLabel("Threshold source",{exact:true});
      await source.selectOption(await source.locator("option").filter({hasText:"Dates below the review threshold / Within 45 minutes"}).getAttribute("value"));
    }
    await p.locator("[data-cell-setting=below]").fill(hospital?"#a63e31":"#43856b");
    await p.locator("[data-cell-setting=above]").fill(hospital?"#43856b":"#a63e31");
    await check(p,hospital?"Harbor":"2026-04");await capture(p,file);
    await p.locator('[data-page="'+original+'"]').click();await save(p);
  });
  await studio(async p=>{
    await open(p,report);await p.getByRole("button",{name:page,exact:true}).click();await settled(p);
    await check(p,hospital?"Harbor":"2026-04");
    const next=hospital?"Cedar":"2026-01";
    await art(p,hospital?"Review site":"Forecast period").locator("select").selectOption({label:next});await settled(p);await check(p,next);
    await art(p,title).getByRole("button",{name:"Show as a table"}).click();
    const table=p.getByRole("dialog").getByRole("table");await table.waitFor();
    assert.deepEqual(await table.locator("th").allTextContents(),hospital?["Date","Within 45 minutes"]:["Department","Actual","Forecast"]);
    if(hospital) {
      await p.keyboard.press("Escape");
      await art(p,"Review site").locator("select").selectOption({label:"Harbor"});await settled(p);
      const ledger=art(p,"Dates below the review threshold");
      for(const n of [70,50]) {
        await ledger.locator("[data-view-filters]").click();await p.locator('[data-measure-filter="0"]').click();
        await p.getByLabel("Threshold (%)").fill(String(n));await p.locator("dialog button[type=submit]").click();await settled(p);
        await check(p,"Harbor",n/100);
      }
      await ledger.locator("[data-view-filters]").click();await p.locator('[data-clear-measure-filter="0"]').click();await settled(p);
      await check(p,"Harbor",null);
    }
  });
  await writeFile("portfolio-evidence/"+file+".json",JSON.stringify({report,page,title,proof},null,2)+"\n");console.log(report,proof[0]);
}
