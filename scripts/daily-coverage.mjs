import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  addPage,
  visual,
  art,
  filter,
  save,
  settled,
  capture,
  setInput,
} from "./portfolio-ui.mjs";

const report = "Hospital Operations",
  page = "Daily coverage";
const chart = "Closed encounters by service date",
  table = "Daily encounter ledger";
const choice = "Show items with no data";
async function csv(name) {
  const [header, ...lines] = (
    await readFile("web/datasets/hospital/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  return lines.map((line) =>
    Object.fromEntries(
      line.split(",").map((v, i) => [header.split(",")[i], v]),
    ),
  );
}
const dates = await csv("Calendar"),
  visits = (await csv("Encounter")).filter(
    (r) => r.Status === "Closed" && r.Cohort === "Routine",
  );
const sites = [...new Set(visits.map((r) => r.Site))].sort(),
  months = [...new Set(dates.map((r) => r.Month))];
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});
const tab = (p, name) => p.locator("#pages .page").filter({ hasText: name });
async function go(p, name) {
  await tab(p, name).click();
  await settled(p);
}
async function build(p, name) {
  await art(p, name).locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
}
async function toggle(p, name, enabled) {
  await build(p, name);
  await p.getByLabel(choice, { exact: true }).setChecked(enabled);
  await settled(p);
}
async function select(p, title, value) {
  const picker=art(p,title),multi=picker.locator("[data-slicer-values]");
  if (await multi.count()) {
    await multi.click();const d=p.getByRole("dialog");
    await d.getByRole("checkbox",{name:"All values",exact:true}).check();
    await d.getByRole("checkbox",{name:value,exact:true}).check();
    await d.getByRole("button",{name:"Apply",exact:true}).click();
  } else await picker.locator("select").selectOption({ label: value });
  await settled(p);
}
const ledger = (p) =>
  art(p, table)
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
function expected(site, month) {
  return dates
    .filter((d) => d.Month === month)
    .map((d) => {
      const facts = visits.filter(
        (r) => r.Site === site && r.CalendarKey === d.CalendarKey,
      );
      const count = facts.length,
        sum = facts.reduce((n, r) => n + Number(r.Visits), 0);
      const rate = facts.reduce((n, r) => n + Number(r.MetTarget), 0) / sum;
      return [
        d.Date,
        count ? String(sum) : "—",
        count ? String(count) : "—",
        count ? percent.format(rate) : "—",
      ];
    });
}
await studio(async (p) => {
  await open(p, report);
  if (!(await tab(p, page).count())) {
    await addPage(p, page);
    await filter(p, "page", "Encounter · Status", "Closed");
    await visual(
      p,
      "dropdown",
      "Coverage month",
      ["Calendar · Month"],
      [],
      [18, 14, 260, 112],
    );
    await visual(
      p,
      "dropdown",
      "Coverage site",
      ["Encounter · Site"],
      [],
      [294, 14, 260, 112],
    );
    await visual(
      p,
      "card",
      "Closed routine visits",
      [],
      ["Encounter · Visits"],
      [570, 14, 405, 112],
    );
    await visual(
      p,
      "line",
      chart,
      ["Calendar · Date"],
      ["Encounter · Visits"],
      [18, 140, 504, 397],
    );
    await visual(
      p,
      "table",
      table,
      ["Calendar · Date"],
      [
        "Encounter · Visits",
        ["Encounter · Encounter", "count"],
        "Within 45 minutes",
      ],
      [538, 140, 437, 397],
    );
  } else await go(p, page);
  await art(p, table).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await setInput(p, '[data-dim="h"]', 473);
  await select(p, "Coverage month", "2026-03");
  await select(p, "Coverage site", "Harbor");
  await toggle(p, table, false);
  await toggle(p, chart, false);
  const baseline = await ledger(p),
    wanted = expected("Harbor", "2026-03");
  assert.deepEqual(
    baseline,
    wanted.filter((r) => r[1] !== "—"),
  );
  assert.equal(await art(p, chart).locator("polyline").count(), 1);
  await toggle(p, table, true);
  await toggle(p, chart, true);
  assert.deepEqual(await ledger(p), wanted);
  for (const type of ["area", "line"]) {
    await p.locator('[data-kind="' + type + '"]').click();
    await settled(p);
    assert.ok(await p.getByLabel(choice, { exact: true }).isChecked());
    assert.equal(await art(p, chart).locator("polyline").count(), 4);
  }
  await go(p, "Site and month detail");
  await toggle(p, "Encounters by day", true);
  await go(p, page);
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await go(p, page);
  const result = {};
  for (const site of sites) {
    await select(p, "Coverage site", site);
    for (const month of months) {
      await select(p, "Coverage month", month);
      const rows = await ledger(p),
        wanted = expected(site, month);
      assert.deepEqual(rows, wanted);
      const recorded = wanted.filter((r) => r[1] !== "—");
      const plot = art(p, chart);
      const points = await plot
        .locator("[data-point]")
        .evaluateAll((marks) =>
          marks.map((m) => [
            m.getAttribute("aria-label").match(/\d{4}-\d{2}-\d{2}/)[0],
            m.dataset.value,
          ]),
        );
      assert.deepEqual(
        points,
        recorded.map((r) => r.slice(0, 2)),
      );
      assert.ok(
        await plot
          .locator("polyline")
          .evaluateAll((lines) =>
            lines.every((l) => l.points.numberOfItems === 1),
          ),
      );
      result[site + " " + month] = rows;
    }
  }
  await select(p, "Coverage month", "2026-03");
  await select(p, "Coverage site", "Harbor");
  await save(p);
  await capture(p, "hospital-daily-coverage");
  const saved = await (
    await p.request.get(
      new URL(
        "/api/reports/" + new URL(p.url()).hash.slice(1).split("/")[0],
        p.url(),
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
    "portfolio-evidence/daily-coverage.json",
    JSON.stringify({ url, baselineMarchHarbor: 4, rows: result }, null, 2) +
      "\n",
  );
});
console.log(
  "Daily coverage reconciled every supplied date, sum, count, rate and line gap across all twelve site/month combinations after reopening.",
);
