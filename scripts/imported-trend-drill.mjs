import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { addPage, art, open, rename, save, settled, studio, visual } from "./portfolio-ui.mjs";

export async function verifyTrendDrill() {
  const report = "Dispatch by operating period", chart = "Shipment volume", total = "Selected units";
  const mark = (p, label) => art(p, chart).locator('[data-point][aria-label^="' + label + '"]');
  const select = async (p, label) => {
    await mark(p, label).press("Enter");
    await settled(p);
  };
  const drill = async (p, direction) => {
    await art(p, chart).locator('[data-drill="' + direction + '"]').click();
    await settled(p);
  };
  const card = p => art(p, total).locator(".kpi").innerText();
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, report, "Which shifts contributed to each day's volume?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({ name: "Dispatch.csv", mimeType: "text/csv", buffer: Buffer.from(
      "Period,Day,Shift,Depot,Units\nMar,Mon,Early,A,10\nMar,Mon,Late,A,4\nMar,Mon,Early,B,3\nMar,Tue,Early,A,-2\nApr,Mon,Early,A,100\nApr,Mon,Late,B,40\n,Fri,Early,A,0\n"
    ) });
    await p.getByTitle("Dispatch.Units", {exact:true}).waitFor({state:"attached"});
    await visual(p, "card", total, [], ["Dispatch · Units"], [650,18,300,145]);
    await visual(p, "line", chart, ["Dispatch · Period","Dispatch · Day","Dispatch · Shift"], ["Dispatch · Units"], [18,18,615,390]);
    await p.getByLabel("Data labels", {exact:true}).check();
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=legendFields]").selectOption({label:"Dispatch · Depot"});
    await settled(p);
    assert.equal(await art(p,chart).locator("[data-drill=down]").isDisabled(), true);
    await drill(p,"expand");
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Period › Day");
    const axis=(...values)=>art(p,chart).locator(`[data-axis-pick='${JSON.stringify(values)}']`);
    await axis("Mar").click(); await settled(p); assert.equal(await card(p),"15");
    await axis("Mar","Mon").click(); await settled(p); assert.equal(await card(p),"17");
    await axis("Apr","Mon").click(); await settled(p); assert.equal(await card(p),"140");
    await axis("Mar","Tue").press("Control+Enter"); await settled(p); assert.equal(await card(p),"138");
    await save(p); await p.reload(); await settled(p); assert.equal(await card(p),"138");
    assert.equal(await axis("Mar","Tue").getAttribute("aria-pressed"),"true");
    assert.equal(await axis("Mar","Mon").getAttribute("aria-pressed"),"false");
    await axis(null).click(); await settled(p); assert.equal(await card(p),"0");
    await art(p,chart).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    await art(p,chart).getByRole("button",{name:"Show as a table"}).click();
    const summary=p.locator(".chart-summary"), units=summary.getByRole("button",{name:"Units",exact:true});
    await units.waitFor();
    assert.deepEqual(await summary.locator("th").allTextContents(),["Period","Day","Depot","Units"]);
    await units.click(); await units.press("Enter");
    const sorted=await summary.locator("tbody tr").evaluateAll(es=>es.map(e=>[...e.cells].map(c=>c.textContent)));
    assert.deepEqual(sorted.map(row=>Number(row.at(-1))),[-2,0,3,14,40,100]);
    assert.deepEqual(sorted[1],["(Blank)","Fri","A","0"]);
    await p.keyboard.press("Escape");
    assert.equal(await mark(p,"Period Mar, Day Mon, Depot A").getAttribute("data-value"),"14");
    assert.equal(await mark(p,"Period Apr, Day Mon, Depot A").getAttribute("data-value"),"100");
    await select(p,"Period Mar, Day Mon, Depot A");
    assert.equal(await card(p),"14");
    await drill(p,"down");
    assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("data-value"),"10");
    await drill(p,"up");
    for (const kind of ["area","stackedArea","percentArea","dot","clusteredBar","stackedBar","percentBar","clusteredColumn","percentColumn","stackedColumn"]) {
      await p.locator('[data-kind="' + kind + '"]').click();
      await settled(p);
      assert.equal(await mark(p,"Period Apr, Day Mon, Depot B").getAttribute("data-value"),"40");
    }
    await p.locator("#rank-order").selectOption("asc");
    await p.locator("#rank-limit").fill("2");
    await p.locator("#rank-limit").press("Tab");
    await settled(p);
    assert.equal(await art(p,chart).locator("[data-point]").count(),2);
    assert.equal(await mark(p,"Period Mar, Day Tue, Depot A").getAttribute("data-value"),"-2");
    assert.equal(await mark(p,"Period (Blank), Day Fri, Depot A").getAttribute("data-value"),"0");
    await p.locator('[data-kind="line"]').click();
    await settled(p);
    await drill(p,"expand");
    await select(p,"Period Apr, Day Mon, Shift Early, Depot A");
    assert.equal(await card(p),"100");
    await save(p);
    await p.reload();
    await settled(p);
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Period › Day › Shift");
    assert.equal(await card(p),"100");
    await drill(p,"up");
    assert.equal(await mark(p,"Period Mar, Day Tue, Depot A").getAttribute("data-value"),"-2");
    await drill(p,"up");
    await p.locator("[data-tab=Build]").click();
    await drill(p,"next");
    assert.equal(await art(p,chart).locator(".drill-path").innerText(), "Day");
    assert.equal(await mark(p,"Day Fri, Depot A").getAttribute("data-value"), "0");
    await select(p,"Day Mon, Depot A");
    assert.equal(await card(p), "114");
    await drill(p,"down");
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Mon › Shift");
    assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("data-value"), "110");
    await drill(p,"up");
    assert.equal(await mark(p,"Day Tue, Depot A").getAttribute("data-value"), "-2");
    await drill(p,"up");
    await select(p,"Period (Blank), Depot A");
    await drill(p,"down");
    assert.equal(await art(p,chart).locator("[data-point]").count(),1);
    assert.equal(await mark(p,"Day Fri, Depot A").getAttribute("data-value"),"0");
    await drill(p,"up");
    await select(p,"Period Mar, Depot A");
    assert.equal(await card(p), "12");
    await drill(p,"down");
    assert.equal(await mark(p,"Day Mon, Depot A").getAttribute("data-value"), "14");
    assert.equal(await mark(p,"Day Mon, Depot B").getAttribute("data-value"), "3");
    assert.equal(await card(p), "155");
    await drill(p,"next");
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Mar › Shift");
    assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("data-value"),"8");
    assert.ok(await art(p,chart).locator("[data-drill=next]").isDisabled());
    await drill(p,"up");
    await select(p,"Day Mon, Depot A");
    assert.equal(await card(p), "14");
    await drill(p,"down");
    assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("data-value"), "10");
    for (const kind of ["stackedArea", "percentArea", "area"]) {
      await p.locator('[data-kind="' + kind + '"]').click();
      await settled(p);
      assert.equal(await art(p,chart).locator(".drill-path").innerText(), "Mar › Mon › Shift");
      assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("data-value"), "10");
    }
    await select(p,"Shift Early, Depot A");
    assert.equal(await card(p), "10");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,chart).locator(".drill-path").innerText(), "Mar › Mon › Shift");
    assert.equal(await card(p), "10");
    assert.equal(await mark(p,"Shift Early, Depot A").getAttribute("aria-pressed"), "true");
    await art(p,chart).locator(".vhead strong").click();
    await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Move Day up",exact:true}).click();
    await settled(p);
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Mon › Mar › Shift");
    assert.equal(await card(p),"10");
    await p.getByRole("button",{name:"Move Period up",exact:true}).click();
    await settled(p);
    await drill(p,"up");
    assert.equal(await mark(p,"Day Tue, Depot A").getAttribute("data-value"), "-2");
    await drill(p,"up");
    assert.equal(await mark(p,"Period Apr, Depot A").getAttribute("data-value"), "100");
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=groups]").selectOption({label:"Dispatch · Day"});
    assert.equal(await p.locator("[data-well=groups] .wellrow").count(),3);
    assert.equal(await card(p), "155");
    await select(p,"Period Apr, Depot A");
    await drill(p,"next");
    assert.equal(await card(p),"155");
    for (const kind of ["clusteredBar","stackedBar","percentBar","clusteredColumn","stackedColumn","percentColumn","dot"]) {
      await p.locator('[data-kind="' + kind + '"]').click();
      await settled(p);
      assert.equal(await p.locator("[data-well=groups] .wellrow").count(),3);
      assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Day");
      assert.equal(await mark(p,"Day Mon, Depot A").getAttribute("data-value"),"114");
    }
    await p.locator("#rank-order").selectOption("asc");
    await p.locator("#rank-limit").fill("1");
    await p.locator("#rank-limit").press("Tab");
    await settled(p);
    assert.equal(await art(p,chart).locator("[data-point]").count(),1);
    assert.equal(await mark(p,"Day Tue, Depot A").getAttribute("data-value"),"-2");
    await p.locator("#rank-limit").fill("");
    await p.locator("#rank-limit").press("Tab");
    await settled(p);
    await select(p,"Day Mon, Depot B");
    assert.equal(await card(p),"43");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await card(p),"43");
    assert.equal(await art(p,chart).locator(".drill-path").innerText(),"Day");
    await drill(p,"up");
    await select(p,"Period Apr, Depot A");
    await drill(p,"down");
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-remove-field="groups:0"]').click();
    await settled(p);
    assert.equal(await mark(p,"Day Mon, Depot A").getAttribute("data-value"), "114");
    assert.equal(await art(p,chart).locator("[data-drill=up]").isDisabled(), true);
  });
  console.log("Three-level trend drilling retained ancestor and series context, signed units, type conversions and saved child selections.");
}

