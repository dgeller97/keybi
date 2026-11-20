import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyAuthorHistory() {
  const name="Transfer margins",revised="Weekly transfer margins",chart="Units by dock",card="Total units";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which dock received the most units?");
    const picking=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await picking).setFiles({name:"Transfers.csv",mimeType:"text/csv",buffer:Buffer.from("Dock,Units\nNorth,11\nEast,17\nNorth,3\n")});
    await p.getByTitle("Transfers.Units",{exact:true}).waitFor();
    await visual(p,"bar",chart,["Transfers · Dock"],["Transfers · Units"],[24,26,505,182]);
    await visual(p,"card",card,[],["Transfers · Units"],[24,225,330,104]);
    const figure=art(p,chart);
    await figure.locator(".barrow").filter({hasText:"North"}).click();await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"14");await save(p);
    await rename(p,revised,"Which dock received the most units?");
    await figure.locator(".vhead").click();await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Remove visual",exact:true}).click();
    await p.getByRole("dialog").getByRole("button",{name:"Remove",exact:true}).click();await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"31");
    await p.keyboard.press("Control+z");await settled(p);
    const remaining=await p.locator("#paper .vhead strong").allTextContents();
    assert.equal(await p.locator("#report-name").innerText(),revised);
    if (process.env.FOLIO_HISTORY_BASELINE==="1") {
      assert.deepEqual(remaining,[card]);
      await writeFile("portfolio-evidence/author-undo-before.json",JSON.stringify({command:"Ctrl+Z",unsavedTitle:revised,
        remaining,selectedUnits:14,afterRemoval:31,afterShortcut:Number(await art(p,card).locator(".kpi").innerText())},null,2));
      return;
    }
    const total=()=>art(p,card).locator(".kpi").innerText();
    const undo=p.getByRole("button",{name:"Undo",exact:true}),redo=p.getByRole("button",{name:"Redo",exact:true});
    assert.deepEqual(remaining,[chart,card]);assert.equal(await total(),"14");
    const box=await figure.evaluate(el=>[el.style.left,el.style.top,el.style.width,el.style.height]);
    assert.deepEqual(box,["24px","26px","505px","182px"]);
    await p.keyboard.press("Control+Shift+z");await settled(p);assert.equal(await figure.count(),0);assert.equal(await total(),"31");
    await undo.click();await settled(p);await undo.click();await settled(p);
    assert.equal(await p.locator("#report-name").innerText(),name);
    assert.equal(await p.locator("#save-state").innerText(),"Saved");
    await p.keyboard.press("Control+y");await settled(p);assert.equal(await p.locator("#report-name").innerText(),revised);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    assert.equal(await undo.isVisible(),false);
    await figure.locator(".barrow").filter({hasText:"East"}).click();await settled(p);assert.equal(await total(),"17");
    await p.keyboard.press("Control+z");await settled(p);assert.equal(await total(),"17");
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);assert.equal(await total(),"14");
    await figure.locator(".vhead").click();await p.locator("[data-tab=Format]").click();
    const width=p.getByLabel("Width",{exact:true});await width.fill("545");await width.press("Tab");await settled(p);
    assert.equal(await redo.isDisabled(),true);
    await undo.click();await settled(p);assert.equal(await figure.evaluate(el=>el.style.width),"505px");
    await redo.click();await settled(p);assert.equal(await figure.evaluate(el=>el.style.width),"545px");
    await save(p);
    await writeFile("portfolio-evidence/author-undo.json",JSON.stringify({restored:remaining,unsavedTitle:revised,restoredSelection:"North",
      restoredUnits:14,afterRedoRemoval:31,originalGeometry:box,savedWidth:545},null,2));
  });
  if (process.env.FOLIO_HISTORY_BASELINE==="1") return;
  await studio(async p=>{
    await open(p,revised);assert.equal(await art(p,card).locator(".kpi").innerText(),"14");
    assert.equal(await art(p,chart).evaluate(el=>el.style.width),"545px");
    assert.ok(await p.getByRole("button",{name:"Undo",exact:true}).isDisabled());
    assert.ok(await p.getByRole("button",{name:"Redo",exact:true}).isDisabled());
  });
  console.log("Verified removal, undo and redo, saved-state detection, reading isolation, branching edits, geometry and reopening.");
}
