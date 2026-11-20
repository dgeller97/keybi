import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  save,
  art,
  settled,
  capture,
  addPage,
  visual,
} from "./portfolio-ui.mjs";
const report = "Wait-Time Performance",
  detail = "Visit detail",
  title = "Source visit records",
  bookmark = "Longest waits";
const [, ...lines] = (await readFile("web/datasets/wait/Visit.csv", "utf8"))
  .trim()
  .split(/\r?\n/);
const ledger = lines.map((line) => {
  const [record, service, period, wait, band] = line.split(",");
  return [record, service, period, band, Number(wait)];
});
await studio(async (p) => {
  await open(p, "Budget vs. Actual");
  await addPage(p, "Sort reconciliation");
  await visual(
    p,
    "table",
    "Budget reconciliation",
    ["Department · Department", "Period · Period"],
    ["Budget · Budget", "Transaction · Actual", "Variance"],
    [20, 20, 960, 480],
  );
  const table = art(p, "Budget reconciliation");
  for (const [field, department, period] of [
    ["Budget", "Facilities", "2026-04"],
    ["Actual", "Surgery", "2026-02"],
  ]) {
    for (const direction of ["descending", "ascending"]) {
      await sort(p, table, field, direction);
      const rows = await allRows(p, table),
        column = field === "Budget" ? 2 : 3;
      assert.equal(rows.length, 12);
      const last = rows.at(-1);
      assert.deepEqual(
        [last[0], last[1], last[column]],
        [department, period, "—"],
      );
      const values = rows
        .slice(0, -1)
        .map((r) => Number(r[column].replaceAll(",", "")));
      assert.deepEqual(
        values,
        [...values].sort((a, b) => (direction === "ascending" ? a - b : b - a)),
      );
    }
  }
});
const tab = (p, name) =>
  p.locator("#pages .page").filter({ hasText: name }).first();
