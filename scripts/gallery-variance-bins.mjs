import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const pageName="Variance distribution",chart="Monthly regional channel results by variance",
  matrix="Revenue by interval and region",variance="Net variance",revenue="Revenue in selection";
const csv=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1);
const bins=new Map();
for(const line of csv) {
  const [,region,,,amount,target]=line.split(","),delta=Number(amount)-Number(target);
  const lower=20*Math.floor(delta/20),bin=bins.get(lower)||{count:0,variance:0,revenue:0,regions:{}};
  bin.count++;bin.variance+=delta;bin.revenue+=Number(amount);
  bin.regions[region]=(bin.regions[region]||0)+Number(amount);bins.set(lower,bin);
}
const currency=value=>value.toLocaleString("en-US",{style:"currency",currency:"USD"});
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");
  const origin=await p.locator("#pages .active").getAttribute("data-page");
  const tab=p.locator("#pages").getByRole("button",{name:pageName,exact:true});
  if (!await tab.count()) {
    await addPage(p,pageName);
    await p.getByTitle("Dispatch.Change",{exact:true}).click({button:"right"});
    await p.getByLabel("Bin field name").fill("Variance interval");
    await p.getByLabel("Bin size").fill("20");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await visual(p,"card",variance,[],["Dispatch · Change"],[18,12,458,94],"currency");
    await visual(p,"card",revenue,[],["Dispatch · Revenue"],[496,12,490,94],"currency");
    await visual(p,"clusteredColumn",chart,["Dispatch · Variance interval"],[["Dispatch · Change","count"]],[18,120,968,200]);
    await p.getByLabel("Data labels",{exact:true}).check();await settled(p);
    await p.getByLabel("Legend",{exact:true}).uncheck();await settled(p);
    await visual(p,"matrix",matrix,["Dispatch · Variance interval"],["Dispatch · Revenue"],[18,332,968,214],"currency");
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=columns]").selectOption({label:"Dispatch · Region"});await settled(p);
    await save(p);
  } else {await tab.click();await settled(p);}
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);await art(p,chart).waitFor();await settled(p);
  const plot=art(p,chart);
  const points=await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)]));
  assert.deepEqual(points,[...bins].sort((a,b)=>a[0]-b[0]).map(([k,v])=>[k,v.count]));
  const varianceValue=art(p,variance).locator(".kpi"),revenueValue=art(p,revenue).locator(".kpi");
  for(const [lower,bin] of bins) {
    const mark=plot.locator('[data-selection-key="['+lower+']"]');
    await mark.press("Enter");await settled(p);
    assert.equal(await varianceValue.innerText(),currency(bin.variance));
    assert.equal(await revenueValue.innerText(),currency(bin.revenue));
    const totalRow=art(p,matrix).locator(".matrix-total");
    const visibleRegions=await art(p,matrix).locator("thead tr:first-child th").allTextContents();
    const regionTotals=visibleRegions.filter(region=>region in bin.regions).map(region=>currency(bin.regions[region]));
    assert.equal(regionTotals.length,Object.keys(bin.regions).length);
    assert.deepEqual(await totalRow.locator("td").allTextContents(),["Grand total",...regionTotals,currency(bin.revenue)]);
    if (lower===-20) await capture(p,"gallery-variance-intervals");
  }
  await writeFile("portfolio-evidence/gallery-variance-intervals.json",JSON.stringify({link,bins:Object.fromEntries(bins)},null,2));
  console.log("Verified each of four signed intervals against CSV revenue and target",link);
});
