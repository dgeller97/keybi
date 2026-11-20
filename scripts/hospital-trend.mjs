import assert from "node:assert/strict";
import {
  studio,
  open,
  visual,
  settled,
  save,
  art,
  addPage,
  capture,
  filter,
} from "./portfolio-ui.mjs";
import { rows } from "./portfolio-data.mjs";
import { writeFile } from "node:fs/promises";
const name = "Volume and attainment",
  title = "Monthly encounter volume and target attainment",
  bookmark = "March encounter days",
  allDays = "Daily volume across months",
  report = "Hospital Operations";
async function bookmarkView(p, name) {
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const existing = p.locator(".bookmark-row").filter({hasText:name});
  if (await existing.count()) await existing.locator("[data-bookmark-update]").click();
  else {
    await p.getByLabel("New bookmark name").fill(name);
    await p.locator("dialog button[type=submit]").click();
  }
}
await studio(async (p) => {
  await open(p, report);
  const existing = p.locator("#pages .page").filter({ hasText: name });
  if (await existing.count()) {
    await existing.click();
    await settled(p);
  } else {
    await addPage(p, name);
    await filter(p, "page", "Encounter · Status", "Closed");
    await visual(
      p,
      "combo",
      title,
      ["Calendar · Month"],
      ["Encounter · Visits"],
      [18, 20, 960, 420],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=other]")
      .selectOption({ label: "Within 45 minutes" });
    await visual(
      p,
      "card",
      "Selected visits",
      [],
      ["Encounter · Visits"],
      [18, 458, 470, 140],
    );
    await visual(
      p,
      "card",
      "Selected attainment",
      [],
      ["Within 45 minutes"],
      [506, 458, 472, 140],
    );
    await save(p);
  }
  const chart = art(p, title);
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=groups]").selectOption({label:"Calendar · Date"});
  await settled(p);
  assert.equal(await p.locator("[data-well=groups] .wellrow").count(), 2);
  await chart.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03"]').press("Enter");
  await settled(p);
  await chart.locator("[data-drill=down]").click();
  await settled(p);
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Continuous date axis").check();
  await settled(p);
  await bookmarkView(p, bookmark);
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  await chart.getByRole("button",{name:"Go to next level (Date)"}).click();
  await settled(p);
  await bookmarkView(p, allDays);
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  await chart.locator("[data-drill=expand]").click();
  await settled(p);
  await bookmarkView(p,"Daily visits grouped by month");
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
  const calendar = new Map(rows.Calendar.map((r) => [r.CalendarKey, r.Month]));
  const groups = new Map();
  for (const r of rows.Encounter.filter(
    (r) => r.Status === "Closed" && r.Cohort === "Routine",
  )) {
    const month = calendar.get(r.CalendarKey);
    const fact = groups.get(month) || [0, 0];
    fact[0] += r.Visits;
    fact[1] += r.MetTarget;
    groups.set(month, fact);
  }
  const a = art(p, title);
  const marks = await a
    .locator("[data-point]")
    .evaluateAll((es) =>
      es.map((e) => ({ ...e.dataset, label: e.getAttribute("aria-label") })),
    );
  assert.equal(marks.length, groups.size * 2);
  for (const item of marks) {
    const month = [...groups.keys()].find((k) => item.label.includes(k));
    assert.ok(month);
    const [volume, met] = groups.get(month);
    assert.ok(
      Math.abs(
        Number(item.value) - (item.metric === "0" ? volume : met / volume),
      ) < 1e-10,
    );
    if (item.metric === "1") assert.equal(item.axis, "secondary");
  }
  await a.locator("[data-point]").first().focus();
  await p.keyboard.press("Enter");
  await settled(p);
  assert.equal(
    await art(p, "Selected visits").locator(".kpi").innerText(),
    marks[0].value,
  );
  await a.locator("[data-clear]").click();
  await settled(p);
  await capture(p, "hospital-volume-attainment");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button", {name:bookmark, exact:true}).click();
  await settled(p);
  assert.equal(await a.locator(".drill-path").innerText(), "2026-03 › Date");
  await a.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  assert.equal(await p.getByLabel("Continuous date axis").isChecked(), true);
  await p.locator("[data-tab=Build]").click();
  const dates = new Map(rows.Calendar.map(r => [r.CalendarKey, r.Date]));
  const ledger = new Map();
  for (const r of rows.Encounter) {
    const day = dates.get(r.CalendarKey);
    if (r.Status !== "Closed" || r.Cohort !== "Routine") continue;
    const balance = ledger.get(day) || {visits:0, met:0};
    balance.visits += r.Visits;
    balance.met += r.MetTarget;
    ledger.set(day, balance);
  }
  const days = new Map([...ledger].filter(([day]) => day.startsWith("2026-03")));
  assert.equal(await a.locator("[data-point]").count(), days.size * 2);
  for (const [day, {visits, met}] of days) {
    const mark = metric => a.locator('[data-metric="' + metric + '"][aria-label^="Date ' + day + '"]');
    assert.equal(Number(await mark(0).getAttribute("data-value")), visits);
    const line = mark(1);
    assert.equal(await line.getAttribute("data-axis"), "secondary");
    assert.ok(Math.abs(Number(await line.getAttribute("data-value")) - met/visits) < 1e-10);
  }
  const [day, balance] = [...days].find(([,b]) => b.met > 0 && b.met < b.visits);
  await a.locator('[data-point][data-metric="0"][aria-label^="Date ' + day + '"]').press("Enter");
  await settled(p);
  assert.equal(Number(await art(p,"Selected visits").locator(".kpi").innerText()), balance.visits);
  assert.equal(await art(p,"Selected attainment").locator(".kpi").innerText(),
    (balance.met/balance.visits).toLocaleString("en-US",{style:"percent",maximumFractionDigits:2}));
  await capture(p, "hospital-march-drill");
  await a.locator("[data-drill=up]").click();
  await settled(p);
  assert.equal(await a.locator("[data-point]").count(), groups.size*2);
  const evidence = {month:"2026-03", visits:groups.get("2026-03")[0], met:groups.get("2026-03")[1], selected:day, days:Object.fromEntries(days)};
  await writeFile("portfolio-evidence/hospital-march-drill.json", JSON.stringify(evidence,null,2)+"\n");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:allDays,exact:true}).click();
  await settled(p);
  assert.equal(await a.locator(".drill-path").innerText(),"Date");
  const plotted = await a.locator("[data-point]").evaluateAll(ms => ms.map(m => ({
    date:m.getAttribute("aria-label").match(/^Date (\d{4}-\d{2}-\d{2})/)[1],
    metric:m.dataset.metric, value:Number(m.dataset.value)
  })));
  assert.equal(new Set(plotted.map(m => m.date + "/" + m.metric)).size, ledger.size*2);
  assert.equal(plotted.length, ledger.size*2);
  for (const {date,metric,value} of plotted) {
    const {visits,met} = ledger.get(date);
    assert.ok(Math.abs(value - (metric === "0" ? visits : met/visits)) < 1e-10);
  }
  const visits = [...ledger.values()].reduce((n,d) => n+d.visits,0);
  const met = [...ledger.values()].reduce((n,d) => n+d.met,0);
  assert.equal(await art(p,"Selected visits").locator(".kpi").innerText(),String(visits));
  await capture(p,"hospital-all-dates");
  await writeFile("portfolio-evidence/hospital-all-dates.json", JSON.stringify({visits, met, dates:ledger.size, days:Object.fromEntries([...ledger].sort())}, null, 2)+"\n");
  await a.locator("[data-drill=up]").click();
  await settled(p);
  assert.equal(await a.locator("[data-point]").count(),groups.size*2);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:"Daily visits grouped by month",exact:true}).click();
  await settled(p);
  assert.deepEqual(await a.locator("[data-axis-parent]").allTextContents(),[...groups.keys()].sort());
  const expanded = await a.locator("[data-point]").evaluateAll(ms => ms.map(m => [
    m.getAttribute("aria-label"),m.dataset.metric,Number(m.dataset.value)
  ]));
  assert.equal(expanded.length,ledger.size*2);
  for (const [label,metric,value] of expanded) {
    const [,month,date] = label.match(/^Month (\S+), Date (\S+) ·/);
    assert.equal(month,date.slice(0,7));
    const {met,visits} = ledger.get(date);
    assert.ok(Math.abs(value - (metric === "0" ? visits : met/visits)) < 1e-10);
  }
  await a.locator('[data-point][data-metric="0"][aria-label^="Month 2026-03, Date 2026-03-02"]').press("Enter");
  await settled(p);
  assert.equal(await art(p,"Selected visits").locator(".kpi").innerText(),"3");
  assert.equal(await art(p,"Selected attainment").locator(".kpi").innerText(),"66.67%");
  await capture(p,"hospital-expanded-dates");
  console.log(JSON.stringify(evidence));
});
