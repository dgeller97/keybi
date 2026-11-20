import assert from "node:assert/strict";
import { rows } from "./portfolio-data.mjs";
import { art, capture, settled } from "./portfolio-ui.mjs";
const fmt = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(n);
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const percent = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(n);
function ledger(d, m) {
  const filter = (r) =>
    (d == null || r.DepartmentKey === d) && (m == null || r.PeriodKey === m);
  const b = rows.Budget.filter(filter),
    a = rows.Transaction.filter(filter);
  const budget = b.reduce((s, r) => s + r.Budget, 0),
    actual = a.reduce((s, r) => s + r.Actual, 0);
  return [
    b.length ? budget : null,
    a.length ? actual : null,
    actual - budget,
    budget ? (actual - budget) / budget : null,
  ];
}
function quantile(rs, q) {
  const v = rs.map((r) => r.Wait).sort((a, b) => a - b),
    pos = (v.length - 1) * q,
    lo = Math.floor(pos);
  return v[lo] + (v[Math.ceil(pos)] - v[lo]) * (pos - lo);
}
async function budget(p) {
  const records = await p
    .locator(".matrix tbody tr")
    .evaluateAll((rs) =>
      rs.map((r) => ({
        path: JSON.parse(r.dataset.path),
        cells: [...r.cells].slice(1).map((c) => c.textContent),
      })),
    );
  assert.equal(records.length, 16);
  for (const { path, cells } of records) {
    const d = rows.Department.find(
        (d) => d.Department === path[0],
      )?.DepartmentKey,
      m = rows.Period.find((m) => m.Period === path[1])?.PeriodKey;
    const [b, a, v, r] = ledger(d, m);
    assert.deepEqual(
      cells,
      [fmt(b), fmt(a), fmt(v), percent(r)],
      JSON.stringify(path),
    );
  }
  assert.deepEqual(
    await p.locator(".kpi").allTextContents(),
    ledger().slice(0, 3).map(money),
  );
  await capture(p, "budget-statement");
  await p.locator('[data-page="1"]').click();
  await settled(p);
  const names = await p
    .locator(".matrix thead tr")
    .first()
    .locator("th")
    .allTextContents();
  assert.deepEqual(names, [
    "Department",
    ...rows.Period.map((r) => r.Period),
    "Total",
  ]);
  const grid = await p
    .locator(".matrix tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  for (const [name, ...values] of grid) {
    const d = rows.Department.find((r) => r.Department === name)?.DepartmentKey;
    assert.deepEqual(values, [
      ...rows.Period.map((m) => money(ledger(d, m.PeriodKey)[2])),
      money(ledger(d)[2]),
    ]);
  }
  await capture(p, "budget-periods");
  await p.locator('[data-page="0"]').click();
  await settled(p);
}
async function ledgerEvidence(p) {
  const statement = art(p, "Operating statement · USD");
  const april = statement
    .locator("tr[data-path]")
    .filter({ has: p.getByText("2026-04", { exact: true }) })
    .first();
  await april.locator("td").nth(2).locator("button").click();
  await settled(p);
  await statement.locator("[data-through]").click();
  await settled(p);
  let table = art(p, "Posted transactions");
  const expected = rows.Transaction.filter(
    (r) => r.DepartmentKey === 1 && r.PeriodKey === 4,
  );
  assert.deepEqual(
    await table
      .locator("tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      ),
    expected.map((r) => [
      r.Transaction,
      "Facilities",
      "2026-04",
      fmt(r.Actual),
    ]),
  );
  assert.equal(await art(p, "Budget lines").locator("tbody tr").count(), 0);
  await capture(p, "budget-unbudgeted-evidence");
  await p.locator("[data-action=drill-back]").click();
  await settled(p);
  assert.equal(
    await statement.locator(".matrix-cell[aria-pressed=true]").count(),
    4,
  );
  await statement.locator("[data-clear]").click();
  await p.locator('[data-page="1"]').click();
  await settled(p);
  const pivot = art(p, "Variance by department and period");
  const medicine = pivot
    .locator("tr")
    .filter({ has: p.getByText("Medicine", { exact: true }) });
  await medicine.locator("td").nth(3).locator("button").click();
  await pivot.locator("[data-through]").click();
  await settled(p);
  assert.deepEqual(
    await art(p, "Budget lines").locator("tbody td").allTextContents(),
    ["Medicine", "2026-03", "2,300"],
  );
  assert.deepEqual(
    await art(p, "Posted transactions")
      .locator("tbody tr td:first-child")
      .allTextContents(),
    rows.Transaction.filter((r) => r.DepartmentKey === 2 && r.PeriodKey === 3)
      .map((r) => r.Transaction)
      .sort(),
  );
  await capture(p, "budget-ledger");
  await p.locator("[data-action=drill-back]").click();
  await settled(p);
  await pivot.locator("[data-clear]").click();
  await p.locator('[data-page="0"]').click();
  await settled(p);
}
async function ranking(p) {
  const chart = art(p, "Five clinics with longest P90");
  function ref(records) {
    const by = new Map();
    for (const r of records) {
      if (!by.has(r.Clinic)) by.set(r.Clinic, []);
      by.get(r.Clinic).push(r);
    }
    return [...by]
      .map(([clinic, v]) => [clinic, quantile(v, 0.9)])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5);
  }
  async function compare(records) {
    await settled(p);
    const expected = ref(records);
    assert.deepEqual(
      await chart
        .locator(".barrow")
        .evaluateAll((rs) =>
          rs.map((r) => [
            r.firstElementChild.textContent,
            r.lastElementChild.textContent,
          ]),
        ),
      expected.map(([name, n]) => [name, fmt(n)]),
    );
    assert.equal(
      await art(p, "P90 in selection · minutes").locator(".kpi").textContent(),
      fmt(quantile(records, 0.9)),
    );
    return expected;
  }
  const all = await compare(rows.Referral);
  await capture(p, "service-ranking");
  const scope = rows.Referral.filter((r) => r.Period === "2026-02");
  await art(p, "Review period").getByText("2026-02", { exact: true }).click();
  const month = await compare(scope);
  assert.notDeepEqual(all, month);
  const name = month[0][0];
  await chart.locator(".barrow").filter({ hasText: name }).click();
  await chart.locator("[data-through]").click();
  await settled(p);
  assert.deepEqual(
    await p
      .locator(".grid tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      ),
    scope
      .filter((r) => r.Clinic === name)
      .map((r) => [r.Referral, r.Clinic, r.Period, String(r.Wait)]),
  );
  await capture(p, "service-referrals");
  await p.locator("[data-action=drill-back]").click();
  await settled(p);
  await chart.locator("[data-clear]").click();
  await art(p, "Review period").locator("[data-clear]").click();
  await compare(rows.Referral);
}
async function waitTimes(p) {
  const visits = rows.Visit;
  async function compare(rs) {
    await settled(p);
    assert.equal(
      await art(p, "Median wait · minutes").locator(".kpi").innerText(),
      fmt(quantile(rs, 0.5)),
    );
    assert.equal(
      await art(p, "90th percentile · minutes").locator(".kpi").innerText(),
      fmt(quantile(rs, 0.9)),
    );
  }
  await compare(visits);
  for (const service of new Set(visits.map((r) => r.Service))) {
    const group = visits.filter((r) => r.Service === service);
    assert.equal(
      await art(p, "90th percentile by service")
        .locator(".barrow")
        .filter({ hasText: service })
        .locator("b")
        .innerText(),
      fmt(quantile(group, 0.9)),
    );
  }
  for (const band of new Set(visits.map((r) => r["Wait band"])))
    assert.equal(
      await art(p, "Visits by wait band")
        .locator(".barrow")
        .filter({ hasText: band })
        .locator("b")
        .innerText(),
      String(visits.filter((r) => r["Wait band"] === band).length),
    );
  for (const tr of await art(p, "Wait performance by period")
    .locator("tbody tr")
    .all()) {
    const [month, ...values] = await tr.locator("td").allTextContents(),
      rs = visits.filter((r) => r.Period === month);
    assert.deepEqual(values, [
      fmt(quantile(rs, 0.5)),
      fmt(quantile(rs, 0.9)),
      String(rs.length),
    ]);
  }
  await capture(p, "wait-summary");
  await art(p, "Period").getByText("2026-04", { exact: true }).click();
  await compare(visits.filter((r) => r.Period === "2026-04"));
  const chart = art(p, "90th percentile by service");
  await chart.locator(".barrow").filter({ hasText: "Review" }).click();
  const subset = visits.filter(
    (r) => r.Service === "Review" && r.Period === "2026-04",
  );
  await compare(subset);
  await chart.locator("[data-through]").click();
  await settled(p);
  assert.deepEqual(
    await p
      .locator(".grid tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      ),
    subset.map((r) => [
      r.Record,
      r.Service,
      r.Period,
      r["Wait band"],
      String(r.Wait),
    ]),
  );
  await capture(p, "wait-drillthrough");
  await p.locator("[data-action=drill-back]").click();
  await compare(subset);
  await chart.locator("[data-clear]").click();
  await art(p, "Period").locator("[data-clear]").click();
  await compare(visits);
  await p.locator('[data-page="1"]').click();
  await settled(p);
  assert.equal(await p.locator(".grid tbody tr").count(), 25);
  await capture(p, "wait-detail");
  await p.locator('[data-page="0"]').click();
  await settled(p);
}
export async function verifyAdvanced(p, i) {
  if (i === 2) {
    await budget(p);
    if (process.argv.includes("--ledger")) await ledgerEvidence(p);
    return;
  }
  if (i === 3) return waitTimes(p);
  if (i === 4) return ranking(p);
}
