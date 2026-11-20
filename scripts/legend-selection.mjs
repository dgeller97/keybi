import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

async function csv(path) {
  const [header,...lines]=(await readFile(path,"utf8")).trim().split(/\r?\n/);
  const fields=header.split(",");
  return lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[fields[i],v])));
}
const dispatch=await csv("web/datasets/gallery/Dispatch.csv");
const encounters=(await csv("web/datasets/hospital/Encounter.csv")).filter(r=>r.Cohort==="Routine" && r.Status==="Closed");
const examples=[
  {report:"Visual Gallery",page:"Comparisons",chart:"Regional revenue by channel",card:"Revenue in selection",
    bookmark:"Online across regions",values:["Online"],rows:dispatch,column:"Channel",amount:"Revenue",file:"gallery-online-legend"},
  {report:"Hospital Operations",page:"Site volumes",chart:"Monthly encounter volume by site",card:"Closed routine encounters",
    bookmark:"Cedar and Harbor across months",values:["Cedar","Harbor"],rows:encounters,column:"Site",amount:"Visits",file:"hospital-site-legend"},
];
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
for(const example of examples) {
  const {report,page,chart,card,bookmark,values,rows,column,amount,file}=example;
  const proof=[], gallery=report==="Visual Gallery";
  const mark=(p,v)=>art(p,chart).getByRole("button",{name:v,exact:true});
  async function check(p,selection,step) {
    const matching=rows.filter(r=>!selection.length || selection.includes(r[column]));
    const total=matching.reduce((sum,r)=>sum+Number(r[amount]),0);
    assert.equal(await art(p,card).locator(".kpi").innerText(),gallery?money.format(total):String(total),step);
    assert.deepEqual((await art(p,chart).locator("[data-legend-pick][aria-pressed=true]").allTextContents()).sort(),selection.slice().sort(),step);
    const points=await art(p,chart).locator("[data-selection-key]").evaluateAll(es=>es.map(e=>({key:JSON.parse(e.dataset.selectionKey),pressed:e.getAttribute("aria-pressed")==="true"})));
    for(const point of points) assert.equal(point.pressed,selection.includes(point.key.at(-1)),step);
    proof.push({step,selection,total,sourceRows:matching.length,visiblePoints:points.length});
  }
  await studio(async p=>{
    await open(p,report); const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    for(const [i,v] of values.entries()) { await mark(p,v).click({modifiers:i?["Control"]:[]}); await settled(p); }
    await check(p,values,"Select legends");
    await p.locator(".ribbon [data-action=bookmarks]").click();
    const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
    if(await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
    else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
    await art(p,chart).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p); await check(p,values,"Reopen bookmark");
    await capture(p,file);
    if(gallery) {
      const highlights=await art(p,"Channel contribution").locator(".highlight-value").evaluateAll(es=>es.map(e=>[
        JSON.parse(e.closest("[data-selection-key]").dataset.selectionKey),Number(e.dataset.end)-Number(e.dataset.start)]));
      assert.deepEqual(highlights,[[["East","Online"],409],[["West","Online"],478]]);
      await art(p,chart).getByRole("button",{name:"View records"}).click(); await settled(p);
      const ledger=await art(p,"Dispatch ledger").locator("tbody tr").evaluateAll(es=>es.map(tr=>[...tr.cells].map(td=>td.textContent)));
      assert.deepEqual(ledger,dispatch.filter(row=>row.Channel==="Online").map(Object.values).sort());
      await p.locator("[data-action=drill-back]").click(); await settled(p); await check(p,values,"Return from records");
    }
    await art(p,chart).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
    await check(p,values,"Keep all source categories with one category displayed");
    if(gallery) {
      for(const kind of ["stackedColumn","line","percentArea","clusteredBar"]) {
        await p.locator(`[data-kind="${kind}"]`).click(); await settled(p); await check(p,values,kind);
      }
      await mark(p,"Retail").press("Control+Enter"); await settled(p); await check(p,["Online","Retail"],"Add Retail");
      assert.equal(await p.evaluate(()=>document.activeElement.textContent),"Retail");
      await mark(p,"Online").press("Control+Space"); await settled(p); await check(p,["Retail"],"Remove Online");
      await mark(p,"Retail").click(); await settled(p); await check(p,[],"Clear last series");
    } else {
      await mark(p,"Harbor").press("Control+Enter"); await settled(p); await check(p,["Cedar"],"Remove Harbor");
    }
  });
  await writeFile("portfolio-evidence/"+file+".json",JSON.stringify({bookmark,proof},null,2)+"\n");
  console.log(report,proof);
}
