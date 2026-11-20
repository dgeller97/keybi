import assert from "node:assert/strict";
import {createReadStream} from "node:fs";
import {readFile,writeFile} from "node:fs/promises";
import {createInterface} from "node:readline";
import {resolve} from "node:path";
import {art,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
const dir=resolve("bench-data/1000000"),category=new Map(),totals=new Map();
for(const line of (await readFile(resolve(dir,"Product.csv"),"utf8")).trim().split(/\r?\n/).slice(1)){
  const [key,name]=line.split(",");category.set(key,name);
}
let n=0;
for await(const line of createInterface({input:createReadStream(resolve(dir,"Sales.csv")),crlfDelay:Infinity})){
  if(line.startsWith("SaleID")) continue;
  const [,key,,revenue]=line.split(","),name=category.get(key);assert.ok(name);n++;
  totals.set(name,(totals.get(name)||0)+Math.round(Number(revenue)*100));
}
assert.equal(n,1000000);
const currency=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
export async function verifyMillionMerge(){
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,"Million-sale merge","Do joined category totals reconcile to the source sales?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles(["Sales","Product"].map(t=>resolve(dir,t+".csv")));
    await p.locator("#data details[data-tree]").nth(1).waitFor();
    await p.getByRole("button",{name:"Model view"}).click();await p.getByRole("button",{name:"Merge tables"}).click();
    const d=p.getByRole("dialog");await d.getByLabel("Left table",{exact:true}).selectOption({label:"Sales"});await d.getByLabel("Right table",{exact:true}).selectOption({label:"Product"});
    await d.getByLabel("Output table").fill("Joined sales");
    await d.getByLabel("Product",{exact:true}).uncheck();
    const previewStart=performance.now();await d.getByRole("button",{name:"Preview rows"}).click();
    await d.locator(".merge-preview tbody tr").nth(4).waitFor();const previewMs=performance.now()-previewStart;
    const mergeStart=performance.now();await d.getByRole("button",{name:"Create table",exact:true}).click();
    await p.locator(".modelcard").filter({has:p.getByRole("heading",{name:"Joined sales",exact:true})}).getByText(/1,000,000 merged rows|1,000,000 rows/).waitFor({timeout:60000});
    const mergeMs=performance.now()-mergeStart;
    await p.locator('[data-action="report"]').click();
    await visual(p,"table","Category reconciliation",["Joined sales · Product.Category"],["Joined sales · Revenue"],[16,16,940,380],"currency");
    await settled(p);
    const rows=await art(p,"Category reconciliation").locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
    assert.deepEqual(rows,[...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,currency.format(v/100)]));
    await save(p);
    const grand=[...totals.values()].reduce((s,v)=>s+v,0)/100;
    await writeFile("portfolio-evidence/million-merge.json",JSON.stringify({rows:n,previewMs,mergeMs,revenue:grand,categoryTotals:rows},null,2));
  });
}
