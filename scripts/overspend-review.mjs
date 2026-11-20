import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  addPage,
  art,
  visual,
  save,
  settled,
  capture,
} from "./portfolio-ui.mjs";
const title = "Budget vs. Actual",
  page = "Overspend review",
  matrix = "Spending in over-budget months";
async function csv(name) {
  const [head, ...lines] = (
    await readFile("web/datasets/budget/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  return lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [head.split(",")[i], v])),
  );
}
const [dept, period, budgets, actuals] = await Promise.all(
  ["Department", "Period", "Budget", "Transaction"].map(csv),
);
const pairs = dept.flatMap((d) =>
  period.map((p) => {
    const at = (r) =>
      r.DepartmentKey === d.DepartmentKey && r.PeriodKey === p.PeriodKey;
    const sum = (list, field) =>
      list.length ? list.reduce((n, r) => n + Number(r[field]), 0) : null;
    const budget = sum(budgets.filter(at), "Budget"),
      actual = sum(actuals.filter(at), "Actual");
    return {
      dept: d.Department,
      month: p.Period,
      budget,
      actual,
      variance: (actual ?? 0) - (budget ?? 0),
    };
  }),
);
const tab = (p) => p.locator("#pages .page").filter({ hasText: page });
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
async function pane(p) {
  await art(p, matrix).locator(".vhead").click();
  await p.locator("[data-tab=Filters]").click();
}
async function apply(p, index, name, op, value) {
  await pane(p);
  await p.locator('[data-measure-filter="' + index + '"]').click();
  await p.getByLabel("Measure", { exact: true }).selectOption({ label: name });
  await p.getByLabel("Condition").selectOption(op);
  if (value !== undefined)
    await p.locator("[name=threshold]").fill(String(value));
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
}
async function check(p, wanted) {
  const m = art(p, matrix);
  assert.equal(await m.locator(".err").count(), 0, await m.innerText());
  const lines = await m
    .locator("tbody tr")
    .evaluateAll((rs) =>
      rs.map((r) => [
        JSON.parse(r.dataset.path),
        [...r.querySelectorAll(".cell-value")].map((s) => s.textContent),
      ]),
    );
  const allDepts = new Set(wanted.map((x) => x.dept));
  assert.equal(lines.length, wanted.length + allDepts.size + 1);
  for (const [path, values] of lines) {
    const entries = wanted.filter(
      (r) =>
        (!path.length || r.dept === path[0]) &&
        (path.length < 2 || r.month === path[1]),
    );
    const total = (field) =>
      entries.some((r) => r[field] !== null)
        ? currency.format(entries.reduce((n, r) => n + (r[field] ?? 0), 0))
        : "—";
    assert.deepEqual(
      values,
      [total("budget"), total("actual")],
      JSON.stringify(path),
    );
  }
  return lines;
}
await studio(async (p) => {
  await open(p, title);
  if (!(await tab(p).count())) {
    await addPage(p, page);
    await visual(
      p,
      "card",
      "All budget",
      [],
      ["Budget · Budget"],
      [18, 18, 465, 125],
      "currency",
    );
    await visual(
      p,
      "card",
      "All posted spending",
      [],
      ["Transaction · Actual"],
      [500, 18, 474, 125],
      "currency",
    );
    await visual(
      p,
      "matrix",
      matrix,
      ["Department · Department", "Period · Period"],
      ["Budget · Budget", "Transaction · Actual"],
      [18, 158, 956, 448],
      "currency",
    );
  } else {
    await tab(p).click();
    await settled(p);
  }
  await pane(p);
  while (await p.locator("[data-clear-measure-filter]").count()) {
    await p.locator("[data-clear-measure-filter]").first().click();
    await settled(p);
  }
  await check(p, pairs);
  await apply(p, "new", "Variance", "gt", 0);
  await check(
    p,
    pairs.filter((r) => r.variance > 0),
  );
  await save(p);
});
await studio(async (p) => {
  await open(p, title);
  await tab(p).click();
  await settled(p);
  await check(
    p,
    pairs.filter((r) => r.variance > 0),
  );
  await apply(p, "new", "Budget", "present");
  await check(
    p,
    pairs.filter((r) => r.variance > 0 && r.budget !== null),
  );
  await p.locator('[data-clear-measure-filter="1"]').click();
  await settled(p);
  await apply(p, 0, "Variance", "gte", 100);
  await check(
    p,
    pairs.filter((r) => r.variance >= 100),
  );
  await apply(p, 0, "Variance", "gt", 0);
  const lines = await check(
    p,
    pairs.filter((r) => r.variance > 0),
  );
  assert.equal(
    await art(p, "All budget").locator(".kpi").innerText(),
    "$25,600.00",
  );
  assert.equal(
    await art(p, "All posted spending").locator(".kpi").innerText(),
    "$23,246.00",
  );
  await save(p);
  await capture(p, "budget-overspend-review");
  const address = new URL(p.url()),
    id = address.hash.slice(1).split("/")[0];
  const report = await (
    await p.request.get(new URL("/api/reports/" + id, address).href)
  ).json();
  const url =
    address.origin +
    "/#" +
    id +
    "/page/" +
    report.pages.find((g) => g.name === page).id;
  await p.locator('[data-page="0"]').click();
  await save(p);
  await writeFile(
    "portfolio-evidence/overspend-review.json",
    JSON.stringify(
      { url, positive: pairs.filter((r) => r.variance > 0), matrix: lines },
      null,
      2,
    ) + "\n",
  );
});
console.log(
  "Two-fact matrix reconciled qualified leaves, department subtotals and grand totals under individual and combined rules.",
);