export async function benchmarkTrendDrill(p, revenueByCategoryDate, directory) {
  const dates = new Map((await readFile(join(directory,"Date.csv"),"utf8")).trim()
    .split(/\r?\n/).slice(1).map(row => {
      const [key,day] = row.split(",");
      return [day,Number(key)];
    }));
  await addPage(p,"Revenue by category and day");
  const title = "Revenue by category and day";
  await visual(p,"stackedArea",title,["Product · Category","Date · Date"],["Sales · Revenue"],[18,18,930,470],"currency");
  const plot = art(p,title);
  const records = [];
  const allDays = new Map();
  for (const days of revenueByCategoryDate.values())
    for (const [date,cents] of days) allDays.set(date,(allDays.get(date) || 0) + cents);
  for (const category of ["All","A","F","L","All","A","F","L"]) {
    if (category !== "All") {
      await plot.locator('[data-point][aria-label^="Category ' + category + ' ·"]').press("Enter");
      await settled(p);
    }
    const button = plot.locator(category === "All" ? "[data-drill=next]" : "[data-drill=down]");
    await button.evaluate(el => el.addEventListener("click", () => { window.drillStarted = performance.now(); }, {once:true}));
    await button.click();
    await settled(p);
    const {points, displayMs} = await plot.evaluate(async el => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const displayMs = performance.now() - window.drillStarted;
      const points = Array.from(el.querySelectorAll("[data-area-point]"), m => [
        m.getAttribute("aria-label").match(/Date (\d{4}-\d{2}-\d{2})/)[1],
        Math.round(100 * Number(m.dataset.value))
      ]);
      return {points, displayMs};
    });
    const expected = category === "All" ? allDays : revenueByCategoryDate.get(category);
    assert.equal(new Set(points.map(([day]) => day)).size, expected.size);
    assert.equal(points.length, expected.size);
    for (const [day,cents] of points) assert.equal(cents, expected.get(dates.get(day)));
    records.push({category, dates:points.length, displayMs});
    await plot.locator("[data-drill=up]").click();
    await settled(p);
  }
  return records;
}

