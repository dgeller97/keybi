import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  studio,
  open,
  visual,
  settled,
  save,
  art,
  addPage,
  capture,
  setInput,
} from "./portfolio-ui.mjs";
const report = "Visual Gallery",
  pageName = "Channel contribution",
  slicer = "Channel selection",
  totals = "Revenue by region",
  variance = "Variance to plan by region",
  selected = "Selected revenue",
  period = "Month selection";
const page = (p) => p.locator("#pages .page").filter({ hasText: pageName });
async function pick(p, title, name) {
  await art(p, title).locator("select").selectOption({ label: name });
  await settled(p);
}
async function snapshot(p, chart) {
  return art(p, chart)
    .locator("[data-point]")
    .evaluateAll((es) =>
      Object.fromEntries(
        es.map((e) => [
          e.getAttribute("aria-label").match(/Region ([^ ·,]+)/)[1],
          {
            total: +e.dataset.value,
            highlight:
              e.dataset.highlight == null
                ? undefined
                : Number(e.dataset.highlight),
          },
        ]),
      ),
    );
}
await studio(async (p) => {
  await open(p, report);
  if (await page(p).count()) {
    await page(p).click();
    await settled(p);
  } else await addPage(p, pageName);
  for (const spec of [
    ["dropdown", slicer, ["Dispatch · Channel"], [], [18, 18, 275, 125]],
    ["dropdown", period, ["Dispatch · Period"], [], [310, 18, 275, 125]],
    [
      "card",
      selected,
      [],
      ["Dispatch · Revenue"],
      [602, 18, 375, 125],
      "currency",
    ],
    [
      "clusteredColumn",
      totals,
      ["Dispatch · Region"],
      ["Dispatch · Revenue"],
      [18, 165, 470, 330],
      "currency",
    ],
    [
      "dot",
      variance,
      ["Dispatch · Region"],
      ["Dispatch · Change"],
      [508, 165, 470, 330],
      "currency",
    ],
  ]) {
    if (!(await art(p, spec[1]).count())) await visual(p, ...spec);
  }
  await art(p, slicer).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  for (const target of [totals, variance])
    await p
      .getByLabel("Interaction with " + target, { exact: true })
      .selectOption("highlight");
  await pick(p, slicer, "Retail");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await page(p).click();
  await settled(p);
  assert.deepEqual(await snapshot(p, totals), {
    East: { total: 863, highlight: 454 },
    West: { total: 868, highlight: 390 },
  });
  assert.deepEqual(await snapshot(p, variance), {
    East: { total: 63, highlight: 34 },
    West: { total: 18, highlight: -30 },
  });
  assert.equal(await art(p, selected).locator(".kpi").innerText(), "$844.00");
  const mark = art(p, totals).locator("[data-point]").first();
  assert.match(
    await mark.getAttribute("aria-label"),
    /Total \$863.00 · Selected \$454.00/,
  );
  const [full, part] = await mark
    .locator("rect")
    .evaluateAll((es) => es.map((e) => Number(e.getAttribute("height"))));
  assert.ok(Math.abs(part / full - 454 / 863) < 1e-10);
  await capture(p, "gallery-cross-highlight");
  await art(p, totals).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  const dl = p.waitForEvent("download");
  await p.locator("[data-action=export-csv]").click();
  const file = await dl;
  assert.equal(
    (await readFile(await file.path(), "utf8")).trim(),
    '"Region","Revenue","Selected · Revenue"\r\n"East","863","454"\r\n"West","868","390"',
  );
  await p.locator("[data-tab=Build]").click();
  await p.locator("#rank-order").selectOption("desc");
  await setInput(p, "#rank-limit", 1);
  await settled(p);
  assert.deepEqual(await snapshot(p, totals), {
    West: { total: 868, highlight: 390 },
  });
  await setInput(p, "#rank-limit", "");
  await p.locator("#rank-order").selectOption("category");
  await settled(p);
  await pick(p, period, "2026-03-01");
  assert.deepEqual(await snapshot(p, totals), {
    East: { total: 349, highlight: 180 },
    West: { total: 383, highlight: 143 },
  });
  await pick(p, slicer, "Online");
  assert.deepEqual(await snapshot(p, totals), {
    East: { total: 349, highlight: 169 },
    West: { total: 383, highlight: 240 },
  });
  await pick(p, slicer, "All");
  assert.equal(await art(p, totals).locator("[data-highlight]").count(), 0);
  assert.equal(await art(p, selected).locator(".kpi").innerText(), "$732.00");
  await pick(p, period, "All");
  await pick(p, slicer, "Retail");
  await art(p, slicer).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p
    .getByLabel("Interaction with " + totals, { exact: true })
    .selectOption("filter");
  assert.equal(
    (
      await (async () => {
        await settled(p);
        return snapshot(p, totals);
      })()
    ).East.total,
    454,
  );
  await p.getByRole("checkbox", { name: totals, exact: true }).uncheck();
  await settled(p);
  assert.equal((await snapshot(p, totals)).East.total, 863);
  console.log(
    "Saved cross-highlights, signed values, geometry, export, top N, combined slicers, filter and disabled interactions passed.",
  );
});