async function sort(p, table, name, order) {
  const th = table.getByRole("columnheader", { name, exact: true });
  for (
    let i = 0;
    i < 2 && (await th.getAttribute("aria-sort")) !== order;
    i++
  ) {
    await th.getByRole("button").focus();
    await p.keyboard.press("Enter");
    await settled(p);
  }
  assert.equal(await th.getAttribute("aria-sort"), order);
}
async function allRows(p, table) {
  const values = [];
  while (true) {
    const rows = await table
      .locator("tbody tr")
      .evaluateAll((trs) =>
        trs.map((tr) => [...tr.cells].map((td) => td.textContent)),
      );
    values.push(...rows);
    const next = table.locator('[data-page-delta="1"]');
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
    await settled(p);
  }
  return values;
}
function reference(index, desc = false) {
  return [...ledger]
    .sort((a, b) => {
      const diff =
        typeof a[index] === "number"
          ? a[index] - b[index]
          : a[index].localeCompare(b[index]);
      return (desc ? -diff : diff) || a[0].localeCompare(b[0]);
    })
    .map((row) => row.map(String));
}
function multiReference(rules) {
  return [...ledger]
    .sort((a, b) => {
      for (const [index, sign] of rules) {
        const difference =
          typeof a[index] === "number"
            ? a[index] - b[index]
            : a[index].localeCompare(b[index]);
        if (difference) return difference * sign;
      }
      return a[0].localeCompare(b[0]);
    })
    .map((row) => row.map(String));
}
async function addSort(p, table, name) {
  await table
    .getByRole("columnheader", { name, exact: true })
    .getByRole("button")
    .click({ modifiers: ["Shift"] });
  await settled(p);
}
await studio(async (p) => {
  await open(p, report);
  await tab(p, detail).click();
  await settled(p);
  const table = art(p, title);
  await sort(p, table, "Wait", "descending");
  assert.deepEqual(await allRows(p, table), reference(4, true));
  await sort(p, table, "Service", "ascending");
  assert.equal(
    await table.locator("[data-page-delta='-1']").isDisabled(),
    true,
  );
  assert.deepEqual(await allRows(p, table), reference(1, false));
  await addSort(p, table, "Wait");
  assert.deepEqual(
    await allRows(p, table),
    multiReference([
      [1, 1],
      [4, -1],
    ]),
  );
  await addSort(p, table, "Service");
  assert.deepEqual(
    await allRows(p, table),
    multiReference([
      [4, -1],
      [1, -1],
    ]),
  );
  await sort(p, table, "Service", "descending");
  assert.deepEqual(await allRows(p, table), reference(1, true));
  await sort(p, table, "Wait", "ascending");
  assert.deepEqual(await allRows(p, table), reference(4, false));
  await sort(p, table, "Wait", "descending");
  await addSort(p, table, "Service");
  assert.deepEqual(
    await allRows(p, table),
    multiReference([
      [4, -1],
      [1, 1],
    ]),
  );
  await p.locator("[data-action=bookmarks]").click();
  const existing = p
    .locator("dialog [data-bookmark-go]")
    .filter({ hasText: bookmark });
  if (await existing.count())
    await existing.locator("..").locator("[data-bookmark-update]").click();
  else {
    await p.getByLabel("New bookmark name").fill(bookmark);
    await p.getByRole("button", { name: "Add current view" }).click();
  }
  await sort(p, table, "Record", "ascending");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, report);
  const summary = art(p, "Wait performance by period");
  await sort(p, summary, "P90 of Wait", "descending");
  const summaryRows = await allRows(p, summary);
  const expected = [...new Set(ledger.map((r) => r[2]))]
    .map((period) => {
      const waits = ledger
        .filter((r) => r[2] === period)
        .map((r) => r[4])
        .sort((a, b) => a - b);
      const index = 0.9 * (waits.length - 1),
        lower = Math.floor(index);
      return [
        period,
        waits[lower] +
          (index - lower) * (waits[Math.ceil(index)] - waits[lower]),
      ];
    })
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  assert.deepEqual(
    summaryRows.map((r) => [r[0], Number(r[2])]),
    expected.map(([p, n]) => [p, Number(n.toFixed(3))]),
  );
  await p.locator("[data-action=bookmarks]").click();
  await p
    .locator("dialog [data-bookmark-go]")
    .filter({ hasText: bookmark })
    .click();
  await settled(p);
  const table = art(p, title);
  assert.equal(
    await table
      .getByRole("columnheader", { name: "Wait", exact: true })
      .getAttribute("aria-sort"),
    "descending",
  );
  const top = reference(4, true)[0];
  assert.deepEqual(
    await table.locator("tbody tr").first().locator("td").allTextContents(),
    top,
  );
  await capture(p, "wait-longest-visits");
  assert.equal(
    await table
      .getByRole("columnheader", { name: "Service", exact: true })
      .getAttribute("data-sort-direction"),
    "ascending",
  );
  assert.deepEqual(
    await allRows(p, table),
    multiReference([
      [4, -1],
      [1, 1],
    ]),
  );
  await sort(p, table, "Wait", "ascending");
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-well="metrics"] [data-agg]').selectOption("max");
  await settled(p);
  assert.equal(
    await table
      .getByRole("columnheader", { name: "Maximum of Wait" })
      .getAttribute("aria-sort"),
    "ascending",
  );
  await p.locator('[data-remove-field="groups:1"]').click();
  await settled(p);
  const narrowed = await allRows(p, table);
  assert.deepEqual(
    narrowed,
    reference(4).map(([id, s, period, band, v]) => [id, period, band, v]),
  );
  await writeFile(
    "portfolio-evidence/table-sorting.json",
    JSON.stringify(
      {
        visits: ledger.length,
        pageSize: 25,
        topVisit: top,
        periodP90: expected,
        bookmark,
        savedSort: ["Wait descending", "Service ascending"],
        orderedRowsChecked: [
          "wait descending",
          "wait ascending",
          "service ascending",
          "service descending",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Verified all 108 visits across five pages in four sort orders, a non-first measure, a saved bookmark, and sort retention after rebinding. Longest visit: " +
      top[0] +
      ", " +
      top.at(-1) +
      " minutes.",
  );
});
