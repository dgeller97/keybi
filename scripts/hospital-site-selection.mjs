import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const report="Hospital Operations",page="Monthly change",bookmark="April Cedar and Harbor",sites=["Cedar","Harbor"];
const chart=p=>art(p,"Sites by change in attainment");
async function csv(name) {
  const [head,...lines]=(await readFile(`web/datasets/hospital/${name}.csv`,"utf8")).trim().split(/\r?\n/);
  return lines.map(line=>Object.fromEntries(line.split(",").map((value,i)=>[head.split(",")[i],value])));
}
const dates=new Map((await csv("Calendar")).map(row=>[row.CalendarKey,row.Month]));
const encounters=(await csv("Encounter")).filter(row=>row.Cohort==="Routine" && row.Status==="Closed");
const fmt=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2}),proof=[];
async function check(p,selection,month,prior) {
  const counts=[month,prior].map(m=>{
    const rows=encounters.filter(r=>dates.get(r.CalendarKey)===m && (!selection.length || selection.includes(r.Site)));
    const visits=rows.reduce((sum,r)=>sum+Number(r.Visits),0),met=rows.reduce((sum,r)=>sum+Number(r.MetTarget),0);
    return {m,met,visits,rate:fmt.format(met/visits)};
  });
  for(const [i,title] of ["Current attainment","Previous attainment"].entries())
    assert.equal(await art(p,title).locator(".kpi").innerText(),counts[i].rate);
  assert.deepEqual((await chart(p).locator(".barrow.selected span:first-child").allTextContents()).sort(),[...selection].sort());
  proof.push({selection,counts});
}
await studio(async p=>{
  await open(p,report);
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
  await art(p,"Review month").locator("select").selectOption({label:"2026-04"}); await settled(p);
  for(const [i,site] of sites.entries()) {
    await chart(p).locator(".barrow").filter({hasText:site}).click({modifiers:i?["Control"]:[]}); await settled(p);
  }
  await check(p,sites,"2026-04","2026-03");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const saved=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if(await saved.count()) await saved.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
  await chart(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
  await p.locator(`[data-page="${original}"]`).click(); await save(p);
});
await studio(async p=>{
  await open(p,report); await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p); await check(p,sites,"2026-04","2026-03");
  await capture(p,"hospital-paired-sites");
  await art(p,"Review month").locator("select").selectOption({label:"2026-03"}); await settled(p); await check(p,sites,"2026-03","2026-02");
  await chart(p).locator(".barrow").filter({hasText:"Cedar"}).click({modifiers:["Control"]}); await settled(p); await check(p,["Harbor"],"2026-03","2026-02");
  await chart(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p); await check(p,[],"2026-03","2026-02");
});
await writeFile("portfolio-evidence/hospital-paired-sites.json",JSON.stringify({bookmark,proof},null,2)+"\n");
