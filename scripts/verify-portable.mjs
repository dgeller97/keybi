import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { art, settled } from "./portfolio-ui.mjs";
import {editFormula} from "./formula-check.mjs";
import { verifyGeometry } from "./reference-geometry.mjs";
import {checkFreeze} from "./matrix-freeze.mjs";
import {sparkValues} from "./row-sparklines.mjs";
const dest = await mkdtemp(resolve("test-results/portable-"));
await cp("web", join(dest, "web"), { recursive: true });
await cp("portfolio", join(dest, "portfolio"), { recursive: true });
const manifest = JSON.parse(await readFile("portfolio/manifest.json", "utf8"));
const binary = resolve(
  "target/release/keybi" + (process.platform === "win32" ? ".exe" : ""),
);
const env = { ...process.env, FOLIO_PORT: "4352" };
delete env.FOLIO_DATA;
delete env.FOLIO_POSTGRES;
let server, browser;
async function start() {
  server = spawn(binary, [], {
    cwd: dest,
    env,
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Studio failed to launch");
    }),
  ]);
  browser = await chromium.launch({ channel: "chrome" });
}
async function stop() {
  if (browser) {
    await browser.close();
    browser = null;
  }
  if (server && server.exitCode === null) {
    const done = once(server, "exit");
    server.kill();
    await done;
  }
  server = null;
}
const base = "http://127.0.0.1:4352/";
async function pages(p) {
  const original = await p.locator(".page.active").getAttribute("data-page");
  const tabs = p.locator("#pages .page"),
    contents = [];
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click();
    await p.waitForFunction(
      () => document.querySelector("#paper").dataset.pending === "false",
    );
    assert.deepEqual(await p.locator(".visual .err").allTextContents(), []);
    contents.push({
      text: await p.locator(".visual .vbody").allTextContents(),
      images:await p.locator(".visual .report-image").evaluateAll(async imgs=>Promise.all(imgs.map(async img=>{
        await img.decode();return [img.getAttribute("src"),img.alt,img.naturalWidth,img.naturalHeight,img.style.objectFit];
      }))),
      statusIcons: await p.locator(".vbody [data-icon-band]").evaluateAll(icons=>icons.map(icon=>[
        icon.closest("td").textContent, icon.dataset.iconBand, icon.parentElement.dataset.iconLayout,
        getComputedStyle(icon).backgroundColor, icon.getAttribute("aria-label")
      ])),
      cellRules: await p
        .locator(".vbody [data-cell-tone]")
        .evaluateAll((cells) =>
          cells.map((cell) => [
            cell.textContent,
            cell.dataset.cellTone,
            getComputedStyle(cell).backgroundColor,
          ]),
        ),
      dataBars: await p
        .locator(".vbody [data-cell-bar]")
        .evaluateAll((cells) =>
          cells.map((td) => [
            td.textContent,
            td.dataset.cellBar,
            td.hasAttribute("data-bar-only"),
            ...[
              "--bar-zero",
              "--bar-left",
              "--bar-width",
              "--bar-color",
              "--bar-axis",
            ].map((k) => td.style.getPropertyValue(k)),
          ]),
        ),
      sortDirections: await p
        .locator(".vbody th[data-sort-direction]")
        .evaluateAll((headers) =>
          headers.map((header) => [
            header.textContent,
            header.dataset.sortDirection,
          ]),
        ),
    });
  }
  await p.locator('[data-page="' + original + '"]').click();
  return contents;
}
const packages = [];
async function checkRankedBookmarks(p,title) {
  if (title==="Hospital Operations") {
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"Busiest months including ties",exact:true}).click(); await settled(p);
    assert.deepEqual(await art(p,"Monthly encounter volume by site").locator("[data-axis-pick]").allTextContents(),["2026-03","2026-01","2026-02"]);
    assert.equal(await art(p,"Closed routine encounters").locator(".kpi").innerText(),"37");
    return;
  }
  const names=title==="Visual Gallery"?["Busiest dispatch region","Revenue for the busiest region"]:
    title==="Budget vs. Actual"?["Largest February forecast"]:[];
  for (const name of names) {
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name,exact:true}).click(); await settled(p);
    if (name==="Largest February forecast") {
      const card=art(p,"Posted variance by department").locator(".category-card");
      assert.equal(await card.locator(".category-pick").innerText(),"Surgery");
      assert.equal(await card.locator("dd").last().innerText(),"3,200");
    } else if (name==="Busiest dispatch region") {
      const chart=art(p,"Dispatch by selected group");
      assert.deepEqual(await chart.locator("[data-axis-pick]").allTextContents(),["East"]);
      assert.deepEqual(await chart.locator("[data-point]").evaluateAll(es=>es.map(e=>Number(e.dataset.value)).sort((a,b)=>a-b)),[74,863]);
    } else {
      assert.deepEqual(await art(p,"Regional revenue by channel").locator("[data-axis-pick]").allTextContents(),["East"]);
      assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$863.00");
      await p.locator(".ribbon [data-action=bookmarks]").click();
      await p.getByRole("button",{name:"West across channels",exact:true}).click(); await settled(p);
      const chart=art(p,"Regional revenue by channel");
      assert.deepEqual(await chart.locator("[data-axis-pick]").allTextContents(),["East","West"]);
      assert.equal(await chart.getByRole("button",{name:"Region = West",exact:true}).getAttribute("aria-pressed"),"true");
      assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$868.00");
    }
  }
  if (title==="Visual Gallery") {
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"East dispatch revenue",exact:true}).click();await settled(p);
    const chart=art(p,"Dispatch by selected group");
    assert.deepEqual(await chart.locator('[data-point]').evaluateAll(es=>es.map(g=>[JSON.parse(g.dataset.selectionKey)[0],g.querySelector("rect").getAttribute("fill"),Number(g.dataset.value)])),[["East","#243f76",863],["West","#43856b",868]]);
  }
  if (title==="Budget vs. Actual") {
    await p.getByRole("button",{name:"Forecast review",exact:true}).click();await settled(p);
    const chart=art(p,"Actual and forecast by department");
    await art(p,"Forecast period").locator("select").selectOption({label:"2026-04"});await settled(p);
    assert.equal(await chart.locator('[data-metric="1"] rect[fill="#773e82"]').count(),1);
    assert.equal(await chart.locator('[data-metric="0"][data-value="1273"] rect').getAttribute("fill"),"#a63e31");
  }
}
async function checkCharts(p, title) {
  const go = async (page) => {
    await p.locator("#pages").getByRole("button",{name:page,exact:true}).click();
    await settled(p);
  };
  if (["Budget vs. Actual","Visual Gallery"].includes(title)) {
    const budget=title==="Budget vs. Actual";
    await go(budget?"Department cards":"Channel cards");
    const tile=p.getByRole("button",{name:budget?"Medicine":"West › Retail",exact:true});
    const summary=art(p,"Selection total").locator(".kpi");
    if(!budget) assert.deepEqual(await art(p,"Revenue by region and channel").locator(".category-card").evaluateAll(tiles=>{
      const tops=tiles.map(t=>t.offsetTop);
      return [...new Set(tops)].map(y=>tops.filter(top=>top===y).length);
    }),[2,2]);
    assert.equal(await tile.locator("..").locator(".kpi").evaluate(el=>el.style.color),"rgb(166, 62, 49)");
    await tile.focus();
    await p.locator("#chart-tooltip:not([hidden]) .tooltip-page-title").waitFor();
    assert.deepEqual(await p.locator("#chart-tooltip .kpi").allTextContents(),budget?["$2,200.00","$2,175.00"]:["$143.00","11"]);
    await p.keyboard.press("Escape");
    await tile.click(); await settled(p);
    assert.equal(await summary.innerText(),budget?"$25.00":"$143.00");
    await tile.click(); await settled(p);
    assert.equal(await summary.innerText(),budget?"$28.00":"$732.00");
    if(!budget) {
      await p.locator(".ribbon [data-action=bookmarks]").click();
      await p.getByRole("button",{name:"March paired channels",exact:true}).click(); await settled(p);
      assert.equal(await summary.innerText(),"$312.00");
      assert.deepEqual(await art(p,"Selection total").locator("dd").allTextContents(),["24","$13.00"]);
      assert.equal(await p.locator(".category-pick[aria-pressed=true]").count(),2);
      await art(p,"Revenue by region and channel").getByRole("button",{name:"View records"}).click(); await settled(p);
      assert.equal(await art(p,"Dispatch ledger").locator("tbody tr").count(),2);
      await p.locator("[data-action=drill-back]").click(); await settled(p);
      assert.equal(await summary.innerText(),"$312.00");
    }
  }
    if (title === "Visual Gallery") {
      await go("March briefing");
      const nav = art(p,"Report pages");
      assert.equal(await nav.getByRole("button",{name:"Dispatch records",exact:true}).count(),0);
      assert.equal(await p.locator("#pages").getByRole("button",{name:"Dispatch records",exact:true}).getAttribute("aria-description"),"Hidden from navigators by default");
      for(const [name,chart,amount] of [["Paired channel bars","Regional revenue by channel","$799.00"],["March dispatch points","Orders and revenue","$732.00"],["Online across regions","Regional revenue by channel","$887.00"],["West across channels","Regional revenue by channel","$868.00"]]) {
      await p.locator(".ribbon [data-action=bookmarks]").click();
      await p.getByRole("button",{name,exact:true}).click(); await settled(p);
      assert.equal(await art(p,chart).locator('[data-selection-key][aria-pressed=true]').count(),2);
        if (name==="Online across regions") assert.equal(await art(p,chart).getByRole("button",{name:"Online",exact:true}).getAttribute("aria-pressed"),"true");
        if (name==="West across channels") assert.equal(await art(p,chart).getByRole("button",{name:"Region = West",exact:true}).getAttribute("aria-pressed"),"true");
      assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),amount);
      await art(p,chart).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    }
    await go("Channel comparison");
    assert.equal(await art(p,"Selected channel revenue").locator(".kpi").innerText(),"$143.00");
    assert.equal(await art(p,"Selected channel revenue").locator(".kpi").evaluate(el=>el.style.color),"rgb(166, 62, 49)");
    assert.deepEqual(await art(p,"Selected channel revenue").locator(".card-references dt,.card-references dd").allTextContents(),["Orders","11","Per order","$13.00"]);
    await art(p,"Selected channel revenue").locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    assert.equal(await p.getByLabel("Maximum text size (px)").inputValue(),"42");
    assert.equal(await art(p,"Online revenue").locator(".kpi").innerText(),"$240.00");
    assert.equal(await art(p,"Variance from Online").locator(".kpi").innerText(),"-$97.00");
    await art(p,"Comparison period").locator("select").selectOption({index:0});
    await settled(p);
    assert.equal(await art(p,"Online revenue").locator(".kpi").innerText(),"$478.00");
    const comparison=art(p,"Selected revenue compared with Online");
    const retail=comparison.locator(`tr[data-path='["West","Retail"]'] td[data-cell-tone="below"]`).first();
    await comparison.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-remove-field="metrics:2"]').click();
    await settled(p);
    assert.equal(await retail.textContent(),"$390.00");
    assert.match(await retail.locator('[data-icon-band="low"]').getAttribute("aria-label"),/Variance from Online -\$88\.00/);
    await go("Channel share");
    assert.equal(await art(p,"Share of region").locator(".kpi").innerText(),"62.66%");
    await art(p,"Dispatch period").locator("select").selectOption({index:0});
    await settled(p);
    assert.equal(await art(p,"Regional revenue").locator(".kpi").innerText(),"$868.00");
    assert.equal(await art(p,"Share of region").locator(".kpi").innerText(),"55.07%");
    await editFormula(p,"Channel share of region");
    assert.equal(await p.getByLabel("DAX expression").inputValue(),"DIVIDE([Dispatch revenue], [Revenue across channels])");
    await p.keyboard.press("Escape");
    await editFormula(p,"Dispatch revenue");
    const expression=await p.getByLabel("DAX expression").inputValue();
    for (const [source,expected] of [["SUM('Dispatch'[Target])","50.59%"],[expression,"55.07%"]]) {
      await p.getByLabel("DAX expression").fill(source);
      await p.getByRole("button",{name:"Save measure"}).click();
      await p.locator(".rail [data-action=report]").click();
      await settled(p);
      assert.equal(await art(p,"Share of region").locator(".kpi").innerText(),expected);
      if (source !== expression) await editFormula(p,"Dispatch revenue");
    }
    await go("Trends");
    const combo=art(p,"Revenue and order volume");
    assert.equal(await combo.locator('[aria-label="Period 2026-03-01 · Revenue: $732.00"]').count(),1);
    assert.equal(await combo.locator('[aria-label="Period 2026-03-01 · Orders: 55"]').count(),1);
    await go("Dispatch by period");
    const monthly = art(p,"Monthly dispatch by region and channel");
    await monthly.locator(".vhead strong").click();
    await p.locator("[data-tab=Format]").click();
    assert.equal(await p.getByLabel("Wrap row headers").isChecked(),false);
    assert.equal(await monthly.locator('th[data-column-label="2026-02-01 / Dispatch revenue"]').evaluate(th => th.offsetWidth),134);
    await checkFreeze(p,monthly);
    await monthly.locator(`tr[data-path='["West","Online"]']`).getByRole("button",{name:"$478.00"}).click();
    await settled(p);
    assert.equal(await art(p,"Orders in selection").locator(".kpi").innerText(),"33");
    await go("Dispatch hierarchy");
    const hierarchy = art(p,"Revenue and orders by selected levels"), levels = art(p,"Dispatch row levels");
    assert.equal(await hierarchy.getByRole("button",{name:"Expand East"}).count(),1);
    assert.deepEqual(await hierarchy.locator("tbody tr").evaluateAll(rs => rs.map(r => JSON.parse(r.dataset.path))),
      [["East"],["West"],["West","Online"],["West","Retail"],[]]);
    await levels.getByRole("button",{name:"Move Channel earlier"}).click();
    await settled(p);
    assert.deepEqual(await hierarchy.locator("th[data-row-level]").allTextContents(),["Channel","Region"]);
    assert.deepEqual(await hierarchy.locator(`tr[data-path='["Online","West"]'] td`).allTextContents(),["Online","West","$478.00","33"]);
    await go("Compare groupings");
    const group = art(p,"Group dispatch by").getByRole("combobox");
    await group.selectOption({label:"Channel"});
    await settled(p);
    assert.deepEqual(await art(p,"Dispatch totals").locator("tbody td").allTextContents(),["Online","$887.00","66","Retail","$844.00","71"]);
    await art(p,"Measures to compare").getByLabel("Dispatch orders").uncheck();
    await settled(p);
    await group.selectOption({label:"Region"});
    await settled(p);
    assert.equal(await art(p,"Dispatch by selected group").locator('[aria-label^="Region West"]').getAttribute("data-value"),"868");
    await go("Channel performance");
    const contribution = art(p,"Regional contribution by channel");
    const parameter = art(p,"Operating measure").getByRole("combobox");
    await parameter.selectOption({label:"Dispatch orders"});
    await settled(p);
    assert.equal(await art(p,"Channel and region detail").locator("th").last().innerText(),"Dispatch orders");
    assert.equal(await contribution.locator('[aria-label^="Channel Online, Region West"]').getAttribute("data-value"),"33");
    await parameter.selectOption({label:"Dispatch revenue"});
    await settled(p);
    assert.deepEqual((await contribution.locator("[data-series-color]").allTextContents()).sort(),["East","West"]);
    assert.equal(await contribution.locator('[aria-label^="Channel Online, Region West"]').getAttribute("data-value"),"478");
    assert.match(await contribution.locator('[aria-label^="Channel Online, Region West"]').getAttribute("aria-label"),/\$478\.00/);
    const ordered = art(p,"Revenue by channel and region");
    assert.deepEqual(await ordered.locator("[data-axis-parent]").allTextContents(),["Online","Retail"]);
    await ordered.locator('[data-point][aria-label^="Channel Online, Region West"]').press("Enter");
    await settled(p);
    assert.equal(await art(p,"Revenue for selection").locator(".kpi").innerText(),"$478.00");
    assert.deepEqual(await art(p,"Channel operating results").locator("tr.matrix-total td").allTextContents(),["Grand total","33","478"]);
    await go("Channel contribution");
    const revenue = art(p,"Revenue by region");
    await revenue.locator("[data-drill=next]").click();
    await settled(p);
    assert.equal(await revenue.locator('[data-point][aria-label^="Channel Retail"]').getAttribute("data-highlight"),"844");
    await revenue.locator("[data-drill=up]").click();
    await settled(p);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"Revenue by region and channel",exact:true}).click();
    await settled(p);
    assert.deepEqual(await revenue.locator("[data-axis-parent]").allTextContents(),["East","West"]);
    await revenue.locator('[data-point][aria-label^="Region East, Channel Online"]').press("Enter");
    await settled(p);
    assert.equal(await art(p,"Selected revenue").locator(".kpi").innerText(),"$409.00");
    await go("Distributions");
    const plot = art(p, "Orders and revenue");
    await verifyGeometry(plot, "x", 25, true, "Order benchmark");
    await verifyGeometry(plot, "primary", 300, false, "Revenue benchmark");
    await verifyGeometry(art(p, "Target by market and period"), "primary", 336.25, false, "P75 revenue");
    await go("Regional revenue mix");
    const westMarch='[data-area-point][aria-label*="2026-03"][aria-label*="Region West"]';
    const amount=art(p,"Monthly revenue by region").locator(westMarch);
    assert.equal(await amount.getAttribute("data-end"),"732");
    const share=art(p,"Regional share of monthly revenue").locator(westMarch);
    assert.ok(Math.abs(Number(await share.getAttribute("data-start"))-349/732)<1e-9);
    await amount.press("Enter");await settled(p);
    assert.equal(await art(p,"Revenue in view").locator(".kpi").innerText(),"$383.00");
    const amountChart = art(p,"Monthly revenue by region");
    await amountChart.locator("[data-drill=down]").click();
    await settled(p);
    const marchOnline = amountChart.locator('[data-area-point][aria-label^="Channel Online, Region West"]');
    assert.equal(await marchOnline.getAttribute("data-value"), "240");
    await marchOnline.press("Enter");
    await settled(p);
    assert.equal(await art(p,"Revenue in view").locator(".kpi").innerText(),"$240.00");
    await amountChart.locator("[data-drill=up]").click();
    await settled(p);
  }
  if (title === "Budget vs. Actual") {
    await go("Forecast review");
    await art(p,"Forecast period").locator("select").selectOption({label:"2026-02"}); await settled(p);
    const february=art(p,"Department forecast review");
    assert.equal(await art(p,"Posted departments variance").locator(".kpi").innerText(),"$28.00");
    assert.equal(await art(p,"Posted departments variance").locator(".card-references dd").innerText(),"2");
    assert.equal(await art(p,"Posted departments variance").locator(".card-references dd").evaluate(el=>el.style.color),"rgb(134, 84, 15)");
    const surgery=february.locator(`tr[data-path='["Surgery"]']`);
    assert.deepEqual(await surgery.locator("td").allTextContents(),["Surgery","—","$3,200.00","-$3,200.00"]);
    assert.equal(await surgery.locator("[data-icon-band],[data-cell-tone]").count(),0);
    assert.match(await february.locator('tr[data-path="[]"] [data-icon-band]').getAttribute("aria-label"),/Posted variance -\$3,172\.00/);
    await go("Period comparison");
    const plot = art(p,"Posted spending by department");
    assert.equal(await plot.locator("[data-area-point]").count(),11);
    await plot.locator('[data-area-point][aria-label*="2026-04"][aria-label*="Department Facilities"]').press("Enter");
    await settled(p);
    await plot.locator("[data-through]").click();
    await settled(p);
    assert.deepEqual(await art(p,"Posted transactions").locator("tbody tr td:first-child").allTextContents(),["T24","T25"]);
    await p.locator("[data-action=drill-back]").click();
    await settled(p);
    await plot.getByLabel("Clear selection").click();
    await settled(p);
  }
  if (title !== "Hospital Operations") return;
  await go("Attainment exceptions");
  const chart = art(p, "Attainment on recorded days");
  await verifyGeometry(chart, "primary", 0.6, false, "Review threshold");
  assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),2);
  await art(p, "Dates below the review threshold").locator("[data-view-filters]").click();
  await p.locator('[data-measure-filter="0"]').click();
  await p.getByLabel("Threshold (%)").fill("50");
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
  await verifyGeometry(chart, "primary", 0.5, false, "Review threshold");
  assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),1);
  await go("Volume and attainment");
  await verifyGeometry(art(p, "Monthly encounter volume and target attainment"), "secondary", 0.5, false, "Review threshold");
  const trend = art(p, "Monthly encounter volume and target attainment");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button", {name:"March encounter days", exact:true}).click();
  await settled(p);
  assert.equal(await trend.locator(".drill-path").innerText(), "2026-03 › Date");
  const volumes = await trend.locator('[data-point][data-metric="0"]').evaluateAll(marks => marks.map(m => +m.dataset.value));
  assert.equal(volumes.length, 12);
  assert.equal(volumes.reduce((sum, n) => sum + n, 0), 39);
  await trend.locator("[data-drill=up]").click();
  await settled(p);
  assert.equal(await trend.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]').getAttribute("data-value"), "39");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:"Daily volume across months",exact:true}).click();
  await settled(p);
  assert.equal(await trend.locator('[data-point][data-metric="0"]').count(),48);
  assert.equal(await art(p,"Selected visits").locator(".kpi").innerText(),"149");

  // Older reports can have two rules for the same measure without stored rule IDs.
  const id = new URL(p.url()).hash.slice(1).split("/")[0];
  const report = await (await p.request.get(base + "api/reports/" + id)).json();
  const review = report.pages.find(page => page.name === "Attainment exceptions");
  const rules = review.visuals.find(v => v.title === "Dates below the review threshold").measureFilters;
  const { binding, op } = rules[0];
  rules.push({ binding, op, value: 0.4 });
  const saved = await p.request.post(base + "api/reports", { data: {report} });
  assert.ok(saved.ok());
  await p.reload();
  await go("Attainment exceptions");
  const ledger = art(p, "Dates below the review threshold");
  await ledger.locator("[data-view-filters]").click();
  await p.locator('[data-clear-measure-filter="0"]').click();
  await settled(p);
  assert.equal(await chart.getByRole("img", {name:/^Review threshold/}).count(), 0);
  assert.equal(await chart.locator('rect[fill="#a63e31"]').count(),0);
  await verifyGeometry(chart,"primary",7/12,false,"Median day");
  assert.match(await p.locator('[data-measure-filter="0"]').innerText(), /40%/);
}
async function checkTooltip(p, title) {
  const samples = {
    "Hospital Operations": [
      "Site volumes",
      "Monthly encounter volume by site",
      '.plot-mark[aria-label*="2026-03, Site Harbor"]',
      ["13", "53.85%"],
    ],
    "Visual Gallery": [
      "Comparisons",
      "Regional revenue by channel",
      '.plot-mark[aria-label*="Region East, Channel Retail"]',
      ["$454.00", "41"],
    ],
    "Budget vs. Actual": [
      "Variance statement",
      "Operating statement · USD",
      'tr[data-path="[]"] [data-rich-tip]',
      ["$25,600.00", "$23,246.00"],
    ],
  };
  const sample = samples[title];
  if (!sample) return;
  const [page, chart, selector, expected] = sample;
  await p.locator("#pages").getByRole("button",{name:page,exact:true}).click();
  await p.waitForFunction(
    () => document.querySelector("#paper").dataset.pending === "false",
  );
  await p
    .locator('article[aria-label="' + chart + '"]')
    .locator(selector)
    .first()
    .focus();
  await p.locator("#chart-tooltip .tooltip-page-title").waitFor();
  const size = {"Visual Gallery":[520,380],"Hospital Operations":[550,405]}[title];
  if (size) assert.deepEqual(await p.locator("#chart-tooltip .tooltip-sheet").evaluate(el =>
    [el.offsetWidth,el.offsetHeight,el.firstElementChild.offsetLeft,el.firstElementChild.offsetTop]),[...size,18,18]);
  assert.deepEqual(
    await p.locator("#chart-tooltip .kpi").allTextContents(),
    expected,
    title,
  );
  await p.keyboard.press("Escape");
}
async function checkBookmark(page, title) {
  const bookmark = {
    "Visual Gallery": "Pacific depots",
    "Wait-Time Performance": "Longest waits",
  }[title];
  if (!bookmark) return;
  await page.locator("[data-action=bookmarks]").click();
  await page
    .locator("dialog [data-bookmark-go]")
    .filter({ hasText: bookmark })
    .click();
  await page.waitForFunction(
    () => document.querySelector("#paper").dataset.pending === "false",
  );
  if (title === "Visual Gallery") {
    assert.equal(
      await page
        .locator('article[aria-label="Scheduled loads"] .kpi')
        .innerText(),
      "62",
    );
    assert.equal(await page.locator("folio-map [data-lng]:visible").count(), 3);
    assert.ok(
      await page
        .locator(".map-grid text")
        .filter({ hasText: /^180°$/ })
        .isVisible(),
    );
    await page.locator("[data-action=bookmarks]").click();
    await page.getByRole("button", {name:"Channels below revenue target",exact:true}).click();
    await page.waitForFunction(() => document.querySelector("#paper").dataset.pending === "false");
    const remaining = page.locator('article[aria-label="Regional revenue by channel"] [data-point]');
    assert.equal(await remaining.count(), 1);
    assert.match(await remaining.getAttribute("aria-label"), /Region West, Channel Retail/);
    assert.equal(await remaining.getAttribute("data-value"), "390");
  } else {
    assert.equal(
      await page
        .locator('th[aria-sort="descending"]')
        .getByRole("button", { name: "Wait", exact: true })
        .count(),
      1,
    );
    assert.equal(
      await page
        .getByRole("columnheader", { name: "Service", exact: true })
        .getAttribute("data-sort-direction"),
      "ascending",
    );
    const first = await page
      .locator(".grid tbody tr")
      .first()
      .locator("td")
      .allTextContents();
    assert.equal(first[0], "W066");
    assert.equal(first.at(-1), "77");
  }
}
try {
  await start();
  for (const r of manifest.reports) {
    const p = await browser.newPage();
    await p.goto(base);
    await p
      .locator("#report-cards button")
      .filter({ hasText: r.title })
      .click();
    await p.waitForFunction(
      () => document.querySelector("#paper").dataset.pending === "false",
    );
    assert.equal(await p.locator(".visual .err").count(), 0);
    assert.equal(await p.locator("#report-name").innerText(), r.title);
    const response = await p.request.get(
      base + "api/reports/" + r.id + "/package",
    );
    assert.ok(response.ok(), r.title);
    packages.push({
      title: r.title,
      buffer: await response.body(),
      values: await pages(p),
    });
    if (r === manifest.reports[0]) {
      await p.locator("#report-name").click();
      await p.getByLabel("Report name").fill("Portable edit check");
      await p.locator("dialog button[type=submit]").click();
      await p.locator("header [data-action=save]").click();
      await p.waitForFunction(
        () => document.querySelector("#save-state").textContent === "Saved",
      );
    }
    await p.close();
  }
  await stop();
  await start();
  const p = await browser.newPage();
  await p.goto(base);
  await p.getByRole("heading", { name: "Portable edit check" }).waitFor();
  assert.equal(
    await p.locator("#report-cards button").count(),
    manifest.reports.length,
  );
  await p.getByRole("button",{name:"Published reports",exact:true}).click();
  await p.getByRole("link",{name:"Budget vs. Actual",exact:true}).click();
  await art(p,"Order amount").locator(".kpi").waitFor();await settled(p);
  assert.equal(await art(p,"Order amount").locator(".kpi").innerText(),"$124.50");
  assert.equal(await p.getByRole("button",{name:"Edit report",exact:true}).count(),0);
  console.log(
    "Clean first launch seeded all " +
      manifest.reports.length +
      " reports. A saved edit survived restart.",
  );
  await stop();
  env.FOLIO_DATA = join(dest, "imported");
  await start();
  for (const entry of packages) {
    const page = await browser.newPage();
    await page.goto(base);
    const picker = page.waitForEvent("filechooser");
    await page.locator("#home [data-action=import-package]").click();
    const importing = page.waitForResponse(r => r.url() === base + "api/packages" && r.request().method() === "POST");
    await (
      await picker
    ).setFiles({
      name: entry.title + ".keybi",
      mimeType: "application/octet-stream",
      buffer: entry.buffer,
    });
    const imported = await importing;
    if (!imported.ok()) throw Error(entry.title + " failed to import. " + await imported.text());
    await page
      .locator("#report-name")
      .filter({ hasText: entry.title })
      .waitFor();
    assert.deepEqual(await pages(page), entry.values, entry.title);
    await checkCharts(page, entry.title);
    await checkTooltip(page, entry.title);
    await checkBookmark(page, entry.title);
    await checkRankedBookmarks(page,entry.title);
    if (entry.title==="Visual Gallery") {
      await page.locator("#pages").getByRole("button",{name:"Pipeline status",exact:true}).click();await settled(page);
      await art(page,"Deals by pipeline status").locator('[data-selection-key=\'["Open"]\']').press("Enter");await settled(page);
      assert.equal(await art(page,"Deals in view").locator(".kpi").innerText(),"219");
      await art(page,"Sales office").locator("select").selectOption({label:"Toronto"});await settled(page);
      assert.equal(await art(page,"Deals in view").locator(".kpi").innerText(),"78");
      await page.locator("#pages").getByRole("button",{name:"Regional panels",exact:true}).click();await settled(page);
      const regions=art(page,"Monthly revenue by region");
      await regions.getByRole("region",{name:"West",exact:true}).locator('.plot-mark[data-value="240"]').press("Enter");await settled(page);
      assert.equal(await art(page,"Orders under selection").locator(".kpi").innerText(),"16");
      await page.locator("#pages").getByRole("button",{name:"Regional trends",exact:true}).click();await settled(page);
      const grand=art(page,"Orders by channel and region").locator('tr[data-path="[]"]');
      assert.deepEqual((await sparkValues(page,grand,"Total / Orders by month")).map(r=>r[1]),["36","46","55"]);
      assert.equal(await art(page,"Revenue · All channels").locator(".kpi").innerText(),"$1,731.00");
      await art(page,"Channel to compare").locator("select").selectOption({label:"Online"});await settled(page);
      assert.equal(await art(page,"Revenue · Online").locator(".kpi").innerText(),"$887.00");
      await page.locator("#pages").getByRole("button",{name:"Monthly briefing",exact:true}).click();await settled(page);
      const narration=art(page,"Dispatch summary").locator(".narrative-text");
      assert.match(await narration.innerText(),/\$732\.00 from 55 orders/);
      await art(page,"Revenue in the selected period").locator(".barrow").filter({hasText:"West"}).click();await settled(page);
      assert.match(await narration.innerText(),/\$383\.00 from 27 orders against a \$350\.00 target \(109\.43%/);
      await page.locator("#pages").getByRole("button",{name:"Channel performance",exact:true}).click();await settled(page);
      const channelRevenue=await art(page,"Revenue for selection").locator(".kpi").innerText();
      await page.getByRole("button",{name:"Reading view",exact:true}).click();await settled(page);
      await page.getByRole("combobox",{name:"Page layout",exact:true}).selectOption("phone");
      assert.deepEqual(await page.locator("#paper .visual:visible .vhead strong").allTextContents(),["Revenue for selection","Regional contribution by channel","Revenue attainment for selection","Operating measure"]);
      assert.equal(await art(page,"Revenue for selection").locator(".kpi").innerText(),channelRevenue);
      assert.equal(await art(page,"Regional contribution by channel").locator('[data-series-color="West"]').getAttribute("data-color"),"#d7863a");
      await page.locator("#pages").getByRole("button",{name:"Overnight dispatch",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Parcels at scan time").locator("[data-calendar-caption]").textContent(),"2026-11-01 · UTC");
      await art(page,"Parcels at scan time").locator('.plot-mark[data-value="14"]').press("Enter");await settled(page);
      assert.equal(await art(page,"Parcels scanned").locator(".kpi").innerText(),"14");
        await page.locator("#pages").getByRole("button",{name:"Variance distribution",exact:true}).click();await settled(page);
        await art(page,"Monthly regional channel results by variance").locator('[data-selection-key="[-20]"]').press("Enter");await settled(page);
        assert.equal(await art(page,"Net variance").locator(".kpi").innerText(),"-$44.00");
        assert.equal(await art(page,"Revenue in selection").locator(".kpi").innerText(),"$486.00");
        await page.locator("#pages").getByRole("button",{name:"Hourly dispatch",exact:true}).click();await settled(page);
        await art(page,"Parcels by UTC hour").locator('.plot-mark[data-value="30"]').press("Enter");await settled(page);
        assert.deepEqual(await art(page,"Dock scans in selection").locator("tbody tr td:first-child").allTextContents(),
          ["2026-11-01T06:05:00Z","2026-11-01T06:05:00Z","2026-11-01T01:45:00-05:00"]);
        await art(page,"Parcels by UTC hour").locator("[data-axis-pick='[\"2026-11-01T07:00:00.000Z\"]']").press("Enter");await settled(page);
        assert.equal(await art(page,"Parcels in selection").locator(".kpi").innerText(),"0");
    }
    if (entry.title==="Wait-Time Performance") {
      await page.locator("#pages").getByRole("button",{name:"Wait frequency",exact:true}).click();await settled(page);
      await verifyGeometry(art(page,"Visits at recorded wait times"),"x",60,true,"Long wait");
      await art(page,"Visits at recorded wait times").locator('[data-selection-key="[32]"]').press("Enter");await settled(page);
      assert.equal(await art(page,"Visits in selection").locator(".kpi").innerText(),"6");
        await page.locator("#pages").getByRole("button",{name:"Wait intervals",exact:true}).click();await settled(page);
        const bins=art(page,"Visits by ten-minute wait");
        assert.equal(await bins.locator('[data-axis-pick="[50]"]').textContent(),"50–<60");
        await bins.locator('[data-selection-key="[60]"]').press("Enter");await settled(page);
        assert.deepEqual(await art(page,"Visits in the selected interval").locator("tbody tr td:first-child").allTextContents(),
          ["W014","W040","W053","W079","W092"]);
    }
    if (entry.title==="Budget vs. Actual") {
      await page.locator("#pages").getByRole("button",{name:"Receiving reconciliation",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Unreconciled amount").locator(".kpi").innerText(),"$20.25");
      await art(page,"Order and receipt exceptions").locator("tbody tr").filter({hasText:"P-06"}).click();await settled(page);
      assert.equal(await art(page,"Receipt amount").locator(".kpi").innerText(),"$18.25");
      await page.locator("#pages").getByRole("button",{name:"Purchase price check",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Recalculated cost").locator(".kpi").innerText(),"$225.75");
      await art(page,"Purchasing department").locator("select").selectOption({label:"Facilities"});await settled(page);
      assert.equal(await art(page,"Recalculated cost").locator(".kpi").innerText(),"$112.25");
      assert.equal(await art(page,"Recalculated cost").locator(".vsubtitle").innerText(),"Department · Facilities");
      assert.equal(await art(page,"Difference from source").locator(".kpi").innerText(),"$0.00");
      await page.locator("#pages").getByRole("button",{name:"Purchase vouchers",exact:true}).click();await settled(page);
      await art(page,"Purchase order").locator("select").selectOption({label:"P-02"});await settled(page);
      const voucher=art(page,"Voucher for selected order").locator("img");await voucher.evaluate(img=>img.decode());
      assert.equal(await voucher.getAttribute("alt"),"Surgery voucher P-02 for $80.00");
      assert.equal(await art(page,"Above approval limit").locator(".kpi").innerText(),"$5.00");
      await page.locator("#pages").getByRole("button",{name:"Approval exceptions",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Total above limits").locator(".kpi").innerText(),"$29.50");
      assert.deepEqual(await art(page,"Orders above their approval limit").locator("tbody tr td:last-child").allTextContents(),["$24.50","$5.00"]);
      await page.locator("#pages").getByRole("button",{name:"Approval limits",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Largest order").locator(".kpi").innerText(),"$124.50");
      await art(page,"Approval owner").locator("select").selectOption({label:"Surgery lead"});await settled(page);
      assert.deepEqual(await art(page,"Purchase approval ledger").locator("tbody tr").first().locator("td").allTextContents(),["P-02","Surgery lead","75","$80.00"]);
      await page.locator("#pages").getByRole("button",{name:"Purchase authorizations",exact:true}).click();await settled(page);
        assert.equal(await art(page,"Purchase summary background").locator("svg[data-shape]").getAttribute("data-shape"),"rounded");
        assert.equal(await art(page,"Purchase summary background").getAttribute("data-position-locked"),"");
      assert.equal(await art(page,"Authorized amount").locator(".kpi").innerText(),"$225.75");
      await art(page,"Authorized amount by department").locator('[data-selection-key=\'["Facilities"]\']').press("Enter");await settled(page);
      assert.equal(await art(page,"Authorized amount").locator(".kpi").innerText(),"$112.25");
        assert.equal(await art(page,"Purchase line count").locator(".kpi").innerText(),"3");
        assert.equal(await art(page,"Average line amount").locator(".kpi").innerText(),"$37.42");
      assert.deepEqual(await art(page,"Purchase lines for review").locator("tbody tr td:first-child").allTextContents(),["P-01","P-03","P-04"]);
      await page.locator("#pages").getByRole("button",{name:"Quarterly spending",exact:true}).click();await settled(page);
      const plot=art(page,"Actual and budget by calendar quarter");
      await plot.locator('[data-drill="expand"]').click();await settled(page);
      assert.deepEqual(await plot.locator("[data-axis-parent]").allTextContents(),["2026 Q1","2026 Q2"]);
      await plot.locator('.plot-mark[data-value="3328"]').press("Enter");await settled(page);
      assert.equal(await art(page,"Actual less budget").locator(".kpi").innerText(),"-$3,272.00");
      await page.locator(".ribbon [data-action=bookmarks]").click();
      await page.getByRole("button",{name:"January and March spending",exact:true}).click();await settled(page);
      assert.equal(await art(page,"Posted actual").locator(".kpi").innerText(),"$13,119.00");
      assert.equal(await art(page,"Authorized budget").locator(".kpi").innerText(),"$13,200.00");
    }
    if (entry.title==="Hospital Operations") {
          await page.locator("#pages").getByRole("button",{name:"Site trends",exact:true}).click();await settled(page);
          const sites=art(page,"Monthly target attainment by site");
          await sites.getByRole("region",{name:"Ridge",exact:true}).locator('.plot-mark[aria-label*="Month 2026-04"]').press("Enter");await settled(page);
          assert.equal(await art(page,"Attainment in selection").locator(".kpi").innerText(),"58.33%");
          await page.locator("#pages").getByRole("button",{name:"Harbor and Ridge",exact:true}).click();await settled(page);
          const harbor=art(page,"Harbor monthly trend"),ridge=art(page,"Ridge monthly trend");
          assert.equal(await ridge.locator('[data-scale="secondary"]').getAttribute("data-max"),"1");
          await harbor.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]').press("Enter");await settled(page);
          assert.deepEqual(await art(page,"Closed visits by site").locator("tbody tr td:nth-child(3)").allTextContents(),["9","7","7"]);
          assert.deepEqual(await sparkValues(page,art(page,"Closed visits by site").locator("tbody tr").filter({hasText:"Harbor"}),"Monthly target attainment"),[["2026-03","53.85%"]]);
        await page.locator(".ribbon [data-action=bookmarks]").click();
        await page.getByRole("button",{name:"Harbor open workload",exact:true}).click();await settled(page);
        assert.equal(await art(page,"Encounter count").locator(".kpi").innerText(),"8");
        await page.locator("#pages").getByRole("button",{name:"Site volumes",exact:true}).click();await settled(page);
        const linkedSite=art(page,"Site focus").locator("select");
        assert.equal(await linkedSite.locator("option:checked").innerText(),"Harbor");
        // The earlier ranking bookmark selected February on this page.
        assert.equal(await art(page,"Closed routine encounters").locator(".kpi").innerText(),"13");
        await art(page,"Monthly encounter volume by site").locator("[data-clear]").click();await settled(page);
        assert.equal(await art(page,"Closed routine encounters").locator(".kpi").innerText(),"50");
        await linkedSite.selectOption({label:"All"});await settled(page);
        await page.locator("#pages").getByRole("button",{name:"Encounter detail",exact:true}).click();await settled(page);
        const find=art(page,"Find an encounter");await find.getByRole("searchbox").fill("e19");
        await find.locator("select").selectOption({label:"E192"});await settled(page);
        assert.equal(await art(page,"Routine encounter register").locator("tbody tr td").nth(4).innerText(),"58");
        await page.locator(".ribbon [data-action=bookmarks]").click();
        await page.getByRole("button",{name:"Pasted case review",exact:true}).click();await settled(page);
        assert.deepEqual(await art(page,"Routine encounter register").locator("tbody tr td:first-child").allTextContents(),["E002","E191","E192"]);
        assert.equal(await art(page,"Encounters in view").locator(".kpi").innerText(),"3");
        await page.locator(".ribbon [data-action=bookmarks]").click();
        await page.getByRole("button",{name:"Cedar and Harbor in March",exact:true}).click();await settled(page);
        assert.match(await art(page,"Coverage site").locator("[data-slicer-values]").innerText(),/2 selected/);
        assert.equal(await art(page,"Closed routine visits").locator(".kpi").innerText(),"26");
        await page.locator("#pages").getByRole("button",{name:"Calendar review",exact:true}).click();await settled(page);
        const calendar=art(page,"Routine encounters by calendar period");
        await calendar.locator('.plot-mark[data-value="174"]').press("Enter");await settled(page);
        await calendar.locator('[data-drill="down"]').click();await settled(page);
        assert.deepEqual(await calendar.locator(".plot-mark").evaluateAll(es=>es.map(e=>Number(e.dataset.value))),[131,43]);
        const vacant=calendar.locator(".empty-interval[data-axis-pick='[\"2026-07-01T00:00:00.000Z\"]']");
        await vacant.press("Enter");await settled(page);
        assert.equal(await art(page,"Visits in selected period").locator(".kpi").innerText(),"0");
        await page.locator("#pages").getByRole("button",{name:"Weekly caseload",exact:true}).click();await settled(page);
        await art(page,"Routine visits by week").locator("[data-selection-key='[\"2026-01-05T00:00:00.000Z\"]']").press("Enter");await settled(page);
        assert.equal(await art(page,"Routine visits in selection").locator(".kpi").innerText(),"26");
      await page.locator("#pages").getByRole("button",{name:"Encounter workload",exact:true}).click();await settled(page);
      await page.getByRole("button",{name:"Reading view",exact:true}).click();await settled(page);
      await page.getByRole("combobox",{name:"Page layout",exact:true}).selectOption("phone");
      assert.deepEqual(await page.locator("#paper .vhead strong").allTextContents(),["Encounter count","Median wait (minutes)","Encounters by site","Status by site"]);
      const countBox=await art(page,"Encounter count").boundingBox(),waitBox=await art(page,"Median wait (minutes)").boundingBox();
      assert.equal(countBox.y,waitBox.y);assert.equal(waitBox.x-countBox.x-countBox.width,8);
      assert.equal((await art(page,"Encounters by site").boundingBox()).height,256);
      assert.equal(await art(page,"Encounter count").locator(".kpi").innerText(),"25");
      await page.locator("[data-action=reader-filters]").click();
      const form=page.getByRole("dialog");
      assert.match(await form.locator(".locked-filter").innerText(),/Routine.*Locked/);
      await form.getByLabel("Status",{exact:true}).selectOption({label:"Closed"});
      await form.getByRole("button",{name:"Apply"}).click();await settled(page);
      assert.equal(await art(page,"Encounter count").locator(".kpi").innerText(),"149");
    }
    await page.close();
    if (entry.title === "Visual Gallery")
      await writeFile("portfolio-evidence/Visual Gallery.keybi", entry.buffer);
  }
  console.log(
    "Every page of all six packaged reports displayed the same visual contents in an independent workspace.",
  );
} finally {
  await stop();
}
