import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  art,
  visual,
  settled,
  save,
  pageName,
  capture,
} from "./portfolio-ui.mjs";
const title = "Visual Gallery",
  source = "Regional revenue by channel",
  target = "Channel detail tooltip";
const tab = (p, n) => p.locator("#pages .page").filter({ hasText: n });
await studio(async (p) => {
  await open(p, title);
  await tab(p, "Comparisons").click();
  await settled(p);
  await art(p, source).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  if (!(await tab(p, target).count())) {
    await p.getByLabel("Tooltip page", { exact: true }).selectOption("new");
    await pageName(p, target);
    await visual(
      p,
      "card",
      "Channel revenue",
      [],
      ["Dispatch · Revenue"],
      [18, 18, 240, 116],
      "currency",
    );
    await visual(
      p,
      "card",
      "Channel orders",
      [],
      ["Dispatch · Orders"],
      [268, 18, 232, 116],
    );
    await visual(
      p,
      "matrix",
      "Monthly revenue and target",
      ["Dispatch · Period"],
      ["Dispatch · Revenue", "Dispatch · Target"],
      [18, 144, 482, 215],
      "currency",
    );
    await tab(p, "Comparisons").click();
    await settled(p);
    await art(p, source).locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
  }
  await p
    .getByLabel("Tooltip page", { exact: true })
    .selectOption({ label: target });
  await save(p);
});
const rows = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((r) => r.split(","));
const cash = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
await studio(async (p) => {
  await open(p, title);
  const marks = art(p, source).locator("[data-rich-tip]"),
    tip = p.locator("#chart-tooltip");
  const evidence = {};
  let queries = 0;
  p.on("request", (r) => {
    if (r.url().endsWith("/api/query")) queries++;
  });
  for (const i of [0, 1, 0, 1, 0, 1, 2, 3]) {
    const mark = marks.nth(i),
      label = await mark.getAttribute("aria-label"),
      region = label.match(/Region ([^,]+)/)[1],
      channel = label.match(/Channel ([^ ·]+)/)[1];
    await mark.focus();
    await p.waitForFunction((label) => {
      const t = document.querySelector("#chart-tooltip");
      return (
        t &&
        !t.hidden &&
        t.querySelector(".tooltip-page-title") &&
        t.querySelector("strong").textContent === label
      );
    }, label);
    const values = rows.filter((r) => r[1] === region && r[2] === channel),
      sum = (rs, c) => rs.reduce((n, r) => n + Number(r[c]), 0);
    assert.equal(
      await tip
        .getByRole("region", { name: "Channel revenue" })
        .locator(".kpi")
        .textContent(),
      cash(sum(values, 4)),
    );
    assert.equal(
      await tip
        .getByRole("region", { name: "Channel orders" })
        .locator(".kpi")
        .textContent(),
      String(sum(values, 3)),
    );
    const matrix = await tip
      .locator("tbody tr")
      .evaluateAll((rs) =>
        rs.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    assert.deepEqual(matrix, [
      ...values.map((r) => [r[0], cash(Number(r[4])), cash(Number(r[5]))]),
      ["Grand total", cash(sum(values, 4)), cash(sum(values, 5))],
    ]);
    evidence[region + " " + channel] = matrix;
    if (i === 3) await capture(p, "gallery-report-tooltip");
    await p.keyboard.press("Escape");
    await tip.waitFor({ state: "hidden" });
  }
  assert.equal(queries, 4, "Each distinct mark needs one query batch");
  await writeFile(
    "portfolio-evidence/gallery-report-tooltip.json",
    JSON.stringify({ queries, focusEvents: 8, evidence }, null, 2) + "\n",
  );
});
console.log(
  "Four gallery points reconciled to the monthly ledger and matrix totals; eight focus events required four query batches.",
);
