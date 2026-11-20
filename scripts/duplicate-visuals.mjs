import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,save,settled,studio} from "./portfolio-ui.mjs";
import {sweep} from "./canvas-rectangle.mjs";

export async function verifyDuplicates() {
  await studio(async p=>{
    await open(p,"Sales layout review");
    await sweep(p,990,150,9,8);
    await p.keyboard.press("Control+d");await settled(p);
    const count=await p.locator("#paper .visual").count();
    if (process.env.FOLIO_DUPLICATE_BASELINE==="1") {
      assert.equal(count,3);
      await writeFile("portfolio-evidence/duplicate-before.json",JSON.stringify({selected:3,action:"Ctrl+D",after:count},null,2));return;
    }
    assert.equal(count,6);
    const copies=p.locator("#paper .visual.selected");
    assert.deepEqual(await copies.locator(".kpi").allTextContents(),["$1,000.00","$130.00","2"]);
    const delta=await p.locator("#paper .visual").evaluateAll(els=>els.slice(3).map((e,i)=>["left","top"].map(k=>parseFloat(e.style[k])-parseFloat(els[i].style[k]))));
    assert.deepEqual(delta,[[16,16],[16,16],[16,16]]);
    await p.keyboard.press("Control+z");await settled(p);assert.equal(await p.locator("#paper .visual").count(),3);
    await p.keyboard.press("Control+y");await settled(p);assert.equal(await p.locator("#paper .visual").count(),6);
    await p.locator("#paper .visual").nth(4).locator(".vhead strong").click();
    await p.locator("[data-tab=Format]").click();const input=p.getByLabel("Visual title",{exact:true});
    await input.fill("Profit for review");await input.press("Tab");await settled(p);
    assert.equal(await art(p,"Profit").count(),1);assert.equal(await art(p,"Profit for review").locator(".kpi").innerText(),"$130.00");
    await save(p);
    await writeFile("portfolio-evidence/duplicate-visuals.json",JSON.stringify({originals:3,after:6,delta,editedCopy:"Profit for review",profit:130},null,2));
  });
  if (process.env.FOLIO_DUPLICATE_BASELINE==="1") return;
  await studio(async p=>{
    await open(p,"Sales layout review");assert.equal(await p.locator("#paper .visual").count(),6);
    assert.equal(await art(p,"Profit").locator(".kpi").innerText(),"$130.00");
    assert.equal(await art(p,"Profit for review").locator(".kpi").innerText(),"$130.00");
  });
}
