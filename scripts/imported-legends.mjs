import assert from "node:assert/strict";
import {art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedLegends() {
  const report="Depot service mix",chart="Service by depot",card="Units selected";
  const data="Depot,Service,Volume,Cost\nA,,12,1\nA,(Blank),8,2\nB,Night,2,70\nC,,15,60\nC,(Blank),0,30\nC,Night,4,17\n";
  const amount=p=>art(p,card).locator(".kpi").innerText();
  const legend=(p,key)=>art(p,chart).locator("[data-legend-pick]").filter({hasText:key});
  const member=(p,label)=>art(p,chart).getByRole("button",{name:label,exact:true});
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,report,"How much volume came from each service?");
    const picker=p.waitForEvent("filechooser"); await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Moves.csv",mimeType:"text/csv",buffer:Buffer.from(data)});
    await p.getByTitle("Moves.Depot",{exact:true}).waitFor();
    await visual(p,"card",card,[],["Moves · Volume"],[18,18,430,115]);
    await visual(p,"clusteredColumn",chart,["Moves · Depot"],["Moves · Volume","Moves · Cost"],[18,145,860,405]);
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=legendFields]").selectOption({label:"Moves · Service"}); await settled(p);
    const blank=legend(p,/^\(Blank\) · /),literal=legend(p,/^"\(Blank\)" · /);
    assert.equal(await blank.count(),2); assert.equal(await literal.count(),2);
    await blank.first().click(); await settled(p); assert.equal(await amount(p),"27");
    assert.deepEqual(await blank.evaluateAll(es=>es.map(e=>e.getAttribute("aria-pressed"))),["true","true"]);
    await literal.last().press("Control+Enter"); await settled(p); assert.equal(await amount(p),"35");
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
    assert.equal(await amount(p),"35");
    await blank.last().press("Control+Space"); await settled(p); assert.equal(await amount(p),"8");
    await save(p);
  });
  await studio(async p=>{
    await open(p,report); assert.equal(await amount(p),"8");
    await art(p,chart).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await p.locator("[data-kind=scatter]").click();
    await p.locator("[data-pick=other]").selectOption({label:"Moves · Cost"}); await settled(p);
    await member(p,"Night").click(); await settled(p); assert.equal(await amount(p),"6");
    await p.locator("[data-kind=bubble]").click();
    await p.locator("[data-pick=size]").selectOption({label:"Moves · Cost"}); await settled(p);
    await member(p,"(Blank)").click(); await settled(p); assert.equal(await amount(p),"27");
    await p.locator("[data-kind=pie]").click(); await settled(p);
    assert.equal(await amount(p),"41","Removing the Service binding clears its filter");
    await p.getByTitle("Moves.Service",{exact:true}).dragTo(p.locator("[data-well=groups] .wellrow")); await settled(p);
    await member(p,'"(Blank)"').click(); await settled(p); assert.equal(await amount(p),"8");
    await p.locator("[data-kind=donut]").click(); await settled(p); assert.equal(await amount(p),"8");
    await member(p,"(Blank)").click({modifiers:["Control"]}); await settled(p); assert.equal(await amount(p),"35");
    await save(p);
  });
  await studio(async p=>{
    await open(p,report); assert.equal(await amount(p),"35");
    assert.deepEqual((await art(p,chart).locator("[data-legend-pick][aria-pressed=true]").allTextContents()).sort(),['"(Blank)"',"(Blank)"]);
  });
  console.log("Imported blank and literal labels, multiple measures, ranked-out branches, scatter, bubbles, slices, keyboard and saved legend filters passed.");
}
