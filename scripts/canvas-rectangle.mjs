import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {open,settled,studio} from "./portfolio-ui.mjs";

export async function sweep(p,x1,y1,x2,y2,{modifier,cancel=false,during}={}) {
  const paper=p.locator("#paper");
  const frame=await paper.boundingBox();
  const width=await paper.evaluate(el=>el.offsetWidth),scale=frame.width/width;
  if (modifier) await p.keyboard.down(modifier);
  await p.mouse.move(frame.x+x1*scale,frame.y+y1*scale);await p.mouse.down();
  await p.mouse.move(frame.x+x2*scale,frame.y+y2*scale,{steps:8});
  if (during) await during();
  if (cancel) await p.keyboard.press("Escape");
  await p.mouse.up();if (modifier) await p.keyboard.up(modifier);
}

export async function verifyCanvasRectangle() {
  await studio(async p=>{
    await open(p,"Sales layout review");
    const selected=()=>p.locator("#paper .visual.selected .vhead strong").allTextContents();
    await sweep(p,990,150,9,8);
    const all=await selected();
    if (process.env.FOLIO_LASSO_BASELINE==="1") {
      assert.deepEqual(all,[]);
      await writeFile("portfolio-evidence/canvas-rectangle-before.json",JSON.stringify({gesture:"Drag from below-right to above-left around the three imported KPI cards",selected:all},null,2));
      return;
    }
    assert.deepEqual(all,["Revenue","Profit","Transactions"]);
    await sweep(p,8,8,490,150,{modifier:"Control"});
    assert.deepEqual(await selected(),["Profit","Transactions"]);
    await sweep(p,8,8,245,150,{modifier:"Shift"});
    assert.deepEqual(await selected(),all);
    await sweep(p,8,8,245,150,{cancel:true});
    assert.deepEqual(await selected(),all);
    await sweep(p,11,7,490,150);
    assert.deepEqual(await selected(),["Revenue"]);
    const values=await p.locator(".kpi").allTextContents();
    assert.deepEqual(values,["$1,000.00","$130.00","2"]);
    assert.equal(await p.locator("#save-state").innerText(),"Saved");
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await sweep(p,11,7,990,150);assert.equal(await p.getByText("Arrange visuals",{exact:true}).isVisible(),false);
    await writeFile("portfolio-evidence/canvas-rectangle.json",JSON.stringify({fullyEnclosed:all,partialCardExcluded:["Revenue"],afterCtrl:["Profit","Transactions"],afterEscape:all,values},null,2));
  });
}
