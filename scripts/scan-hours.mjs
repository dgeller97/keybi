import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
import {formatChart} from "./reference-geometry.mjs";

const pageName="Hourly dispatch",chart="Parcels by UTC hour",card="Parcels in selection",ledger="Dock scans in selection";
const csv=(await readFile("web/datasets/gallery/Scans.csv","utf8")).trim().split(/\r?\n/).slice(1);
const iso=hour=>new Date(Date.UTC(2026,10,1,hour)).toISOString();
const scans=csv.map(line=>{
  const [timestamp,dock,number]=line.split(",");
  return {timestamp,dock,value:Number(number),hour:new Date(timestamp).getUTCHours()};
});
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const tab=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (!await tab.count()) {
    await addPage(p,pageName);
    await formula(p,"Parcel count with empty hours","IF(ISBLANK(SUM('Scans'[Parcels])), 0, SUM('Scans'[Parcels]))");
    await visual(p,"card",card,[],["Parcel count with empty hours"],[18,12,370,94]);
    await visual(p,"clusteredColumn",chart,["Scans · ScanTime"],["Scans · Parcels"],[18,118,966,193]);
    await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Replace ScanTime",exact:true}).click();
    await p.getByRole("button",{name:"Create time bins",exact:true}).click();
    await p.getByLabel("Bin field name").fill("UTC scan hour");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Scans.UTC scan hour",{exact:true}).waitFor();
    await formatChart(p,chart);await p.getByLabel("Show empty intervals").check();await settled(p);
    await p.getByLabel("Legend",{exact:true}).uncheck();await settled(p);
    await p.getByLabel("Data labels",{exact:true}).check();await settled(p);
    await visual(p,"table",ledger,["Scans · ScanTime","Scans · Dock"],["Scans · Parcels"],[18,324,966,220]);
    await save(p);
  } else {await tab.click();await settled(p);}
  await formatChart(p,chart);await position(p,[18,112,966,173]);
  await formatChart(p,ledger);await position(p,[18,296,966,248]);
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Sort ScanTime by UTC time").check();
  await art(p,ledger).locator('th[aria-sort="ascending"]').first().waitFor();await settled(p);
  await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);await art(p,chart).waitFor();await settled(p);
  const plot=art(p,chart),value=art(p,card).locator(".kpi");
  assert.equal(await value.innerText(),"59");
  assert.deepEqual(await plot.locator("[data-axis-pick]").allTextContents(),["05:00","06:00","07:00","08:00"]);
  assert.equal(await plot.locator("[data-time-bin-caption]").textContent(),"2026-11-01 · UTC interval start");
  const checks=[];
  for (const hour of [5,7,8,6]) {
    const matches=scans.filter(row=>row.hour===hour),sum=matches.reduce((a,row)=>a+row.value,0);
    const attr=matches.length ? "data-selection-key" : "data-axis-pick";
    const target=plot.locator("["+attr+"='"+JSON.stringify([iso(hour)])+"']");
    if (matches.length) assert.equal(Number(await target.getAttribute("data-value")),sum);
    await target.press("Enter");await settled(p);
    assert.equal(await value.innerText(),String(sum));
    const rows=await art(p,ledger).locator("tbody tr").evaluateAll(es=>es.map(e=>[...e.querySelectorAll("td")].map(c=>c.textContent)));
    matches.sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)||a.dock.localeCompare(b.dock));
    assert.deepEqual(rows,matches.map(r=>[r.timestamp,r.dock,String(r.value)]));
    checks.push({start:iso(hour),parcels:sum,records:rows});
  }
  await capture(p,"gallery-hourly-dispatch");
  await plot.getByLabel("Clear selection").click();await settled(p);assert.equal(await value.innerText(),"59");
  await writeFile("portfolio-evidence/scan-hours.json",JSON.stringify({link,checks},null,2));
  console.log("Verified four hourly selections, underlying records and cleared total",link);
});
