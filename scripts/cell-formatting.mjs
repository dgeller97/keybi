import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { studio, open, save, art, settled, capture } from "./portfolio-ui.mjs";
const report = "Budget vs. Actual",
  statement = "Operating statement · USD",
  forecast = "Department forecast review";
const below = "#d7eee3",
  above = "#f6d7c8";
async function csv(name) {
  const [head, ...lines] = (
    await readFile("web/datasets/budget/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((v, i) => [head.split(",")[i], v])),
  );
}
const period = await csv("Period"),
  dept = await csv("Department"),
  budgets = await csv("Budget"),
  transactions = await csv("Transaction");
function amount(path) {
  const department = dept.find((d) => d.Department === path[0])?.DepartmentKey,
    month = period.find((d) => d.Period === path[1])?.PeriodKey;
  const match = (r) =>
    (!department || department === r.DepartmentKey) &&
    (!month || month === r.PeriodKey);
  return (
    transactions.filter(match).reduce((n, r) => n + Number(r.Actual), 0) -
    budgets.filter(match).reduce((n, r) => n + Number(r.Budget), 0)
  );
}
async function tab(p, name) {
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
}
async function field(p, title, metric) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({ label: metric });
}
async function rule(p, title, metric) {
  await field(p, title, metric);
  await p.getByLabel("Set background by value").check();
  await p.getByLabel("Below threshold", { exact: true }).fill(below);
  await p.getByLabel("Above threshold", { exact: true }).fill(above);
}
async function cells(p, title) {
  return art(p, title)
    .locator("tbody tr")
    .evaluateAll((trs) =>
      trs.map((tr) => ({
        path: JSON.parse(tr.dataset.path || "null"),
        cells: [...tr.cells].map((td) => ({
          value: td.textContent,
          tone: td.dataset.cellTone || null,
          color: td.style.backgroundColor,
          ink: getComputedStyle(td).color,
        })),
      })),
    );
}
async function verifyStatement(p, scope) {
  const data = await cells(p, statement);
  assert.equal(data.length, 16);
  let colored = 0;
  for (const row of data) {
    const expected = amount(row.path),
      variance = row.cells[3],
      isTotal = row.path.length < 2;
    assert.equal(Number(variance.value.replaceAll(",", "")), expected);
    const paint = scope === "all" || (scope === "detail" ? !isTotal : isTotal);
    assert.equal(
      variance.tone,
      paint ? (expected > 0 ? "above" : "below") : null,
    );
    if (paint) {
      assert.equal(
        variance.color,
        expected > 0 ? "rgb(246, 215, 200)" : "rgb(215, 238, 227)",
      );
      colored++;
    }
    for (const i of [1, 2, 4]) assert.equal(row.cells[i].tone, null);
  }
  return colored;
}
await studio(async (p) => {
  await open(p, report);
  await tab(p, "Variance statement");
  let queries = 0;
  p.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/query") queries++;
  });
  await rule(p, statement, "Variance");
  await p.getByLabel("Color applies to").selectOption("all");
  assert.equal(await verifyStatement(p, "all"), 16);
  await p.getByLabel("Color applies to").selectOption("detail");
  assert.equal(await verifyStatement(p, "detail"), 12);
  await p.getByLabel("Color applies to").selectOption("totals");
  assert.equal(await verifyStatement(p, "totals"), 4);
  await p.getByLabel("Color applies to").selectOption("all");
  assert.equal(queries, 0);
  await tab(p, "Forecast review");
  await field(p, forecast, "Actual less forecast");
  const style = p.getByLabel("Background style");
  if (!(await style.count()) || (await style.inputValue()) === "rule") {
    await rule(p, forecast, "Actual less forecast");
    await p.getByLabel("Color applies to").selectOption("all");
  }
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  assert.equal(await verifyStatement(p, "all"), 16);
  await field(p, statement, "Budget");
  await p.getByLabel("Set background by value").check();
  const threshold = p.getByLabel("Rule threshold", { exact: true });
  await threshold.fill("1200");
  await threshold.press("Tab");
  const groups = await cells(p, statement);
  assert.equal(
    groups.find((r) => r.path.join("/") === "Facilities/2026-02").cells[1].tone,
    null,
  );
  assert.equal(
    groups.find((r) => r.path.join("/") === "Facilities/2026-04").cells[1].tone,
    null,
  );
  await p.getByLabel("Set background by value").uncheck();
  await field(p, statement, "Variance %");
  await p.getByLabel("Set background by value").check();
  const pct = p.getByLabel("Rule threshold (%)", { exact: true });
  await pct.fill("4");
  await pct.press("Tab");
  const percentage = await cells(p, statement);
  assert.equal(
    percentage.find((r) => r.path.join("/") === "Surgery/2026-01").cells[4]
      .tone,
    "below",
  );
  assert.equal(
    percentage.find((r) => r.path.join("/") === "Facilities").cells[4].tone,
    "above",
  );
  await p.getByLabel("Set background by value").uncheck();
  await tab(p, "Period comparison");
  const pivot = "Variance by department and period";
  await rule(p, pivot, "Variance");
  await p.getByLabel("Color applies to").selectOption("totals");
  assert.equal(await art(p, pivot).locator("[data-cell-tone]").count(), 8);
  const pivotRows = await cells(p, pivot);
  for (const row of pivotRows) {
    for (const [i, c] of row.cells.slice(1).entries()) {
      assert.equal(!!c.tone, row.path.length === 0 || i === 4);
    }
  }
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-remove-field="groups:0"]').click();
  await settled(p);
  assert.equal(await art(p, pivot).locator("[data-cell-tone]").count(), 1);
  await tab(p, "Ledger evidence");
  await rule(p, "Posted transactions", "Actual");
  const table = art(p, "Posted transactions");
  assert.ok(await table.locator("[data-cell-tone=above]").count());
  await p.getByLabel("Above threshold", { exact: true }).fill("#152a30");
  assert.equal(
    await table
      .locator("[data-cell-tone=above]")
      .first()
      .evaluate((td) => getComputedStyle(td).color),
    "rgb(255, 255, 255)",
  );
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-well=metrics] [data-agg]").selectOption("max");
  await settled(p);
  assert.ok(await table.locator("[data-cell-tone=above]").count());
  await tab(p, "Forecast review");
  await field(p, forecast, "Actual less forecast");
  await p.getByLabel("Background style").selectOption("rule");
  const findings = await cells(p, forecast);
  assert.deepEqual(
    findings.map((r) => [r.path[0] || "Grand total", r.cells[3].tone]),
    [
      ["Facilities", "above"],
      ["Medicine", "below"],
      ["Surgery", "below"],
      ["Grand total", "below"],
    ],
  );
  await art(p, forecast).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p
    .getByLabel("Apply to measure")
    .selectOption({ label: "Actual less forecast" });
  await p.mouse.move(1, 1);
  await capture(p, "budget-variance-rules");
  await writeFile(
    "portfolio-evidence/cell-formatting.json",
    JSON.stringify(
      {
        statementColored: { all: 16, detail: 12, totals: 4 },
        pivotTotals: 8,
        queryCountForFormatting: 0,
        forecast: findings.map((r) => [
          r.path,
          r.cells[3].value,
          r.cells[3].tone,
        ]),
        equalAndBlank: "uncolored",
        percentThreshold: 4,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Field rules matched 16 independently calculated variances, all row and column totals, blank and equal cells, a percentage threshold, and a detail table after changing its aggregation.",
  );
});
