import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {art,capture,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

const reportName="Sales layout review",titles=["Revenue","Profit","Transactions"];
const start=[[25,48,210,124],[315,17,180,100],[720,82,245,108]];
const arranged=[[25,17,210,124],[388,17,180,100],[720,17,245,108]];
async function boxes(p) {
  return Promise.all(titles.map(name=>art(p,name).evaluate(el=>
    ["left","top","width","height"].map(prop=>parseFloat(el.style[prop])))));
}
async function selectCards(p) {
  for (const [i,title] of titles.entries())
    await art(p,title).locator(".vhead strong").click({modifiers:i?["Control"]:[]});
}
export async function verifyArrange() {
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    await rename(p,reportName,"How much revenue and profit came from the two sales?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles(resolve("web/samples/Sales.csv"));
    await p.getByTitle("Sales.Profit",{exact:true}).waitFor();
    const measures=["Sales · Revenue","Sales · Profit",["Sales · SaleID","count"]];
    for (const [i,title] of titles.entries())
      await visual(p,"card",title,[],[measures[i]],start[i],i<2?"currency":"number");
    assert.deepEqual(await boxes(p),start);
    await selectCards(p);
    const chosen=await p.locator("#paper .visual.selected .vhead strong").allTextContents();
    if (process.env.FOLIO_ARRANGE_BASELINE==="1") {
      assert.deepEqual(chosen,["Transactions"]);
      await writeFile("portfolio-evidence/arrange-before.json",JSON.stringify({gesture:"Click first title; Ctrl-click the other two",chosen,positions:await boxes(p)},null,2));
      return;
    }
    assert.deepEqual(chosen,titles);
    const align=p.getByRole("button",{name:"Align top",exact:true});
    const distribute=p.getByRole("button",{name:"Distribute horizontally",exact:true});
    let queries=0;p.on("request",r=>{if(new URL(r.url()).pathname==="/api/query")queries++;});
    await align.click();await distribute.click();
    assert.deepEqual(await boxes(p),arranged);
    assert.equal(queries,0);
    await capture(p,"arrange-three-cards");
    const title=art(p,"Profit").locator(".vhead strong");
    const rect=await title.boundingBox(),paper=await p.locator("#paper").boundingBox();
    const scale=paper.width/1000;
    const pointer={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
    await p.mouse.move(pointer.x,pointer.y);await p.mouse.down();
    await p.mouse.move(pointer.x+140*scale,pointer.y+40*scale,{steps:4});await p.mouse.up();
    assert.deepEqual(await boxes(p),arranged.map(([x,y,w,h])=>[x+35,y+40,w,h]));
    assert.equal(queries,0);
    await p.keyboard.press("Control+z");await settled(p);
    assert.deepEqual(await boxes(p),arranged);
    await p.keyboard.press("Control+z");await settled(p);
    assert.deepEqual(await boxes(p),start.map(([x,_y,w,h])=>[x,17,w,h]));
    await p.keyboard.press("Control+y");await settled(p);
    assert.deepEqual(await boxes(p),arranged);await save(p);
  });
  if (process.env.FOLIO_ARRANGE_BASELINE==="1") return;
  await studio(async p=>{
    await open(p,reportName);assert.deepEqual(await boxes(p),arranged);
    const values=await p.locator("#paper .kpi").allTextContents();
    assert.deepEqual(values,["$1,000.00","$130.00","2"]);
    await p.getByRole("button",{name:"Arrange",exact:true}).click();
    for (const title of titles) await p.getByRole("checkbox",{name:title,exact:true}).check();
    const middle=p.getByRole("button",{name:"Align middle",exact:true});
    await middle.click();assert.deepEqual((await boxes(p)).map(b=>b[1]),[17,29,25]);
    await p.getByRole("checkbox",{name:"Profit",exact:true}).uncheck();
    assert.ok(await p.getByRole("button",{name:"Distribute vertically",exact:true}).isDisabled());
    await p.getByRole("button",{name:"Align right",exact:true}).click();
    assert.deepEqual((await boxes(p)).map(b=>b[0]),[755,388,720]);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    assert.equal(await p.getByRole("button",{name:"Arrange",exact:true}).isVisible(),false);
    await writeFile("portfolio-evidence/arrange-cards.json",JSON.stringify({original:start,arranged,values,horizontalGaps:[153,152],layoutQueries:0,groupDrag:{x:35,y:40},middle:[17,29,25],right:[755,388,720]},null,2));
  });
  console.log("Three imported KPI cards aligned and distributed with one pixel of rounding. Undo, redo and reopening retained geometry and values.");
}
