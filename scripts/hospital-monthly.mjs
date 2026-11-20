import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  visual,
  settled,
  save,
  art,
  addPage,
  filter,
  capture,
  evidence,
} from "./portfolio-ui.mjs";
const report = "Hospital Operations",
  pageName = "Monthly change",
  base = "Within 45 minutes",
  previous = "Prior month attainment",
  delta = "Attainment change",
  ranking = "Sites by change in attainment";
async function source(name) {
  const [header, ...lines] = (
    await readFile("web/datasets/hospital/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const keys = header.split(",");
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((v, i) => [keys[i], v])),
  );
}
const calendar = new Map(
  (await source("Calendar")).map((r) => [r.CalendarKey, r.Month]),
);
const facts = (await source("Encounter"))
  .filter((r) => r.Cohort === "Routine" && r.Status === "Closed")
  .map((r) => ({ ...r, month: calendar.get(r.CalendarKey) }));
const rate = (data) =>
  data.reduce((n, r) => n + Number(r.MetTarget), 0) /
  data.reduce((n, r) => n + Number(r.Visits), 0);
const value = (month, site) =>
  rate(facts.filter((r) => r.month === month && (!site || r.Site === site)));
const percent = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(n);
const pp = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(100 * n) +
  " pp";
const page = (p) => p.locator("#pages .page").filter({ hasText: pageName });
async function makeMeasure(p, name, mode) {
  if (await p.locator("#data [data-field]").filter({ hasText: name }).count())
    return;
  await p.locator(".ribbon [data-action=measure]").click();
  await p.locator("dialog [data-action=monthly]").click();
  await p.getByLabel("Measure name").fill(name);
  await p.getByLabel("Base measure").selectOption({ label: base });
  await p
    .locator("dialog [name=month]")
    .selectOption({ label: "Calendar · Month" });
  await p.locator("dialog [name=mode]").selectOption(mode);
  await p.getByRole("button", { name: "Save measure" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
async function month(p, m) {
  await art(p, "Review month").locator("select").selectOption({ label: m });
  await settled(p);
}
await studio(async (p) => {
  await open(p, report);
  if (await page(p).count()) {
    await page(p).click();
    await settled(p);
  } else {
    await addPage(p, pageName);
    await filter(p, "page", "Encounter · Status", "Closed");
  }
  await makeMeasure(p, previous, "previous");
  await makeMeasure(p, delta, "change");
  await p.locator(".rail [data-action=model]").click();
  await p.locator("[data-edit-measure]").filter({ hasText: previous }).click();
  await p
    .locator("dialog [name=month]")
    .selectOption({ label: "Calendar · Date" });
  await p.getByRole("button", { name: "Save measure" }).click();
  await p.locator(".rail [data-action=report]").click();
  await settled(p);
  for (const spec of [
    ["dropdown", "Review month", ["Calendar · Month"], [], [18, 18, 210, 130]],
    ["card", "Current attainment", [], [base], [242, 18, 225, 130]],
    ["card", "Previous attainment", [], [previous], [481, 18, 225, 130]],
    ["card", "Month change", [], [delta], [720, 18, 260, 130]],
    ["bar", ranking, ["Encounter · Site"], [delta], [18, 168, 419, 331]],
    [
      "matrix",
      "Attainment by site",
      ["Encounter · Site"],
      [base, previous, delta],
      [453, 168, 527, 331],
    ],
  ]) {
    if (await art(p, spec[1]).count()) continue;
    await visual(p, ...spec);
    if (spec[1] === ranking) {
      await p
        .locator("#drill-target")
        .selectOption({ label: "Encounter detail" });
      await p.locator("[data-tab=Build]").click();
      await p.locator("#rank-order").selectOption("asc");
    }
  }
  await month(p, "2026-04");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await page(p).click();
  await settled(p);
  const toggle = art(p, "Review month").locator("select");
  assert.equal(await toggle.locator("option:checked").innerText(), "2026-04");
  const sites = [...new Set(facts.map((r) => r.Site))],
    result = {};
  for (const [focus, prior] of [
    ["2026-04", "2026-03"],
    ["2026-03", "2026-02"],
    ["2026-02", "2026-01"],
    ["2026-01", null],
  ]) {
    await month(p, focus);
    assert.equal(
      await art(p, "Current attainment").locator(".kpi").innerText(),
      percent(value(focus)),
    );
    assert.equal(
      await art(p, "Previous attainment").locator(".kpi").innerText(),
      prior ? percent(value(prior)) : "—",
    );
    assert.equal(
      await art(p, "Month change").locator(".kpi").innerText(),
      prior ? pp(value(focus) - value(prior)) : "—",
    );
    const data = await art(p, "Attainment by site")
      .locator("tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    for (const [s, a, b, d] of data) {
      const site = s === "Grand total" ? undefined : s;
      assert.equal(a, percent(value(focus, site)));
      assert.equal(b, prior ? percent(value(prior, site)) : "—");
      assert.equal(
        d,
        prior ? pp(value(focus, site) - value(prior, site)) : "—",
      );
    }
    result[focus] = data;
    const ordered = [...sites].sort((a, b) =>
      prior
        ? value(focus, a) -
          value(prior, a) -
          (value(focus, b) - value(prior, b))
        : a.localeCompare(b),
    );
    assert.deepEqual(
      await art(p, ranking)
        .locator(".barrow > span:first-child")
        .allTextContents(),
      ordered,
    );
  }
  await month(p, "2026-04");
  await capture(p, "hospital-monthly-change");
  const chart = art(p, ranking);
  await chart.locator(".barrow").first().click();
  await settled(p);
  assert.equal(
    await art(p, "Previous attainment").locator(".kpi").innerText(),
    percent(value("2026-03", "Harbor")),
  );
  await chart.locator("[data-through]").click();
  await settled(p);
  const ids = await art(p, "Routine encounter register")
    .locator("tbody tr td:first-child")
    .allTextContents();
  assert.deepEqual(
    ids,
    facts
      .filter((r) => r.Site === "Harbor" && r.month === "2026-04")
      .map((r) => r.Encounter)
      .sort(),
  );
  await p.locator("[data-action=drill-back]").click();
  await settled(p);
  await chart.locator("[data-clear]").click();
  await settled(p);
  await month(p, "All");
  assert.equal(await art(p, "Month change").locator(".kpi").innerText(), "—");
  await writeFile(
    evidence + "/monthly-change.json",
    JSON.stringify(
      {
        report,
        url: p.url(),
        checked: new Date().toISOString(),
        periods: result,
        aprilHarborEncounters: ids,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(result["2026-04"]));
});