export async function benchmarkExpandedAxis(p, revenueByCategoryDate, directory) {
  const calendar = (await readFile(join(directory,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1);
  const dates = new Map(calendar.map(line => {
    const [key, date] = line.split(",");
    return [Number(key),date];
  }));
  const candidates = [];
  for (const [category, days] of revenueByCategoryDate)
    for (const [key,cents] of days) candidates.push([category,dates.get(key),cents]);
  candidates.sort((a,b) => b[2]-a[2] || a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  const expected = candidates.slice(0,20);
  const title = "Highest revenue category and date pairs";
  await addPage(p,title);
  await visual(p,"stackedColumn",title,["Product · Category","Date · Date"],["Sales · Revenue"],[18,18,940,470],"currency");
  await p.getByLabel("Legend",{exact:true}).uncheck();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=legendFields]").selectOption({label:"Product · Product"});
  await settled(p);
  await p.locator("#rank-order").selectOption("desc");
  await p.locator("#rank-limit").fill("20");
  await p.locator("#rank-limit").press("Tab");
  await settled(p);
  const chart = art(p,title), timings = [], moves = [];
  async function measureAction(button, reversed) {
    await button.evaluate(el => el.addEventListener("click",() => {window.expandStart=performance.now();},{once:true}));
    await button.click();
    const path = reversed ? "Date › Category" : "Category › Date";
    await p.waitForFunction(path => document.querySelector(".visual .drill-path")?.textContent === path,path);
    await settled(p);
    const {marks,ms} = await chart.evaluate(async el => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.expandStart, marks:[...el.querySelectorAll("[data-point]")].map(m => [
        m.getAttribute("aria-label"),Math.round(Number(m.dataset.value)*100)
      ])};
    });
    const plotted = new Map();
    for (const [label,cents] of marks) {
      const [,category] = label.match(/\bCategory (\w+),/);
      const [,date] = label.match(/\bDate ([\d-]+),/);
      const key = category + "/" + date;
      plotted.set(key,(plotted.get(key)||0) + cents);
    }
    assert.deepEqual([...plotted],expected.map(([category,date,cents]) => [category+"/"+date,cents]));
    return {ms,marks:marks.length};
  }
  for (let repeat=0; repeat<2; repeat++) {
    timings.push(await measureAction(chart.locator("[data-drill=expand]"),false));
    moves.push(await measureAction(p.getByRole("button",{name:"Move Date up",exact:true}),true));
    moves.push(await measureAction(p.getByRole("button",{name:"Move Category up",exact:true}),false));
    await chart.locator("[data-drill=up]").click();
    await settled(p);
  }
  const transfers = await benchmarkLegendTransfer(p,candidates);
  return {candidates:candidates.length,top:expected,timings,moves,transfers};
}

