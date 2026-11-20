import assert from "node:assert/strict";
import {art} from "./portfolio-ui.mjs";

export const widths = grid => grid.locator("th[data-column-key]").evaluateAll(headings =>
  Object.fromEntries(headings.map(th => [th.dataset.columnLabel,th.offsetWidth])));

export async function editWidth(p,label,width) {
  await p.getByRole("button",{name:"Edit column width",exact:true}).click();
  await p.getByLabel("Column",{exact:true}).selectOption({label});
  await p.getByLabel("Width (px)").fill(width === null ? "" : String(width));
  await p.getByRole("button",{name:"Apply",exact:true}).click();
  await p.locator("#dialog").waitFor({state:"hidden"});
}

export async function dragWidth(p,grid,label,delta) {
  const th = grid.locator("th[data-column-label]").filter({hasText:label});
  const handle = th.locator(".matrix-width-grip");
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox(), scale = await th.evaluate(el => el.getBoundingClientRect().width/el.offsetWidth);
  const x = box.x+box.width/2, y = box.y+box.height/2;
  await p.mouse.move(x,y); await p.mouse.down();
  await p.mouse.move(x+delta*scale,y,{steps:4});
  await p.mouse.up();
}

export async function benchmarkMatrixWidths(p) {
  const grid=art(p,"Revenue by product levels");
  const baseline=await widths(grid), label="B / Billed revenue";
  assert.ok(baseline[label]>0);
  const contents=() => grid.locator("tbody").textContent();
  const initialContents=await contents(), records=[];
  let queryRequests=0;
  const count=r => { if (new URL(r.url()).pathname==="/api/query") queryRequests++; };
  p.on("request",count);
  try {
    for (const target of [baseline[label]+65,65,baseline[label]+120,null]) {
      await p.getByRole("button",{name:"Edit column width"}).click();
      await p.getByLabel("Column",{exact:true}).selectOption({label});
      await p.getByLabel("Width (px)").fill(target===null ? "" : String(target));
      await p.locator("#dlgform").evaluate(form => form.addEventListener("submit",() => {
        const start=performance.now();
        window.matrixWidthPaint=new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()-start))));
      },{once:true,capture:true}));
      await p.getByRole("button",{name:"Apply",exact:true}).click();
      const ms=await p.evaluate(() => window.matrixWidthPaint);
      assert.deepEqual(await widths(grid),{...baseline,[label]:target ?? baseline[label]});
      assert.equal(await contents(),initialContents);
      records.push({width:target ?? "Auto",ms});
    }
    assert.equal(queryRequests,0);
    return {rows:await grid.locator("tbody tr").count(),columns:Object.keys(baseline).length,label,baseline,records,queryRequests};
  } finally { p.off("request",count); }
}
