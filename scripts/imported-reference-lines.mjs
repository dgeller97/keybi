import assert from "node:assert/strict";
import {
  studio,
  open,
  rename,
  visual,
  art,
  filter,
  addPage,
  save,
  settled,
  setInput,
} from "./portfolio-ui.mjs";
import {
  formatChart,
  configureLine,
  verifyGeometry,
} from "./reference-geometry.mjs";
const report = "Dispatch tolerance bands",
  chart = "Net pallets by route",
  ledger = "Routes for review";
export async function verifyReferenceLines() {
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, report, "Which routes crossed the return limit?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await picker
    ).setFiles({
      name: "Dock movements.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Route,Pallets,Demand\nNorth,-8,20\nNorth,1,8\nSouth,4,9\nEast,0,0\nWest,9,20\nUnposted,,200\n",
      ),
    });
    await p
      .getByTitle("Dock movements.Pallets", { exact: true })
      .waitFor({ state: "attached" });
    await visual(
      p,
      "clusteredBar",
      chart,
      ["Dock movements · Route"],
      ["Dock movements · Pallets"],
      [18, 18, 530, 340],
    );
    await visual(
      p,
      "table",
      ledger,
      ["Dock movements · Route"],
      ["Dock movements · Pallets"],
      [565, 18, 410, 340],
    );
    await p.locator("[data-tab=Filters]").click();
    await p.locator('[data-measure-filter="new"]').click();
    await p
      .getByLabel("Measure", { exact: true })
      .selectOption({ label: "Pallets" });
    await p.getByLabel("Condition").selectOption("lt");
    await p.getByLabel("Threshold", { exact: true }).fill("-5");
    await p.locator("dialog button[type=submit]").click();
    await settled(p);
    const plot = art(p, chart);
    await formatChart(p, chart);
    await configureLine(p, "primary", {
      name: "Return limit",
      value: -5,
      source: "Routes for review / Pallets",
      label: "name",
      position: "start",
      pattern: "solid",
      color: "#4e387d",
    });
    await configureLine(p, "primary", {
      name: "Capacity",
      value: 20,
      label: "value",
      pattern: "dotted",
      color: "#245d77",
    });
    await verifyGeometry(plot, "primary", -5, true, "Return limit");
    await verifyGeometry(plot, "primary", 20, true, "Capacity");
    assert.deepEqual(
      await plot.locator("[data-reference-label]").allTextContents(),
      ["Return limit", "20"],
    );
    assert.equal(
      await plot
        .locator('[data-reference-value="-5"] line')
        .getAttribute("stroke"),
      "#4e387d",
    );
    assert.equal(
      await plot
        .locator('[data-reference-value="20"] line')
        .getAttribute("stroke-dasharray"),
      "2 3",
    );
    assert.ok(
      Number(
        await plot.locator('[data-scale="primary"]').getAttribute("data-max"),
      ) >= 20,
    );
    for (const kind of ["clusteredColumn", "area", "clusteredBar"]) {
      await p.locator("[data-tab=Build]").click();
      await p.locator('[data-kind="' + kind + '"]').click();
      await settled(p);
      await verifyGeometry(
        plot,
        "primary",
        -5,
        kind === "clusteredBar",
        "Return limit",
      );
      assert.deepEqual(
        await plot
          .locator("[data-point]")
          .evaluateAll((ms) =>
            ms.map((m) => Number(m.dataset.value)).sort((a, b) => a - b),
          ),
        [-7, 0, 4, 9],
      );
    }
    await formatChart(p, chart);
    await configureLine(
      p,
      "primary",
      { name: "Capacity", value: 12, label: "none", color: "#245d77" },
      "Capacity",
    );
    assert.equal(await plot.locator("[data-reference-label]").count(), 1);
    await save(p);
  });
  await studio(async (p) => {
    await open(p, report);
    const plot = art(p, chart);
    await verifyGeometry(plot, "primary", -5, true, "Return limit");
    await verifyGeometry(plot, "primary", 12, true, "Capacity");
    const mark = plot.locator('[data-value="-7"]');
    await mark.click();
    await settled(p);
    assert.equal(await mark.getAttribute("aria-pressed"), "true");
    await art(p, chart).getByLabel("Clear selection").click();
    await settled(p);
    await art(p, ledger).locator("[data-view-filters]").click();
    await p.getByLabel("Clear measure filter").click();
    await settled(p);
    assert.equal(await plot.locator("[data-reference]").count(), 1);
    await formatChart(p, chart);
    await p
      .getByRole("button", {
        name: "Return limit · Filter unavailable",
        exact: true,
      })
      .click();
    await p.locator("#ref-source").selectOption("constant");
    await p.locator("#ref-value").fill("-3");
    await p.locator("dialog button[type=submit]").click();
    await verifyGeometry(plot, "primary", -3, true, "Return limit");
    await p.getByLabel("Remove Capacity · 12").click();
    await settled(p);
    assert.equal(await plot.locator("[data-reference]").count(), 1);
    await setInput(p, '[data-axis-key="primary"][data-bound="min"]', 0);
    assert.equal(await plot.locator("[data-reference]").count(), 0);
  });
  console.log(
    "Imported signed movements retained both authored references through chart conversion and reopen. Source removal, relinking, clipping, labels, colors and selection passed.",
  );
  await studio(async (p) => {
    await open(p, report);
    const plot = art(p, chart);
    await plot.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=metrics]")
      .selectOption({ label: "Dock movements · Demand" });
    await settled(p);
    await formatChart(p, chart);
    const summary = { name: "Route statistic", measure: "Pallets" };
    let existing;
    for (const [statistic, expected, percentile] of [
      ["min", -7],
      ["max", 9],
      ["average", 1.5],
      ["percentile", -7, 0],
      ["percentile", 9, 100],
      ["percentile", 5.25, 75],
      ["median", 2],
    ]) {
      await configureLine(
        p,
        "primary",
        { ...summary, statistic, percentile },
        existing,
      );
      await verifyGeometry(plot, "primary", expected, true, summary.name);
      existing = summary.name;
    }
    await configureLine(p, "primary", {
      name: "Demand median",
      measure: "Demand",
      statistic: "median",
    });
    await verifyGeometry(plot, "primary", 20, true, "Demand median");
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="combo"]').click();
    await settled(p);
    await verifyGeometry(plot, "primary", 2, false, summary.name);
    await verifyGeometry(plot, "secondary", 20, false, "Demand median");
    await p.locator('[data-agg-well="other"]').selectOption("avg");
    await settled(p);
    await formatChart(p, chart);
    await p
      .getByRole("button", { name: /^Demand median.*Average of Demand/ })
      .waitFor();
    await p.getByLabel("Secondary line axis").uncheck();
    await settled(p);
    await verifyGeometry(plot, "primary", 14, false, "Demand median");
    await p.getByLabel("Secondary line axis").check();
    await settled(p);
    await save(p);
  });
  await studio(async (p) => {
    await open(p, report);
    await verifyGeometry(
      art(p, chart),
      "secondary",
      14,
      false,
      "Demand median",
    );
    await verifyGeometry(art(p, chart), "primary", 2, false, "Route statistic");
    const plot = art(p, chart);
    await plot.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="percentColumn"]').click();
    await settled(p);
    await verifyGeometry(plot, "primary", 2 / 13, false, "Route statistic");
    await verifyGeometry(plot, "primary", 20 / 29, false, "Demand median");
    await filter(p, "visual", "Dock movements · Route", "Unposted");
    assert.equal(
      await plot.getByRole("img", { name: /^Route statistic/ }).count(),
      0,
    );
    await verifyGeometry(plot, "primary", 1, false, "Demand median");
  });
  console.log(
    "Signed values, zeros, blanks, both percentile endpoints, measure selection, aggregation edits and combo-axis conversion passed after reopening.",
  );
}