async function benchmarkLegendTransfer(p,candidates) {
  const title = "Highest revenue dates by category";
  const totals = new Map();
  for (const [,date,cents] of candidates) totals.set(date,(totals.get(date) || 0) + cents);
  const highest = [...totals].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,20);
  const topDays = new Map(highest);
  const centsByPair = new Map(candidates.map(([c,d,n]) => [d+"/"+c,n]));
  await addPage(p,title);
  await visual(p,"stackedColumn",title,["Date · Date","Product · Category"],["Sales · Revenue"],[18,18,940,470],"currency");
  await p.locator("[data-tab=Build]").click();
  await p.locator("#rank-order").selectOption("desc");
  await p.locator("#rank-limit").fill("20");
  await p.locator("#rank-limit").press("Tab");
  const chart = art(p,title);
  await chart.locator("[data-drill=expand]").click();
  await settled(p);
  const results = [];
  for (const toLegend of [true,false,true,false]) {
    const from = toLegend ? "groups" : "legendFields", to = toLegend ? "legendFields" : "groups";
    const destination = p.locator('[data-pick="'+to+'"]');
    await destination.evaluate(el => el.addEventListener("drop",() => {window.transferStarted = performance.now();},{once:true}));
    await p.locator('[data-well="'+from+'"] .wellrow').last().dragTo(destination,{sourcePosition:{x:3,y:3}});
    await p.waitForFunction(n => document.querySelectorAll(".visual [data-point]").length === n,toLegend ? 240 : 20);
    await settled(p);
    const {marks,ms} = await chart.evaluate(async el => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.transferStarted,marks:[...el.querySelectorAll("[data-point]")].map(m =>
        [m.getAttribute("aria-label"),Math.round(100*Number(m.dataset.value))])};
    });
    assert.ok(Number.isFinite(ms));
    const segments = new Map(), plotted = new Map();
    for (const [label,cents] of marks) {
      const date = label.match(/Date ([\d-]+)/)[1], category = label.match(/Category (\w+)/)[1];
      const key = date+"/"+category;
      assert.equal(cents,centsByPair.get(key));
      assert.ok(!segments.has(key));
      segments.set(key,cents);
      plotted.set(date,(plotted.get(date)||0)+cents);
    }
    if (toLegend) assert.deepEqual([...plotted],[...topDays]);
    else assert.deepEqual([...segments],candidates.slice(0,20).map(([c,d,n]) => [d+"/"+c,n]));
    results.push({destination:to,ms,segments:segments.size});
  }
  return results;
}
