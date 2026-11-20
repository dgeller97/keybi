import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { studio, open, settled, art, save, capture } from "./portfolio-ui.mjs";
const budget = "Budget vs. Actual",
  purchase = "Purchasing commitments",
  detail = "Purchase order lines",
  matrix = "Posted spending and commitments",
  gallery = "Visual Gallery",
  galleryTable = "Period and region detail";
async function tab(p, name) {
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
}
async function field(p, title, name) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({ label: name });
}
async function number(p, label, n) {
  const input = p.getByLabel(label, { exact: true });
  await input.fill(String(n));
  await input.press("Tab");
}
async function bars(p, title, name, min, max) {
  await field(p, title, name);
  await p.getByLabel("Show data bars").check();
  await number(p, "Bar minimum", min);
  await number(p, "Bar maximum", max);
}
function close(a, b) {
  assert.ok(Math.abs(a - b) <= 0.55, a + " vs " + b);
}
async function geometry(cell, value, min, max) {
  const g = await cell.evaluate((td) => {
    const track = getComputedStyle(td, "::after"),
      axis = getComputedStyle(td, "::before");
    return {
      side: td.dataset.cellBar,
      left: parseFloat(track.left),
      width: parseFloat(track.width),
      axis: parseFloat(axis.left),
      cell: td.clientWidth,
      color: track.backgroundColor,
      text: td.textContent,
    };
  });
  const relative = (n) => (g.cell * (n - min)) / (max - min),
    zero = relative(0),
    end = relative(Math.max(min, Math.min(max, value)));
  assert.equal(
    g.side,
    value === 0 ? "zero" : value < 0 ? "negative" : "positive",
  );
  close(g.left, Math.min(zero, end));
  close(g.width, Math.abs(zero - end));
  close(g.axis, Math.min(zero, g.cell - 1));
  return {
    value,
    left: g.left,
    width: g.width,
    axis: g.axis,
    cellWidth: g.cell,
    color: g.color,
  };
}
await studio(async (p) => {
  await open(p, budget);
  await tab(p, purchase);
  let queries = 0;
  p.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/query") queries++;
  });
  await bars(p, detail, "Amount", -25, 200);
  await bars(p, matrix, "Open commitments", 0, 200);
  await p.getByLabel("Bars apply to").selectOption("detail");
  assert.equal(queries, 0);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, gallery);
  await tab(p, "Detail");
  await bars(p, galleryTable, "Revenue", 0, 800);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const ledger = (await readFile("web/datasets/budget/Commitments.csv", "utf8"))
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((r) => r.split(","));
const results = {};
await studio(async (p) => {
  await open(p, budget);
  await tab(p, purchase);
  const input = art(p, "Purchasing period").locator("select");
  for (const [n, label] of [
    ["3", "2026-03"],
    ["4", "2026-04"],
  ]) {
    await input.selectOption({ label });
    await settled(p);
    const rows = art(p, detail).locator("tbody tr"),
      geometryRows = [];
    for (const order of ledger.filter((r) => r[0] === n)) {
      const row = rows.filter({ hasText: order[2] }),
        cell = row.locator("td").last();
      if (order[4] === "") {
        assert.equal(await cell.getAttribute("data-cell-bar"), null);
        assert.equal(await cell.textContent(), "—");
        continue;
      }
      const g = await geometry(cell, Number(order[4]), -25, 200);
      assert.equal(
        g.color,
        Number(order[4]) < 0 ? "rgb(174, 80, 53)" : "rgb(57, 118, 94)",
      );
      geometryRows.push(g);
    }
    results[label] = geometryRows;
  }
  const total = art(p, matrix).locator(".matrix-total td").last();
  assert.equal(await total.getAttribute("data-cell-bar"), null);
  await field(p, matrix, "Open commitments");
  await p.getByLabel("Bars apply to").selectOption("totals");
  assert.equal(await art(p, matrix).locator("[data-cell-bar]").count(), 1);
  results.clippedTotal = await geometry(total, 349.96, 0, 200);
  await p.getByLabel("Bars apply to").selectOption("all");
  assert.equal(await art(p, matrix).locator("[data-cell-bar]").count(), 4);
  await p.getByLabel("Bars apply to").selectOption("detail");
  await p.getByLabel("Show bar only").check();
  const first = art(p, matrix)
    .locator("tbody tr")
    .filter({ hasText: "Facilities" })
    .locator("td")
    .last();
  assert.equal(await first.getAttribute("title"), "$75.21");
  await first.getByRole("button", { name: "$75.21", exact: true }).focus();
  await p.keyboard.press("Enter");
  await settled(p);
  assert.equal(
    await art(p, "Committed amount").locator(".kpi").textContent(),
    "$75.21",
  );
  await art(p, matrix).locator("[data-clear]").click();
  await settled(p);
  await field(p, matrix, "Open commitments");
  await p.getByLabel("Show bar only").uncheck();
  await field(p, detail, "Amount");
  await p.getByLabel("Set background by value").check();
  assert.equal(
    await art(p, detail)
      .locator('[data-cell-tone="below"][data-cell-bar="negative"]')
      .count(),
    1,
  );
  await p.getByLabel("Set background by value").uncheck();
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-well="metrics"] [data-agg]').selectOption("max");
  await settled(p);
  assert.equal(await art(p, detail).locator("[data-cell-bar]").count(), 5);
  await p.locator('[data-well="metrics"] [data-agg]').selectOption("sum");
  await settled(p);
  await p.locator("#paper").click({ position: { x: 5, y: 5 } });
  await capture(p, "budget-data-bars");
});
await studio(async (p) => {
  await open(p, gallery);
  await tab(p, "Detail");
  const table = art(p, galleryTable);
  const source = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","));
  const months = new Set(source.map((r) => r[0]));
  results.gallery = {};
  for (const month of months) {
    const rows = source.filter((r) => r[0] === month);
    const expected = rows.reduce((n, r) => n + Number(r[4]), 0);
    results.gallery[month] = await geometry(
      table.locator("tbody tr").filter({ hasText: month }).locator("td").last(),
      expected,
      0,
      800,
    );
  }
});
await writeFile(
  "portfolio-evidence/data-bars.json",
  JSON.stringify(results, null, 2) + "\n",
);
console.log(
  "Signed bar geometry, unchanged limits across slicer selections, nulls, clipped totals, independent color rules, aggregation changes and saved Gallery bars passed.",
);
