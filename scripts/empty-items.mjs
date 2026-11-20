import assert from "node:assert/strict";
import {
  studio,
  open,
  rename,
  visual,
  art,
  links,
  save,
  settled,
  filter,
  addPage,
} from "./portfolio-ui.mjs";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";

const title = "Inventory coverage";
const inputs = {
  Style: "StyleKey,Style\n1,Polished\n2,Natural\n3,Bare\n",
  Part: "PartKey,Family,Finish,StyleKey\n1,Alpha,Gloss,1\n2,Alpha,Matte,2\n3,Beta,Gloss,1\n4,Gamma,Satin,2\n",
  Period: "PeriodKey,Period\n1,January\n2,February\n3,March\n",
  Posting:
    "PartKey,PeriodKey,Amount,Status\n1,1,0,Posted\n3,1,7,Posted\n99,2,4,Posted\n2,3,13,Draft\n",
};
export async function benchmarkEmptyDates(p, directory) {
  const dates = (await readFile(join(directory, "Date.csv"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((r) => r.split(","));
  const file = createReadStream(join(directory, "Sales.csv"));
  const reader = createInterface({ input: file, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  let sale;
  try {
    await lines.next();
    sale = (await lines.next()).value.split(",");
  } finally {
    reader.close();
    file.destroy();
  }
  const [id, , key, revenue] = sale,
    day = dates.find(([k]) => k === key)[1];
  await addPage(p, "Sparse calendar benchmark");
  await visual(
    p,
    "line",
    "Sale by date",
    ["Date · Date"],
    ["Sales · Revenue"],
    [20, 20, 920, 430],
  );
  await p.getByLabel("Continuous date axis").check();
  await filter(p, "visual", "Sales · SaleID", id);
  await p.locator("[data-tab=Build]").click();
  const option = p.getByLabel("Show items with no data", { exact: true });
  const samples = [];
  for (const enabled of [true, false, true, false]) {
    const response = p.waitForResponse((r) => r.url().endsWith("/api/query"));
    const elapsed = await option.evaluate(async (el) => {
      const start = performance.now();
      el.click();
      do {
        await new Promise(requestAnimationFrame);
      } while (document.querySelector("#paper").dataset.pending !== "false");
      return performance.now() - start;
    });
    const [query] = await (await response).json();
    const expected = enabled
      ? dates.map(([k, date]) => [date, k === key ? Number(revenue) : null])
      : [[day, Number(revenue)]];
    assert.deepEqual(query.rows, expected);
    const plot = art(p, "Sale by date");
    assert.equal(await plot.locator("[data-point]").count(), 1);
    assert.equal(
      await plot.locator("[data-point]").getAttribute("data-value"),
      revenue,
    );
    const endpoints = await plot
      .locator("[data-tick-date]")
      .evaluateAll((ts) => ts.map((t) => t.dataset.tickDate));
    assert.equal(endpoints[0], expected[0][0]);
    assert.equal(endpoints.at(-1), expected.at(-1)[0]);
    samples.push({
      enabled,
      categories: expected.length,
      queryMs: query.ms,
      cached: query.cache,
      displayMs: elapsed,
    });
  }
  return samples;
}
async function rows(p, name) {
  return art(p, name)
    .locator("tbody tr")
    .evaluateAll((rs) =>
      rs.map((r) => [...r.cells].map((c) => c.textContent.trim())),
    );
}
async function setAxis(p, name, option, checked) {
  await art(p, name).locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p
    .getByLabel("Show items with no data" + option, { exact: true })
    .setChecked(checked);
  await settled(p);
}
export async function verifyEmptyItems() {
  const pivot = "Posted by family and period",
    detail = "Available finishes",
    trend = "Pending periods";
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "Which listed parts and periods have no posting?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await picker
    ).setFiles(
      Object.entries(inputs).map(([name, csv]) => ({
        name: name + ".csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csv),
      })),
    );
    await p
      .getByTitle("Posting.Status", { exact: true })
      .waitFor({ state: "attached" });
    await links(p, 3);
    await filter(p, "page", "Posting · Status", "Posted");
    await visual(
      p,
      "matrix",
      pivot,
      ["Part · Family"],
      ["Posting · Amount"],
      [18, 18, 600, 250],
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=columns]")
      .selectOption({ label: "Period · Period" });
    await settled(p);
    const labels = () => art(p, pivot).locator("thead").textContent();
    assert.doesNotMatch(await labels(), /March/);
    await setAxis(p, pivot, " (rows)", true);
    assert.ok((await rows(p, pivot)).some((row) => row[0] === "Gamma"));
    assert.doesNotMatch(await labels(), /March/);
    await setAxis(p, pivot, " (columns)", true);
    assert.match(await labels(), /March/);
    await setAxis(p, pivot, " (rows)", false);
    assert.ok(!(await rows(p, pivot)).some((row) => row[0] === "Gamma"));
    assert.match(await labels(), /March/);
    await setAxis(p, pivot, " (rows)", true);
    await visual(
      p,
      "table",
      detail,
      ["Part · Family", "Part · Finish"],
      ["Posting · Amount"],
      [18, 285, 600, 270],
    );
    await setAxis(p, detail, "", true);
    await visual(
      p,
      "line",
      trend,
      ["Period · Period"],
      ["Posting · Amount"],
      [630, 18, 350, 250],
    );
    await filter(p, "visual", "Posting · Status", "Missing");
    await setAxis(p, trend, "", true);
    for (const [name, fields] of [
      ["Style first", ["Style · Style", "Part · Finish"]],
      ["Finish first", ["Part · Finish", "Style · Style"]],
    ]) {
      await visual(
        p,
        "table",
        name,
        fields,
        ["Posting · Amount"],
        [20, 570, 460, 240],
      );
      await setAxis(p, name, "", true);
    }
    await visual(
      p,
      "table",
      "Natural finishes",
      ["Part · Finish"],
      ["Posting · Amount"],
      [500, 570, 470, 240],
    );
    await filter(p, "visual", "Style · Style", "Natural");
    await setAxis(p, "Natural finishes", "", true);
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    const result = await rows(p, pivot);
    const find = (name) => result.find((r) => r[0] === name);
    // Pivot columns sort alphabetically as February, January, March, then total.
    assert.deepEqual(find("Alpha"), ["Alpha", "—", "0", "—", "0"]);
    assert.deepEqual(find("Gamma"), ["Gamma", "—", "—", "—", "—"]);
    assert.deepEqual(find("(Blank)"), ["(Blank)", "4", "—", "—", "4"]);
    assert.deepEqual(find("Grand total"), ["Grand total", "4", "7", "—", "11"]);
    assert.deepEqual(
      (await rows(p, detail)).sort(),
      [
        ["(Blank)", "(Blank)", "4"],
        ["Alpha", "Gloss", "0"],
        ["Alpha", "Matte", "—"],
        ["Beta", "Gloss", "7"],
        ["Gamma", "Satin", "—"],
      ].sort(),
    );
    const chart = art(p, trend);
    assert.equal(await chart.locator("[data-point]").count(), 0);
    for (const period of ["January", "February", "March"])
      assert.equal(
        await chart.locator("svg text").filter({ hasText: period }).count(),
        1,
      );
    const styles = await rows(p, "Style first"),
      finishes = await rows(p, "Finish first");
    assert.deepEqual(
      styles.sort(),
      [
        ["(Blank)", "(Blank)", "4"],
        ["Bare", "(Blank)", "—"],
        ["Natural", "Matte", "—"],
        ["Natural", "Satin", "—"],
        ["Polished", "Gloss", "7"],
      ].sort(),
    );
    assert.deepEqual(
      finishes.sort(),
      [
        ["(Blank)", "(Blank)", "4"],
        ["Gloss", "Polished", "7"],
        ["Matte", "Natural", "—"],
        ["Satin", "Natural", "—"],
      ].sort(),
    );
    assert.deepEqual(await rows(p, "Natural finishes"), [
      ["Matte", "—"],
      ["Satin", "—"],
    ]);
  });
  console.log(
    "Blank-report import preserved dimension tuples, orphan keys, a real zero, all-blank chart axes, independent matrix axes and grand totals.",
  );
}
