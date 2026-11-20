import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

async function records(table) {
  const [head,...lines]=(await readFile("web/datasets/hospital/"+table+".csv","utf8")).trim().split(/\r?\n/);
  const columns=head.split(",");
  return lines.map(line=>Object.fromEntries(line.split(",").map((value,i)=>[columns[i],value])));
}
const months=new Map((await records("Calendar")).map(r=>[r.CalendarKey,r.Month])),volume=new Map();
for(const r of await records("Encounter")) {
  if(r.Status!=="Closed" || r.Cohort!=="Routine") continue;
  const month=months.get(r.CalendarKey);
  volume.set(month,(volume.get(month)||0)+Number(r.Visits));
}
const bookmark="Busiest months including ties",baseline=process.argv.includes("--baseline");
await studio(async p=>{
  await open(p,"Hospital Operations"); const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:"Site volumes",exact:true}).click(); await settled(p);
  const chart=art(p,"Monthly encounter volume by site"); await chart.locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();
  const order=await p.locator("#rank-order").inputValue(),limit=await p.locator("#rank-limit").inputValue();
  await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",2); await settled(p);
  const displayed=await chart.locator("[data-axis-pick]").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0]));
  const cutoff=[...volume.values()].sort((a,b)=>b-a)[1];
  const withTies=[...volume].filter(([,n])=>n>=cutoff).map(([month])=>month).sort();
  assert.equal(displayed.length,2); assert.ok(withTies.length>displayed.length);
  const result={report:"Hospital Operations",page:"Site volumes",limit:2,volume:Object.fromEntries(volume),displayed,withTies};
  if (baseline) {
    await writeFile("portfolio-evidence/chart-rank-tie-baseline.json",JSON.stringify(result,null,2)+"\n"); return;
  }
  await p.getByLabel("Include ties at the cutoff").check(); await settled(p);
  result.inclusive=await chart.locator("[data-axis-pick]").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0]));
  assert.deepEqual(result.inclusive,["2026-03","2026-01","2026-02"]);
  const marks=await chart.locator("[data-selection-key]").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey),Number(e.dataset.value)]));
  for (const month of result.inclusive) assert.equal(marks.filter(([[day]])=>day===month).reduce((n,[,v])=>n+v,0),volume.get(month));
  await chart.getByRole("button",{name:"Month = 2026-02",exact:true}).click(); await settled(p);
  assert.equal(await art(p,"Closed routine encounters").locator(".kpi").innerText(),"37");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if(await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
  await p.getByLabel("Include ties at the cutoff").uncheck(); await settled(p);
  assert.equal(await art(p,"Closed routine encounters").locator(".kpi").innerText(),String([...volume.values()].reduce((a,b)=>a+b,0)));
  await p.locator("#rank-order").selectOption(order); await setInput(p,"#rank-limit",limit); await settled(p);
  await p.locator('[data-page="'+original+'"]').click(); await save(p);
  await writeFile("portfolio-evidence/hospital-rank-cutoff.json",JSON.stringify({...result,bookmark,marks},null,2)+"\n");
});
if (!baseline) await studio(async p=>{
  await open(p,"Hospital Operations"); await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
  const chart=art(p,"Monthly encounter volume by site");
  assert.deepEqual(await chart.locator("[data-axis-pick]").allTextContents(),["2026-03","2026-01","2026-02"]);
  assert.equal(await art(p,"Closed routine encounters").locator(".kpi").innerText(),"37");
  await chart.locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();
  await p.locator("#rank-ties").scrollIntoViewIfNeeded(); await capture(p,"hospital-rank-cutoff");
  await p.locator("[data-kind=stackedColumn]").click(); await settled(p);
  assert.equal(await p.locator("#rank-ties").isChecked(),true);
  assert.deepEqual(await chart.locator("[data-axis-pick]").allTextContents(),["2026-03","2026-01","2026-02"]);
  console.log(bookmark,[...volume]);
});
