import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import {
  studio,
  visual,
  rename,
  open,
  art,
  settled,
  save,
  capture,
} from "./portfolio-ui.mjs";

async function positions(chart) {
  return chart.locator(".plot-mark:has(circle)").evaluateAll((marks) =>
    marks.map((mark) => ({
      label: mark.getAttribute("aria-label"),
      value: Number(mark.dataset.value),
      x: Number(mark.querySelector("circle").getAttribute("cx")),
    })),
  );
}
function spacing(points) {
  return (points[2].x - points[1].x) / (points[1].x - points[0].x);
}
async function option(p, chart, enabled) {
  await chart.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Continuous date axis").setChecked(enabled);
  await settled(p);
}
export async function verifyCalendar() {
  const title = "Irregular readings",
    trend = "Measured load";
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "How far apart were the measurements?");
    const choosing = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await choosing
    ).setFiles({
      name: "Readings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Date,Units,Plan\n2024-03-09,9,13\n2024-02-28,3,5\n2024-02-29,5,10\n2024-02-29,2,1\n",
      ),
    });
    await p.locator("#data details[data-tree]").waitFor();
    await visual(
      p,
      "card",
      "Total units",
      [],
      ["Readings · Units"],
      [20, 20, 230, 128],
    );
    await visual(
      p,
      "line",
      trend,
      ["Readings · Date"],
      ["Readings · Units"],
      [20, 165, 720, 315],
    );
    const chart = art(p, trend);
    const before = await positions(chart);
    assert.deepEqual(
      before.map((m) => m.value),
      [3, 7, 9],
    );
    assert.ok(Math.abs(spacing(before) - 1) < 1e-8);
    await option(p, chart, true);
    for (const kind of ["line", "area", "combo"]) {
      if (kind !== "line") {
        await p.locator("[data-tab=Build]").click();
        await p.locator('[data-kind="' + kind + '"]').click();
        if (kind === "combo")
          await p
            .locator("[data-pick=other]")
            .selectOption({ label: "Readings · Plan" });
        await settled(p);
      }
      const actual = await positions(chart);
      assert.ok(Math.abs(spacing(actual) - 9) < 1e-8);
      assert.deepEqual(
        actual.map((m) => m.value),
        kind === "combo" ? [5, 11, 13] : [3, 7, 9],
      );
      assert.equal(
        await chart
          .locator("[data-tick-date]")
          .first()
          .getAttribute("data-tick-date"),
        "2024-02-28",
      );
    }
    const target = chart.locator(".plot-mark:has(circle)").nth(1);
    await target.focus();
    await p.keyboard.press("Enter");
    await settled(p);
    assert.equal(await art(p, "Total units").locator(".kpi").innerText(), "7");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    const chart = art(p, trend);
    assert.ok(Math.abs(spacing(await positions(chart)) - 9) < 1e-8);
    assert.equal(await art(p, "Total units").locator(".kpi").innerText(), "7");
    await option(p, chart, false);
    assert.ok(Math.abs(spacing(await positions(chart)) - 1) < 1e-8);
  });
  console.log(
    "Calendar spacing preserved a 1-day then 9-day interval across leap day, line/area/combo conversion, selection, save and reopen.",
  );
}
if (process.argv[2] === "gallery") {
  const names = [
    "Monthly revenue",
    "Order volume by region",
    "Revenue and order volume",
  ];
  const visit = async (p) => {
    await open(p, "Visual Gallery");
    await p.locator("#pages .page").filter({ hasText: "Trends" }).click();
    await settled(p);
  };
  await studio(async (p) => {
    await visit(p);
    for (const title of names) await option(p, art(p, title), true);
    await p.locator('[data-page="0"]').click();
    await save(p);
  });
  await studio(async (p) => {
    await visit(p);
    const ratios = [];
    for (const title of names) {
      const chart = art(p, title),
        points = await positions(chart);
      const first = points.slice(0, 3);
      assert.ok(Math.abs(spacing(first) - 28 / 31) < 1e-8);
      ratios.push({
        title,
        januaryToFebruaryDays: 31,
        februaryToMarchDays: 28,
        displayedRatio: spacing(first),
      });
    }
    await capture(p, "gallery-trends");
    await writeFile(
      "portfolio-evidence/calendar-axis.json",
      JSON.stringify(ratios, null, 2) + "\n",
    );
  });
}
