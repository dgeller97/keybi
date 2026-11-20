import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  studio,
  open,
  save,
  capture,
  settled,
  art,
  cards,
  evidence,
} from "./portfolio-ui.mjs";
import { rows } from "./portfolio-data.mjs";
const names = [
  "Sales and Margin Overview",
  "Hospital Operations",
  "Budget vs. Actual",
  "Wait-Time Performance",
  "Service Tail Review",
];
const stages = Number(process.argv[2] || 1);
const percent = (n) =>
  new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(n);
const sum = (rows, key) => rows.reduce((s, r) => s + r[key], 0);
const pct = (rows) => percent(sum(rows, "MetTarget") / sum(rows, "Visits"));
const bar = (p, t, name) =>
  art(p, t)
    .locator(".barrow")
    .filter({ has: p.getByText(name, { exact: true }) });
async function value(p, t, want) {
  await settled(p);
  assert.equal(await art(p, t).locator(".kpi").textContent(), String(want));
}
const closeSelection = async (p, t) => {
  await art(p, t).locator("[data-clear]").click();
  await settled(p);
};
async function verify(p, i) {
  if (i === 0) {
    await value(p, "Margin", "13%");
    await bar(p, "Revenue by Category", "B").click();
    await value(p, "Margin", "10%");
    await bar(p, "Revenue by Category", "A").click();
    await value(p, "Margin", "40%");
    await p.getByRole("button", { name: "2025-01-01", exact: true }).click();
    await closeSelection(p, "Revenue by Category");
    await value(p, "Margin", "40%");
    await closeSelection(p, "Date");
    await value(p, "Margin", "13%");
    await p.locator(".rail [data-action=model]").click();
    assert.equal(await p.locator(".relationrow").count(), 2);
    assert.match(await p.locator(".formula").innerText(), /Profit.*Revenue/);
    await p.locator(".rail [data-action=report]").click();
    await capture(p, "sales-overview");
  }
  if (i === 1) {
    const routine = rows.Encounter.filter((r) => r.Cohort === "Routine"),
      closed = routine.filter((r) => r.Status === "Closed");
    await value(p, "Closed routine visits", closed.length);
    await value(p, "Within 45 minutes", pct(closed));
    for (const s of ["Cedar", "Harbor", "Ridge"])
      assert.equal(
        await bar(p, "Target rate by site", s).locator("b").textContent(),
        pct(closed.filter((r) => r.Site === s)),
      );
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04"])
      assert.equal(
        await bar(p, "Visits by month", m).locator("b").innerText(),
        String(
          closed.filter((r) => rows.Calendar[r.CalendarKey - 1].Month === m)
            .length,
        ),
      );
    await art(p, "Site").getByText("Harbor", { exact: true }).click();
    await value(
      p,
      "Closed routine visits",
      closed.filter((r) => r.Site === "Harbor").length,
    );
    await closeSelection(p, "Site");
    await capture(p, "hospital-summary");
    await p.locator('[data-page="1"]').click();
    await settled(p);
    const found = [];
    while (true) {
      found.push(
        ...(await p.locator(".grid tbody tr td:first-child").allTextContents()),
      );
      const next = p.locator('[data-page-delta="1"]');
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
      await settled(p);
    }
    assert.deepEqual(found, routine.map((r) => r.Encounter).sort());
    await p.locator('[data-page="0"]').click();
    await p.locator('[data-page="1"]').click();
    await settled(p);
    await capture(p, "hospital-detail");
    await p.locator('[data-page="0"]').click();
    await settled(p);
  }
  if (process.argv.includes("--ledger")) {
    if (i === 0) {
      await bar(p, "Revenue by Category", "A").click();
      await art(p, "Revenue by Category").locator("[data-through]").click();
      await settled(p);
      assert.deepEqual(await p.locator(".grid tbody td").allTextContents(), [
        "1",
        "2025-01-01",
        "Product 1",
        "A",
        "100",
        "40",
        "40%",
      ]);
      await capture(p, "sales-detail");
      await p.locator("[data-action=drill-back]").click();
      await closeSelection(p, "Revenue by Category");
    }
    if (i === 1) {
      const chart = art(p, "Target rate by site");
      await chart.locator(".barrow").filter({ hasText: "Harbor" }).click();
      await chart.locator("[data-through]").click();
      await settled(p);
      const ids = [];
      while (true) {
        ids.push(
          ...(await p
            .locator(".grid tbody tr td:first-child")
            .allTextContents()),
        );
        const next = p.locator('[data-page-delta="1"]');
        if (!(await next.count()) || (await next.isDisabled())) break;
        await next.click();
        await settled(p);
      }
      assert.deepEqual(
        ids,
        rows.Encounter.filter(
          (r) =>
            r.Site === "Harbor" &&
            r.Status === "Closed" &&
            r.Cohort === "Routine",
        )
          .map((r) => r.Encounter)
          .sort(),
      );
      await p.locator("[data-action=drill-back]").click();
      await closeSelection(p, "Target rate by site");
    }
  }
  if (i >= 2) {
    const { verifyAdvanced } = await import("./portfolio-advanced-check.mjs");
    await verifyAdvanced(p, i);
  }
}
const log = [];
for (let i = 0; i < stages; i++) {
  let color, visualTitle;
  await studio(async (p) => {
    await open(p, names[i]);
    await verify(p, i);
    const first = p.locator("article").first();
    visualTitle = await first.getAttribute("aria-label");
    await first.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    const input = p.locator("#vaccent");
    color = (await input.inputValue()) === "#366851" ? "#42836b" : "#366851";
    await input.fill(color);
    await save(p);
    log.push({
      title: names[i],
      url: p.url(),
      checked: new Date().toISOString(),
    });
  });
  await studio(async (p) => {
    await open(p, names[i]);
    await art(p, visualTitle).locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    assert.equal(await p.locator("#vaccent").inputValue(), color);
    await verify(p, i);
  });
}
await studio(async (p) => {
  await cards(p).first().waitFor();
  assert.ok((await cards(p).count()) >= stages);
  await p.screenshot({ path: evidence + "/library.png" });
});
await writeFile(
  evidence + "/checkpoint-" + stages + ".json",
  JSON.stringify(log, null, 2),
);
console.log(JSON.stringify(log));
