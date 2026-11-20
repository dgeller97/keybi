import assert from "node:assert/strict";
import {art,filter,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedSeriesColors() {
  const report="Dispatch palette",name="Loads by lane";
  const colors=p=>art(p,name).locator("[data-series-color]").evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.seriesColor,e.dataset.color])));
  let original;
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"Which lanes carried the most loads?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Buckets.csv",mimeType:"text/csv",buffer:Buffer.from("Lane,Loads\nNorth,90\nSouth,40\ntoString,15\n")});
    await p.getByTitle("Buckets.Loads",{exact:true}).waitFor();
    await visual(p,"card","Loads",[],["Buckets · Loads"],[24,18,400,110]);
    await visual(p,"donut",name,["Buckets · Lane"],["Buckets · Loads"],[24,152,600,340]);
    await p.locator('[data-color-key="North"]').fill("#81408a");
    original=await colors(p);assert.equal(original.North,"#81408a");assert.match(original.toString,/^#[a-f0-9]{6}$/i);
    let queries=0;p.on("request",r=>{if (r.url().endsWith("/api/query")) queries++;});
    await p.getByRole("button",{name:"Pin displayed colors"}).click();
    assert.deepEqual(await colors(p),original);
    await p.getByRole("button",{name:"Use automatic color for South"}).click();
    assert.equal(await p.getByRole("button",{name:"Use automatic color for North"}).count(),1);
    await p.getByRole("button",{name:"Pin displayed colors"}).click();
    assert.equal(queries,0);
    await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="pie"]').click();await settled(p);
    assert.deepEqual(await colors(p),original);
    await filter(p,"page","Buckets · Lane","South");assert.equal(await art(p,"Loads").locator(".kpi").innerText(),"40");
    assert.deepEqual(await colors(p),{South:original.South});await save(p);
  });
  await studio(async p=>{
    await open(p,report);assert.deepEqual(await colors(p),{South:original.South});
    const plot=art(p,name);await plot.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
    assert.ok(await p.getByRole("button",{name:"Displayed colors pinned"}).isDisabled());
    await p.getByRole("button",{name:"Use automatic color for South"}).click();
    assert.notEqual((await colors(p)).South,original.South);
    assert.equal(await art(p,"Loads").locator(".kpi").innerText(),"40");
  });
  console.log("Imported series colors survived a chart conversion, a single-lane filter and reopen. Resetting South preserved the other pins.");
}
