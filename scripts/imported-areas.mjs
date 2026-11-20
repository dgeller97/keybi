import assert from "node:assert/strict";
import {
  studio,
  open,
  rename,
  visual,
  art,
  save,
  settled,
  addPage,
  measure,
} from "./portfolio-ui.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatChart,
  configureLine,
  verifyGeometry,
} from "./reference-geometry.mjs";
const report = "Signed dispatch adjustments",
  title = "Daily movement",
  card = "Booked pallets";
const csv =
  "Day,Booked,Correction,Queue\n2026-02-28,6,4,\n2026-02-28,4,,(Blank)\n2026-03-01,20,-8,(Blank)\n2026-03-10,,3,\n2026-03-11,0,0,\n2026-03-12,5,-5,(Blank)\n";
const at = (plot, date, metric) =>
  plot.locator(
    '[data-area-point][aria-label*="' +
      date +
      '"][aria-label*="' +
      metric +
      '"]',
  );
const near = (a, b) =>
  assert.ok(Math.abs(a - b) < 1e-7, a + " differs from " + b);
const bounds = (mark) =>
  mark.evaluate((m) => [+m.dataset.start, +m.dataset.end]);
async function changeChart(p, kind) {
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-kind="' + kind + '"]').click();
  await settled(p);
}
export async function verifyImportedAreas() {
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(
      p,
      report,
      "How much of each day's movement came from adjustments?",
    );
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await picker
    ).setFiles({
      name: "Movement.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    await p
      .getByTitle("Movement.Booked", { exact: true })
      .waitFor({ state: "attached" });
    await visual(
      p,
      "card",
      card,
      [],
      ["Movement · Booked"],
      [650, 18, 320, 140],
    );
    await visual(
      p,
      "percentArea",
      title,
      ["Movement · Day"],
      ["Movement · Booked", "Movement · Correction"],
      [18, 18, 610, 390],
    );
    await p.getByLabel("Data labels", { exact: true }).check();
    await p.getByLabel("Continuous date axis").check();
    await settled(p);
    const plot = art(p, title);
    assert.equal(await plot.locator("[data-area-point]").count(), 9);
    assert.equal(await plot.locator("[data-no-share]").count(), 2);
    assert.match(
      await at(plot, "2026-03-11", "Correction").getAttribute("aria-label"),
      /Share unavailable/,
    );
    assert.equal(await at(plot, "2026-03-10", "Booked").count(), 0);
    near((await bounds(at(plot, "2026-03-01", "Correction")))[1], -8 / 28);
    await configureLine(p, "primary", {
      name: "Mean correction share",
      statistic: "average",
      measure: "Correction",
    });
    await verifyGeometry(
      plot,
      "primary",
      0.125,
      false,
      "Mean correction share",
    );
    await changeChart(p, "stackedArea");
    assert.deepEqual(
      await bounds(at(plot, "2026-02-28", "Correction")),
      [10, 14],
    );
    assert.deepEqual(
      await bounds(at(plot, "2026-03-01", "Correction")),
      [0, -8],
    );
    await verifyGeometry(plot, "primary", -1.2, false, "Mean correction share");
    const coords = await plot.evaluate((article) => {
      const mark = (date, name) =>
        article.querySelector(
          '[data-area-point][aria-label*="' +
            date +
            '"][aria-label*="' +
            name +
            '"]',
        );
      const x = (m) => +m.querySelector("circle").getAttribute("cx");
      const xs = ["2026-02-28", "2026-03-01", "2026-03-10"].map((date) =>
        x(mark(date, "Correction")),
      );
      const path = (m) =>
        Array.from(
          (m.querySelector("path")?.getAttribute("d") || "").matchAll(
            /([\d.e+-]+),([\d.e+-]+)/g,
          ),
          (pair) => pair.slice(1).map(Number),
        );
      const points = path(mark("2026-02-28", "Correction"));
      const y0 = +mark("2026-03-01", "Correction")
        .querySelector("line")
        .getAttribute("y1");
      const y10 = +mark("2026-02-28", "Booked")
        .querySelector("line")
        .getAttribute("y2");
      return { xs, points, y0, y10, gap: path(mark("2026-03-01", "Booked")) };
    });
    const [first, second, third] = coords.xs;
    near((third - second) / (second - first), 9);
    const crossing = first + (second - first) / 3;
    for (const y of [coords.y0, coords.y0 + ((coords.y10 - coords.y0) * 4) / 3])
      assert.ok(
        coords.points.some(
          ([x, n]) => Math.abs(x - crossing) < 1e-7 && Math.abs(n - y) < 1e-7,
        ),
        "Incorrect positive or negative wedge at zero",
      );
    assert.ok(
      coords.gap.every(([x]) => x <= second + 1e-7),
      "Filled a blank observation",
    );
    await p.locator('[data-agg-well="metrics"]').first().selectOption("avg");
    await settled(p);
    assert.deepEqual(
      await bounds(at(plot, "2026-02-28", "Correction")),
      [5, 9],
    );
    for (const kind of ["area", "line", "stackedColumn", "percentArea"])
      await changeChart(p, kind);
    near((await bounds(at(plot, "2026-02-28", "Correction")))[0], 5 / 9);
    await at(plot, "2026-03-01", "Correction").press("Enter");
    await settled(p);
    assert.equal(await art(p, card).locator(".kpi").innerText(), "20");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, report);
    const plot = art(p, title),
      mark = at(plot, "2026-03-01", "Correction");
    assert.equal(await mark.getAttribute("aria-pressed"), "true");
    assert.equal(await art(p, card).locator(".kpi").innerText(), "20");
    await verifyGeometry(
      plot,
      "primary",
      (4 / 9 - 8 / 28 + 1 - 0.5) / 4,
      false,
      "Mean correction share",
    );
    await plot.getByLabel("Clear selection").click();
    await settled(p);
    assert.equal(await art(p, card).locator(".kpi").innerText(), "35");
    await formatChart(p, title);
    assert.equal(await p.getByLabel("Continuous date axis").isChecked(), true);
    await addPage(p, "Distinct series");
    const name = "Bookings by queue";
    await visual(
      p,
      "stackedArea",
      name,
      ["Movement · Day"],
      ["Movement · Booked"],
      [18, 18, 600, 340],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=legendFields]")
      .selectOption({ label: "Movement · Queue" });
    await settled(p);
    const queues = art(p, name);
    assert.deepEqual(
      new Set(await queues.locator("[data-series-color]").allTextContents()),
      new Set(["(Blank)", '"(Blank)"']),
    );
    const first = queues.locator('[data-area-point][aria-label*="2026-02-28"]');
    assert.equal(await first.locator("path").count(), 1);
    assert.equal(
      await first
        .and(queues.locator('[data-value="4"]'))
        .locator("path")
        .count(),
      1,
    );
    await p.locator('[data-remove-field="legendFields:0"]').click();
    await settled(p);
    await measure(
      p,
      "Booked",
      "Movement · Correction",
      "Movement · Booked",
      "ratio",
      "number",
    );
    await queues.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=metrics]").selectOption({ label: "Booked" });
    await settled(p);
    assert.deepEqual(
      await queues.locator("[data-series-color]").allTextContents(),
      ["Booked", "Booked (2)"],
    );
    assert.equal(await first.locator("path").count(), 2);
    const top = await bounds(first.and(queues.locator('[data-metric="1"]')));
    near(top[0], 10);
    near(top[1], 10.4);
  });
  console.log(
    "Imported signed bands preserve stack order, gaps, zero totals, sign crossings, aggregation, percent references and selections through chart conversion and reopen.",
  );
}

