import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  visual,
  save,
  art,
  filter,
  addPage,
  pageName,
  settled,
  capture,
} from "./portfolio-ui.mjs";
const report = "Hospital Operations",
  source = "Site volumes",
  target = "Site and month detail",
  chart = "Monthly encounter volume by site",
  pageCard = "Closed routine encounters",
  siteControl = "Site focus",
  siteCard = "Encounters",
  rateCard = "Within 45 minutes",
  daily = "Encounters by day";
const pct = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(n);
async function read(name) {
  const [head, ...lines] = (
    await readFile("web/datasets/hospital/" + name + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const keys = head.split(",");
  return lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])),
  );
}
const calendar = new Map(
  (await read("Calendar")).map((r) => [r.CalendarKey, r]),
);
const facts = (await read("Encounter"))
  .filter((r) => r.Cohort === "Routine" && r.Status === "Closed")
  .map((r) => ({ ...r, ...calendar.get(r.CalendarKey) }));
const tab = (p, name) => p.locator("#pages .page").filter({ hasText: name });
async function go(p, name) {
  await tab(p, name).click();
  await settled(p);
}
async function assign(p, title) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
}
await studio(async (p) => {
  await open(p, report);
  if (!(await tab(p, source).count())) {
    await addPage(p, source);
    await filter(p, "page", "Encounter · Status", "Closed");
    await visual(
      p,
      "dropdown",
      siteControl,
      ["Encounter · Site"],
      [],
      [18, 18, 350, 120],
    );
    await visual(
      p,
      "card",
      pageCard,
      [],
      ["Encounter · Visits"],
      [385, 18, 593, 120],
    );
    await visual(
      p,
      "clusteredColumn",
      chart,
      ["Calendar · Month"],
      ["Encounter · Visits"],
      [18, 154, 960, 435],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=legendFields]")
      .selectOption({ label: "Encounter · Site" });
  } else await go(p, source);
  if (!(await tab(p, target).count())) {
    await assign(p, chart);
    await p.getByLabel("Tooltip page", { exact: true }).selectOption("new");
    await pageName(p, target);
    await visual(
      p,
      "card",
      siteCard,
      [],
      ["Encounter · Visits"],
      [18, 18, 235, 126],
    );
    await visual(p, "card", rateCard, [], [rateCard], [263, 18, 260, 126]);
    await visual(
      p,
      "line",
      daily,
      ["Calendar · Date"],
      ["Encounter · Visits"],
      [18, 154, 505, 232],
    );
    await p.getByLabel("Continuous date axis").check();
    await go(p, source);
  }
  await assign(p, chart);
  await p
    .getByLabel("Tooltip page", { exact: true })
    .selectOption({ label: target });
  await p.locator('[data-page="0"]').click();
  await save(p);
});
export async function verifyHospital(p, { evidence = false } = {}) {
  await open(p, report);
  await go(p, source);
  const sourceChart = art(p, chart),
    card = art(p, pageCard),
    tip = p.locator("#chart-tooltip");
  const marks = sourceChart.locator("[data-rich-tip]");
  assert.equal(await marks.count(), 12);
  const total = String(facts.length);
  assert.equal(await card.locator(".kpi").textContent(), total);
  const url = p.url(),
    proof = {};
  async function verify(mark, keyboard) {
    const label = await mark.getAttribute("aria-label");
    const site = label.match(/Site ([^ ·,]+)/)[1],
      month = label.match(/Month (\d{4}-\d{2})/)[1];
    const rows = facts.filter((r) => r.Site === site && r.Month === month);
    if (keyboard) {
      await mark.focus();
    } else {
      await mark.hover();
    }
    await p.waitForFunction(
      ([label, title]) => {
        const tip = document.querySelector("#chart-tooltip");
        return (
          tip &&
          !tip.hidden &&
          tip.querySelector("strong")?.textContent === label &&
          tip.querySelector(".tooltip-page-title")?.textContent === title
        );
      },
      [label, target],
    );
    const cell = (name) => tip.getByRole("region", { name, exact: true });
    assert.equal(
      await cell(siteCard).locator(".kpi").textContent(),
      String(rows.length),
    );
    assert.equal(
      await cell(rateCard).locator(".kpi").textContent(),
      pct(rows.reduce((sum, r) => sum + Number(r.MetTarget), 0) / rows.length),
    );
    const points = await cell(daily)
      .locator("[data-point]")
      .evaluateAll((ms) =>
        ms.map((m) => [
          m.getAttribute("aria-label").match(/\d{4}-\d{2}-\d{2}/)[0],
          Number(m.dataset.value),
        ]),
      );
    const expected = new Map();
    for (const r of rows)
      expected.set(r.Date, (expected.get(r.Date) || 0) + Number(r.Visits));
    assert.deepEqual(
      points,
      [...expected].sort(([a], [b]) => a.localeCompare(b)),
    );
    assert.equal(p.url(), url);
    assert.equal(await mark.getAttribute("aria-describedby"), "chart-tooltip");
    const box = await tip.boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= 1680 &&
        box.y + box.height <= 980,
    );
    proof[site + " " + month] = {
      count: rows.length,
      met: rows.reduce((sum, r) => sum + Number(r.MetTarget), 0),
      days: points,
    };
    if (evidence && site === "Harbor" && month === "2026-03")
      await capture(p, "hospital-report-tooltip");
  }
  let calls = 0;
  const count = (r) => {
    if (r.url().endsWith("/api/query")) calls++;
  };
  p.on("request", count);
  for (const i of [0, 1, 0, 1, 0, 1]) {
    await verify(marks.nth(i), true);
    await p.keyboard.press("Escape");
  }
  p.off("request", count);
  assert.equal(calls, 2);
  if (evidence)
    await writeFile(
      "portfolio-evidence/tooltip-requests.json",
      JSON.stringify(
        {
          focusEvents: 6,
          distinctMarks: 2,
          beforeCaching: 6,
          afterCaching: calls,
        },
        null,
        2,
      ) + "\n",
    );
  for (let i = 0; i < (await marks.count()); i++) {
    await verify(marks.nth(i), i % 2 === 0);
    await p.keyboard.press("Escape");
  }
  assert.equal(await card.locator(".kpi").textContent(), total);
  const control = art(p, siteControl).locator("select");
  await control.selectOption({ label: "Harbor" });
  await settled(p);
  await verify(marks.nth(1), true);
  await p.keyboard.press("Escape");
  await tip.waitFor({ state: "hidden" });
  assert.equal(
    await card.locator(".kpi").textContent(),
    String(facts.filter((r) => r.Site === "Harbor").length),
  );
  assert.equal(await control.locator("option:checked").textContent(), "Harbor");
  if (evidence)
    await writeFile(
      "portfolio-evidence/report-tooltips.json",
      JSON.stringify(proof, null, 2) + "\n",
    );
}
await studio((p) => verifyHospital(p, { evidence: true }));
console.log(
  "All twelve site/month tooltip pages matched encounter counts, attainment and daily visits by mouse and keyboard after reopening.",
);
