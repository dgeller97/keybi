import assert from "node:assert/strict";
import {addPage,art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";
import {configureLine,formatChart,verifyGeometry} from "./reference-geometry.mjs";

export async function verifyNumericTrend() {
  const report="Calibration profile", title="Recorded signal", plot=p=>art(p,title);
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"How does the signal vary with probe position?");
    const choose=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await choose).setFiles({name:"Probe.csv",mimeType:"text/csv",buffer:Buffer.from("Position,Signal,Plan\n12,11,10\n-4,2,5\n0.5,4,3\n0.5,8,5\n0,3,4\n")});
    await p.getByTitle("Probe.Position",{exact:true}).waitFor();
    await visual(p,"card","Signal total",[],["Probe · Signal"],[24,18,400,112]);
    await visual(p,"line",title,["Probe · Position"],["Probe · Signal"],[24,146,880,350]);
    await p.getByLabel("Continuous numeric axis").check();await settled(p);
    await configureLine(p,"x",{name:"Origin",value:0});
    for (const kind of ["line","area","combo","stackedArea","percentArea"]) {
      if (kind!=="line") {
        await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="'+kind+'"]').click();
        if (kind==="combo") await p.locator("[data-pick=other]").selectOption({label:"Probe · Plan"});
        await settled(p);
      }
      await verifyGeometry(plot(p),"x",0,true,"Origin");
      if (["line","area","combo"].includes(kind)) {
        const pts=await plot(p).locator(".plot-mark:has(circle)").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.querySelector("circle").getAttribute("cx")),Number(e.dataset.value)]).sort((a,b)=>a[0]-b[0]));
        assert.deepEqual(pts.map(r=>r[2]),kind==="combo" ? [5,4,8,10] : [2,3,12,11]);
        assert.ok(Math.abs((pts[2][1]-pts[1][1])/(pts[1][1]-pts[0][1])-0.125)<1e-7);
      }
    }
    await p.locator('[data-kind="line"]').click();await settled(p);
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    await formatChart(p,title);
    await setInput(p,'[data-axis-key="x"][data-bound="min"]',-1);
    await setInput(p,'[data-axis-key="x"][data-bound="max"]',3);
    await plot(p).locator('.plot-mark[data-value="6"]').press("Enter");await settled(p);
    assert.equal(await art(p,"Signal total").locator(".kpi").innerText(),"12");
    await save(p);
  });
  await studio(async p=>{
    await open(p,report);await verifyGeometry(plot(p),"x",0,true,"Origin");
    assert.equal(await plot(p).locator('[data-scale=x]').getAttribute("data-min"),"-1");
    assert.equal(await plot(p).locator('.plot-mark[data-selection-key="[12]"]').first().getAttribute("tabindex"),"-1");
    assert.equal(await art(p,"Signal total").locator(".kpi").innerText(),"12");
    await formatChart(p,title);await setInput(p,'[data-axis-key="x"][data-bound="max"]',"");
    assert.equal(await plot(p).locator('.plot-mark[data-selection-key="[12]"]').first().getAttribute("tabindex"),"0");
    const checks=await p.evaluate(async()=>{
      const {numericTrendScale}=await import("/axes.js");
      const extreme=numericTrendScale([-1e308,0,1e308],0,500,true);
      return [numericTrendScale([null,1],0,500,false)===null,Number.isFinite(extreme.band),
        extreme.positions.get(0)===250,numericTrendScale([2],0,500,true).ticks.length===1];
    });assert.deepEqual(checks,[true,true,true,true]);
  });
  console.log("Signed fractional X positions, independent bounds and a zero reference survived five chart modes, changing aggregation, selection and reopen.");
}

export async function benchmarkNumericWindow(p,daily) {
  const title="Revenue by day number";
  await addPage(p,title);
  await visual(p,"line",title,["Date · DateKey"],["Sales · Revenue"],[18,18,930,430],"currency");
  await p.getByLabel("Continuous numeric axis").check();await settled(p);
  const plot=art(p,title);
  await configureLine(p,"x",{name:"Day 50",value:50});
  let queries=0;
  const count=r=>{if(r.url().endsWith("/api/query")) queries++;};
  p.on("request",count);
  const samples=[];
  try {
    await setInput(p,'[data-axis-key=x][data-bound=min]',10);
    for (const maximum of [50,80,100,50,80,100]) {
      const input=p.locator('[data-axis-key=x][data-bound=max]');
      await input.fill(String(maximum));
      await input.evaluate(el=>el.addEventListener("change",()=>{window.windowStart=performance.now();},{once:true,capture:true}));
      await input.press("Tab");
      const sample=await plot.evaluate(async el=>{
        await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
        return {ms:performance.now()-window.windowStart,
          bounds:[el.querySelector("[data-scale=x]").dataset.min,el.querySelector("[data-scale=x]").dataset.max],
          visible:[...el.querySelectorAll('.plot-mark[tabindex="0"]')].map(mark=>[JSON.parse(mark.dataset.selectionKey)[0],Math.round(Number(mark.dataset.value)*100)])};
      });
      assert.deepEqual(sample.bounds,["10",String(maximum)]);
      assert.deepEqual(sample.visible.sort((a,b)=>a[0]-b[0]),[...daily].filter(([day])=>day>=10&&day<=maximum).sort((a,b)=>a[0]-b[0]).map(([day,[cents]])=>[day,cents]));
      await verifyGeometry(plot,"x",50,true,"Day 50");
      samples.push({maximum,visible:sample.visible.length,ms:sample.ms});
    }
    assert.equal(queries,0);return {queries,samples};
  } finally {p.off("request",count);}
}
