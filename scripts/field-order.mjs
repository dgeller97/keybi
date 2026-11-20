import assert from "node:assert/strict";
import {addPage, art, measure, open, rename, save, setInput, settled, studio, visual} from "./portfolio-ui.mjs";

export async function dragBinding(p, well, from, to) {
  const rows = p.locator('[data-well="' + well + '"] [data-bound-index]');
  const target = rows.nth(to), box = await target.boundingBox();
  await rows.nth(from).dragTo(target,{
    sourcePosition:{x:5,y:4},
    targetPosition:{x:10,y:from < to ? Math.floor(box.height)-2 : 2},
  });
  await settled(p);
}
async function build(p,title) {
  await art(p,title).locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
}
async function move(p,name,well) {
  await p.locator('[data-well="' + well + '"]').getByRole("button",{name,exact:true}).press("Enter");
  await settled(p);
}
export async function verifyFieldOrder() {
  const report = "Dispatch routing", chart = "Route volume", card = "Units selected", matrix = "Dispatch statement";
  const mark = (p, label) => art(p,chart).locator('[data-point][aria-label^="' + label + '"]');
  const selected = p => art(p,card).locator(".kpi").innerText();
  const fields = names => names.map(n => "Routes · "+n);
  const row = (p,...keys) => art(p,matrix).locator("tbody tr[data-path='" + JSON.stringify(keys) + "']");
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,report,"How does dispatch volume vary by route?");
    const pick = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await pick).setFiles({name:"Routes.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Region,Channel,Quarter,Period,Units,Cost\nEast,Online,Q1,Jan,12,24\nEast,Retail,Q1,Feb,3,9\nWest,Online,Q2,Jan,18,54\nWest,Retail,Q2,Feb,9,45\n"
    )});
    await p.getByTitle("Routes.Units",{exact:true}).waitFor({state:"attached"});
    await visual(p,"card",card,[],fields(["Units"]),[645,18,320,130]);
    await visual(p,"clusteredColumn",chart,fields(["Region","Channel"]),fields(["Units"]),[18,18,615,330]);
    await p.getByLabel("Data labels",{exact:true}).check();
    const plot = art(p,chart);
    await plot.locator("[data-drill=expand]").click();
    await settled(p);
    await mark(p,"Region East, Channel Online").press("Enter");
    await settled(p);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("East online route");
    await p.locator("dialog button[type=submit]").click();
    await build(p,chart);
    await p.locator("[data-well=groups] [data-bound-index]").first().dragTo(p.locator("#report-name"));
    assert.equal(await plot.locator(".drill-path").innerText(),"Region › Channel");
    await dragBinding(p,"groups",1,0);
    assert.equal(await plot.locator(".drill-path").innerText(),"Channel › Region");
    assert.equal(await mark(p,"Channel Online, Region East").getAttribute("aria-pressed"),"true");
    assert.equal(await selected(p),"12");
    await plot.locator("[data-drill=up]").click();
    await settled(p);
    assert.equal(await mark(p,"Channel Online").getAttribute("data-value"),"30");
    await mark(p,"Channel Online").press("Enter");
    await settled(p);
    await plot.locator("[data-drill=down]").click();
    await settled(p);
    await move(p,"Move Region up","groups");
    assert.equal(await plot.locator(".drill-path").innerText(),"Region");
    assert.equal(await mark(p,"Region East").getAttribute("data-value"),"15");
    assert.equal(await selected(p),"42");
    await move(p,"Move Channel up","groups");
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"East online route",exact:true}).click();
    await settled(p);
    assert.equal(await selected(p),"12");
    assert.equal(await mark(p,"Channel Online, Region East").getAttribute("aria-pressed"),"true");
    await plot.getByRole("button",{name:"Clear selection"}).click();
    await settled(p);
    await visual(p,"matrix",matrix,fields(["Region","Channel"]),fields(["Units","Cost"]),[18,365,940,255]);
    await build(p,matrix);
    for (const name of fields(["Quarter","Period"])) await p.locator("[data-pick=columns]").selectOption({label:name});
    await setInput(p,'[data-heading="metrics:0"]',"Handled");
    await setInput(p,'[data-heading="groups:0"]',"Geography");
    const cell = row(p,"East","Online").locator("[data-matrix-pick]").filter({hasText:/^12$/}).first();
    await cell.click();
    await settled(p);
    await move(p,"Move Channel up","groups");
    await dragBinding(p,"columns",0,1);
    await move(p,"Move Cost up","metrics");
    assert.equal(await selected(p),"12");
    assert.equal(await p.locator('[data-heading="groups:1"]').inputValue(),"Geography");
    assert.equal(await p.locator('[data-heading="metrics:1"]').inputValue(),"Handled");
    const picked = row(p,"Online","East").locator('[aria-pressed=true][data-matrix-pick]');
    assert.ok(await picked.count() >= 1);
    assert.equal(await row(p,"Online").locator("td").first().innerText(),"Online subtotal");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    await build(p,matrix);
    assert.deepEqual(await p.locator('[data-well=columns] [data-heading]').evaluateAll(es => es.map(e=>e.placeholder)),["Period","Quarter"]);
    assert.equal(await p.locator('[data-heading="metrics:1"]').inputValue(),"Handled");
    assert.equal(await selected(p),"12");
    // Insert the row field before Period on the column axis. Its local heading
    // and the two-dimensional cell selection should survive the pivot.
    await p.locator('[data-well=groups] .wellrow').nth(1).dragTo(p.locator('[data-well=columns] .wellrow').first(),
      {sourcePosition:{x:4,y:4},targetPosition:{x:4,y:1}});
    await settled(p);
    assert.equal(await p.locator('[data-heading="columns:0"]').inputValue(),"Geography");
    assert.equal(await p.locator('[data-well=groups] .wellrow').count(),1);
    assert.equal(await selected(p),"12");
    assert.ok(await art(p,matrix).locator('[data-matrix-pick][aria-pressed=true]').count());
    await build(p,chart);
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Channel › Region");
    await p.locator("[data-tab=Format]").click();
    assert.ok(await p.getByLabel("Data labels",{exact:true}).isChecked());
    await addPage(p,"Measure order");
    const area = "Volume and cost";
    await visual(p,"stackedArea",area,fields(["Period"]),fields(["Units","Cost"]),[18,18,800,350]);
    await build(p,area);
    const charge = art(p,area).locator('[data-area-point][aria-label^="Period Jan · Cost"]');
    assert.equal(await charge.getAttribute("data-start"),"30");
    await move(p,"Move Cost up","metrics");
    assert.equal(await charge.getAttribute("data-start"),"0");
    assert.equal(await charge.getAttribute("data-end"),"78");
    for (const name of fields(["Units","Cost"])) await p.locator("[data-pick=tooltipFields]").selectOption({label:name});
    await setInput(p,'[data-tip-label="1"]',"Booked charges");
    await settled(p);
    let queries = 0;
    p.on("request",req => { if (req.url().endsWith("/api/query")) queries++; });
    await move(p,"Move Cost up","tooltipFields");
    assert.equal(queries,0);
    assert.equal(await p.locator('[data-tip-label="0"]').inputValue(),"Booked charges");
    // An identical Cost aggregation is already bound in Values.
    await p.locator('[data-well=tooltipFields] .wellrow').first().dragTo(p.locator('[data-pick=metrics]'),{sourcePosition:{x:4,y:4}});
    assert.equal(await p.locator('[data-well=tooltipFields] .wellrow').count(),2);
    assert.equal(await p.locator('[data-well=metrics] .wellrow').count(),2);
    assert.equal(queries,0);
    await measure(p,"Cost per unit","Routes · Cost","Routes · Units","ratio","number");
    await p.locator('[data-pick=tooltipFields]').selectOption({label:"Cost per unit"});
    await settled(p);
    const ratio = p.locator('[data-well=tooltipFields] .wellrow').last();
    await ratio.dragTo(p.locator('[data-pick=groups]'),{sourcePosition:{x:4,y:4}});
    assert.equal(await p.locator('[data-well=groups] .wellrow span').innerText(),"Period");
    assert.equal(await p.locator('[data-well=tooltipFields] .wellrow').count(),3);
    await ratio.dragTo(p.locator('[data-pick=metrics]'),{sourcePosition:{x:4,y:4}});
    await settled(p);
    assert.equal(await p.locator('[data-well=tooltipFields] .wellrow').count(),2);
    assert.equal(await p.locator('[data-well=metrics] .wellrow').last().locator("span").innerText(),"Cost per unit");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    await build(p,"Volume and cost");
    assert.equal(await art(p,"Volume and cost").locator('[data-area-point][aria-label^="Period Jan · Cost per unit"]').getAttribute("data-value"),"2.6");
    await p.locator('[data-page="0"]').click();
    await settled(p);
    await build(p,matrix);
    assert.equal(await p.locator('[data-heading="columns:0"]').inputValue(),"Geography");
    assert.equal(await selected(p),"12");
  });
  console.log("Native drag and keyboard reorder retained chart selections, bookmarks, matrix cells, captions and formatting after reopening.");
}
