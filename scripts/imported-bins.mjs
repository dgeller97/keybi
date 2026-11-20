import assert from "node:assert/strict";
import {addPage,art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedBins() {
  const report="Invoice adjustments",chart="Units by net change",total="Units selected";
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,report,"Which adjustments fall within one tenth?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Adjustments.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Amount,Fee,Units\n-0.3,0,2\n-0.30000000000000004,0,3\n0,0,4\n0.29999999999999993,0,5\n0.3,0,6\n0.32,0,7\n,0,8\n")});
    await p.getByTitle("Adjustments.Amount",{exact:true}).waitFor();
    await p.locator(".ribbon [data-action=calculation]").click();
    await p.getByLabel("Name",{exact:true}).fill("Net");
    await p.getByLabel("Left column").selectOption({label:"Adjustments · Amount"});
    await p.getByLabel("Operator").selectOption("-");
    await p.getByLabel("Right column").selectOption({label:"Adjustments · Fee"});
    await p.getByRole("button",{name:"Create",exact:true}).click();
    await p.getByTitle("Adjustments.Net",{exact:true}).click({button:"right"});
    await p.getByLabel("Bin size").fill("0");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    assert.match(await p.locator("dialog .err").innerText(),/greater than zero/);
    await p.getByLabel("Bin size").fill("0.1");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Adjustments.Net (bins)",{exact:true}).waitFor();
    await visual(p,"card",total,[],["Adjustments · Units"],[18,16,440,100]);
    await visual(p,"clusteredColumn",chart,["Adjustments · Net (bins)"],["Adjustments · Units"],[18,132,920,350]);
    await p.getByLabel("Show empty intervals").check();await settled(p);
    const gap=art(p,chart).locator('[data-axis-pick="[-0.1]"]');
    assert.equal(await gap.textContent(),"-0.1–<0");
    await gap.press("Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"—");
    await gap.press("Enter");await settled(p);
    await p.locator("[data-tab=Build]").click();
    const marks=art(p,chart).locator(".plot-mark");
    const values=() => marks.evaluateAll(es => es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)]));
    for (const kind of ["clusteredColumn","clusteredBar"]) {
      await p.locator('[data-kind="'+kind+'"]').click();await settled(p);
      assert.deepEqual(await values(),[[-0.4,3],[-0.3,2],[0,4],[0.2,5],[0.3,13],[null,8]]);
    }
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    const bin=art(p,chart).locator('[data-selection-key="[0.3]"]');
    assert.equal(Number(await bin.getAttribute("data-value")),6.5);
    assert.match(await bin.getAttribute("aria-label"),/0\.3–<0\.4/);
    await bin.press("Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"13");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"13");
    await art(p,chart).locator('[data-selection-key="[null]"]').press("Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"8");
    await art(p,chart).locator('[data-selection-key="[null]"]').press("Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"35");
    await addPage(p,"Interval details");
    const field="Adjustments · Net (bins)",units="Adjustments · Units";
    await visual(p,"table","Adjustment detail",[field],[units],[18,16,380,220]);
    assert.equal(await art(p,"Adjustment detail").getByRole("cell",{name:"0.3–<0.4",exact:true}).count(),1);
    await visual(p,"matrix","Adjustment totals",[field],[units],[418,16,520,240]);
    assert.match(await art(p,"Adjustment totals").locator("tbody").innerText(),/0\.3–<0\.4/);
    await visual(p,"list","Filter by interval",[field],[],[18,270,370,240]);
    await art(p,"Filter by interval").getByRole("button",{name:"0.3–<0.4",exact:true}).click();await settled(p);
    assert.deepEqual(await art(p,"Adjustment detail").locator("tbody td").allTextContents(),["0.3–<0.4","13"]);
    assert.match(await art(p,"Adjustment totals").locator(".matrix-total").innerText(),/13/);
  });
  console.log("Imported decimal bins retained signed boundaries, blanks, the calculated source, average and saved selection.");
}

export async function benchmarkBins(p,daily) {
  const title="Revenue by thirty-day interval",card="Interval revenue",totals=new Map();
  for (const [day,[cents]] of daily) {
    const lower = Math.floor(day / 30) * 30;
    totals.set(lower,(totals.get(lower) || 0)+cents);
  }
  await addPage(p,title);
  await visual(p,"card",card,[],["Sales · Revenue"],[18,16,360,104],"currency");
  await p.locator(".ribbon [data-action=calculation]").click();
  await p.getByRole("button",{name:"Create numeric bins"}).click();
  await p.getByLabel("Source column").selectOption({label:"Date · DateKey"});
  await p.getByLabel("Bin field name").fill("Thirty-day interval");
  await p.getByLabel("Bin size").fill("30");
  await p.getByRole("button",{name:"Create bins",exact:true}).click();
  await visual(p,"clusteredColumn",title,["Date · Thirty-day interval"],["Sales · Revenue"],[18,134,940,300],"currency");
  return verifyBinTotals(p,title,totals,[0,30,60]);
}

export async function verifyBinTotals(p,title,totals,selected) {
  const plot=art(p,title);
  const expected=[...totals].sort(([a],[b])=>a<b ? -1 : a>b ? 1 : 0);
  const actual=await plot.locator(".plot-mark").evaluateAll(es => es.map(e=>
    [JSON.parse(e.dataset.selectionKey)[0],Math.round(Number(e.dataset.value)*100)]));
  assert.deepEqual(actual,expected);
  const samples=[];
  for (const lower of [...selected,...selected]) {
    const point=plot.locator("[data-selection-key='"+JSON.stringify([lower])+"']");
    await point.evaluate(el=>el.addEventListener("keydown",()=>{window.binStart=performance.now();},{capture:true,once:true}));
    await point.press("Enter");
    const revenue=(totals.get(lower)/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
    await p.waitForFunction(value=>document.querySelector(".kpi")?.textContent===value &&
      document.querySelector("#paper").dataset.pending==="false",revenue,{polling:"raf"});
    const ms=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.binStart;});
    assert.equal(await point.getAttribute("aria-pressed"),"true");
    samples.push({lower,revenue,ms});
  }
  return {intervals:actual,samples};
}
