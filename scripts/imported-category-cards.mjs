import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {addPage,art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedCategoryCards() {
  const report="Depot balances",title="Peak delivery by depot";
  const rows=["Depot,Amount",",12","Depot 000,0","Depot 001,2","Depot 001,5",
    ...Array.from({length:100},(_,i)=>`Depot ${String(i+2).padStart(3,"0")},${i+2}`)];
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,report,"What was the largest delivery at each depot?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Loads.csv",mimeType:"text/csv",buffer:Buffer.from(rows.join("\n"))});
    await p.getByTitle("Loads.Amount",{exact:true}).waitFor();
    await visual(p,"card","Selected deliveries",[],["Loads · Amount"],[18,18,400,115]);
    await visual(p,"card",title,["Loads · Depot"],[["Loads · Amount","max"]],[18,145,950,400]);
    await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Reference labels",{exact:true}).selectOption({label:"Loads · Amount"}); await settled(p);
    const card=art(p,title),group=name=>card.getByRole("button",{name,exact:true});
    assert.equal(await card.locator(".category-card").count(),100);
    await card.getByRole("button",{name:"Next",exact:true}).click(); await settled(p);
    assert.equal(await card.locator(".category-card").count(),3);
    await card.getByRole("button",{name:"Previous",exact:true}).click(); await settled(p);
    const amounts=await group("Depot 001").locator("..").locator(".kpi,dd").allTextContents();
    assert.deepEqual(amounts,["5","7"]);
    assert.equal(await group("Depot 000").locator("..").locator(".kpi").innerText(),"0");
    const late=group("Depot 088");
    await late.scrollIntoViewIfNeeded(); await late.focus();
    const body=card.locator(".vbody"), priorScroll=await body.evaluate(el=>el.scrollTop);
    assert.ok(priorScroll>0);
    await p.keyboard.press("Space"); await settled(p);
    assert.equal(await p.evaluate(()=>document.activeElement.textContent),"Depot 088");
    assert.equal(await body.evaluate(el=>el.scrollTop),priorScroll);
    await p.keyboard.press("Tab");
    assert.equal(await p.evaluate(()=>document.activeElement.textContent),"Depot 089");
    await p.keyboard.press("Control+Enter"); await settled(p);
    assert.equal(await art(p,"Selected deliveries").locator(".kpi").innerText(),"177");
    await group("Depot 001").click(); await settled(p);
    if(!(await group("(Blank)").count())) { await card.getByRole("button",{name:"Next",exact:true}).click(); await settled(p); }
    await group("(Blank)").click({modifiers:["Control"]}); await settled(p);
    assert.equal(await art(p,"Selected deliveries").locator(".kpi").innerText(),"19");
    await addPage(p,"Delivery lines");
    await visual(p,"table","Loads",["Loads · Depot","Loads · Amount"],["Loads · Amount"],[18,18,800,420]);
    await p.locator('[data-page="0"]').click(); await settled(p);
    await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Detail page",{exact:true}).selectOption({label:"Delivery lines"}); await settled(p);
    await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    const card=art(p,title),blank=card.getByRole("button",{name:"(Blank)",exact:true});
    await card.getByRole("button",{name:"View records"}).click(); await settled(p);
    const linesInSelection=await art(p,"Loads").locator("tbody tr").evaluateAll(trs=>trs.map(tr=>[...tr.cells].map(td=>td.textContent)));
    assert.deepEqual(linesInSelection.sort(),[["(Blank)","12","12"],["Depot 001","2","2"],["Depot 001","5","5"]].sort());
    await p.locator("[data-action=drill-back]").click(); await settled(p);
    if(!(await blank.count())) { await card.getByRole("button",{name:"Next",exact:true}).click(); await settled(p); }
    assert.equal(await blank.getAttribute("aria-pressed"),"true");
    assert.equal(await art(p,"Selected deliveries").locator(".kpi").innerText(),"19");
    await blank.click({modifiers:["Control"]}); await settled(p);
    assert.equal(await art(p,"Selected deliveries").locator(".kpi").innerText(),"7");
    const previous=card.getByRole("button",{name:"Previous",exact:true});
    if(await previous.isEnabled()) { await previous.click(); await settled(p); }
    await card.getByRole("button",{name:"Depot 001",exact:true}).click(); await settled(p);
    assert.equal(await art(p,"Selected deliveries").locator(".kpi").innerText(),"5,169");
    await p.locator("[data-tab=Format]").click();
    const downloaded=p.waitForEvent("download");
    await p.getByRole("button",{name:"Download chart data"}).click();
    const lines=(await readFile(await (await downloaded).path(),"utf8")).trim().split(/\r?\n/);
    assert.equal(lines.length,101);
    assert.match(lines[0],/^"Depot",.+,.+/);
    assert.ok(lines.includes('"Depot 001","5","7"'));
  });
}
