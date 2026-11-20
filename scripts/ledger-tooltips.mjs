import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  art,
  visual,
  pageName,
  save,
  settled,
  capture,
} from "./portfolio-ui.mjs";
const title = "Budget vs. Actual",
  target = "Spending detail tooltip",
  statement = "Operating statement · USD",
  pivot = "Variance by department and period",
  table = "Budget lines";
async function go(p, name) {
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
}
async function config(p, title) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  return p.getByLabel("Tooltip page", { exact: true });
}
await studio(async (p) => {
  await open(p, title);
  await go(p, "Variance statement");
  if (!(await p.locator("#pages .page").filter({ hasText: target }).count())) {
    await (await config(p, statement)).selectOption("new");
    await pageName(p, target);
    await visual(
      p,
      "card",
      "Budget amount",
      [],
      ["Budget · Budget"],
      [18, 18, 250, 118],
      "currency",
    );
    await visual(
      p,
      "card",
      "Posted amount",
      [],
      ["Transaction · Actual"],
      [278, 18, 250, 118],
      "currency",
    );
    await visual(
      p,
      "table",
      "Postings by department",
      ["Department · Department"],
      ["Transaction · Actual"],
      [18, 147, 510, 192],
      "currency",
    );
  }
  for (const [page, v] of [
    ["Variance statement", statement],
    ["Period comparison", pivot],
    ["Ledger evidence", table],
  ]) {
    await go(p, page);
    await (await config(p, v)).selectOption({ label: target });
  }
  await go(p, "Variance statement");
  await save(p);
});
async function csv(file) {
  const [head, ...lines] = (
    await readFile("web/datasets/budget/" + file + ".csv", "utf8")
  )
    .trim()
    .split(/\r?\n/);
  const keys = head.split(",");
  return lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])),
  );
}
const months = await csv("Period"),
  depts = await csv("Department"),
  budgets = await csv("Budget"),
  actuals = await csv("Transaction");
const cash = (n) =>
  n === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(n);
function aggregate(rows, field) {
  return rows.length
    ? rows.reduce((sum, r) => sum + Number(r[field]), 0)
    : null;
}
await studio(async (p) => {
  await open(p, title);
  const proof = {};
  const tip = p.locator("#chart-tooltip");
  async function check(mark, dept, month) {
    const dk = depts.find((d) => d.Department === dept)?.DepartmentKey,
      mk = months.find((m) => m.Period === month)?.PeriodKey;
    const match = (r) =>
      (!dk || r.DepartmentKey === dk) && (!mk || r.PeriodKey === mk);
    const expected = [
      cash(aggregate(budgets.filter(match), "Budget")),
      cash(aggregate(actuals.filter(match), "Actual")),
    ];
    await mark.focus();
    await p
      .waitForFunction((arr) => {
        const t = document.querySelector("#chart-tooltip");
        return (
          t &&
          !t.hidden &&
          t.querySelector(".tooltip-page-title")?.textContent ===
            "Spending detail tooltip" &&
          JSON.stringify(
            [...t.querySelectorAll(".kpi")].map((el) => el.textContent),
          ) === JSON.stringify(arr)
        );
      }, expected)
      .catch(async (error) => {
        throw Error(
          "Tooltip did not show " +
            [dept, month, expected].join(" / ") +
            "; displayed " +
            (await tip.textContent()),
          { cause: error },
        );
      });
    const clipped = await tip.locator(".kpi").evaluateAll((cards) =>
      cards.flatMap((card) => {
        const range = document.createRange();
        range.selectNodeContents(card);
        const text = range.getBoundingClientRect(), box = card.parentElement.getBoundingClientRect();
        return text.left < box.left || text.right > box.right || text.top < box.top || text.bottom > box.bottom
          ? [{value: card.textContent, text: text.toJSON(), box: box.toJSON(), font: getComputedStyle(card).fontSize}] : [];
      })
    );
    assert.deepEqual(clipped, [], "Every digit must fit inside both currency cards");
    const postings = await tip
      .locator(".grid tbody tr")
      .evaluateAll((rows) =>
        rows.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    assert.deepEqual(
      postings,
      depts
        .filter((d) =>
          actuals.some((r) => match(r) && r.DepartmentKey === d.DepartmentKey),
        )
        .map((d) => [
          d.Department,
          cash(
            aggregate(
              actuals.filter(
                (r) => match(r) && r.DepartmentKey === d.DepartmentKey,
              ),
              "Actual",
            ),
          ),
        ]),
    );
    await p.keyboard.press("Escape");
    await tip.waitFor({ state: "hidden" });
    return expected;
  }
  const stat = art(p, statement);
  for (const r of await stat.locator("tbody tr").all()) {
    const path = JSON.parse(await r.getAttribute("data-path"));
    proof["statement " + (path.join("/") || "total")] = await check(
      r.locator("[data-rich-tip]").first(),
      path[0],
      path[1],
    );
  }
  await go(p, "Period comparison");
  const m = art(p, pivot);
  for (const row of await m.locator("tbody tr").all()) {
    const dept = JSON.parse(await row.getAttribute("data-path"))[0];
    for (const [i, month] of [...months.map((r) => r.Period), null].entries()) {
      const cell = row
        .locator("td")
        .nth(i + 1)
        .locator("[data-rich-tip]");
      proof["pivot " + [dept ?? "total", month ?? "total"].join("/")] =
        await check(cell, dept, month);
    }
  }
  await go(p, "Ledger evidence");
  const rows = art(p, table).locator("tbody tr[data-rich-tip]");
  assert.equal(await rows.count(), budgets.length);
  for (const row of await rows.all()) {
    const [dept, month] = await row.locator("td").allTextContents();
    proof["table " + dept + "/" + month] = await check(row, dept, month);
  }
  await go(p, "Variance statement");
  const missing = stat
    .locator("tr[data-path]")
    .filter({ hasText: "2026-04" })
    .first()
    .locator("[data-rich-tip]")
    .first();
  await missing.focus();
  await tip.locator(".tooltip-page-title").waitFor();
  await capture(p, "budget-ledger-tooltip");
  await writeFile(
    "portfolio-evidence/ledger-tooltips.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
});
console.log(
  "Matrix leaf, subtotal, pivot-column, grand-total and table-row tooltip contexts reconciled against both source ledgers.",
);
