import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  art,
  save,
  settled,
  capture,
  setInput,
} from "./portfolio-ui.mjs";
import {
  formatChart,
  configureLine,
  verifyGeometry,
} from "./reference-geometry.mjs";
const hospital = "Hospital Operations",
  page = "Attainment exceptions",
  chart = "Attainment on recorded days",
  label = "Review threshold";
const monthly = "Monthly encounter volume and target attainment",
  gallery = "Visual Gallery",
  scatter = "Orders and revenue";
const go = async (p, name) => {
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
};
async function set(p, axis, options) {
  const existing = await p
    .locator("[data-edit-reference]")
    .filter({ hasText: options.name })
    .count();
  await configureLine(p, axis, options, existing ? options.name : null);
}
const proof = {};
const source =
  "Attainment exceptions / Dates below the review threshold / Within 45 minutes";
await studio(async (p) => {
  await open(p, hospital);
  await go(p, page);
  await formatChart(p, chart);
  const plot = art(p, chart);
  const before = await plot
    .locator("[data-point]")
    .evaluateAll((ms) => ms.map((m) => m.dataset.value));
  let requests = 0;
  const count = (r) => {
    if (r.url().endsWith("/api/query")) requests++;
  };
  p.on("request", count);
  await set(p, "primary", { name: label, value: 60, source });
  await set(p, "primary", {
    name: "Median day",
    statistic: "median",
    measure: "Within 45 minutes",
    position: "start",
    color: "#355b99",
    pattern: "dotted",
  });
  proof.harbor = await verifyGeometry(plot, "primary", 0.6, false, label);
  assert.deepEqual(
    await plot
      .locator("[data-point]")
      .evaluateAll((ms) => ms.map((m) => m.dataset.value)),
    before,
  );
  await setInput(p, '[data-axis-key="primary"][data-bound="max"]', "0.5");
  await settled(p);
  assert.equal(await plot.locator("[data-reference]").count(), 0);
  await setInput(p, '[data-axis-key="primary"][data-bound="max"]', "1");
  await settled(p);
  proof.fixed = await verifyGeometry(plot, "primary", 0.6, false, label);
  await setInput(p, '[data-axis-key="primary"][data-bound="max"]', "");
  await settled(p);
  assert.equal(requests, 0);
  p.off("request", count);
  proof.formattingQueries = requests;
  await go(p, "Volume and attainment");
  await formatChart(p, monthly);
  await set(p, "secondary", { name: label, value: 60, source });
  proof.combo = await verifyGeometry(
    art(p, monthly),
    "secondary",
    0.6,
    false,
    label,
  );
  await go(p, page);
  await save(p);
});
await studio(async (p) => {
  await open(p, hospital);
  await go(p, page);
  const plot = art(p, chart);
  async function threshold(op, value) {
    await art(p, "Dates below the review threshold")
      .locator("[data-view-filters]")
      .click();
    await p.locator('[data-measure-filter="0"]').click();
    await p.getByLabel("Condition").selectOption(op);
    if (value !== undefined)
      await p.getByLabel("Threshold (%)").fill(String(value));
    await p.locator("dialog button[type=submit]").click();
    await settled(p);
  }
  await threshold("lt", 50);
  proof.changedThreshold = await verifyGeometry(
    plot,
    "primary",
    0.5,
    false,
    label,
  );
  assert.deepEqual(
    await art(p, "Dates below the review threshold")
      .locator("tbody tr td:first-child")
      .allTextContents(),
    ["2026-03-05"],
  );
  await go(p, "Volume and attainment");
  await verifyGeometry(art(p, monthly), "secondary", 0.5, false, label);
  await go(p, page);
  await threshold("blank");
  assert.equal(
    await plot.getByRole("img", { name: /^Review threshold/ }).count(),
    0,
  );
  await verifyGeometry(plot, "primary", 7 / 12, false, "Median day");
  await threshold("lt", 60);
  const csv = async (n) =>
    (await readFile("web/datasets/hospital/" + n + ".csv", "utf8"))
      .trim()
      .split(/\r?\n/);
  const [dates, facts] = await Promise.all([csv("Calendar"), csv("Encounter")]);
  const records = facts
    .slice(1)
    .map((l) => l.split(","))
    .filter((r) => r[3] === "Routine" && r[4] === "Closed");
  const days = new Map(
    dates.slice(1).map((l) => {
      const [key, day] = l.split(",");
      return [key, day];
    }),
  );
  proof.sites = {};
  proof.dailyStatistics = {};
  await plot.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Show items with no data", { exact: true }).check();
  await settled(p);
  for (const site of ["Cedar", "Harbor", "Ridge"]) {
    await art(p, "Review site").locator("select").selectOption({ label: site });
    await settled(p);
    for (const month of ["2026-01", "2026-02", "2026-03", "2026-04"]) {
      await art(p, "Review month")
        .locator("select")
        .selectOption({ label: month });
      await settled(p);
      const stats = new Map();
      for (const r of records.filter(
        (r) => r[2] === site && days.get(r[1]).startsWith(month),
      )) {
        const day = days.get(r[1]),
          pair = stats.get(day) || [0, 0];
        pair[0] += Number(r[6]);
        pair[1] += Number(r[7]);
        stats.set(day, pair);
      }
      const y = (await verifyGeometry(plot, "primary", 0.6, false, label))
        .coordinate;
      const marks = await plot
        .locator("[data-point]")
        .evaluateAll((ms) =>
          ms.map((m) => [
            m.getAttribute("aria-label").match(/\d{4}-\d{2}-\d{2}/)[0],
            Number(m.dataset.value),
            +m.querySelector("rect").getAttribute("y"),
          ]),
        );
      assert.equal(marks.length, stats.size);
      const rates = [...stats.values()]
        .map(([met, visits]) => met / visits)
        .sort((a, b) => a - b);
      const median =
        (rates[Math.floor((rates.length - 1) / 2)] +
          rates[Math.floor(rates.length / 2)]) /
        2;
      const totals = [...stats.values()].reduce(
        ([a, b], [met, visits]) => [a + met, b + visits],
        [0, 0],
      );
      await verifyGeometry(plot, "primary", median, false, "Median day");
      const datesInMonth = [...days.values()].filter((day) =>
        day.startsWith(month),
      ).length;
      const ticks = await plot.locator("svg text").allTextContents();
      assert.ok(
        ticks.some((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !stats.has(d)),
      );
      const pooled = new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(totals[0] / totals[1]);
      assert.equal(
        await art(p, "Overall site attainment").locator(".kpi").innerText(),
        pooled,
      );
      proof.dailyStatistics[site + " " + month] = {
        days: rates.length,
        emptyDates: datesInMonth - rates.length,
        rates,
        median,
        pooled: totals[0] / totals[1],
      };
      for (const [day, value, top] of marks) {
        const [met, visits] = stats.get(day);
        assert.ok(Math.abs(value - met / visits) < 1e-10);
        if (Math.abs(value - 0.6) > 1e-10)
          assert.equal(top > y, met / visits < 0.6);
      }
      proof.sites[site + " " + month] = marks
        .filter(([, value]) => value < 0.6)
        .map(([day]) => day);
    }
  }
  await art(p, "Review month")
    .locator("select")
    .selectOption({ label: "2026-03" });
  await art(p, "Review site")
    .locator("select")
    .selectOption({ label: "Harbor" });
  await settled(p);
  await plot.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Show items with no data", { exact: true }).uncheck();
  await settled(p);
  await formatChart(p, chart);
  const oldHeight = await p.locator('[data-dim="h"]').inputValue();
  await setInput(p, '[data-dim="h"]', Number(oldHeight) + 70);
  await settled(p);
  proof.resized = await verifyGeometry(plot, "primary", 0.6, false, label);
  await setInput(p, '[data-dim="h"]', oldHeight);
  await settled(p);
  await plot.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await save(p);
  await capture(p, "hospital-reference-line");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, gallery);
  await go(p, "Distributions");
  await formatChart(p, scatter);
  await set(p, "x", {
    name: "Order benchmark",
    value: 25,
    pattern: "dotted",
    color: "#31518b",
  });
  await set(p, "primary", {
    name: "Revenue benchmark",
    value: 300,
    pattern: "dashed",
    color: "#91452e",
    position: "start",
  });
  await formatChart(p, "Target by market and period");
  await set(p, "primary", {
    name: "P75 revenue",
    statistic: "percentile",
    measure: "Revenue",
    percentile: 75,
    color: "#355b99",
    position: "start",
  });
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, gallery);
  await go(p, "Distributions");
  const plot = art(p, scatter);
  proof.scatterX = await verifyGeometry(plot, "x", 25, true, "Order benchmark");
  proof.scatterY = await verifyGeometry(
    plot,
    "primary",
    300,
    false,
    "Revenue benchmark",
  );
  // Six region/month revenues from the dispatch CSV are 214, 216, 271, 298, 349 and 383.
  proof.bubbleP75 = await verifyGeometry(
    art(p, "Target by market and period"),
    "primary",
    336.25,
    false,
    "P75 revenue",
  );
  await capture(p, "gallery-reference-lines");
});
await writeFile(
  "portfolio-evidence/reference-lines.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(
  "Daily, secondary-axis, and scatter reference geometry matched chart scales after filtering, resizing and reopening. Line formatting issued zero queries.",
);
