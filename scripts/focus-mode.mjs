import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,settled,studio} from "./portfolio-ui.mjs";

const title = "Regional revenue by channel";
const measure = chart => chart.evaluate(el=>{
  const {width,height} = el.getBoundingClientRect();
  const axis = [...el.querySelectorAll("svg text")].find(t=>t.textContent === "East");
  return {width,height,axisLabelHeight:axis.getBoundingClientRect().height};
});
const proof = [];
for (const width of [390,1440]) {
  await studio(async p=>{
    await p.setViewportSize({width,height:width===390 ? 700 : 900});
    const read = p.getByRole("link",{name:"Read Visual Gallery",exact:true});
    const id = (await read.getAttribute("href")).slice(1).split("/")[0];
    const saved = async()=> (await p.request.get(new URL("/api/reports/"+id,p.url()).href)).json();
    const original = await saved();
    await read.click();
    const chart = art(p,title), picker = p.getByRole("combobox",{name:"Focus visual"});
    await chart.waitFor();await settled(p);
    const before = await measure(chart);
    let queries=0,writes=0;
    p.on("request",r=>{
      if (r.method()!=="POST") return;
      if (r.url().endsWith("/api/query")) queries++;
      if (r.url().endsWith("/api/reports")) writes++;
    });
    if (width===390) await picker.selectOption({label:title});
    else await chart.getByRole("button",{name:"Focus mode"}).press("Enter");
    await p.mouse.move(0,0);
    const back = chart.getByRole("button",{name:"Back to report"});
    await back.waitFor();assert.equal(await p.locator("#paper .visual:visible").count(),1);
    const focused = await measure(chart);
    assert.ok(focused.width>before.width && focused.height>before.height);
    if (width===390) assert.ok(focused.axisLabelHeight >= 11,JSON.stringify(focused));
    await capture(p,"gallery-focus-"+width);
    await p.setViewportSize({width:width+80,height:750});
    await p.waitForFunction(w=>document.querySelector(".in-focus").getBoundingClientRect().width>w+50,focused.width);
    await p.setViewportSize({width,height:width===390?700:900});
    await p.keyboard.press("Escape");
    assert.deepEqual(await measure(chart),before);
    assert.equal(await p.locator(":focus").getAttribute(width===390?"id":"data-action"),width===390?"focus-picker":"focus-visual");
    assert.equal(queries,0);
    await picker.selectOption({label:title});
    const east = chart.locator('.plot-mark[aria-label*="Region East, Channel Retail"]');
    await east.focus();
    await p.locator("#chart-tooltip").waitFor();
    await p.keyboard.press("Escape");
    assert.ok(await back.isVisible());
    await east.press("Enter");
    await settled(p);
    await chart.getByRole("button",{name:"Show as a table"}).click();
    await p.getByRole("dialog").getByRole("table").waitFor();
    await p.keyboard.press("Escape");assert.ok(await back.isVisible());
    await back.click();
    assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$454.00");
    await picker.selectOption({label:title});
    await chart.getByRole("button",{name:"View records"}).click();await settled(p);
    assert.equal(await art(p,"Dispatch ledger").locator("tbody tr").count(),3);
    assert.equal(await p.locator(".in-focus").count(),0);
    await p.locator("[data-action=drill-back]").click();await settled(p);
    assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$454.00");
    assert.deepEqual(await saved(),original);assert.equal(writes,0);
    if (width===1440) {
      await p.getByRole("button",{name:"Workspace home"}).click();
      await open(p,"Visual Gallery");
      await chart.getByRole("button",{name:"Focus mode"}).click();
      await p.locator("[data-tab=Format]").click();
      await p.locator("#vtitle").fill("Focused draft");await p.locator("#vtitle").press("Tab");await settled(p);
      await art(p,"Focused draft").getByRole("button",{name:"Back to report"}).click();
      assert.equal(await p.locator("#vtitle").inputValue(),"Focused draft");
      assert.equal(await p.locator("#save-state").innerText(),"Unsaved changes");
    }
    proof.push({viewport:width,before,focused,focusResizeReturnQueries:0,selectedRevenue:454,dispatchRecords:3,reportWrites:writes});
  });
}
await writeFile("portfolio-evidence/focus-mode.json",JSON.stringify(proof,null,2)+"\n");
console.log(proof);