export async function benchmarkAreas(p, daily, directory) {
  const dates = (await readFile(join(directory, "Date.csv"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .slice(1);
  const dateKeys = new Map(
    dates.map((row) => {
      const [key, day] = row.split(",");
      return [day, Number(key)];
    }),
  );
  await addPage(p, "Daily cost and profit");
  await p.locator(".ribbon [data-action=calculation]").click();
  await p.getByLabel("Name", { exact: true }).fill("Cost");
  await p.getByLabel("Left column").selectOption({ label: "Sales · Revenue" });
  await p.getByLabel("Right column").selectOption({ label: "Sales · Profit" });
  await p.getByLabel("Operator").selectOption("-");
  await p.getByRole("button", { name: "Create", exact: true }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
  await visual(
    p,
    "card",
    "Revenue on selected date",
    [],
    ["Sales · Revenue"],
    [18, 18, 930, 100],
    "currency",
  );
  await visual(
    p,
    "stackedArea",
    "Daily revenue components",
    ["Date · Date"],
    ["Sales · Cost", "Sales · Profit"],
    [18, 140, 930, 390],
    "currency",
  );
  await p.getByLabel("Continuous date axis").check();
  await p.getByLabel("Data labels", { exact: true }).check();
  await settled(p);
  const plot = art(p, "Daily revenue components");
  const marks = await plot
    .locator("[data-area-point]")
    .evaluateAll((es) =>
      es.map((g) => [
        g.getAttribute("aria-label").match(/\d{4}-\d{2}-\d{2}/)[0],
        +g.dataset.metric,
        +g.dataset.start,
        +g.dataset.end,
      ]),
    );
  assert.equal(marks.length, daily.size * 2);
  for (const [day, metric, start, end] of marks) {
    const [revenue, profit] = daily.get(dateKeys.get(day));
    assert.equal(Math.round(100 * start), metric ? revenue - profit : 0);
    assert.equal(Math.round(100 * end), metric ? revenue : revenue - profit);
  }
  const labels = await plot.locator("[data-area-label]").evaluateAll((es) =>
    es.map((e) => {
      const b = e.getBBox();
      return [b.x, b.y, b.width, b.height];
    }),
  );
  assert.ok(labels.length > 0 && labels.length < marks.length);
  for (const [i, [x, y, w, h]] of labels.entries())
    for (const [a, b, c, d] of labels.slice(0, i))
      assert.ok(
        x + w <= a || a + c <= x || y + h <= b || b + d <= y,
        "Overlapping daily area labels",
      );
  const days = [...dateKeys.keys()].filter((day) =>
    daily.has(dateKeys.get(day)),
  );
  const picks = [days[0], days[Math.floor(days.length / 2)], days.at(-1)];
  const timings = [];
  for (const day of [...picks, ...picks]) {
    const point = plot.locator('[data-metric="1"][aria-label*="' + day + '"]');
    const want = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(daily.get(dateKeys.get(day))[0] / 100);
    await point.evaluate((el) =>
      el.addEventListener(
        "keydown",
        () => {
          window.areaStart = performance.now();
        },
        { once: true },
      ),
    );
    await point.press("Enter");
    const elapsed = await p.evaluate(
      async ({ day, want }) => {
        for (let i = 0; i < 150; i++) {
          await new Promise(requestAnimationFrame);
          if (
            document.querySelector("#paper").dataset.pending === "false" &&
            document.querySelector(".kpi")?.textContent === want &&
            document.querySelector(
              '[data-area-point][aria-pressed="true"][aria-label*="' +
                day +
                '"]',
            )
          ) {
            await new Promise(requestAnimationFrame);
            return performance.now() - window.areaStart;
          }
        }
        throw Error("Selected date did not reconcile");
      },
      { day, want },
    );
    timings.push({ day, revenue: want, displayMs: elapsed });
  }
  return {
    dates: days.length,
    marks: marks.length,
    labels: labels.length,
    timings,
  };
}
