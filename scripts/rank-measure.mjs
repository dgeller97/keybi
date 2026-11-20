import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

const dispatch=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(s=>s.split(","));
const groups=new Map();
for(const [,region,,orders,revenue] of dispatch) {
  const totals=groups.get(region)||[0,0]; totals[0]+=Number(revenue); totals[1]+=Number(orders); groups.set(region,totals);
}
const forecasts=JSON.parse(await readFile("portfolio-evidence/budget-category-cards.json","utf8")).periods["2026-02"];
for (const example of [
  ["Visual Gallery","Compare groupings","Dispatch by selected group","Dispatch orders","Busiest dispatch region","gallery-ranked-orders"],
  ["Budget vs. Actual","Department cards","Posted variance by department","Forecast","Largest February forecast","budget-ranked-forecast"]
]) {
  const [report,page,chart,metric,bookmark,file]=example, gallery=report==="Visual Gallery",proof=[];
  const build=async p=>{await art(p,chart).locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();};
  const pick=async(p,name)=>{await p.getByLabel("Rank by measure",{exact:true}).selectOption({label:name}); await settled(p);};
  async function check(p,expected,step) {
    if(gallery) {
      const points=await art(p,chart).locator("[data-selection-key]").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],e.getAttribute("aria-label"),Number(e.dataset.value)]));
      assert.ok(points.length); assert.ok(points.every(([cat])=>cat===expected),step);
      for(const [,label,n] of points) assert.equal(n,groups.get(expected)[label.includes("Dispatch orders")?1:0]);
      proof.push({step,region:expected,points});
    } else {
      const card=art(p,chart).locator(".category-card"); assert.equal(await card.count(),1);
      assert.equal(await card.locator(".category-pick").innerText(),expected);
      assert.deepEqual(await card.locator("dd").allTextContents(),forecasts[expected].refs);
      assert.equal(await card.locator(".kpi").innerText(),forecasts[expected].amount);
      proof.push({step,department:expected,...forecasts[expected]});
    }
  }
  await studio(async p=>{
    await open(p,report); const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p); await build(p);
    const order=await p.locator("#rank-order").inputValue(),limit=await p.locator("#rank-limit").inputValue(),prior=await p.locator("#rank-measure").inputValue();
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
    await check(p,gallery?"West":"Medicine","First measure");
    await pick(p,metric); await check(p,gallery?"East":"Surgery","Chosen measure");
    await capture(p,file);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
    if(await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
    else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
    await p.locator("#rank-measure").selectOption(prior); await p.locator("#rank-order").selectOption(order); await setInput(p,"#rank-limit",limit); await settled(p);
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
    await check(p,gallery?"East":"Surgery","Reopen bookmark"); await build(p);
    assert.equal(await p.locator("#rank-measure option:checked").innerText(),metric);
    if(gallery) {
      await p.locator("[data-kind=stackedColumn]").click(); await settled(p); await check(p,"East","Convert to columns");
      await art(p,"Measures to compare").getByLabel(metric,{exact:true}).uncheck(); await settled(p);
      await check(p,"West","Use the remaining displayed measure");
      await art(p,"Measures to compare").getByLabel(metric,{exact:true}).check(); await settled(p);
      await check(p,"East","Restore orders");
    } else {
      await p.locator("#rank-order").selectOption("asc"); await settled(p); await check(p,"Facilities","Lowest forecast");
    }
  });
  await writeFile("portfolio-evidence/"+file+".json",JSON.stringify({bookmark,proof},null,2)+"\n"); console.log(bookmark,proof);
}
