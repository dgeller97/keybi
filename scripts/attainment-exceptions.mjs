import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  visual,
  art,
  save,
  filter,
  settled,
  addPage,
  capture,
} from "./portfolio-ui.mjs";
const report = "Hospital Operations",
  page = "Attainment exceptions",
  measure = "Within 45 minutes";
const ledger = "Dates below the review threshold",
  chart = "Attainment on recorded days";
const pageTab = (p) => p.locator("#pages .page").filter({ hasText: page });
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});
async function csv(name) {
  const [head, ...rows] = (
    await readFile("web/datasets/hospital/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const keys = head.split(",");
  return rows.map((r) =>
    Object.fromEntries(r.split(",").map((v, i) => [keys[i], v])),
  );
}
const calendar = await csv("Calendar");
const visits = (await csv("Encounter")).filter(
  (r) => r.Cohort === "Routine" && r.Status === "Closed",
);
const sites = [...new Set(visits.map((r) => r.Site))].sort(),
  months = [...new Set(calendar.map((r) => r.Month))];
function daily(site, month) {
  return calendar
    .filter((d) => d.Month === month)
    .map((d) => {
      const records = visits.filter(
        (r) => r.CalendarKey === d.CalendarKey && r.Site === site,
      );
      const count = records.reduce((s, r) => s + Number(r.Visits), 0);
      return {
        date: d.Date,
        count,
        rate: count
          ? records.reduce((s, r) => s + Number(r.MetTarget), 0) / count
          : null,
      };
    });
}
async function choose(p, title, value) {
  await art(p, title).locator("select").selectOption({ label: value });
  await settled(p);
}
async function pane(p) {
  const applied = art(p, ledger).locator("[data-view-filters]");
  if (await applied.count()) {
    await applied.click();
    await p.locator('[data-measure-filter="new"]').waitFor();
    return;
  }
  await art(p, ledger).locator(".vhead").click();
  await p.locator("[data-tab=Filters]").click();
  await p.locator('[data-measure-filter="new"]').waitFor();
}
async function rule(p, op, threshold) {
  await pane(p);
  const edit = p.locator('[data-measure-filter="0"]');
  if (await edit.count()) await edit.click();
  else
    await p
      .locator("#data [data-field]")
      .filter({ hasText: measure })
      .first()
      .dragTo(p.locator('[data-measure-filter="new"]'));
  await p
    .getByLabel("Measure", { exact: true })
    .selectOption({ label: measure });
  await p.getByLabel("Condition").selectOption(op);
  if (threshold !== undefined)
    await p.getByLabel("Threshold (%)").fill(String(threshold));
  else assert.ok(await p.locator('[name="threshold"]').isHidden());
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
}
async function check(p, expected) {
  const rows = await art(p, ledger)
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  const wanted = expected.map((r) => [
    r.date,
    r.count ? String(r.count) : "—",
    r.rate === null ? "—" : percent.format(r.rate),
  ]);
  assert.deepEqual(rows, wanted);
  return rows;
}
await studio(async (p) => {
  await open(p, report);
  if (!(await pageTab(p).count())) {
    await addPage(p, page);
    await filter(p, "page", "Encounter · Status", "Closed");
    await visual(
      p,
      "dropdown",
      "Review month",
      ["Calendar · Month"],
      [],
      [18, 16, 240, 118],
    );
    await visual(
      p,
      "dropdown",
      "Review site",
      ["Encounter · Site"],
      [],
      [274, 16, 240, 118],
    );
    await visual(
      p,
      "card",
      "Overall site attainment",
      [],
      [measure],
      [530, 16, 443, 118],
    );
    await visual(
      p,
      "clusteredColumn",
      chart,
      ["Calendar · Date"],
      [measure],
      [18, 152, 505, 365],
    );
    await visual(
      p,
      "table",
      ledger,
      ["Calendar · Date"],
      ["Encounter · Visits", measure],
      [541, 152, 432, 365],
    );
  } else await pageTab(p).click();
  await choose(p, "Review site", "Harbor");
  await choose(p, "Review month", "2026-03");
  await art(p, ledger).locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Show items with no data", { exact: true }).check();
  await settled(p);
  await pane(p);
  const clear = p.getByLabel("Clear measure filter");
  if (!(await clear.count())) await check(p, daily("Harbor", "2026-03"));
  await rule(p, "lt", 60);
  await check(
    p,
    daily("Harbor", "2026-03").filter((r) => r.rate !== null && r.rate < 0.6),
  );
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await pageTab(p).click();
  await settled(p);
  const proof = {};
  for (const site of sites) {
    await choose(p, "Review site", site);
    for (const month of months) {
      await choose(p, "Review month", month);
      const all = daily(site, month);
      proof[site + " " + month] = await check(
        p,
        all.filter((r) => r.rate !== null && r.rate < 0.6),
      );
      assert.equal(
        await art(p, chart).locator("[data-point]").count(),
        all.filter((r) => r.count).length,
      );
      const siteRate =
        all.reduce((s, r) => s + (r.rate || 0) * r.count, 0) /
        all.reduce((s, r) => s + r.count, 0);
      assert.equal(
        await art(p, "Overall site attainment").locator(".kpi").innerText(),
        percent.format(siteRate),
      );
    }
  }
  await choose(p, "Review month", "2026-03");
  await choose(p, "Review site", "Harbor");
  const march = daily("Harbor", "2026-03");
  for (const [op, value, predicate] of [
    ["lt", 50, (n) => n !== null && n < 0.5],
    ["lte", 50, (n) => n !== null && n <= 0.5],
    ["eq", 50, (n) => n === 0.5],
    ["ne", 50, (n) => n !== null && n !== 0.5],
    ["gt", 50, (n) => n !== null && n > 0.5],
    ["gte", 50, (n) => n !== null && n >= 0.5],
    ["blank", undefined, (n) => n === null],
    ["present", undefined, (n) => n !== null],
  ]) {
    await rule(p, op, value);
    await check(
      p,
      march.filter((r) => predicate(r.rate)),
    );
  }
  await rule(p, "lt", 60);
  await save(p);
  await capture(p, "hospital-attainment-exceptions");
  const reportUrl = new URL(p.url());
  const saved = await (
    await p.request.get(
      new URL(
        "/api/reports/" + reportUrl.hash.slice(1).split("/")[0],
        reportUrl,
      ).href,
    )
  ).json();
  const url =
    p.url().split("/page/")[0] +
    "/page/" +
    saved.pages.find((item) => item.name === page).id;
  await p.locator('[data-page="0"]').click();
  await save(p);
  await writeFile(
    "portfolio-evidence/attainment-exceptions.json",
    JSON.stringify(
      {
        url,
        threshold: 0.6,
        sites: proof,
        blankDates: march.filter((r) => r.rate === null).length,
      },
      null,
      2,
    ) + "\n",
  );
});
console.log(
  "Verified all eight measure comparisons and 12 site/month contexts. Other visuals kept their full population.",
);
