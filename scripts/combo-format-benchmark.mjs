import assert from "node:assert/strict";
import {addPage,art,settled,visual} from "./portfolio-ui.mjs";

export async function benchmarkComboFormats(p,truth) {
  await addPage(p,"Revenue and margin");
  const title="Category revenue and weighted margin";
  await visual(p,"combo",title,["Product · Category"],["Sales · Revenue"],[18,18,945,450]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=other]").selectOption({label:"Margin"});
  await settled(p);
  await p.locator("[data-tab=Format]").click();
  const chart=art(p,title), select=p.getByLabel("Number format for Revenue");
  const pct=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2}), records=[];
  let queryRequests=0;
  const count=r => { if (new URL(r.url()).pathname==="/api/query") queryRequests++; };
  p.on("request",count);
  try {
    for (const format of ["currency","number","currency",""]) {
      await select.evaluate(el => el.addEventListener("change",() => {
        const start=performance.now();
        window.comboFormatPaint=new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()-start))));
      },{once:true}));
      await select.selectOption(format);
      const ms=await p.evaluate(() => window.comboFormatPaint);
      const labels=await chart.locator("[data-point]").evaluateAll(ms => ms.map(m => m.getAttribute("aria-label")));
      const amount=new Intl.NumberFormat("en-US",format==="currency" ? {style:"currency",currency:"USD"} : {});
      assert.equal(labels.length,truth.map.size*2);
      for (const [category,[revenue,profit]] of truth.map) {
        assert.ok(labels.includes(`Category ${category} · Revenue: ${amount.format(revenue/100)}`));
        assert.ok(labels.includes(`Category ${category} · Margin: ${pct.format(profit/revenue)}`));
      }
      records.push({format:format || "Use visual format",ms,marks:labels.length});
    }
    assert.equal(queryRequests,0);
    return {records,queryRequests};
  } finally { p.off("request",count); }
}
