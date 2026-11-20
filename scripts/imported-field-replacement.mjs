import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

const report = "Travel time and charges", table = "Average by lane", chart = "Highest lane", card = "Trips selected";
const field = n => "Trips · "+n;
const well = (p,key,index) => p.locator('[data-well="'+key+'"] .wellrow').nth(index);
async function build(p,title) {
  await art(p,title).locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
}
async function drop(p,name,key,index) {
  await p.getByTitle("Trips."+name,{exact:true}).dragTo(well(p,key,index));
  await settled(p);
}
const cells = (p) => art(p,table).locator("tbody tr").evaluateAll(rows => rows.map(r => [...r.cells].map(c => c.textContent)));
export async function verifyImportedReplacement() {
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,report,"Where are travel times highest?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Trips.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Lane,Carrier,Stops,Charge,Minutes\nEast,A,1,10,80\nEast,B,3,20,100\nWest,A,5,200,10\nWest,A,1,100,30\n"
    )});
    await p.getByTitle("Trips.Lane",{exact:true}).waitFor();
    await visual(p,"card",card,[],[field("Stops")],[665,18,300,125]);
    await visual(p,"table",table,[field("Lane")],[field("Charge"),field("Stops")],[18,320,940,205]);
    await build(p,table);
    await well(p,"metrics",0).locator("[data-agg]").selectOption("avg");
    await setInput(p,'[data-heading="metrics:0"]',"Average charge");
    await setInput(p,'[data-heading="metrics:1"]',"Stops handled");
    await art(p,table).getByRole("button",{name:"Average charge",exact:true}).click();
    await settled(p);
    assert.deepEqual(await cells(p),[["West","150","6"],["East","15","4"]]);
    await drop(p,"Minutes","metrics",0);
    assert.deepEqual(await cells(p),[["East","90","4"],["West","20","6"]]);
    assert.equal(await well(p,"metrics",0).locator("[data-agg]").inputValue(),"avg");
    assert.equal(await well(p,"metrics",0).locator("[data-heading]").inputValue(),"");
    assert.equal(await well(p,"metrics",1).locator("[data-heading]").inputValue(),"Stops handled");
    await drop(p,"Carrier","metrics",0);
    assert.equal(await well(p,"metrics",0).locator("[data-agg]").inputValue(),"count");
    await drop(p,"Minutes","metrics",0);
    await well(p,"metrics",0).locator("[data-agg]").selectOption("avg");
    await settled(p);
    await visual(p,"clusteredColumn",chart,[field("Lane"),field("Carrier")],[field("Charge")],[18,18,625,280]);
    await build(p,chart);
    await p.locator("#rank-order").selectOption("desc");
    await setInput(p,"#rank-limit","1");
    await settled(p);
    const plot = art(p,chart);
    await plot.locator('[data-point][aria-label^="Lane West"]').press("Enter");
    await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"6");
    await drop(p,"Minutes","metrics",0);
    assert.equal(await plot.locator("[data-point]").getAttribute("data-value"),"180");
    assert.equal(await art(p,card).locator(".kpi").innerText(),"10","A lane that left the top ranking still filters the card.");
    await plot.locator("[data-point]").press("Enter");
    await settled(p);
    await plot.locator("[data-drill=down]").click();
    await settled(p);
    await plot.locator("[data-point]").press("Enter");
    await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"3");
    await drop(p,"Stops","groups",0);
    assert.equal(await plot.locator(".drill-path").innerText(),"Stops");
    assert.equal(await plot.locator("[data-point]").getAttribute("data-value"),"110");
    assert.equal(await art(p,card).locator(".kpi").innerText(),"10");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    await build(p,table);
    assert.deepEqual(await cells(p),[["East","90","4"],["West","20","6"]]);
    assert.equal(await art(p,table).getByRole("columnheader",{name:"Average of Minutes"}).getAttribute("aria-sort"),"descending");
    assert.equal(await art(p,chart).locator("[data-point]").getAttribute("data-value"),"110");
  });
  console.log("Imported replacements retained aggregate, sort position and unrelated headings. Removed drill ancestors and ranked-out selections cleared after save and reopen.");
}

export async function benchmarkReplacement(p,daily,directory) {
  const name = "Top dates by amount", selected = "Revenue for selected date";
  const dates = (await readFile(join(directory,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1)
    .map(line => line.split(","));
  const ledger = new Map(dates.map(([key,date]) => [date,daily.get(Number(key))]));
  const ranked = [0,1].map(i => [...ledger].map(([date,values]) => [date,values[i]])
    .sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,20));
  const profitDays = new Set(ranked[1].map(([date]) => date));
  const removed = ranked[0].find(([date]) => !profitDays.has(date))[0];
  const retained = ranked[0].find(([date]) => profitDays.has(date))[0];
  const total = [...ledger.values()].reduce((sum,[cents]) => sum+cents,0);
  const money = cents => (cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
  await addPage(p,name);
  await visual(p,"card",selected,[],["Sales · Revenue"],[690,18,260,150],"currency");
  await visual(p,"clusteredColumn",name,["Date · Date"],["Sales · Revenue"],[18,18,650,320],"currency");
  await build(p,name);
  await p.locator("#rank-order").selectOption("desc");
  await setInput(p,"#rank-limit","20");
  await settled(p);
  const chart = art(p,name), kpi = art(p,selected).locator(".kpi");
  async function select(date) {
    await chart.locator('[data-point][aria-label^="Date '+date+' "]').press("Enter");
    await settled(p);
    assert.equal(await kpi.innerText(),money(ledger.get(date)[0]));
  }
  await select(removed);
  const records = [];
  for (const [i,index] of [1,0,1,0].entries()) {
    if (i === 2) await select(retained);
    const field = index ? "Profit" : "Revenue";
    const row = well(p,"metrics",0);
    await row.evaluate(el => el.addEventListener("drop",() => {window.replaceStarted = performance.now();},{once:true}));
    await p.getByTitle("Sales."+field,{exact:true}).dragTo(row);
    await settled(p);
    const {ms,points,picked} = await chart.evaluate(async el => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const marks = [...el.querySelectorAll("[data-point]")];
      return {ms:performance.now()-window.replaceStarted,points:marks.map(m => [
        m.getAttribute("aria-label").match(/^Date ([\d-]+)/)[1],Math.round(Number(m.dataset.value)*100)
      ]),picked:marks.find(m => m.getAttribute("aria-pressed") === "true")?.getAttribute("aria-label")};
    });
    assert.deepEqual(points,ranked[index]);
    assert.ok(Number.isFinite(ms));
    assert.equal(await kpi.innerText(),money(i >= 2 ? ledger.get(retained)[0] : total));
    if (i >= 2) assert.ok(picked.startsWith("Date "+retained+" "));
    else assert.equal(picked,undefined);
    records.push({field,ms,selected:i >= 2 ? retained : null,points:points.length});
  }
  return {days:ledger.size,removed,retained,topRevenue:ranked[0],topProfit:ranked[1],records};
}
