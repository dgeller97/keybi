import assert from "node:assert/strict";
import {createReadStream} from "node:fs";
import {readFile,writeFile} from "node:fs/promises";
import {createInterface} from "node:readline";
import {resolve} from "node:path";
import {art,links,measure,rename,settled,studio,visual} from "./portfolio-ui.mjs";
import {openGroupEditor} from "./named-groups.mjs";

export async function verifyMillionGroupedRows(){
  const dir=resolve("bench-data/1000000"),money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}),
    percent=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  const categories=new Map((await readFile(resolve(dir,"Product.csv"),"utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(",").slice(0,2)));
  const dates=new Map((await readFile(resolve(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(",")));
  const groups=new Map(),daily=new Map();let count=0;
  for await(const line of createInterface({input:createReadStream(resolve(dir,"Sales.csv")),crlfDelay:Infinity})){
    if(line.startsWith("SaleID"))continue;
    const [,product,date,revenue,profit]=line.split(","),cat=categories.get(product),month=dates.get(date).slice(0,7);
    const group="ABC".includes(cat)?"Review":"Remainder",key=JSON.stringify([group,month+"-01T00:00:00.000Z"]);
    for(const [map,id] of [[groups,group],[daily,key]]){const total=map.get(id)||[0,0];total[0]+=Math.round(Number(revenue)*100);total[1]+=Math.round(Number(profit)*100);map.set(id,total);}
    count++;
  }
  assert.equal(count,1000000);
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,"Million-sale review cohorts","Which category groups and months contribute to review margins?");
    const pick=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();await(await pick).setFiles(["Sales","Product","Date"].map(t=>resolve(dir,t+".csv")));
    await p.locator("#data details[data-tree]").nth(2).waitFor();await links(p,2);await measure(p,"Margin","Sales · Profit","Sales · Revenue");
    await p.getByTitle("Date.Date",{exact:true}).click({button:"right"});await p.getByLabel("Interval unit").selectOption({label:"Months"});
    await p.getByLabel("Bin field name").fill("Month");await p.getByRole("button",{name:"Create bins",exact:true}).click();await p.getByTitle("Date.Month",{exact:true}).waitFor();
    await visual(p,"card","Selected revenue",[],["Sales · Revenue"],[12,12,466,105],"currency");
    await visual(p,"card","Selected margin",[],["Margin"],[500,12,478,105]);
    await visual(p,"clusteredColumn","Revenue by cohort",["Product · Category"],["Sales · Revenue"],[12,135,470,380],"currency");
    const chart=art(p,"Revenue by cohort");await openGroupEditor(p,chart,"Category");await p.getByLabel("Group field name").fill("Review cohort");await p.getByLabel("Group label",{exact:true}).fill("Review");
    for(const cat of "ABC")await p.getByRole("checkbox",{name:"Include "+cat,exact:true}).check();
    await p.getByLabel("Combine unassigned values").check();await p.getByLabel("Other label").fill("Remainder");await p.getByRole("button",{name:"Save groups"}).click();await p.locator("dialog").waitFor({state:"hidden"});await settled(p);
    for(const [name,[revenue]] of groups){
      const mark=chart.locator('[data-selection-key=\'["'+name+'"]\']');
      assert.equal(Math.round(Number(await mark.getAttribute("data-value"))*100),revenue);
    }
    await visual(p,"table","Cohort and month",["Product · Review cohort","Date · Month"],["Sales · Revenue","Margin"],[497,135,480,400]);
    const grid=art(p,"Cohort and month"),keys=await grid.locator("tr[data-detail-row]").evaluateAll(rs=>rs.map(r=>r.dataset.detailRow));
    assert.equal(keys.length,24);
    for(const key of keys){
      const [revenue,profit]=daily.get(key),row=grid.locator("tr[data-detail-row]").nth(keys.indexOf(key));
      assert.equal(await row.locator("td").last().innerText(),percent.format(profit/revenue));
    }
    const selected=[keys[0],keys[13],keys[5],keys[22],keys[0],keys[13]],samples=[];
    for(let index=0;index<selected.length;index++){
      const key=selected[index],combine=index%2===1,row=grid.locator("tr[data-detail-row]").nth(keys.indexOf(key)),button=row.locator("[data-detail-pick]");
      const totals=[...daily.get(key)];
      if(combine){const prev=daily.get(selected[index-1]);totals[0]+=prev[0];totals[1]+=prev[1];}
      await button.evaluate(el=>el.addEventListener("keydown",()=>{window.selectionStartMs=performance.now();},{capture:true,once:true}));
      await button.press(combine?"Control+Enter":"Enter");await settled(p);
      assert.equal(await art(p,"Selected revenue").locator(".kpi").innerText(),money.format(totals[0]/100));
      assert.equal(await art(p,"Selected margin").locator(".kpi").innerText(),percent.format(totals[1]/totals[0]));
      const bars=await chart.locator(".plot-mark").evaluateAll(es=>es.map(e=>Math.round(Number(e.dataset.value)*100)));
      assert.equal(bars.reduce((a,b)=>a+b,0),totals[0]);
      samples.push(await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r(performance.now()-window.selectionStartMs)))));
    }
    await writeFile("portfolio-evidence/million-grouped-rows.json",JSON.stringify({sales:count,sourceCategories:12,cohortMonths:keys.length,cohortRevenueCents:Object.fromEntries([...groups].map(([k,[n]])=>[k,n])),samples,maxMs:Math.max(...samples)},null,2));
  });
}

