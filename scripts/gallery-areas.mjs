import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  art,
  visual,
  save,
  settled,
  capture,
  addPage,
  currentPageLink,
} from "./portfolio-ui.mjs";

const report = "Visual Gallery",
  page = "Regional revenue mix";
const amount = "Monthly revenue by region",
  share = "Regional share of monthly revenue",
  total = "Revenue in view";
const tab = (p) => p.locator("#pages .page").filter({ hasText: page });
const proof = {};
const csv = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((l) => l.split(","));
function expected(channel) {
  const result = new Map();
  for (const [date, region, c, , raw] of csv)
    if (!channel || c === channel) {
      const regions = result.get(date) || new Map();
      regions.set(region, (regions.get(region) || 0) + Number(raw));
      result.set(date, regions);
    }
  return result;
}
const close = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} differs from ${b}`);
async function checkChart(p, title, data, normalized) {
  const plot = art(p, title);
  const marks = await plot.locator("[data-area-point]").evaluateAll((ms) =>
    ms.map((g) => {
      const label = g.getAttribute("aria-label"),
        line = g.querySelector("line"),
        circle = g.querySelector("circle");
      return {
        date: label.match(/\d{4}-\d{2}-\d{2}/)[0],
        region: label.match(/Region (East|West)/)[1],
        amount: +g.dataset.value,
        start: +g.dataset.start,
        end: +g.dataset.end,
        x: +circle.getAttribute("cx"),
        y: +line.getAttribute("y2"),
        base: +line.getAttribute("y1"),
        faces: g.querySelector("path")?.getAttribute("d"),
      };
    }),
  );
  const scale = await plot.locator('[data-scale="primary"]').evaluate((g) => {
    const grid = [...g.querySelectorAll("line")];
    return {
      lo: +g.dataset.min,
      hi: +g.dataset.max,
      bottom: +grid[0].getAttribute("y1"),
      top: +grid.at(-1).getAttribute("y1"),
    };
  });
  const y = (n) =>
    scale.bottom +
    ((scale.top - scale.bottom) * (n - scale.lo)) / (scale.hi - scale.lo);
  const summary = [];
  for (const [date, regions] of data) {
    const sum = [...regions.values()].reduce((a, b) => a + b, 0);
    let base = 0;
    for (const region of ["East", "West"]) {
      const mark = marks.find((m) => m.date === date && m.region === region);
      const n = regions.get(region),
        height = normalized ? n / sum : n;
      assert.equal(mark.amount, n);
      close(mark.start, base);
      close(mark.base, y(base));
      base += height;
      close(mark.end, base);
      close(mark.y, y(base));
      assert.ok(mark.faces.includes("Z"));
      summary.push({
        date,
        region,
        amount: n,
        start: mark.start,
        end: mark.end,
      });
    }
  }
  assert.equal(marks.length, summary.length);
  const xs = marks
    .filter((m) => m.region === "East")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => m.x);
  close((xs[1] - xs[0]) / (xs[2] - xs[1]), 31 / 28);
  return summary;
}
await studio(async (p) => {
  await open(p, report);
  if (!(await tab(p).count())) await addPage(p, page);
  else {
    await tab(p).click();
    await settled(p);
  }
  if (!(await art(p, total).count())) {
    await visual(
      p,
      "dropdown",
      "Sales channel",
      ["Dispatch · Channel"],
      [],
      [18, 18, 369, 104],
    );
    await visual(
      p,
      "card",
      total,
      [],
      ["Dispatch · Revenue"],
      [402, 18, 576, 104],
      "currency",
    );
    for (const [kind, title, x] of [
      ["stackedArea", amount, 18],
      ["percentArea", share, 508],
    ]) {
      await visual(
        p,
        kind,
        title,
        ["Dispatch · Period"],
        ["Dispatch · Revenue"],
        [x, 140, 470, 360],
        "currency",
      );
      await p.getByLabel("Continuous date axis").check();
      await p.getByLabel("Data labels", { exact: true }).check();
      await p.locator("[data-tab=Build]").click();
      await p
        .locator("[data-pick=legendFields]")
        .selectOption({ label: "Dispatch · Region" });
      await settled(p);
    }
  }
  const chart = art(p,amount);
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=groups]").selectOption({label:"Dispatch · Channel"});
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  await tab(p).click();
  await settled(p);
  proof.url = await currentPageLink(p);
  for (const channel of ["", "Online", "Retail", ""]) {
    const dropdown = art(p, "Sales channel").locator("select");
    if (channel) await dropdown.selectOption({ label: channel });
    else await dropdown.selectOption("");
    await settled(p);
    const data = expected(channel);
    proof[channel || "All"] = {
      amount: await checkChart(p, amount, data, false),
      share: await checkChart(p, share, data, true),
    };
  }
  await capture(p, "gallery-stacked-areas");
  // Click inside the March half of the western band, away from its marker.
  const point = await art(p, amount)
    .locator("svg.analytic-plot")
    .evaluate((svg) => {
      const mark = (month) =>
        svg.querySelector(
          '[data-area-point][aria-label*="' +
            month +
            '"][aria-label*="Region West"]',
        );
      const read = (m) => [
        +m.querySelector("circle").getAttribute("cx"),
        +m.querySelector("circle").getAttribute("cy"),
      ];
      const [x1, y1] = read(mark("2026-02")),
        [x2, y2] = read(mark("2026-03"));
      const pt = new DOMPoint(
        x1 + (x2 - x1) * 0.82,
        y1 + (y2 - y1) * 0.82,
      ).matrixTransform(svg.getScreenCTM());
      const hit = document.elementFromPoint(pt.x, pt.y);
      return {
        x: pt.x,
        y: pt.y,
        element: hit.tagName,
        label: hit.closest("[data-area-point]")?.getAttribute("aria-label"),
      };
    });
  assert.equal(point.element, "path");
  assert.match(point.label, /2026-03.*Region West/);
  await p.mouse.click(point.x, point.y);
  await settled(p);
  assert.equal(await art(p, total).locator(".kpi").innerText(), "$383.00");
  assert.equal(await art(p, share).locator("[data-area-point]").count(), 1);
  close(
    +(await art(p, share)
      .locator("[data-area-point]")
      .getAttribute("data-end")),
    1,
  );
  const chart = art(p,amount);
  await chart.locator("[data-drill=down]").click();
  await settled(p);
  assert.equal(await chart.locator(".drill-path").innerText(),"2026-03-01 › Channel");
  const contributions = csv.filter(([date]) => date === "2026-03-01");
  assert.equal(await chart.locator("[data-area-point]").count(), contributions.length);
  for (const [,region,channel,,revenue] of contributions) {
    const mark = chart.locator('[data-area-point][aria-label^="Channel ' + channel + ', Region ' + region + '"]');
    assert.equal(Number(await mark.getAttribute("data-value")), Number(revenue));
  }
  await chart.locator('[data-area-point][aria-label^="Channel Online, Region West"]').press("Enter");
  await settled(p);
  assert.equal(await art(p,total).locator(".kpi").innerText(),"$240.00");
  await capture(p,"gallery-channel-drill");
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  assert.equal(await art(p, total).locator(".kpi").innerText(), "$1,731.00");
  proof.bandClick = { ...point, filteredRevenue: 383 };
  proof.marchChannels = contributions.map(([,region,channel,,amount]) => ({region,channel,amount:Number(amount)}));
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await writeFile(
  "portfolio-evidence/stacked-areas.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(
  "Regional area bands reconcile for all dispatches and each channel. A click inside March West selects $383.",
);
