import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,settled,studio} from "./portfolio-ui.mjs";

const evidence={};
async function inspect(p,source,shortcut=false) {
  const chart=art(p,source);
  if(shortcut) {
    await chart.locator("[data-point]").first().focus(); await p.keyboard.press("Alt+Shift+F11");
  } else await chart.getByRole("button",{name:"Show as a table"}).click();
  const table=p.getByRole("dialog").getByRole("table",{name:source,exact:true}); await table.waitFor();
  return {header:await table.locator("thead th").allTextContents(),rows:await table.locator("tbody tr").evaluateAll(es=>es.map(tr=>[...tr.cells].map(td=>td.textContent)))};
}
await studio(async p=>{
  await open(p,"Visual Gallery"); await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:"West across channels",exact:true}).click(); await settled(p);
  let queries=0; p.on("request",r=>{if(r.url().endsWith("/api/query")) queries++;});
  const snapshot=await inspect(p,"Channel contribution",true);
  assert.deepEqual(snapshot.header,["Region","Channel","Revenue","Selected · Revenue"]);
  assert.deepEqual(snapshot.rows,[["East","Online","409","—"],["East","Retail","454","—"],["West","Online","478","478"],["West","Retail","390","390"]]);
  await p.getByRole("button",{name:"Side by side"}).click();
  const beside=await p.locator(".chart-summary").evaluate(el=>{
    const [preview,table]=[...el.children].map(c=>c.getBoundingClientRect()); return table.x>=preview.right;
  });
  assert.ok(beside);
  const sort=p.getByRole("dialog").getByRole("button",{name:"Selected · Revenue",exact:true});
  const shown=()=>p.locator(".summary-scroll tbody tr").evaluateAll(es=>es.map(tr=>[...tr.cells].map(td=>td.textContent)));
  await sort.press("Enter"); assert.deepEqual(await shown(),[snapshot.rows[2],snapshot.rows[3],snapshot.rows[0],snapshot.rows[1]]);
  assert.equal(await sort.locator("..").getAttribute("aria-sort"),"descending");
  await capture(p,"gallery-highlight-table");
  const download=p.waitForEvent("download"); await p.locator("dialog [data-summary-download]").click();
  const csv=(await readFile(await (await download).path(),"utf8")).trim();
  assert.equal(csv.split("\r\n")[1],'"West","Online","478","478"'); assert.ok(csv.includes('"East","Retail","454",""'));
  await sort.click(); assert.deepEqual(await shown(),[snapshot.rows[3],snapshot.rows[2],snapshot.rows[0],snapshot.rows[1]]);
  await sort.click(); assert.deepEqual(await shown(),snapshot.rows);
  await p.keyboard.press("Escape"); assert.equal(await p.locator("dialog[open]").count(),0);
  assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$868.00"); assert.equal(queries,0);
  evidence.gallery={...snapshot,queries,beside,sortedCsv:csv.split("\r\n")};
});
await studio(async p=>{
  await open(p,"Hospital Operations"); await p.getByRole("button",{name:"Volume and attainment",exact:true}).click(); await settled(p);
  const snapshot=await inspect(p,"Monthly encounter volume and target attainment");
  const csv=async name=>(await readFile("web/datasets/hospital/"+name+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
  const calendar=new Map((await csv("Calendar")).map(r=>[r[0],r[2]])),months=new Map();
  for(const r of await csv("Encounter")) {
    if(r[3]!=="Routine" || r[4]!=="Closed") continue;
    const key=calendar.get(r[1]),totals=months.get(key)||[0,0]; totals[0]+=Number(r[7]); totals[1]+=Number(r[6]); months.set(key,totals);
  }
  const percent=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  assert.deepEqual(snapshot.rows,[...months].sort().map(([month,[visits,met]])=>[month,String(visits),percent.format(met/visits)]));
  await capture(p,"hospital-combo-table"); await p.getByRole("button",{name:"Close",exact:true}).click(); evidence.hospital=snapshot;
});
await writeFile("portfolio-evidence/show-chart-table.json",JSON.stringify(evidence,null,2)+"\n");
console.log(evidence);
