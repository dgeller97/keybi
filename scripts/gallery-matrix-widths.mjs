import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";
import {editWidth,widths} from "./matrix-widths.mjs";
import {measureFreeze} from "./matrix-freeze.mjs";

const february="2026-02-01 / Dispatch revenue", report="Visual Gallery";
async function openMatrix(p) {
  await open(p,report);
  await p.getByRole("button",{name:"Dispatch by period",exact:true}).click();
  await settled(p);
  const grid=art(p,"Monthly dispatch by region and channel");
  await grid.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  return grid;
}
await studio(async p => {
  const grid=await openMatrix(p);
  if ((await widths(grid))[february]===134) return;
  await editWidth(p,february,134);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async p => {
  const grid=await openMatrix(p), reopened=await widths(grid);
  assert.equal(reopened[february],134);
  const leaf=grid.locator(`tr[data-path='["West","Online"]']`);
  await grid.locator(".vbody").evaluate(body => body.scrollLeft=body.scrollWidth);
  await leaf.getByRole("button",{name:"$478.00",exact:true}).click();
  await settled(p);
  const selector=p.getByRole("button",{name:"Edit column width",exact:true});
  const totals=() => Promise.all(["Dispatch revenue in selection","Orders in selection"].map(t => art(p,t).locator(".kpi").innerText()));
  assert.deepEqual(await totals(),["$478.00","33"]);
  let requests=0;
  p.on("request",r => { if (new URL(r.url()).pathname==="/api/query") requests++; });
  await editWidth(p,february,null);
  const automatic=await widths(grid);
  assert.ok(automatic[february]<134);
  await editWidth(p,february,134);
  assert.deepEqual(await widths(grid),{...automatic,[february]:134});
  assert.equal(await leaf.getByRole("button",{name:"$478.00",exact:true}).getAttribute("aria-pressed"),"true");
  assert.deepEqual(await totals(),["$478.00","33"]);
  // Show February from its left edge alongside the still-frozen region and channel.
  await grid.locator(".vbody").evaluate(body => {
    const target=body.querySelector('[data-column-label="2026-02-01 / Dispatch revenue"]');
    const pinned=[...body.querySelectorAll("th[data-row-level]")].reduce((w,th) => w+th.offsetWidth,0);
    body.scrollLeft=target.offsetLeft-pinned+12;
  });
  const pinned=await measureFreeze(grid);
  assert.ok(pinned.aligned && pinned.headersVisible.every(Boolean) && pinned.labelsVisible.every(Boolean));
  await selector.scrollIntoViewIfNeeded();
  await capture(p,"gallery-matrix-widths");
  assert.equal(requests,0);
  await writeFile("portfolio-evidence/gallery-matrix-widths.json",JSON.stringify({
    url:await currentPageLink(p),automatic,reopened,pinned,selected:await totals(),queryRequests:requests
  },null,2)+"\n");
  const wrap=p.getByLabel("Wrap row headers");
  await wrap.check();
  const wrapped=await widths(grid);
  assert.ok(wrapped.Region < reopened.Region);
  assert.equal(wrapped[february],134);
  await wrap.uncheck();
  assert.deepEqual(await widths(grid),reopened);
});
