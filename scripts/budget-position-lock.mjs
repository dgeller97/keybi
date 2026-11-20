import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";
import {sweep} from "./canvas-rectangle.mjs";

const bg="Purchase summary background",titles=["Authorized amount","Purchase line count","Average line amount"];
const coords=plot=>plot.evaluate(el=>[el.style.left,el.style.top,el.style.width,el.style.height].map(parseFloat));
await studio(async p=>{
  await open(p,"Budget vs. Actual");
  const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
  await pages.getByRole("button",{name:"Purchase authorizations",exact:true}).click();await settled(p);
  const shape=art(p,bg),before=await coords(shape);
  if (process.env.FOLIO_LOCK_BASELINE==="1") {
    await sweep(p,12,9,972,135);const after=await coords(shape);assert.notDeepEqual(before,after);
    await writeFile("portfolio-evidence/position-lock-before.json",JSON.stringify({before,after,selected:await p.locator("#paper .visual.selected").getAttribute("aria-label")},null,2));return;
  }
  await p.getByRole("button",{name:"Arrange",exact:true}).click();
  await p.getByRole("checkbox",{name:bg,exact:true}).check();
  const lock=p.getByRole("button",{name:"Lock positions",exact:true});
  if (await lock.isVisible()) await lock.click();
  await save(p);
  await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (process.env.FOLIO_LOCK_BASELINE!=="1") await studio(async p=>{
  await open(p,"Budget vs. Actual");
  await p.locator("#pages").getByRole("button",{name:"Purchase authorizations",exact:true}).click();await settled(p);
  const shape=art(p,bg),before=await coords(shape);
  await art(p,"Authorized amount by department").locator('[data-selection-key=\'["Facilities"]\']').press("Enter");await settled(p);
  await sweep(p,12,9,972,135,{during:()=>capture(p,"budget-locked-background")});
  const selected=await p.locator("#paper .visual.selected").evaluateAll(els=>els.map(el=>el.getAttribute("aria-label")));
  assert.deepEqual(selected,titles);assert.deepEqual(await coords(shape),before);
  assert.equal(await art(p,titles[0]).locator(".kpi").innerText(),"$112.25");
  await writeFile("portfolio-evidence/position-lock.json",JSON.stringify({before,after:await coords(shape),selected,facilities:112.25},null,2));
});
