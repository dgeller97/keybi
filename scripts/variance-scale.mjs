import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

const matrix = "Department forecast review";
const ledger = JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
async function forecast(p) {
  await open(p,"Budget vs. Actual");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:"Forecast review",exact:true}).click();
  await settled(p);
  return original;
}
async function panel(p) {
  await art(p,matrix).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({label:"Actual less forecast"});
}
await studio(async p=>{
  const original=await forecast(p);
  await panel(p);
  await p.getByLabel("Set background by value").check();
  await p.getByLabel("Background style").selectOption("gradient");
  // Keep the same dollar scale across months. Positive cost variances represent overspending.
  await setInput(p,"[data-cell-setting=scale-min]",-150);
  await setInput(p,"[data-cell-setting=scale-max]",150);
  await p.getByLabel("Use a center color").check();
  await setInput(p,"[data-cell-setting=scale-center]",0);
  for (const [label,color] of [["Minimum","#39765e"],["Center","#ffffff"],["Maximum","#bd563e"]]) {
    await p.getByLabel(label+" color",{exact:true}).fill(color);
  }
  await p.locator(`[data-page="${original}"]`).click();
  await save(p);
});
await studio(async p=>{
  await forecast(p);
  await panel(p);
  const posted=await p.getByLabel("Base colors on").locator("option:checked").innerText()==="Posted variance";
  const evidence = {};
  for (const [period,{departments,totals}] of Object.entries(ledger)) {
    await art(p,"Forecast period").locator("select").selectOption({label:period});
    await settled(p);
    const rows=await art(p,matrix).locator("tbody tr").evaluateAll(trs=>trs.map(tr=>({
      path:JSON.parse(tr.dataset.path),value:tr.cells[3].textContent,tone:tr.cells[3].dataset.cellTone,
      background:getComputedStyle(tr.cells[3]).backgroundColor,ink:getComputedStyle(tr.cells[3]).color
    })));
    const values=[...departments.map(d=>d[3]),totals[2]];
    assert.equal(rows.length,values.length);
    rows.forEach((row,i)=>{
      if (posted && i<departments.length && departments[i][1]==null) {
        assert.equal(row.tone,undefined);
        return;
      }
      const value=values[i], weight=Math.min(Math.abs(value)/150,1);
      const end=value<0?[57,118,94]:[189,86,62];
      const rgb=end.map(channel=>Math.round(255*(1-weight)+channel*weight));
      assert.equal(row.background,"rgb("+rgb.join(", ")+")");
      assert.equal(row.tone,"scale");
    });
    evidence[period]=rows;
    if (period==="2026-01") await capture(p,"budget-variance-scale");
  }
  await panel(p);
  let queries=0;
  p.on("request",r=>{if(new URL(r.url()).pathname==="/api/query") queries++;});
  await p.getByLabel("Color applies to").selectOption("totals");
  assert.equal(await art(p,matrix).locator("[data-cell-tone=scale]").count(),1);
  await p.getByLabel("Color applies to").selectOption("detail");
  assert.equal(await art(p,matrix).locator("[data-cell-tone=scale]").count(),3);
  await p.getByLabel("Background style").selectOption("rule");
  assert.equal(await art(p,matrix).locator("[data-cell-tone=below]").count(),2);
  await p.getByLabel("Background style").selectOption("gradient");
  assert.equal(await p.getByLabel("Minimum value",{exact:true}).inputValue(),"-150");
  assert.equal(await p.getByLabel("Maximum value",{exact:true}).inputValue(),"150");
  assert.equal(queries,0);
  await writeFile("portfolio-evidence/budget-variance-scale.json",JSON.stringify({months:evidence,formattingQueries:queries},null,2)+"\n");
});
