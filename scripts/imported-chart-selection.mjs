import assert from "node:assert/strict";
import {art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

async function surroundDepots(p,chart,names) {
  const box=await art(p,chart).locator("[data-selection-key] circle").evaluateAll((circles,names)=>{
    const centers=circles.filter(circle=>names.includes(JSON.parse(circle.closest("[data-selection-key]").dataset.selectionKey)[0])).map(circle=>{
      const r=circle.getBoundingClientRect(); return [r.x+r.width/2,r.y+r.height/2];
    });
    if (!centers.length) return null;
    return [Math.min(...centers.map(c=>c[0]))-4,Math.min(...centers.map(c=>c[1]))-4,
      Math.max(...centers.map(c=>c[0]))+4,Math.max(...centers.map(c=>c[1]))+4];
  },names);
  assert.ok(box,"Expected point markers for "+names.join(", "));
  await p.mouse.move(box[0],box[1]); await p.mouse.down(); await p.mouse.move(box[2],box[3],{steps:8}); await p.mouse.up();
  await settled(p);
}

export async function verifyImportedChartSelection() {
  const report="Depot throughput",chart="Ranked depots",total="Loads selected";
  const mark=(p,name)=>art(p,chart).locator(`[data-selection-key='${JSON.stringify([name])}']`).first();
  const summary=p=>art(p,total).locator(".kpi").innerText();
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,report,"Which depots account for the highest load?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Loads.csv",mimeType:"text/csv",buffer:Buffer.from(
      'Depot,Volume,Cost\nA,12,1\nA,8,1\nB,2,70\nC,15,60\n,0,30\n'
    )});
    await p.getByTitle("Loads.Volume",{exact:true}).waitFor();
    await visual(p,"card",total,[],["Loads · Volume"],[18,18,430,115]);
    await visual(p,"clusteredColumn",chart,["Loads · Depot"],["Loads · Volume"],[18,145,850,405]);
    await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Sort by",{exact:true}).selectOption("desc"); await setInput(p,"#rank-limit",2); await settled(p);
    await mark(p,"A").click(); await settled(p);
    await mark(p,"C").click({modifiers:["Control"]}); await settled(p);
    assert.equal(await summary(p),"35");
    await p.getByTitle("Loads.Cost",{exact:true}).dragTo(p.locator('[data-well=metrics] .wellrow')); await settled(p);
    assert.equal(await summary(p),"15");
    assert.equal(await mark(p,"C").getAttribute("aria-pressed"),"true");
    assert.equal(await mark(p,"A").count(),0);
    await setInput(p,"#rank-limit",""); await settled(p);
    await mark(p,"C").click(); await settled(p);
    await mark(p,null).click({modifiers:["Control"]}); await settled(p);
    for(const kind of ["pie","donut"]) {
      await p.locator(`[data-kind="${kind}"]`).click(); await settled(p);
      assert.equal(await summary(p),"15");
      assert.equal(await art(p,chart).locator('[data-selection-key][aria-pressed=true]').count(),2);
    }
    await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    for (const key of [null,"C"]) assert.equal(await mark(p,key).getAttribute("aria-pressed"),"true");
    await mark(p,"C").press("Control+Enter"); await settled(p);
    assert.equal(await summary(p),"0");
    await art(p,chart).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    assert.equal(await summary(p),"37");
    await art(p,chart).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await p.locator("[data-kind=scatter]").click();
    await p.locator("[data-pick=other]").selectOption({label:"Loads · Volume"}); await settled(p);
    await mark(p,"A").click(); await settled(p); await mark(p,"C").click({modifiers:["Control"]}); await settled(p);
    assert.equal(await summary(p),"35");
    await p.locator("[data-kind=bubble]").click();
    await p.locator("[data-pick=size]").selectOption({label:"Loads · Volume"}); await settled(p);
    await surroundDepots(p,chart,["B","C"]);
    assert.equal(await summary(p),"17");
    assert.equal(await mark(p,"B").getAttribute("aria-pressed"),"true");
    assert.equal(await mark(p,"C").getAttribute("aria-pressed"),"true");
    for (const kind of ["dot","line","area","stackedArea","percentArea"]) {
      await p.locator(`[data-kind="${kind}"]`).click(); await settled(p);
      for (const [depot,value] of [["A","20"],["B","2"]]) {
        await surroundDepots(p,chart,[depot]);
        assert.equal(await summary(p),value,kind+" rectangle around "+depot);
        assert.equal(await mark(p,depot).getAttribute("aria-pressed"),"true");
      }
    }
  });
}
