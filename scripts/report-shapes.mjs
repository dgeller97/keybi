import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,create,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyShapes() {
  const name="Dispatch layout",chart="Revenue by region",total="Dispatch revenue",shape="Revenue backdrop";
  await studio(async p=>{
    await create(p,name,"Which region generated more revenue?","gallery",["Dispatch"]);
    await visual(p,"bar",chart,["Dispatch · Region"],["Dispatch · Revenue"],[30,36,445,235],"currency");
    await visual(p,"card",total,[],["Dispatch · Revenue"],[510,36,430,112],"currency");
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$1,731.00");
    await p.locator(".ribbon [data-action=add]").click();
    if (process.env.FOLIO_SHAPE_BASELINE==="1") {
      assert.equal(await p.locator("[data-create=shape]").count(),0);await p.keyboard.press("Escape");
      await p.getByRole("button",{name:"Arrange",exact:true}).click();
      assert.equal(await p.getByRole("button",{name:"Send to back",exact:true}).count(),0);
      await writeFile("portfolio-evidence/shape-before.json",JSON.stringify({pickerShape:false,sendToBack:false,revenue:1731},null,2));return;
    }
    await p.locator("[data-create=shape]").click();
    await p.getByLabel("Shape type",{exact:true}).selectOption("rounded");
    await p.locator("[data-tab=Format]").click();
    const title=p.getByLabel("Visual title",{exact:true});await title.fill(shape);await title.press("Tab");
    await position(p,[12,16,948,270]);await settled(p);
    await p.getByLabel("Fill color",{exact:true}).fill("#dbe9dd");
    const transparency=p.getByLabel("Fill transparency (%)",{exact:true});await transparency.fill("15");await transparency.press("Tab");
    await p.getByLabel("Outline color",{exact:true}).fill("#50785f");
    const stroke=p.getByLabel("Outline width",{exact:true});await stroke.fill("3");await stroke.press("Tab");
    const artwork=art(p,shape).locator("svg[data-shape]");
    assert.equal(await artwork.getAttribute("data-shape"),"rounded");
    await p.locator("[data-tab=Build]").click();
    const type=p.getByLabel("Shape type",{exact:true});
    for (const [kind,geometry] of [["rectangle",/ H/],["ellipse",/ A/],["triangle",/ L/],["line",/ H/]]) {
      await type.selectOption(kind);assert.equal(await artwork.getAttribute("data-shape"),kind);
      assert.match(await artwork.locator("path").getAttribute("d"),geometry);
    }
    await p.getByLabel("Direction",{exact:true}).selectOption("vertical");
    assert.match(await artwork.locator("path").getAttribute("d"),/ V/);
    await p.getByLabel("Direction",{exact:true}).selectOption("up");
    assert.match(await artwork.locator("path").getAttribute("d"),/ L/);
    await p.locator("[data-tab=Format]").click();
    const height=p.getByLabel("Height",{exact:true});await height.fill("4");await height.press("Tab");
    assert.equal(await art(p,shape).evaluate(el=>el.style.height),"4px");
    await height.fill("270");await height.press("Tab");await p.locator("[data-tab=Build]").click();
    await type.selectOption("rounded");await settled(p);
    const mark=art(p,chart).locator(".barrow").filter({hasText:"East"});
    const hit=()=>mark.evaluate(el=>{
      const box=el.getBoundingClientRect();
      return document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest(".visual")?.getAttribute("aria-label");
    });
    assert.equal(await hit(),shape);
    await p.getByRole("button",{name:"Arrange",exact:true}).click();
    await p.getByRole("button",{name:"Send to back",exact:true}).click();assert.equal(await hit(),chart);
    await p.getByRole("button",{name:"Bring forward",exact:true}).click();assert.equal(await hit(),shape);
    await p.getByRole("button",{name:"Send backward",exact:true}).click();assert.equal(await hit(),chart);
    await p.getByRole("button",{name:"Bring to front",exact:true}).click();assert.equal(await hit(),shape);
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);assert.equal(await hit(),chart);
    await p.locator("[data-tab=Format]").click();
    const lock=p.getByLabel("Lock position and size",{exact:true});
    await lock.check();assert.equal(await p.getByLabel("Width",{exact:true}).isDisabled(),true);
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
    assert.equal(await lock.isChecked(),false);assert.equal(await p.getByLabel("Width",{exact:true}).isDisabled(),false);
    await p.getByRole("button",{name:"Redo",exact:true}).click();await settled(p);assert.equal(await lock.isChecked(),true);
    await mark.click();await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"$863.00");
    await save(p);
  });
  if (process.env.FOLIO_SHAPE_BASELINE==="1") return;
  await studio(async p=>{
    await open(p,name);assert.equal(await art(p,total).locator(".kpi").innerText(),"$863.00");
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    const artwork=art(p,shape).locator("svg[data-shape] path");
    assert.equal(await artwork.getAttribute("fill"),"#dbe9dd");assert.equal(await artwork.getAttribute("fill-opacity"),"0.85");
    assert.equal(await artwork.getAttribute("stroke-width"),"3");
    assert.equal(await art(p,shape).locator(".vhead").isVisible(),false);
    await art(p,chart).locator(".barrow").filter({hasText:"West"}).click();await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$868.00");
    await capture(p,"imported-report-shape");
    await p.getByRole("button",{name:"Edit report",exact:true}).click();await settled(p);
    const original=new URL(p.url()).hash;
    await p.locator("header [data-action=library]").click();const exporting=p.waitForEvent("download");
    await p.locator("dialog [data-action=export-package]").click();const file=await exporting;
    const buffer=await readFile(await file.path());
    await p.locator("header [data-action=home]").click();
    const chooser=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();
    await (await chooser).setFiles({name:file.suggestedFilename(),mimeType:"application/octet-stream",buffer});
    await art(p,shape).waitFor();await settled(p);
    assert.notEqual(new URL(p.url()).hash,original);
    assert.equal(await p.locator("#paper .visual").first().getAttribute("aria-label"),shape);
    assert.equal(await art(p,shape).getAttribute("data-position-locked"),"");
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$863.00");
    await writeFile("portfolio-evidence/report-shape.json",JSON.stringify({shape:"rounded",fill:"#dbe9dd",opacity:.85,outline:"#50785f",width:3,all:1731,east:863,west:868,frontToBack:[total,chart,shape],transferred:true},null,2));
  });
}
