import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { studio, open, art, settled, save, setInput } from "./portfolio-ui.mjs";
const hospital = {
  report: "Hospital Operations",
  page: "Volume and attainment",
  chart: "Monthly encounter volume and target attainment",
};
const gallery = {
  report: "Visual Gallery",
  page: "Channel contribution",
  chart: "Revenue by region",
};
async function visit(p, target) {
  await open(p, target.report);
  await p.locator("#pages .page").filter({ hasText: target.page }).click();
  await settled(p);
  return art(p, target.chart);
}
async function setup(target, bindings) {
  await studio(async (p) => {
    const chart = await visit(p, target);
    await chart.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    const well = p.locator('[data-well="tooltipFields"]');
    for (const [i, [name, label, op]] of bindings.entries()) {
      if ((await well.locator(".wellrow").count()) <= i)
        await well.locator("[data-pick]").selectOption({ label: name });
      const row = well.locator(".wellrow").nth(i);
      if (op) await row.locator("[data-agg]").selectOption(op);
      await setInput(p, '[data-tip-label="' + i + '"]', label);
    }
    await p.locator('[data-page="0"]').click();
    await save(p);
  });
}
await setup(hospital, [
  ["Encounter · MetTarget", "Within target"],
  ["Encounter · Visits", "Closed routine encounters"],
  ["Encounter · Minutes", "90th percentile wait (min)", "p90"],
  ["Within 45 minutes", "Attainment"],
]);
await setup(gallery, [
  ["Dispatch · Orders", "Order count"],
  ["Dispatch · Target", "Revenue target"],
]);
async function tipRows(p) {
  const tip = p.getByRole("tooltip");
  await tip.locator("tbody").waitFor();
  return tip
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
}
async function csv(file) {
  const [header, ...lines] = (await readFile(file, "utf8"))
    .trim()
    .split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])),
  );
}
const calendar = new Map(
  (await csv("web/datasets/hospital/Calendar.csv")).map((r) => [
    r.CalendarKey,
    r.Month,
  ]),
);
const facts = await csv("web/datasets/hospital/Encounter.csv");
function hospitalExpected(month) {
  const records = facts.filter(
    (r) =>
      calendar.get(r.CalendarKey) === month &&
      r.Status === "Closed" &&
      r.Cohort === "Routine",
  );
  const n = records.length,
    met = records.reduce((s, r) => s + Number(r.MetTarget), 0);
  const wait = records.map((r) => Number(r.Minutes)).sort((a, b) => a - b),
    rank = (n - 1) * 0.9;
  const p90 =
    wait[Math.floor(rank)] +
    (wait[Math.ceil(rank)] - wait[Math.floor(rank)]) * (rank % 1);
  return [
    ["Within target", String(met)],
    ["Closed routine encounters", String(n)],
    ["90th percentile wait (min)", String(Number(p90.toFixed(3)))],
    [
      "Attainment",
      new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: 2,
      }).format(met / n),
    ],
  ];
}
const evidence = {};
await studio(async (p) => {
  const chart = await visit(p, hospital);
  const lines = chart.locator('.plot-mark[data-axis="secondary"]');
  assert.equal(await lines.count(), 4);
  const march = lines.nth(2);
  await march.locator("circle").hover();
  evidence.march = await tipRows(p);
  assert.deepEqual(evidence.march, hospitalExpected("2026-03"));
  await p.screenshot({
    path: "portfolio-evidence/hospital-encounter-tooltip.png",
  });
  await p.keyboard.press("Escape");
  await p.locator("#chart-tooltip").waitFor({ state: "hidden" });
  await p.mouse.move(1, 1);
  let release, started;
  const gate = new Promise((r) => (release = r)),
    observed = new Promise((r) => (started = r));
  await p.route("**/api/query", async (route) => {
    const body = route.request().postDataJSON();
    if (
      body.visuals.length === 4 &&
      body.visuals.every((q) => !q.groups.length) &&
      body.visuals[0].filters.some((f) => f.value === "2026-01")
    ) {
      started();
      await gate;
    }
    await route.continue();
  });
  try {
    await lines.first().focus();
    await Promise.race([
      observed,
      p.waitForTimeout(3500).then(() => {
        throw Error("No tooltip request for January");
      }),
    ]);
    await lines.last().focus();
    assert.deepEqual(await tipRows(p), hospitalExpected("2026-04"));
  } finally {
    release();
  }
  await p.unrouteAll({ behavior: "wait" });
  assert.deepEqual(await tipRows(p), hospitalExpected("2026-04"));
  assert.equal(await chart.locator("[aria-pressed=true]").count(), 0);
  await chart.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Tooltips", { exact: true }).uncheck();
  await settled(p);
  assert.equal(await chart.locator("[data-rich-tip]").count(), 0);
});
await studio(async (p) => {
  const chart = await visit(p, gallery);
  const mark = chart.locator(".plot-mark").first();
  await mark.focus();
  evidence.east = await tipRows(p);
  assert.deepEqual(evidence.east, [
    ["Order count", "74", "41"],
    ["Revenue target", "800", "420"],
  ]);
  assert.deepEqual(
    await p.getByRole("tooltip").locator("thead th").allTextContents(),
    ["Field", "Total", "Selected"],
  );
  const source = art(p, "Month selection");
  await source.locator("select").selectOption({ label: "2026-03-01" });
  await settled(p);
  await mark.focus();
  assert.deepEqual(await tipRows(p), [
    ["Order count", "28", "15"],
    ["Revenue target", "320", "170"],
  ]);
  assert.equal(
    await art(p, "Selected revenue").locator(".kpi").innerText(),
    "$323.00",
  );
});
await writeFile(
  "portfolio-evidence/point-tooltips.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  "Custom tooltip fields retained numerator, denominator, P90, and ratio formats. Keyboard focus, Escape, stale requests, and total/selected filtering passed.",
);
