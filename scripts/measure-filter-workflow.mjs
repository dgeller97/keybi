import assert from "node:assert/strict";
import { configureLine, formatChart, verifyGeometry } from "./reference-geometry.mjs";
import {
  studio,
  open,
  rename,
  visual,
  art,
  measure,
  save,
  settled,
  setInput,
  addPage,
} from "./portfolio-ui.mjs";
const title = "Dispatch attainment",
  table = "Qualifying lanes",
  chart = "Lowest qualifying periods",
  matrix = "Period detail",
  source = "Select a period";
const lane = (k) => "L" + String(k).padStart(2, "0");
const lanes = Array.from({ length: 64 }, (_, i) => i + 1);
async function edit(p, name, percent, index = "new") {
  await art(p, name).locator(".vhead").click();
  await p.locator("[data-tab=Filters]").click();
  await p.locator('[data-measure-filter="' + index + '"]').click();
  await p
    .getByLabel("Measure", { exact: true })
    .selectOption({ label: "Fill rate" });
  await p.getByLabel("Condition").selectOption("gte");
  await p.getByLabel("Threshold (%)").fill(String(percent));
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
}
const shown = (p) =>
  art(p, table)
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
const summaries = (keys) => keys.map((k) => [lane(k), String(4 * k)]);
export async function benchmarkMeasureFilters(p, totals) {
  await addPage(p, "Margin thresholds");
  await visual(
    p,
    "table",
    "Revenue by category",
    ["Product · Category"],
    ["Sales · Revenue"],
    [18, 18, 920, 460],
  );
  await p.locator("[data-tab=Filters]").click();
  const sorted = [...totals]
    .map(([category, [revenue, profit]]) => ({
      category,
      revenue,
      percent: (100 * profit) / revenue,
    }))
    .sort((a, b) => a.percent - b.percent);
  const cuts = [6, 9].map(
    (i) => (sorted[i - 1].percent + sorted[i].percent) / 2,
  );
  const samples = [];
  for (const value of [...cuts, ...cuts]) {
    const index = samples.length ? "0" : "new";
    await p.locator('[data-measure-filter="' + index + '"]').click();
    await p
      .getByLabel("Measure", { exact: true })
      .selectOption({ label: "Margin" });
    await p.getByLabel("Condition").selectOption("gte");
    await p.getByLabel("Threshold (%)").fill(String(value));
    const response = p.waitForResponse((r) => r.url().endsWith("/api/query"));
    const elapsed = await p
      .locator("dialog button[type=submit]")
      .evaluate(async (el) => {
        const start = performance.now();
        el.click();
        do {
          await new Promise(requestAnimationFrame);
        } while (document.querySelector("#paper").dataset.pending !== "false");
        return performance.now() - start;
      });
    const [result] = await (await response).json();
    const required = sorted
      .filter((r) => r.percent >= value)
      .sort((a, b) => a.category.localeCompare(b.category));
    assert.deepEqual(
      result.rows.map(([name, rev]) => [name, Math.round(rev * 100)]),
      required.map((r) => [r.category, r.revenue]),
    );
    assert.deepEqual(
      await p.locator(".grid tbody tr td:first-child").allTextContents(),
      required.map((r) => r.category),
    );
    samples.push({
      percent: value,
      categories: required.length,
      queryMs: result.ms,
      cached: result.cache,
      displayMs: elapsed,
    });
  }
  return samples;
}
export async function verifyMeasureFilters() {
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "Which lanes met the fill threshold?");
    const choice = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await choice
    ).setFiles({
      name: "Loads.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        [
          "Lane,Period,Loaded,Capacity",
          ...lanes.flatMap((k) => [
            lane(k) + ",Jan," + k + ",100",
            lane(k) + ",Feb," + 3 * k + ",100",
          ]),
        ].join("\n"),
      ),
    });
    await p
      .getByTitle("Loads.Capacity", { exact: true })
      .waitFor({ state: "attached" });
    await measure(p, "Fill rate", "Loads · Loaded", "Loads · Capacity");
    await visual(
      p,
      "table",
      table,
      ["Loads · Lane"],
      ["Loads · Loaded"],
      [18, 18, 430, 370],
    );
    await edit(p, table, 60);
    assert.deepEqual(await shown(p), summaries(lanes.slice(29, 54)));
    await art(p, table).locator('[data-page-delta="1"]').click();
    await settled(p);
    assert.deepEqual(await shown(p), summaries(lanes.slice(54)));
    await edit(p, table, 120, 0);
    assert.deepEqual(await shown(p), summaries(lanes.slice(59)));
    await p.locator('[data-measure-filter="new"]').click();
    await p.getByLabel("Measure", {exact:true}).selectOption({label:"Loaded"});
    await p.getByLabel("Condition").selectOption("gt");
    await p.getByLabel("Threshold", {exact:true}).fill("250");
    await p.locator("dialog button[type=submit]").click();
    await settled(p);
    await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Aggregation").selectOption("avg");
    await settled(p);
    assert.deepEqual(await shown(p), [["L63","126"],["L64","128"]]);
    await p.getByLabel("Aggregation").selectOption("sum");
    await p.locator("[data-tab=Filters]").click();
    await p.locator('[data-clear-measure-filter="1"]').click(); await settled(p);
    await visual(
      p,
      "clusteredColumn",
      chart,
      ["Loads · Lane"],
      ["Loads · Loaded"],
      [470, 18, 502, 370],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=legendFields]")
      .selectOption({ label: "Loads · Period" });
    await p.locator("#rank-order").selectOption("asc");
    await setInput(p, "#rank-limit", 3);
    await edit(p, chart, 100);
    await formatChart(p,chart);
    await configureLine(p,"primary",{statistic:"median",measure:"Loaded",name:"Ranked median"});
    await verifyGeometry(art(p,chart),"primary",105,false,"Ranked median");
    await visual(
      p,
      "matrix",
      matrix,
      ["Loads · Lane"],
      ["Fill rate"],
      [18, 406, 600, 320],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=columns]")
      .selectOption({ label: "Loads · Period" });
    await edit(p, matrix, 120);
    await visual(
      p,
      "bar",
      source,
      ["Loads · Period"],
      ["Loads · Loaded"],
      [640, 406, 332, 200],
    );
    await p.getByLabel("Interaction with " + chart).selectOption("highlight");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    assert.deepEqual(await shown(p), summaries(lanes.slice(59)));
    const marks = art(p, chart).locator("[data-point]");
    const get = () =>
      marks.evaluateAll((es) =>
        es.map((e) => [
          e.getAttribute("aria-label").match(/L\d+/)[0],
          e.dataset.value,
        ]),
      );
    const ranked = [34, 35, 36].map((k) => [lane(k), String(3 * k)]);
    assert.deepEqual(await get(), ranked);
    const rows = await art(p, matrix)
      .locator("tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    assert.deepEqual(rows, [
      ...lanes
        .slice(59)
        .map((k) => [lane(k), 3 * k + "%", k + "%", 2 * k + "%"]),
      ["Grand total", "186%", "62%", "124%"],
    ]);
    await art(p, source).locator(".barrow").filter({ hasText: "Jan" }).click();
    await settled(p);
    assert.deepEqual(await get(), ranked);
    assert.equal(await art(p, chart).locator(".highlight-value").count(), 0);
    await verifyGeometry(art(p,chart),"primary",105,false,"Ranked median");
    await art(p, source).locator(".barrow").filter({ hasText: "Feb" }).click();
    await settled(p);
    assert.equal(await art(p, chart).locator(".highlight-value").count(), 3);
    await verifyGeometry(art(p,chart),"primary",105,false,"Ranked median");
  });
  console.log(
    "Hidden ratio filters qualified all 64 lanes before paging and ranking. Matrix totals, cross-highlights and saved conditions reconciled after reopening.",
  );
}