export async function benchmarkStatistics(p, totals) {
  await addPage(p, "Category margin distribution");
  const title = "Margin by category",
    name = "Category percentile";
  await visual(
    p,
    "clusteredColumn",
    title,
    ["Product · Category"],
    ["Margin"],
    [18, 18, 920, 440],
  );
  const ratios = [...totals.values()]
    .map(([revenue, profit]) => profit / revenue)
    .sort((a, b) => a - b);
  const samples = [];
  let queries = 0;
  const count = (req) => {
    if (req.url().endsWith("/api/query")) queries++;
  };
  p.on("request", count);
  try {
    for (const percentile of [50, 90, 99]) {
      if (samples.length)
        await p
          .locator("[data-edit-reference]")
          .filter({ hasText: name })
          .click();
      else await p.locator('[data-add-reference="primary"]').click();
      await p.locator("#ref-source").selectOption("percentile");
      await p.getByLabel("Chart measure").selectOption({ label: "Margin" });
      await p.getByLabel("Percentile (0–100)").fill(String(percentile));
      await p.getByLabel("Name", { exact: true }).fill(name);
      const rank = (percentile * (ratios.length - 1)) / 100;
      const lower = ratios[Math.floor(rank)],
        upper = ratios[Math.ceil(rank)];
      const expected = lower + (rank % 1) * (upper - lower);
      const elapsed = await p
        .locator("dialog button[type=submit]")
        .evaluate(async (button, expected) => {
          const start = performance.now();
          button.click();
          for (let i = 0; i < 120; i++) {
            await new Promise(requestAnimationFrame);
            const line = document.querySelector(
              "#paper [data-reference-value]",
            );
            if (
              line &&
              Math.abs(Number(line.dataset.referenceValue) - expected) < 1e-10
            ) {
              await new Promise(requestAnimationFrame);
              return performance.now() - start;
            }
          }
          throw Error("Timed out displaying the expected percentile");
        }, expected);
      await verifyGeometry(art(p, title), "primary", expected, false, name);
      samples.push({
        percentile,
        groups: ratios.length,
        value: expected,
        displayMs: elapsed,
      });
    }
    assert.equal(queries, 0);
    return { queries, samples };
  } finally {
    p.off("request", count);
  }
}
