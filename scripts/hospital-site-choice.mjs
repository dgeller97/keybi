import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const source=async name=>(await readFile("web/datasets/hospital/"+name+".csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const march=new Set((await source("Calendar")).filter(r=>r[2]==="2026-03").map(r=>r[0]));
const visits=(await source("Encounter")).filter(r=>march.has(r[1]) && r[3]==="Routine" && r[4]==="Closed");
const count=sites=>visits.filter(r=>sites.includes(r[2])).length;
const site="Coverage site",name="Daily coverage",bookmark="Cedar and Harbor in March";
const total=p=>art(p,"Closed routine visits").locator(".kpi").innerText();
const baseline=process.argv.includes("--baseline");
let link;
await studio(async p=>{
  await open(p,"Hospital Operations");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name,exact:true}).click();await settled(p);
  const picker=art(p,site);await formatChart(p,site);
  if (baseline) {
    const select=picker.locator("select");
    await select.selectOption({label:"Cedar"});await settled(p);
    await select.selectOption({label:"Harbor"});await settled(p);
    assert.equal(await total(p),String(count(["Harbor"])));
    assert.equal(await p.getByLabel("Select multiple values",{exact:true}).count(),0);
    await writeFile("portfolio-evidence/site-choice-before.json",JSON.stringify({cedarThenHarbor:Number(await total(p)),combined:count(["Cedar","Harbor"])},null,2));return;
  }
  await p.getByLabel("Select multiple values",{exact:true}).check();await settled(p);
  const d=p.getByRole("dialog");await picker.locator("[data-slicer-values]").click();
  assert.ok(await d.getByRole("checkbox",{name:"Harbor",exact:true}).isChecked());
  await d.getByRole("checkbox",{name:"Cedar",exact:true}).check();await d.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.equal(await total(p),String(count(["Harbor","Cedar"])));
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const row=d.locator("[data-bookmark-go]").filter({hasText:bookmark});
  if (await row.count()) await row.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark);await p.getByRole("button",{name:"Add current view"}).click();}
  await picker.locator("[data-slicer-values]").click();await d.getByRole("checkbox",{name:"Cedar",exact:true}).uncheck();
  await d.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);const picker=art(p,site);await picker.waitFor();await settled(p);
  assert.equal(await total(p),String(count(["Harbor"])));
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();await settled(p);
  assert.equal(await total(p),String(count(["Cedar","Harbor"])));
  const counts=await art(p,"Daily encounter ledger").locator("tbody tr").evaluateAll(rows=>rows.map(r=>Number(r.cells[1].textContent)||0));
  assert.equal(counts.reduce((a,b)=>a+b,0),count(["Cedar","Harbor"]));
  await picker.locator("[data-slicer-values]").click();const d=p.getByRole("dialog");
  await d.getByRole("checkbox",{name:"Ridge",exact:true}).check();await d.getByRole("button",{name:"Cancel",exact:true}).click();await settled(p);
  assert.equal(await total(p),String(count(["Cedar","Harbor"])));
  await picker.locator("[data-slicer-values]").click();
  await d.getByRole("checkbox",{name:"Cedar",exact:true}).waitFor();
  assert.ok(await d.getByRole("checkbox",{name:"Harbor",exact:true}).isChecked());
  await d.locator("[data-next]").waitFor({state:"hidden"});
  await capture(p,"hospital-site-choice");
  await d.getByRole("checkbox",{name:"All values",exact:true}).check();await d.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.equal(await total(p),String(visits.length));
  await writeFile("portfolio-evidence/site-choice.json",JSON.stringify({link,bookmark,harbor:count(["Harbor"]),combined:count(["Harbor","Cedar"]),all:visits.length,daily:counts},null,2));
});
