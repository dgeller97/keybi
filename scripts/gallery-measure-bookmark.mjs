import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { studio, open, measure, art, save, settled } from "./portfolio-ui.mjs";
const report = "Visual Gallery",
  name = "Revenue attainment",
  bookmark = "Channels below revenue target",
  chart = "Regional revenue by channel";
const lines = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
  .trim()
  .split(/\r?\n/)
  .slice(1);
const totals = new Map();
for (const line of lines) {
  const [, region, channel, , revenue, target] = line.split(","),
    key = region + " " + channel;
  const sum = totals.get(key) || { region, channel, revenue: 0, target: 0 };
  sum.revenue += Number(revenue);
  sum.target += Number(target);
  totals.set(key, sum);
}
const expected = [...totals.values()].filter((r) => r.revenue < r.target);
async function compare(p) {
  const marks = art(p, chart).locator("[data-point]");
  assert.equal(await marks.count(), expected.length);
  for (const r of expected) {
    const m = marks.locator(
      'xpath=self::*[contains(@aria-label,"Region ' +
        r.region +
        ", Channel " +
        r.channel +
        '")]',
    );
    assert.equal(Number(await m.getAttribute("data-value")), r.revenue);
    await m.focus();
    const tip = p.locator("#chart-tooltip");
    await p.waitForFunction(
      () =>
        document.querySelector(
          "#chart-tooltip:not([hidden]) .tooltip-page-title",
        )?.textContent === "Channel detail tooltip",
    );
    assert.ok(
      (await tip.locator(".kpi").allTextContents()).includes(
        "$" + r.revenue.toFixed(2),
      ),
    );
    await p.keyboard.press("Escape");
  }
}
async function filters(p) {
  await art(p, chart).locator(".vhead").click();
  await p.locator("[data-tab=Filters]").click();
}
async function page(p) {
  await open(p, report);
  await p.locator("#pages .page").filter({ hasText: "Comparisons" }).click();
  await settled(p);
}
await studio(async (p) => {
  await page(p);
  if (
    !(await p
      .locator('#data [data-field^="@"]')
      .filter({ hasText: name })
      .count())
  )
    await measure(p, name, "Dispatch · Revenue", "Dispatch · Target");
  await filters(p);
  if (!(await p.locator("[data-clear-measure-filter]").count())) {
    await p.locator('[data-measure-filter="new"]').click();
    await p
      .getByLabel("Measure", { exact: true })
      .selectOption({ label: name });
    await p.getByLabel("Condition").selectOption("lt");
    await p.getByLabel("Threshold (%)").fill("100");
    await p.locator("dialog button[type=submit]").click();
    await settled(p);
  }
  await compare(p);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const go = p.getByRole("button", { name: bookmark, exact: true });
  if (await go.count())
    await go.locator("..").getByText("Update", { exact: true }).click();
  else {
    await p.getByLabel("New bookmark name").fill(bookmark);
    await p.getByRole("button", { name: "Add current view" }).click();
  }
  await filters(p);
  await p.getByLabel("Clear measure filter").click();
  await settled(p);
  assert.equal(
    await art(p, chart).locator("[data-point]").count(),
    totals.size,
  );
  await save(p);
});
await studio(async (p) => {
  await page(p);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button", { name: bookmark, exact: true }).click();
  await settled(p);
  await compare(p);
  await writeFile(
    "portfolio-evidence/gallery-measure-bookmark.json",
    JSON.stringify(
      { bookmark, rule: name + " < 100%", matched: expected },
      null,
      2,
    ) + "\n",
  );
});
console.log(
  "Gallery bookmark restored the hidden revenue-target filter and its channel tooltip after reopening.",
);
