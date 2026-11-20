import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
const title="Paired booking rows",ledger="Bookings by lane and service",card="Selected charges",fixed="All charges";
export async function verifyDetailRowSelection(){
  const baseline=process.env.FOLIO_DETAIL_NAV_BASELINE==="1";
  const csv=["Lane,Service,Charge","A,East,5","A,West,30","Z,East,40","Z,West,9",...Array.from({length:32},(_,i)=>"M"+String(i).padStart(2,"0")+",Local,1")].join("\n");
  const row=(grid,lane,service)=>grid.locator("tr[data-detail-row]").filter({has:grid.page().getByRole("button",{name:lane,exact:true})}).filter({has:grid.page().getByRole("cell",{name:service,exact:true})});
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"Which two lane-service pairs are under review?");
    const pick=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await pick).setFiles({name:"Bookings.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});await p.getByTitle("Bookings.Charge",{exact:true}).waitFor();
    await visual(p,"card",card,[],["Bookings · Charge"],[14,12,466,110]);
    await visual(p,"card",fixed,[],["Bookings · Charge"],[502,12,476,110]);
    await visual(p,"table",ledger,["Bookings · Lane","Bookings · Service"],["Bookings · Charge"],[14,143,964,400]);
    await p.getByRole("checkbox",{name:fixed,exact:true}).uncheck();await settled(p);
    const grid=art(p,ledger),total=art(p,card).locator(".kpi");
    if(baseline){
      const first=row(grid,"A","East").locator("[data-detail-pick]");await first.focus();await first.press("PageDown");
      assert.match(await grid.locator(".paging").innerText(),/1–25/);
      await writeFile("portfolio-evidence/table-navigation-before.json",JSON.stringify({action:"PageDown from first row",page:"1–25",focus:await p.locator(":focus").innerText()},null,2));return;
    }
    await row(grid,"A","East").getByRole("cell",{name:"5",exact:true}).click();await settled(p);
    assert.equal(await total.innerText(),"5");
    const from=row(grid,"A","East").getByRole("button",{name:"A",exact:true});
    await from.focus();await from.press("ArrowDown");assert.equal(await p.locator(":focus").getAttribute("data-selection-key"),'["A","West"]');
    await p.locator(":focus").press("PageDown");await settled(p);
    assert.equal(await p.locator(":focus").getAttribute("data-selection-key"),'["M23","Local"]');
    await p.locator(":focus").press("End");assert.equal(await p.locator(":focus").getAttribute("data-selection-key"),'["Z","West"]');
    await row(grid,"Z","West").getByRole("button",{name:"Z",exact:true}).press("Control+Enter");await settled(p);
    assert.equal(await total.innerText(),"14");assert.equal(await art(p,fixed).locator(".kpi").innerText(),"116");
    assert.match(await grid.locator(".paging").innerText(),/26–36/);
    assert.equal(await row(grid,"Z","West").getAttribute("aria-current"),"true");
    await row(grid,"Z","West").getByRole("button",{name:"Z",exact:true}).press("PageUp");await settled(p);
    assert.equal(await p.locator(":focus").getAttribute("data-selection-key"),'["M22","Local"]');
    await p.locator(":focus").press("Home");assert.equal(await p.locator(":focus").getAttribute("data-selection-key"),'["A","East"]');
    await p.getByRole("checkbox",{name:"Select multiple rows",exact:true}).check();await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,title);const grid=art(p,ledger),total=art(p,card).locator(".kpi");
    assert.equal(await total.innerText(),"14");const a=row(grid,"A","East").getByRole("button",{name:"A",exact:true});
    assert.equal(await a.getAttribute("aria-pressed"),"true");
    await a.press("Space");await settled(p);assert.equal(await total.innerText(),"9");
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await grid.getByRole("button",{name:"Clear selection",exact:true}).click();await settled(p);assert.equal(await total.innerText(),"116");
    await writeFile("portfolio-evidence/detail-row-selection.json",JSON.stringify({rows:36,all:116,first:5,paired:14,retained:9,ignoredTarget:116,secondPage:"26–36",saved:true},null,2));
  });
}

