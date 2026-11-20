import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const chartName="Regional revenue by channel",bookmark="Paired channel bars";
const dispatch=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
const east=["East","Online"],west=["West","Retail"];
const chart=p=>art(p,chartName);
const point=(p,tuple)=>chart(p).locator(`[data-selection-key='${JSON.stringify(tuple)}']`).first();
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const proof=[];
async function check(p,tuples) {
  const keys=tuples.map(tuple=>JSON.stringify(tuple)).sort();
  const rows=dispatch.filter(row=>!keys.length || keys.includes(JSON.stringify(row.slice(1,3))));
  const amount=rows.reduce((total,row)=>total+Number(row[4]),0);
  const pressed=await chart(p).locator('[data-selection-key][aria-pressed=true]').evaluateAll(es=>[...new Set(es.map(e=>e.dataset.selectionKey))].sort());
  assert.deepEqual(pressed,keys);
  assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),money.format(amount));
  proof.push({tuples,amount,records:rows.length});
}
async function pick(p,tuple,ctrl=false) {
  await point(p,tuple).click({modifiers:ctrl?["Control"]:[]}); await settled(p);
}
async function restore(p) {
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
}
await studio(async p=>{
  await open(p,"Visual Gallery");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:"Comparisons",exact:true}).click(); await settled(p);
  await chart(p).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Detail page",{exact:true}).selectOption({label:"Dispatch records"}); await settled(p);
  await p.getByLabel("Interaction with Channel contribution",{exact:true}).selectOption("highlight"); await settled(p);
  await pick(p,east); await pick(p,west,true); await check(p,[east,west]);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const saved=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if(await saved.count()) await saved.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
  await chart(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
  await p.locator(`[data-page="${original}"]`).click(); await save(p);
});
await studio(async p=>{
  await open(p,"Visual Gallery"); await restore(p); await check(p,[east,west]);
  const marks=art(p,"Channel contribution").locator("[data-selection-key]");
  assert.equal(await marks.count(),4);
  const highlights=await marks.evaluateAll(es=>es.flatMap(el=>{
    const h=el.querySelector(".highlight-value");
    return h?[[JSON.parse(el.dataset.selectionKey),Number(h.dataset.end)-Number(h.dataset.start)]]:[];
  }));
  assert.deepEqual(highlights,[[east,409],[west,390]]);
  await capture(p,"gallery-paired-bars");
  await chart(p).getByRole("button",{name:"View records"}).click(); await settled(p);
  const rows=await art(p,"Dispatch ledger").locator("tbody tr").evaluateAll(trs=>trs.map(tr=>[...tr.cells].map(td=>td.textContent)));
  assert.deepEqual(rows,dispatch.filter(row=>row[1]==="East"&&row[2]==="Online" || row[1]==="West"&&row[2]==="Retail").sort());
  await p.locator("[data-action=drill-back]").click(); await settled(p); await check(p,[east,west]);
  await chart(p).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
  for(const kind of ["stackedColumn","percentColumn","clusteredColumn","stackedBar","percentBar","dot","line","area","clusteredBar"]) {
    await p.locator(`[data-kind="${kind}"]`).click(); await settled(p); await check(p,[east,west]);
  }
  await point(p,west).focus(); await p.keyboard.press("Control+Enter"); await settled(p); await check(p,[east]);
  assert.equal(await p.evaluate(()=>document.activeElement.dataset.selectionKey),JSON.stringify(west));
  await p.keyboard.press("Control+Space"); await settled(p); await check(p,[east,west]);
  await p.locator("[data-tab=Format]").click(); await p.getByLabel("Select multiple categories").check();
  await pick(p,east); await check(p,[west]); await pick(p,west); await check(p,[]);
  await restore(p); await check(p,[east,west]);
  await writeFile("portfolio-evidence/gallery-paired-bars.json",JSON.stringify({bookmark,checks:proof,highlights,rows},null,2)+"\n");
});
