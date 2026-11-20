import assert from "node:assert/strict";
import { studio, open, settled, save, art, capture } from "./portfolio-ui.mjs";
const name = "Orders by region and channel";
const source = "Dispatch · ";
async function detail(p) {
  await open(p, "Visual Gallery");
  await p.locator("#pages .page").filter({ hasText: "Detail" }).click();
  await settled(p);
  await art(p, name).locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
}
async function option(p, well, field) {
  await p
    .locator("[data-pick=" + well + "]")
    .selectOption({ label: source + field });
  await settled(p);
}
await studio(async (p) => {
  await detail(p);
  if ((await p.locator("[data-well=columns] .wellrow").count()) === 1) {
    await p.locator('[data-remove-field="columns:0"]').click();
    await option(p, "columns", "Period");
    await option(p, "columns", "Channel");
  }
  if ((await p.locator("[data-well=groups] .wellrow").count()) === 1)
    await option(p, "groups", "Channel");
  const a = art(p, name);
  await p.locator("[data-tab=Format]").click();
  await p.locator("[data-opt=cellColors]").check();
  await p.locator("[data-opt=cellThreshold]").fill("12");
  await p.locator("[data-opt=cellThreshold]").press("Tab");
  await p.locator("[data-opt=subtotals]").uncheck();
  await settled(p);
  const firstCol = a.locator("[data-matrix-axis=columns]").first(),
    firstRow = a.locator("[data-matrix-axis=rows]").first();
  if ((await firstCol.getAttribute("aria-expanded")) === "true")
    await firstCol.click();
  if ((await firstRow.getAttribute("aria-expanded")) === "true")
    await firstRow.click();
  await save(p);
});
await studio(async (p) => {
  await detail(p);
  const a = art(p, name);
  const firstCol = a.locator("[data-matrix-axis=columns]").first(),
    firstRow = a.locator("[data-matrix-axis=rows]").first();
  assert.equal(await firstCol.getAttribute("aria-expanded"), "false");
  assert.equal(await firstRow.getAttribute("aria-expanded"), "false");
  const path = JSON.stringify(["East"]);
  const east = a
    .locator("tbody tr")
    .filter({
      has: a.page().getByRole("button", { name: "Expand East", exact: true }),
    });
  assert.equal(await east.locator("td").nth(1).innerText(), "20");
  assert.deepEqual(await east.locator("td").allTextContents(), [
    "East",
    "20",
    "12",
    "14",
    "13",
    "15",
    "74",
  ]);
  assert.ok(await a.locator(".cell-low").count());
  assert.ok(await a.locator(".cell-high").count());
  await firstCol.click();
  await firstRow.click();
  await p.locator("[data-tab=Format]").click();
  await p.locator("[data-opt=subtotals]").check();
  await settled(p);
  const values = await a
    .locator("tr[data-path]")
    .evaluateAll((rs) =>
      rs.map((r) => ({
        path: JSON.parse(r.dataset.path),
        vals: [...r.cells].slice(1).map((td) => td.textContent),
      })),
    );
  assert.deepEqual(
    values.find((row) => JSON.stringify(row.path) === path).vals,
    ["8", "12", "20", "12", "14", "26", "13", "15", "28", "74"],
  );
  const retail = values.find((row) => row.path.join("/") === "East/Retail");
  assert.deepEqual(retail.vals, [
    "—",
    "12",
    "12",
    "—",
    "14",
    "14",
    "—",
    "15",
    "15",
    "41",
  ]);
  await capture(p, "gallery-matrix-hierarchy");
  // Keep the detail report compact while preserving the nested month/channel columns.
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-remove-field="groups:1"]').click();
  await p.locator('[data-page="0"]').click();
  await save(p);
});
console.log(
  "Nested row/column context, sparse cells, collapse persistence, subtotal controls and threshold colors passed.",
);
