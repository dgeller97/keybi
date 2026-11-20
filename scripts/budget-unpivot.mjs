import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  studio,
  open,
  save,
  addPage,
  visual,
  art,
  settled,
  measure,
  capture,
  setInput,
} from "./portfolio-ui.mjs";
const title = "Budget vs. Actual",
  page = "Forecast review",
  slicer = "Forecast period",
  matrix = "Department forecast review",
  delta = "Actual less forecast";
async function rows(name) {
  const [columns, ...lines] = (
    await readFile(resolve("web/datasets/budget", name + ".csv"), "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const headers = columns.split(",");
  return lines.map((line) =>
    Object.fromEntries(line.split(",").map((value, i) => [headers[i], value])),
  );
}
const periods = await rows("Period"),
  departments = await rows("Department"),
  forecast = await rows("Forecast"),
  ledger = await rows("Transaction");
const months = ["Jan", "Feb", "Mar", "Apr"];
const tab = (p) => p.locator("#pages .page").filter({ hasText: page });
await studio(async (p) => {
  await open(p, title);
  if (
    !(await p
      .locator("#data details summary")
      .filter({ hasText: "Forecast" })
      .count())
  ) {
    const chooser = p.waitForEvent("filechooser");
    await p.locator("[data-action=prepare]").click();
    await (await chooser).setFiles(resolve("web/datasets/budget/Forecast.csv"));
    for (const [i, source] of months.entries()) {
      await p.getByLabel("Unpivot " + source, { exact: true }).check();
      await p.getByLabel("Output name for " + source).fill(periods[i].Period);
      await p.getByLabel("Type for " + source).selectOption("number");
    }
    await p.getByLabel("Attribute column").fill("Period");
    await p.getByLabel("Value column").fill("Forecast");
    assert.deepEqual(await p.locator("#csv-preview th").allTextContents(), [
      "DepartmentKey",
      "Period",
      "Forecast",
    ]);
    assert.deepEqual(
      await p
        .locator("#csv-preview tbody tr")
        .first()
        .locator("td")
        .allTextContents(),
      ["1", "2026-01", "1050"],
    );
    await p.getByRole("button", { name: "Load table" }).click();
    await p.locator("dialog").waitFor({ state: "hidden" });
    for (const [one, many] of [
      ["Period · Period", "Forecast · Period"],
      ["Department · DepartmentKey", "Forecast · DepartmentKey"],
    ]) {
      await p.locator(".ribbon [data-action=relationship]").click();
      await p.getByLabel("One-side key").selectOption({ label: one });
      await p.getByLabel("Many-side key").selectOption({ label: many });
      await p.locator("dialog button[type=submit]").click();
      await p.locator("dialog").waitFor({ state: "hidden" });
    }
    await measure(
      p,
      delta,
      "Transaction · Actual",
      "Forecast · Forecast",
      "difference",
      "currency",
    );
  }
  if (!(await tab(p).count())) {
    await addPage(p, page);
    await visual(
      p,
      "dropdown",
      slicer,
      ["Period · Period"],
      [],
      [18, 18, 280, 118],
    );
    await visual(
      p,
      "card",
      "Monthly forecast",
      [],
      ["Forecast · Forecast"],
      [313, 18, 328, 118],
      "currency",
    );
    await visual(
      p,
      "card",
      "Above forecast",
      [],
      [delta],
      [656, 18, 322, 118],
      "currency",
    );
    await visual(
      p,
      "matrix",
      matrix,
      ["Department · Department"],
      ["Transaction · Actual", "Forecast · Forecast", delta],
      [18, 152, 960, 208],
      "currency",
    );
    await visual(
      p,
      "clusteredColumn",
      "Actual and forecast by department",
      ["Department · Department"],
      ["Transaction · Actual", "Forecast · Forecast"],
      [18, 374, 960, 250],
      "currency",
    );
  } else {
    await tab(p).click();
    for (const [title, dimensions] of [
      [matrix, { h: 208 }],
      ["Actual and forecast by department", { y: 374, h: 250 }],
    ]) {
      await art(p, title).locator(".vhead").click();
      await p.locator("[data-tab=Format]").click();
      for (const [k, v] of Object.entries(dimensions))
        await setInput(p, "[data-dim=" + k + "]", v);
    }
  }
  await settled(p);
  await art(p, slicer)
    .locator("select")
    .selectOption({ label: periods.at(-1).Period });
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, title);
  await tab(p).click();
  await settled(p);
  const control = art(p, slicer).locator("select"),
    proof = {};
  assert.equal(
    await control.locator("option:checked").textContent(),
    periods.at(-1).Period,
  );
  const number = (v) =>
    /\d/.test(v) ? Number(v.replace(/[^\d.-]/g, "")) : null;
  for (const [i, period] of periods.entries()) {
    await control.selectOption({ label: period.Period });
    await settled(p);
    const displayed = await art(p, matrix)
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [...tr.cells].map((c) => c.textContent)),
      );
    const expected = departments.map((d) => {
      const matches = ledger.filter(
        (r) =>
          r.PeriodKey === period.PeriodKey &&
          r.DepartmentKey === d.DepartmentKey,
      );
      const actual = matches.reduce((sum, r) => sum + Number(r.Actual), 0);
      const plan = Number(
        forecast.find((r) => r.DepartmentKey === d.DepartmentKey)[months[i]],
      );
      return [
        d.Department,
        matches.length ? actual : null,
        plan,
        actual - plan,
      ];
    });
    const totals = [1, 2, 3].map((k) =>
      expected.reduce((sum, r) => sum + (r[k] ?? 0), 0),
    );
    assert.deepEqual(
      displayed.map(([name, ...cells]) => [name, ...cells.map(number)]),
      [...expected, ["Grand total", ...totals]],
    );
    assert.equal(
      number(await art(p, "Monthly forecast").locator(".kpi").innerText()),
      totals[1],
    );
    assert.equal(
      number(await art(p, "Above forecast").locator(".kpi").innerText()),
      totals[2],
    );
    proof[period.Period] = { departments: expected, totals };
  }
  await capture(p, "budget-forecast");
  await writeFile(
    "portfolio-evidence/budget-forecast.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    "All twelve forecast cells, monthly actuals, department differences and totals agree with both source files after reopening.",
  );
});
