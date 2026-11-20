import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,settled,studio} from "./portfolio-ui.mjs";

const link="http://127.0.0.1:4317/#r18e900ae81e95b242/page/1e5c5aed-ca44-4f85-8ca7-020e7726ac37";
const source=async name=>(await readFile("web/datasets/hospital/"+name+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const dates=new Set((await source("Calendar")).filter(r=>r[2]==="2026-03").map(r=>r[0]));
const all=(await source("Encounter")).filter(r=>r[3]==="Routine" && r[4]==="Closed"),march=all.filter(r=>dates.has(r[1]));
await studio(async p=>{
  await p.goto(link);
  const name="Monthly encounter volume and target attainment",chart=art(p,name);
  const column=chart.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]');
  await column.press("Enter");await settled(p);
  const card=art(p,"Selected visits").locator(".kpi"),rate=art(p,"Selected attainment").locator(".kpi");
  assert.equal(await card.innerText(),String(march.length));
  const pct=(100*march.filter(r=>r[6]==="1").length/march.length).toFixed(2)+"%";assert.equal(await rate.innerText(),pct);
  await chart.locator(".vhead").click();await p.locator("[data-tab=Build]").click();
  await p.getByRole("button",{name:"Remove visual",exact:true}).click();await p.getByRole("dialog").getByRole("button",{name:"Remove",exact:true}).click();
  await settled(p);assert.equal(await card.innerText(),String(all.length));
  await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
  assert.equal(await column.getAttribute("aria-pressed"),"true");assert.equal(await card.innerText(),String(march.length));
  assert.equal(await rate.innerText(),pct);assert.equal(await chart.locator('[data-scale="secondary"]').getAttribute("data-max"),"1");
  await capture(p,"hospital-restored-combo");
  await writeFile("portfolio-evidence/restored-combo.json",JSON.stringify({link,chart:name,removedVisits:all.length,restoredVisits:march.length,
    restoredOnTarget:march.filter(r=>r[6]==="1").length,restoredAttainment:pct,secondaryMaximum:1},null,2));
});
