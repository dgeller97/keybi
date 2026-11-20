import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { studio, open, visual, art, settled, save } from "./portfolio-ui.mjs";
const titles = [
  "Selected channel share of monthly revenue",
  "Monthly variance by region",
];
async function visit(p) {
  await open(p, "Visual Gallery");
  await p
    .locator("#pages .page")
    .filter({ hasText: "Channel contribution" })
    .click();
  await settled(p);
}
async function mark(chart, month, region) {
  const group = chart.locator(".plot-mark").filter({
    has: chart
      .page()
      .locator("title")
      .filter({ hasText: "Period 2026-" + month + "-01, Region " + region }),
  });
  return group.evaluate((e) => {
    const h = e.querySelector(".highlight-value"),
      base = e.querySelector("rect"),
      sel = h?.querySelector("rect");
    const box = (r) =>
      r && ["x", "y", "width", "height"].map((k) => Number(r.getAttribute(k)));
    return {
      total: Number(e.dataset.value),
      selected: e.dataset.highlight === "" ? null : Number(e.dataset.highlight),
      start: Number(e.dataset.start),
      end: Number(e.dataset.end),
      from: h && Number(h.dataset.start),
      to: h && Number(h.dataset.end),
      base: box(base),
      overlay: box(sel),
    };
  });
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, a + " versus " + b);
await studio(async (p) => {
  await visit(p);
  const previous = art(p, "Retail share of monthly revenue");
  if (await previous.count()) {
    await previous.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.locator("#vtitle").fill(titles[0]);
    await p.locator("#vtitle").press("Tab");
  }
  for (const [i, title] of titles.entries()) {
    if (!(await art(p, title).count())) {
      await visual(
        p,
        i ? "stackedBar" : "percentColumn",
        title,
        ["Dispatch · Period"],
        ["Dispatch · " + (i ? "Change" : "Revenue")],
        [18 + i * 490, 515, 470, 295],
        "currency",
      );
      await p.locator("[data-tab=Build]").click();
      await p
        .locator("[data-pick=legendFields]")
        .selectOption({ label: "Dispatch · Region" });
    }
  }
  const source = art(p, "Channel selection");
  await source.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  for (const title of titles)
    await p
      .getByLabel("Interaction with " + title, { exact: true })
      .selectOption("highlight");
  await source.locator("select").selectOption({ label: "Retail" });
  await settled(p);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await visit(p);
  const shares = art(p, titles[0]),
    signed = art(p, titles[1]);
  const jan = await mark(shares, "01", "West");
  assert.deepEqual([jan.total, jan.selected], [214, 130]);
  near(jan.start, 216 / 430);
  near(jan.from, 216 / 430);
  near(jan.to, 346 / 430);
  near(jan.overlay[3] / jan.base[3], 130 / 214);
  near(jan.overlay[1] + jan.overlay[3], jan.base[1] + jan.base[3]);
  const march = await mark(signed, "03", "West");
  assert.deepEqual(
    [march.total, march.selected, march.start, march.end, march.from, march.to],
    [33, -7, 29, 62, 0, -7],
  );
  assert.ok(march.overlay[1] >= march.base[1] + march.base[3]);
  assert.match(
    await signed.locator(".highlight-key").innerText(),
    /Separate stacks/,
  );
  await p.setViewportSize({ width: 1680, height: 1300 });
  await p.locator("#viewport").evaluate((el) => (el.scrollTop = 0));
  await p.screenshot({
    path: "portfolio-evidence/gallery-stacked-highlights.png",
  });
  await shares.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-kind="percentBar"]').click();
  await settled(p);
  const horizontal = await mark(shares, "01", "West");
  near(horizontal.overlay[2] / horizontal.base[2], 130 / 214);
  near(horizontal.overlay[0], horizontal.base[0]);
  await p.locator('[data-kind="stackedColumn"]').click();
  await p.locator("[data-agg]").first().selectOption("avg");
  await settled(p);
  const average = await mark(shares, "01", "West");
  assert.deepEqual(
    [
      average.total,
      average.selected,
      average.start,
      average.end,
      average.from,
      average.to,
    ],
    [107, 130, 108, 215, 120, 250],
  );
  assert.ok(average.overlay[0] >= average.base[0] + average.base[2]);
  await art(p, "Channel selection")
    .locator("select")
    .selectOption({ label: "All" });
  await settled(p);
  assert.equal(await shares.locator(".highlight-value").count(), 0);
  await writeFile(
    "portfolio-evidence/stacked-highlights.json",
    JSON.stringify(
      {
        januaryWest: jan,
        marchWestVariance: march,
        januaryWestAverage: average,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Stacked and normalized bars and columns retained category denominators. Opposite-signed variances and averages above the baseline used independent stacks.",
  );
});
