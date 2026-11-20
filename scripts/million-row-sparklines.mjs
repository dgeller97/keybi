import assert from "node:assert/strict";
import {createReadStream} from "node:fs";
import {readFile,writeFile} from "node:fs/promises";
import {createInterface} from "node:readline";
import {resolve} from "node:path";
import {art,links,measure,rename,settled,studio,visual} from "./portfolio-ui.mjs";
import {configureSpark,sparkValues} from "./row-sparklines.mjs";
export async function verifyMillionSpark(){
  const dir=resolve("bench-data/1000000");
  async function lookup(file,index){const rows=(await readFile(resolve(dir,file+".csv"),"utf8")).trim().split(/\r?\n/).slice(1);
    return new Map(rows.map(r=>{const c=r.split(",");return [c[0],c[index]];}));}
  const categories=await lookup("Product",1),dates=await lookup("Date",1),totals=new Map();let count=0;
  for await(const line of createInterface({input:createReadStream(resolve(dir,"Sales.csv")),crlfDelay:Infinity})){
    if(line.startsWith("SaleID"))continue;
    const [,product,date,r,p]=line.split(","),category=categories.get(product),month=dates.get(date).slice(0,7);
    if(!totals.has(category))totals.set(category,new Map());
    const months=totals.get(category),running=months.get(month)||[0,0];running[0]+=Math.round(Number(r)*100);running[1]+=Math.round(Number(p)*100);months.set(month,running);count++;
  }
  assert.equal(count,1000000);
  const pct=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,"Million-sale monthly margins","How does each category's monthly margin compare?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles(["Sales","Product","Date"].map(t=>resolve(dir,t+".csv")));await p.locator("#data details[data-tree]").nth(2).waitFor();
    await links(p,2);await measure(p,"Margin","Sales · Profit","Sales · Revenue");
    await p.getByTitle("Date.Date",{exact:true}).click({button:"right"});await p.getByLabel("Interval unit").selectOption({label:"Months"});
    await p.getByLabel("Bin size").fill("1");await p.getByLabel("Bin field name").fill("Calendar month");await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Date.Calendar month",{exact:true}).waitFor();
    await visual(p,"dropdown","Choose category",["Product · Category"],[],[18,12,460,115]);
    await visual(p,"table","Monthly margin ledger",["Product · Category"],["Margin"],[18,145,960,435]);
    const table=art(p,"Monthly margin ledger"),trend="Monthly margin";
    await configureSpark(p,{name:trend,source:"Margin",axis:"Date · Calendar month",format:"auto"});
    let points=0;
    for(const [category,months] of totals){
      const row=table.locator("tbody tr").filter({has: p.getByRole("cell",{name:category,exact:true})});
      const actual=await sparkValues(p,row,trend);
      const expected=[...months].sort(([a],[b])=>a.localeCompare(b)).map(([m,[r,profit]])=>[m,pct.format(profit/r)]);
      assert.deepEqual(actual,expected);points+=actual.length;
    }
    const select=art(p,"Choose category").locator("select"),samples=[];
    for(const category of ["A","C","E","G","I","K","A","C","E","G","I","K"]){
      await p.evaluate(()=>document.addEventListener("input",()=>{window.startedSpark=performance.now();},{capture:true,once:true}));
      await select.selectOption({label:category});await settled(p);
      const cell=table.locator("tbody tr").first();assert.equal(await cell.locator("td").first().innerText(),category);
      const months=[...totals.get(category)].sort(([a],[b])=>a.localeCompare(b));const ends=months.map(([,v])=>pct.format(v[1]/v[0]));
      assert.equal(await cell.getByRole("button",{name:"Inspect "+trend}).getAttribute("aria-description"),months.length+" values · "+ends[0]+" to "+ends.at(-1));
      samples.push(await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>r(performance.now()-window.startedSpark)))));
    }
    await writeFile("portfolio-evidence/million-sparklines.json",JSON.stringify({sales:count,categories:totals.size,monthlyValuesReconciled:points,inputToCheckedDisplayMs:samples,maximumMs:Math.max(...samples)},null,2));
  });
}

