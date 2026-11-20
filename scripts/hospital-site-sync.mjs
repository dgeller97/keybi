import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const encounters=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/).slice(1)
  .map(row=>row.split(",")).filter(row=>row[3]==="Routine" && row[4]==="Closed");
const count=site=>encounters.filter(row=>!site || row[2]===site).length;
const bookmark="Harbor open workload";
const openCases=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/).slice(1)
  .map(row=>row.split(",")).filter(row=>row[3]==="Routine" && row[4]==="Open");
const link="http://127.0.0.1:4317/#r18e900ae81e95b242/read";
const baseline=process.argv.includes("--baseline");
if (!baseline) await studio(async p=>{
  await open(p,"Hospital Operations");
  const origin=p.locator("#pages .page.active"),pageId=await origin.getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:"Site performance",exact:true}).click();await settled(p);
  await formatChart(p,"Site");await p.getByRole("button",{name:"Sync slicers",exact:true}).click();
  const d=p.getByRole("dialog");
  await d.getByLabel("Site volumes",{exact:true}).selectOption({label:"Site focus"});
  await d.getByLabel("Encounter workload",{exact:true}).selectOption({label:"Filter page only"});await capture(p,"hospital-sync-slicers");
  await d.getByRole("button",{name:"Apply"}).click();await settled(p);
  await art(p,"Site").getByRole("button",{name:"Harbor",exact:true}).click();await settled(p);
  await p.locator("#pages").getByRole("button",{name:"Encounter workload",exact:true}).click();await settled(p);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const row=d.locator("[data-bookmark-go]").filter({hasText:bookmark});
  if (await row.count()) await row.locator("..").locator("[data-bookmark-update]").click();
  else {await d.getByLabel("New bookmark name").fill(bookmark);await d.getByRole("button",{name:"Add current view"}).click();}
  await p.locator("#other-selections button").click();await settled(p);
  await p.locator('[data-page="'+pageId+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const go=async name=>{
    await p.locator("#pages").getByRole("button",{name,exact:true}).click();await settled(p);
  };
  await go("Site performance");
  await art(p,"Site").getByRole("button",{name:"Harbor",exact:true}).click();await settled(p);
  const summary=Number(await art(p,"Closed routine visits").locator(".kpi").innerText());
  assert.equal(summary,count("Harbor"));
  await go("Site volumes");
  const detail=Number(await art(p,"Closed routine encounters").locator(".kpi").innerText());
  if (baseline) {
    assert.equal(detail,count());
    await writeFile("portfolio-evidence/site-sync-before.json",JSON.stringify({sourcePage:"Site performance",site:"Harbor",summary,
    nextPage:"Site volumes",detail,expected:count("Harbor")},null,2));
    return;
  }
  assert.equal(detail,count("Harbor"));
  await go("Encounter workload");
  const workload=Number(await art(p,"Encounter count").locator(".kpi").innerText());
  assert.equal(workload,openCases.filter(r=>r[2]==="Harbor").length);
  await go("Site volumes");
  const picker=art(p,"Site focus").locator("select");
  assert.equal(await picker.locator("option:checked").innerText(),"Harbor");
  await picker.selectOption({label:"Ridge"});await settled(p);await go("Site performance");
  const returned=Number(await art(p,"Closed routine visits").locator(".kpi").innerText());
  assert.equal(returned,count("Ridge"));
  assert.equal(await art(p,"Site").getByRole("button",{name:"Ridge",exact:true}).getAttribute("aria-pressed"),"true");
  await go("Daily coverage");assert.match(await art(p,"Coverage site").locator("[data-slicer-values]").innerText(),/Harbor/);
  await go("Site volumes");await picker.selectOption({label:"All"});await settled(p);await go("Site performance");
  const cleared=Number(await art(p,"Closed routine visits").locator(".kpi").innerText());assert.equal(cleared,count());
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();await settled(p);
  assert.equal(await art(p,"Encounter count").locator(".kpi").innerText(),String(workload));
  await capture(p,"hospital-harbor-workload");
  await p.locator("#other-selections button").click();await settled(p);
  assert.equal(await art(p,"Encounter count").locator(".kpi").innerText(),String(openCases.length));
  await go("Site volumes");assert.equal(await picker.locator("option:checked").innerText(),"All");
  await writeFile("portfolio-evidence/site-sync.json",JSON.stringify({link,harborSummary:summary,harborDetail:detail,
    ridgeOnReturn:returned,cleared,independentCoverageSite:"Harbor",workload,allOpen:openCases.length,bookmark},null,2));
});
