import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {create,art,studio,visual,settled,save,open} from "./portfolio-ui.mjs";

const name="Dispatch panels",total="Revenue selected",title="Panel verification";
export async function addSplit(p,label) {
  await p.locator("[data-tab=Build]").click();await p.locator("[data-pick=smallMultiples]").selectOption({label});await settled(p);
}
export const panel=(plot,name)=>plot.getByRole("region",{name,exact:true});
const data=loc=>loc.locator(".plot-mark").evaluateAll(ms=>ms.map(m=>[JSON.parse(m.dataset.selectionKey),Number(m.dataset.value)]));
export async function verifyPanels(){
  const baseline=process.env.FOLIO_PANELS_BASELINE==="1";
  await studio(async p=>{
    await create(p,title,"Which region and channel account for monthly growth?","gallery",["Dispatch"]);
    await visual(p,"card",total,[],["Dispatch · Revenue"],[12,10,355,110],"currency");
    await visual(p,"clusteredColumn",name,["Dispatch · Period"],["Dispatch · Revenue"],[12,133,968,410],"currency");
    await p.locator("[data-tab=Build]").click();const plot=art(p,name);
    if(baseline){assert.equal(await p.locator("[data-pick=smallMultiples]").count(),0);
      const combined=await data(plot);assert.deepEqual(combined.map(r=>r[1]),[430,569,732]);
      await writeFile("portfolio-evidence/panels-before.json",JSON.stringify({combined,regionalPanels:0},null,2));return;}
    await addSplit(p,"Dispatch · Region");
    const east=panel(plot,"East"),west=panel(plot,"West");
    assert.deepEqual((await data(east)).map(r=>r[1]),[216,298,349]);assert.deepEqual((await data(west)).map(r=>r[1]),[214,271,383]);
    assert.equal(await east.locator('[data-scale="primary"]').getAttribute("data-max"),await west.locator('[data-scale="primary"]').getAttribute("data-max"));
    await west.locator('.plot-mark[data-value="383"]').press("Enter");await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"$383.00");
    await p.locator("[data-tab=Build]").click();await p.locator("[data-kind=line]").click();await settled(p);
    assert.equal(await west.locator('.plot-mark[data-value="383"]').getAttribute("aria-pressed"),"true");
    await p.locator("[data-pick=legendFields]").selectOption({label:"Dispatch · Channel"});await settled(p);
    await east.locator('.plot-mark[data-value="154"]').press("Enter");await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"$154.00");
    await p.locator("[data-tab=Format]").click();const columns=p.getByLabel("Panels per row",{exact:true});await columns.selectOption("1");await settled(p);
    const boundsE=await east.boundingBox(),boundsW=await west.boundingBox();assert.ok(boundsW.y>boundsE.y+10);
    await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,title);const plot=art(p,name);assert.equal(await art(p,total).locator(".kpi").innerText(),"$154.00");
    await plot.getByRole("button",{name:"Select Region = West",exact:true}).click();await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"$868.00");
    await plot.locator("[data-clear]").click();await settled(p);
    await plot.locator(".vhead strong").click();await p.locator("[data-tab=Build]").click();
    await p.locator("[data-kind=stackedBar]").click();await settled(p);
    const west=panel(plot,"West");assert.equal(await west.locator('.plot-mark[data-value="240"]').count(),1);
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    await p.locator('[data-remove-field="legendFields:0"]').click();await settled(p);
    assert.deepEqual((await data(west)).map(r=>r[1]),[107,135.5,191.5]);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await west.locator('.plot-mark[data-value="191.5"]').press("Enter");await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"$383.00");
    await writeFile("portfolio-evidence/small-multiples.json",JSON.stringify({east:[216,298,349],west:[214,271,383],westAverage:[107,135.5,191.5],readerWestMarch:383,westAll:868,selectedEastRetailFebruary:154,savedSingleColumn:true},null,2));
  });
}

