import assert from "node:assert/strict";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedIntraday() {
  const name="Overnight readings",chartName="Load during handover";
  const plot=p=>art(p,chartName);
  const coords=p=>plot(p).locator("[data-scale=calendar]").evaluate(el=>{
    const svg=el.closest("svg");
    return [...svg.querySelectorAll(".plot-mark")].filter(e=>e.querySelector("circle")).map(e=>{
      const x=Number(e.querySelector("circle").getAttribute("cx"));
      return {x,value:Number(e.dataset.value)};
    }).sort((a,b)=>a.x-b.x);
  });
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"When did the measured load change?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Log.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Instant,Units,Target\n2024-03-01T00:59:59.980+01:00,2,4\n2024-02-29 23:59:59.990,3,8\n2024-02-29 23:59:59.990,4,6\n2024-03-01T00:00:00.070Z,5,9\n")});
    await p.getByTitle("Log.Instant",{exact:true}).waitFor();
    await visual(p,"card","Units",[],["Log · Units"],[18,18,320,120]);
    await visual(p,"line",chartName,["Log · Instant"],["Log · Units"],[18,150,930,330]);
    await p.getByLabel("Continuous date axis").check();await settled(p);
    for(const kind of ["line","area","combo","stackedArea","percentArea"]) {
      if(kind!=="line") {
        await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="'+kind+'"]').click();
        if (kind==="combo") await p.locator("[data-pick=other]").selectOption({label:"Log · Target"});
        await settled(p);
      }
      const ticks=await plot(p).locator("[data-tick-date]").evaluateAll(es=>es.map(e=>e.dataset.tickDate));
      assert.equal(ticks[0],"2024-02-29T23:59:59.980Z");
      assert.equal(ticks.at(-1),"2024-03-01T00:00:00.070Z");
      if (["line","area","combo"].includes(kind)) {
        const values=await coords(p);
        assert.deepEqual(values.map(d=>d.value),kind==="combo" ? [4,14,9] : [2,7,5]);
        assert.ok(Math.abs((values[2].x-values[1].x)/(values[1].x-values[0].x)-8)<1e-7);
      }
    }
    await p.locator('[data-kind="line"]').click();await settled(p);
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    assert.deepEqual((await coords(p)).map(d=>d.value),[2,4,3.5,14,5,9]);
    await plot(p).locator('.plot-mark[data-value="3.5"]').press("Enter");await settled(p);
    assert.equal(await art(p,"Units").locator(".kpi").innerText(),"7");await save(p);
  });
  await studio(async p=>{
    await open(p,name);assert.deepEqual((await coords(p)).map(d=>d.value),[2,4,3.5,14,5,9]);
    assert.equal(await art(p,"Units").locator(".kpi").innerText(),"7");
    const invalid=await p.evaluate(async()=>{
      const {calendarScale}=await import("/axes.js");
      return [
        ["2024-02-30T00:00Z"],["2024-01-01T24:40Z"],["2024-01-01T00:00:00.000001Z"],
        ["2024-01-01T00:00Z","2023-12-31T19:00-05:00"],
      ].map(xs=>calendarScale(xs,0,400,false)===null);
    });
    assert.deepEqual(invalid,[true,true,true,true]);
  });
  console.log("Timestamp trends preserved a 10 ms and 80 ms interval across leap-day midnight, chart conversions, aggregation changes, saved selection and reopen.");
}
