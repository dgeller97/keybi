import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import os from "node:os";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";
import { chromium } from "playwright-core";

const size = Number(process.argv[2] || 2),
  large = size !== 2;
const dir = resolve(large ? "bench-data/" + size : "web/samples");
const dest = resolve(
  "test-results",
  String(size),
  new Date().toISOString().replaceAll(":", "-"),
);
await mkdir(dest, { recursive: true });
const port = Number(process.env.TEST_PORT || 4348),
  url = "http://127.0.0.1:" + port;
let server,
  browser,
  p,
  peakBrowser = 0;
const executable =
  process.env.FOLIO_BIN ||
  resolve(
    "target/release/keybi" +
      (process.platform === "win32" ? ".exe" : ""),
  );
const summary = {
  size,
  hardware: os.cpus()[0].model,
  logicalCpus: os.cpus().length,
  ramGiB: Math.round(os.totalmem() / 2 ** 30),
  platform: os.platform() + " " + os.release(),
  viewport: "1536×960",
  release: true,
};
const queryTimes = [],
  filterTimes = [];
let lastBatchCached = false;
const uncachedFilters = [],
  repeatedFilters = [];
let monitor, remote, timer, sampling;
async function start() {
  server = spawn(executable, [], {
    cwd: process.env.FOLIO_TEST_PROJECT || process.cwd(),
    env: {
      ...process.env,
      FOLIO_PORT: String(port),
      FOLIO_DATA: join(dest, "store"),
    },
    stdio: ["ignore", "pipe", "inherit"],
    windowsHide: true,
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(([code]) => {
      throw Error("Server exited " + code);
    }),
  ]);
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  summary.browser = browser.version();
  p = await browser.newPage({ viewport: { width: 1536, height: 960 } });
  if (process.platform === "win32") {
    remote = await browser.newBrowserCDPSession();
    const script =
      'while ($null -ne ($line=[Console]::ReadLine())) { $ids=[int[]]$line.Split(","); $b=Get-Process -Id $ids -ErrorAction SilentlyContinue; $s=Get-Process -Id ' +
      Number(server.pid) +
      ' -ErrorAction SilentlyContinue; [Console]::WriteLine(([string](($b|Measure-Object WorkingSet64 -Sum).Sum))+" "+([string]$s.PeakWorkingSet64)) }';
    monitor = spawn("powershell.exe", ["-NoProfile", "-Command", script], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    timer = setInterval(() => memory().catch(() => {}), 100);
  }
  p.setDefaultTimeout(10000);
  p.on("pageerror", (e) => console.error("Browser error:", e));
  p.on("response", async (r) => {
    if (r.url().endsWith("/api/query") && r.ok()) {
      try {
        const batch = await r.json();
        lastBatchCached = batch.length > 0 && batch.every((q) => q.cache);
        for (const q of batch) {
          if (q.error) console.error(q.error);
          else queryTimes.push(q.ms);
        }
      } catch {}
    }
  });
}
async function stop() {
  clearInterval(timer);
  if (sampling) await sampling.catch(() => {});
  if (monitor) {
    monitor.stdin.end();
    monitor = null;
    await remote.detach();
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  if (server && server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
  server = null;
}
async function memory() {
  if (!monitor) return;
  if (sampling) return sampling;
  sampling = (async () => {
    const { processInfo } = await remote.send("SystemInfo.getProcessInfo");
    const ids = processInfo
      .map((p) => Number(p.id))
      .filter(Number.isSafeInteger)
      .join(",");
    const response = once(monitor.stdout, "data");
    monitor.stdin.write(ids + "\n");
    const [chunk] = await response;
    const [browserBytes, serverBytes] = chunk
      .toString()
      .trim()
      .split(/\s+/)
      .map(Number);
    if (Number.isFinite(browserBytes))
      peakBrowser = Math.max(peakBrowser, browserBytes);
    if (Number.isFinite(serverBytes))
      summary.serverPeakMiB = Math.max(
        summary.serverPeakMiB || 0,
        Math.round(serverBytes / 2 ** 20),
      );
  })();
  try {
    await sampling;
  } finally {
    sampling = null;
  }
}
async function settled() {
  await p.waitForFunction(
    () => document.querySelector("#paper").dataset.pending === "false",
  );
  await p.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function link(one, many) {
  await p.locator(".ribbon [data-action=relationship]").click();
  await p.getByLabel("One-side key").selectOption({ label: one });
  await p.getByLabel("Many-side key").selectOption({ label: many });
  await p.getByRole("button", { name: "Create", exact: true }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
async function create(kind) {
  await p.locator(".ribbon [data-action=add]").click();
  await p.locator("[data-create=" + kind + "]").click();
}
async function bind(well, label) {
  await p.getByLabel(well, { exact: true }).selectOption({ label });
  await settled();
}
async function kpi(expected) {
  await settled();
  assert.equal(await p.locator(".kpi").textContent(), expected);
}
const format = (x) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(x);
async function truthData() {
  const map = new Map(),
    daily = new Map(), dailyCounts = new Map(), products = new Map(),
    revenueByCategoryDate = new Map(),
    dates = new Map(),
    tot = [0, 0];
  let first = true;
  for await (const line of createInterface({
    input: createReadStream(join(dir, "Sales.csv")),
    crlfDelay: Infinity,
  })) {
    if (first) {
      first = false;
      continue;
    }
    const [, product, date, rev, profit] = line.split(",").map(Number),
      cat = String.fromCharCode(65 + ((product - 1) % 12)),
      pair = map.get(cat) || [0, 0];
    pair[0] += Math.round(rev * 100);
    pair[1] += Math.round(profit * 100);
    map.set(cat, pair);
    products.set(product,(products.get(product) || 0) + Math.round(rev*100));
    const day = daily.get(date) || [0,0];
    day[0] += Math.round(rev*100); day[1] += Math.round(profit*100);
    daily.set(date,day);
    dailyCounts.set(date,(dailyCounts.get(date)||0)+1);
    if (!revenueByCategoryDate.has(cat)) revenueByCategoryDate.set(cat, new Map());
    const categoryDays = revenueByCategoryDate.get(cat);
    categoryDays.set(date, (categoryDays.get(date) || 0) + Math.round(rev * 100));
    tot[0] += Math.round(rev * 100);
    tot[1] += Math.round(profit * 100);
    if (!dates.has(cat)) dates.set(cat, new Set());
    dates.get(cat).add(date);
  }
  return { map, tot, dates, daily, dailyCounts, products, revenueByCategoryDate };
}
function percentile(samples, p) {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
}
const truth = await truthData();
const bar = (cat) =>
  p.locator(".barrow").filter({
    has: p.locator("span:first-child", {
      hasText: new RegExp("^" + cat + "$"),
    }),
  });
const clearBar = () =>
  p
    .locator(".visual")
    .filter({ has: p.locator(".barrow") })
    .getByLabel("Clear selection")
    .click();
const pick = async (cat) => {
  await bar(cat).click();
  const pair = truth.map.get(cat);
  await kpi(format(pair[1] / pair[0]));
  assert.equal(await p.locator(".grid tbody tr").count(), 1);
};
try {
  await start();
  await p.goto(url);
  await p.locator("#home [data-action=new]").click();
  await settled();
  await p.screenshot({ path: join(dest, "blank.png") });
  const picker = p.waitForEvent("filechooser");
  await p
    .getByRole("button", { name: "Get data", exact: true })
    .first()
    .click();
  const chooser = await picker,
    imp = performance.now();
  await chooser.setFiles(
    ["Sales", "Product", "Date"].map((f) => join(dir, f + ".csv")),
  );
  await p.waitForFunction(
    () => document.querySelectorAll("#data .tree").length === 3,
  );
  summary.importMs = performance.now() - imp;
  if (process.env.MANUAL_LINKS) {
    await link("Product · ProductKey", "Sales · ProductKey");
    await link("Date · DateKey", "Sales · DateKey");
  } else {
    await p.locator(".ribbon [data-action=relationship]").click();
    assert.equal(await p.locator("[data-suggestion]:checked").count(), 2);
    await p.getByRole("button", { name: "Create selected" }).click();
    await p.locator("dialog").waitFor({ state: "hidden" });
  }
  await p.locator(".ribbon [data-action=measure]").click();
  await p
    .getByLabel("Numerator · sum of")
    .selectOption({ label: "Sales · Profit" });
  await p
    .getByLabel("Denominator · sum of")
    .selectOption({ label: "Sales · Revenue" });
  await p.getByRole("button", { name: "Create", exact: true }).click();
  await create("bar");
  await p
    .locator('#data [title="Product.Category"]')
    .dragTo(p.locator('[data-well="groups"]'));
  await settled();
  await bind("Value", "Sales · Revenue");
  await p.getByLabel("Aggregation").selectOption("avg");
  await settled();
  await p.getByLabel("Aggregation").selectOption("sum");
  await settled();
  await create("card");
  await bind("Value", "Margin");
  await create("table");
  await bind("Rows", "Product · Category");
  await bind("Values", "Sales · Revenue");
  await bind("Values", "Sales · Profit");
  await bind("Values", "Margin");
  await create("slicer");
  await bind("Field", "Date · Date");
  const expected = format(truth.tot[1] / truth.tot[0]);
  await kpi(expected);
  const card = p.locator(".visual").filter({ has: p.locator(".kpi") });
  await card.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Number format").selectOption("percent");
  const before = await card.getAttribute("style");
  for (const [part, dx, dy] of [
    [".vhead", 8, 5],
    [".resize", 12, 10],
  ]) {
    const b = await card.locator(part).boundingBox(),
      x = b.x + b.width / 2,
      y = b.y + b.height / 2;
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + dx, y + dy, { steps: 4 });
    await p.mouse.up();
  }
  const after = await card.getAttribute("style");
  assert.notEqual(after, before);
  await pick("B");
  await pick("A");
  if (!large) {
    await p.locator(".slicebtn", { hasText: "2025-01-01" }).click();
    await kpi("40%");
    await clearBar();
    await kpi("40%");
    await p
      .locator(".visual")
      .filter({ has: p.locator(".slicebtn") })
      .getByLabel("Clear selection")
      .click();
    await kpi("13%");
    await pick("A");
  }
  await p.locator("[data-action=save]").click();
  await p.waitForFunction(
    () =>
      location.hash.startsWith("#r") &&
      document.querySelector("#save-state").textContent === "Saved",
  );
  const savedUrl = p.url();
  const saved = await (
    await p.request.get(url + "/api/reports/" + savedUrl.split("#")[1])
  ).json();
  const outdated = await p.request.post(url + "/api/reports", {
    data: { report: { ...saved, revision: 0, title: "Stale copy" } },
  });
  assert.equal(outdated.ok(), false);
  assert.match((await outdated.json()).error, /newer revision/);
  summary.metadata = process.env.FOLIO_POSTGRES ? "PostgreSQL" : "Local files";
  assert.equal(saved.links.length, 2);
  assert.equal(saved.measures.length, 1);
  assert.equal(saved.pages[0].visuals[1].format, "percent");
  assert.equal(saved.pages[0].visuals[0].selection.value, "A");
  await memory();
  await stop();
  await start();
  const cold = performance.now();
  await p.goto(savedUrl);
  await p.waitForSelector(".kpi");
  await settled();
  summary.coldOpenMs = performance.now() - cold;
  assert.equal(
    await p.locator(".kpi").textContent(),
    format(truth.map.get("A")[1] / truth.map.get("A")[0]),
  );
  const geometry = await p
    .locator(".visual")
    .nth(1)
    .evaluate((el) => [
      el.style.left,
      el.style.top,
      el.style.width,
      el.style.height,
    ]);
  assert.deepEqual(
    geometry,
    ["x", "y", "w", "h"].map((k) => saved.pages[0].visuals[1][k] + "px"),
  );
  summary.transferBytes = await p.evaluate(
    () =>
      performance.getEntriesByType("navigation")[0].encodedBodySize +
      performance
        .getEntriesByType("resource")
        .filter((e) => !e.name.includes("/api/"))
        .reduce((sum, e) => sum + e.encodedBodySize, 0),
  );
  await clearBar();
  await kpi(expected);
  await p.screenshot({ path: join(dest, "report.png") });
  const cats = [...truth.map.keys()].sort();
  for (let i = 0; i < (large ? 48 : 8); i++) {
    const cat = cats[i % cats.length],
      pair = truth.map.get(cat);
    await p.evaluate(() =>
      document.addEventListener(
        "pointerdown",
        () => (window.inputTime = performance.now()),
        { once: true, capture: true },
      ),
    );
    await bar(cat).click();
    const dates = [...truth.dates.get(cat)]
      .sort((a, b) => a - b)
      .slice(0, 100)
      .map((d) => new Date(Date.UTC(2025, 0, d)).toISOString().slice(0, 10));
    const bars = [...truth.map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, [rev]]) => [name, rev / 100]);
    const elapsed = await p.evaluate(
      async ({ cat, ratio, revenue, profit, dates, bars }) => {
        const fmt = (n) =>
          new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(
            n,
          );
        for (let j = 0; j < 600; j++) {
          await new Promise(requestAnimationFrame);
          const cells = [...document.querySelectorAll(".grid tbody td")].map(
            (td) => td.textContent,
          );
          const shownDates = [...document.querySelectorAll(".slicebtn")].map(
            (el) => el.textContent,
          );
          const shownBars = [...document.querySelectorAll(".barrow")].map(
            (el) => [
              el.firstElementChild.textContent,
              el.lastElementChild.textContent,
            ],
          );
          if (
            document.querySelector("#paper").dataset.pending === "false" &&
            document.querySelector(".kpi")?.textContent === ratio &&
            cells.length === 4 &&
            cells[0] === cat &&
            cells[1] === fmt(revenue) &&
            cells[2] === fmt(profit) &&
            cells[3] === ratio &&
            document.querySelector(".barrow.selected")?.firstElementChild
              .textContent === cat &&
            JSON.stringify(shownDates) === JSON.stringify(dates) &&
            JSON.stringify(shownBars) ===
              JSON.stringify(bars.map(([n, v]) => [n, fmt(v)]))
          ) {
            await new Promise(requestAnimationFrame);
            return performance.now() - window.inputTime;
          }
        }
        throw Error("Incorrect filter output for " + cat);
      },
      {
        cat,
        ratio: format(pair[1] / pair[0]),
        revenue: pair[0] / 100,
        profit: pair[1] / 100,
        dates,
        bars,
      },
    );
    filterTimes.push(elapsed);
    (lastBatchCached ? repeatedFilters : uncachedFilters).push(elapsed);
    if (i === 0 || i === cats.length) await memory();
  }
  summary.filterMs = filterTimes;
  summary.filterP95 = percentile(filterTimes, 0.95);
  summary.queryP95 = percentile(queryTimes, 0.95);
  summary.queryCount = queryTimes.length;
  summary.newFilterP95 = percentile(uncachedFilters, 0.95);
  summary.repeatedFilterP95 = percentile(repeatedFilters, 0.95);
  summary.newFilterCount = uncachedFilters.length;
  summary.repeatedFilterCount = repeatedFilters.length;
  summary.browserSampledPeakMiB = Math.round(peakBrowser / 2 ** 20);
  summary.frameIntervalMs = await p.evaluate(async () => {
    const times = [];
    for (let i = 0; i < 13; i++) times.push(await new Promise(requestAnimationFrame));
    return times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)[6];
  });
  summary.cache =
    "Cold open uses fresh server and browser profile with warm OS file cache. Filtering mixes new and repeated selections.";
  const {benchmarkReading}=await import("./reading-view.mjs");
  await writeFile(join(dest,"reading-view.json"),JSON.stringify(await benchmarkReading(p,savedUrl,truth),null,2));
  await writeFile(join(dest,"phone-reading.json"),JSON.stringify(await benchmarkReading(p,savedUrl,truth,true),null,2));
  const source = p.locator(".visual").filter({has:p.locator(".barrow")});
  const authoredSize = await source.getAttribute("style");
  const lastCategory = await source.locator(".barrow.selected > span:first-child").textContent();
  await source.getByLabel("Focus mode").click();
  const focusCategory = lastCategory === "A" ? "B" : "A";
  await bar(focusCategory).click();
  await settled();
  await source.getByRole("button",{name:"Back to report"}).click();
  const [focusRevenue,focusProfit] = truth.map.get(focusCategory);
  await kpi(format(focusProfit/focusRevenue));
  assert.equal(await source.getAttribute("style"),authoredSize);
  await pick(lastCategory);
  if (!large) {
    await clearBar();
    await kpi(expected);
    await p.locator(".ribbon [data-action=calculation]").click();
    await p.getByLabel("Name", { exact: true }).fill("Cost");
    await p
      .getByLabel("Left column")
      .selectOption({ label: "Sales · Revenue" });
    await p
      .getByLabel("Right column")
      .selectOption({ label: "Sales · Profit" });
    await p.getByLabel("Operator").selectOption("-");
    await p.getByRole("button", { name: "Create", exact: true }).click();
    await p
      .locator(".visual")
      .filter({ has: p.locator(".barrow") })
      .locator(".vhead")
      .click();
    await p.locator("[data-tab=Build]").click();
    await bind("Category / hierarchy", "Product · Product");
    await p.locator("[data-drill=expand]").click();
    await settled();
    const pair = p.locator(".barrow").filter({hasText:"B › Product 2"});
    assert.equal(Number((await pair.locator("b").innerText()).replace(/[$,]/g,"")),900);
    await pair.click();
    await kpi("10%");
    await p.locator("[data-drill=up]").click();
    await settled();
    await p.locator("[data-drill=next]").click();
    await settled();
    assert.deepEqual((await p.locator(".barrow span:first-child").allTextContents()).sort(), ["Product 1","Product 2"]);
    await p.locator("[data-drill=up]").click();
    await settled();
    await pick("A");
    await p.locator("[data-drill=down]").click();
    await settled();
    assert.equal(
      await p.locator(".barrow span").first().innerText(),
      "Product 1",
    );
    await p.locator("[data-drill=up]").click();
    await settled();
    await p.locator("[data-action=page-add]").click();
    await create("card");
    await bind("Value", "Sales · Cost");
    await kpi("870");
    await p.locator("[data-tab=Filters]").click();
    for (const [scope, column, value, want] of [
      ["report", "Product · Category", "A", "60"],
      ["page", "Date · Date", "2025-01-02", "—"],
      ["visual", "Date · Date", "2025-01-01", "—"],
    ]) {
      await p.locator(`[data-new-filter="${scope}"]`).click();
      await p
        .getByLabel("Field", { exact: true })
        .selectOption({ label: column });
      await p.getByLabel("Equals").fill(value);
      await p.getByRole("button", { name: "Apply", exact: true }).click();
      await kpi(want);
    }
    await p.locator('[data-remove-filter="page:0"]').click();
    await kpi("60");
    await p.locator("[data-action=library]").first().click();
    await p
      .getByRole("button", { name: "Save dashboard", exact: true })
      .click();
    await p.locator("[data-open]").filter({ hasText: "dashboard" }).waitFor();
    await p.getByLabel("Close", { exact: true }).click();
    await p.locator("[data-action=save]").click();
    await p.waitForFunction(
      () => document.querySelector("#save-state").textContent === "Saved",
    );
    await p.reload();
    await kpi("60");
    await p.locator("[data-action=library]").first().click();
    await p.getByRole("button", { name: "New report", exact: true }).click();
    const chooser = p.waitForEvent("filechooser");
    await p
      .getByRole("button", { name: "Get data", exact: true })
      .first()
      .click();
    await (
      await chooser
    ).setFiles([
      {
        name: "Invoices.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          'Buyer,Net amount\r\n"North, Inc.",82\r\nSouth,28\r\n',
        ),
      },
    ]);
    await p.getByTitle("Invoices.Net amount", { exact: true }).waitFor();
    await create("bar");
    await bind("Category / hierarchy", "Invoices · Buyer");
    await bind("Value", "Invoices · Net amount");
    assert.match(
      await p.locator(".barrow").first().innerText(),
      /North, Inc\.[\s\S]*82/,
    );
    summary.extended =
      "Drill, calculated cost, scoped filters, editable second page, dashboard save, reopen, and custom CSV headers passed.";
  }
  console.log(JSON.stringify(summary, null, 2));
  await writeFile(
    join(dest, "measurements.json"),
    JSON.stringify(summary, null, 2),
  );
  if (size === 1000000) {
    assert.ok(summary.filterP95 <= 250, "Warm filter p95 exceeded 250 ms");
    assert.ok(summary.coldOpenMs <= 2000, "Cold report open exceeded 2 seconds");
  }
  if (size === 1000000 && !process.argv.includes("--core-only")) {
    const {benchmarkCalendarPeriod}=await import("./imported-time-bins.mjs");
    await writeFile(join(dest,"calendar-weeks.json"),JSON.stringify(await benchmarkCalendarPeriod(p,truth.daily,dir),null,2));
    await writeFile(join(dest,"calendar-quarters.json"),JSON.stringify(await benchmarkCalendarPeriod(p,truth.daily,dir,true),null,2));
    const {benchmarkBins}=await import("./imported-bins.mjs");
    await writeFile(join(dest,"numeric-bins.json"),JSON.stringify(await benchmarkBins(p,truth.daily),null,2));
    const {benchmarkNumericWindow}=await import("./imported-numeric-trend.mjs");
    await writeFile(join(dest,"numeric-window.json"),JSON.stringify(await benchmarkNumericWindow(p,truth.daily),null,2));
    const { benchmarkEmptyDates } = await import("./empty-items.mjs");
    const sparse = await benchmarkEmptyDates(p, dir);
    await writeFile(join(dest, "empty-dates.json"), JSON.stringify(sparse, null, 2));
    const { benchmarkMeasureFilters } = await import("./measure-filter-workflow.mjs");
    const filtered = await benchmarkMeasureFilters(p, truth.map);
    await writeFile(join(dest, "measure-thresholds.json"), JSON.stringify(filtered, null, 2));
    const { benchmarkStatistics } = await import("./imported-reference-lines.mjs");
    const statistics = await benchmarkStatistics(p, truth.map);
    await writeFile(join(dest, "chart-statistics.json"), JSON.stringify(statistics, null, 2));
    const { benchmarkAreas } = await import("./imported-areas.mjs");
    const areas = await benchmarkAreas(p, truth.daily, dir);
    await writeFile(join(dest,"dense-areas.json"),JSON.stringify(areas,null,2));
    const { benchmarkTrendDrill, benchmarkExpandedAxis } = await import("./imported-trend-drill.mjs");
    const drill = await benchmarkTrendDrill(p, truth.revenueByCategoryDate, dir);
    await writeFile(join(dest,"trend-drill.json"),JSON.stringify(drill,null,2));
    const expanded = await benchmarkExpandedAxis(p, truth.revenueByCategoryDate, dir);
    await writeFile(join(dest,"expanded-axis.json"),JSON.stringify(expanded,null,2));
    const {benchmarkReplacement} = await import("./imported-field-replacement.mjs");
    const replaced = await benchmarkReplacement(p,truth.daily,dir);
    await writeFile(join(dest,"field-replacement.json"),JSON.stringify(replaced,null,2));
    const {benchmarkParameter} = await import("./imported-field-parameter.mjs");
    const switched = await benchmarkParameter(p,truth.map);
    await writeFile(join(dest,"field-parameter.json"),JSON.stringify(switched,null,2));
    const {benchmarkDimension} = await import("./imported-dimension-parameter.mjs");
    await writeFile(join(dest,"dimension-switch.json"),JSON.stringify(await benchmarkDimension(p,truth,dir),null,2));
    const {benchmarkMultiMeasure} = await import("./multi-measure.mjs");
    await writeFile(join(dest,"multi-measure.json"),JSON.stringify(await benchmarkMultiMeasure(p,truth.map),null,2));
    const {benchmarkMatrixHierarchy} = await import("./matrix-parameter.mjs");
    await writeFile(join(dest,"matrix-parameter.json"),JSON.stringify(await benchmarkMatrixHierarchy(p,truth,dir),null,2));
    const {benchmarkMatrixLayout} = await import("./matrix-layout.mjs");
    await writeFile(join(dest,"matrix-layout.json"),JSON.stringify(await benchmarkMatrixLayout(p,truth),null,2));
    const {benchmarkFreeze} = await import("./matrix-freeze.mjs");
    await writeFile(join(dest,"matrix-freeze.json"),JSON.stringify(await benchmarkFreeze(p,truth),null,2));
    const {benchmarkMatrixWidths} = await import("./matrix-widths.mjs");
    await writeFile(join(dest,"matrix-widths.json"),JSON.stringify(await benchmarkMatrixWidths(p),null,2));
    const {benchmarkComboFormats}=await import("./combo-format-benchmark.mjs");
    await writeFile(join(dest,"combo-formats.json"),JSON.stringify(await benchmarkComboFormats(p,truth),null,2));
    const {benchmarkFilterContext}=await import("./filter-context.mjs");
    await writeFile(join(dest,"filter-context.json"),JSON.stringify(await benchmarkFilterContext(p,truth,dir),null,2));
    const {benchmarkChartSelection}=await import("./chart-selection-benchmark.mjs");
    await writeFile(join(dest,"chart-selection.json"),JSON.stringify(await benchmarkChartSelection(p,truth,dir),null,2));
    const {benchmarkRanking}=await import("./imported-ranking.mjs");
    await writeFile(join(dest,"rank-measure.json"),JSON.stringify(await benchmarkRanking(p,truth,dir),null,2));
    const {benchmarkPointColors}=await import("./imported-point-colors.mjs");
    await writeFile(join(dest,"point-colors.json"),JSON.stringify(await benchmarkPointColors(p,truth),null,2));
  }
  console.log("Verified; results at " + dest);
} catch (e) {
  if (p && !p.isClosed()) {
    await p.screenshot({ path: join(dest, "failure.png") });
    console.error(await p.locator("body").innerText());
  }
  throw e;
} finally {
  await stop();
}
