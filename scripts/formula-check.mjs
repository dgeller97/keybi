import assert from "node:assert/strict";
import {
  addPage,
  open,
  save,
  settled,
  visual,
  art,
  filter,
} from "./portfolio-ui.mjs";
const sales =
  "Region,Order ID,Profit,Revenue\r\nEast,A,40,100\r\nEast,,0,0\r\nWest,A,90,900\r\nWest,B,0,0\r\nOther,C,0,0\r\n";
const counts = async (p, expected) => {
  await settled(p);
  assert.deepEqual(await p.locator(".kpi").allTextContents(), expected);
};
export async function formula(p, name, expression, fmt = "number") {
  await p.locator(".ribbon [data-action=measure]").click();
  await p.locator("dialog [data-action=formula]").click();
  await p.getByLabel("Measure name").fill(name);
  await p.getByLabel("DAX expression").fill(expression);
  await p.locator("dialog [name=format]").selectOption(fmt);
  await p.getByRole("button", { name: "Save measure" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
export async function editFormula(p, name) {
  await p.locator(".rail [data-action=model]").click();
  const buttons = p.locator("[data-edit-measure]");
  const index = (await buttons.allTextContents()).findIndex(text => text.startsWith(name + " = "));
  assert.ok(index >= 0, "Missing measure " + name);
  await buttons.nth(index).click();
  await p.locator("dialog[open] [name=expression]").waitFor();
  assert.equal(await p.getByLabel("Measure name").inputValue(),name);
}
export async function authorFormulas(p) {
  await open(p, "Prepared bookings");
  await addPage(p, "Order analysis");
  const chooser = p.waitForEvent("filechooser");
  await p.locator(".ribbon [data-action=import]").click();
  await (
    await chooser
  ).setFiles({
    name: "Order log.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sales),
  });
  await p.waitForFunction(
    () => document.querySelectorAll("#data details[data-tree]").length === 2,
  );
  await formula(p, "Unique orders", "DISTINCTCOUNT('Order log'[Order ID])");
  await formula(p, "Bookings counted", "COUNTROWS('Order log')");
  await formula(
    p,
    "Order margin",
    "DIVIDE(SUM('Order log'[Profit]), SUM('Order log'[Revenue]))",
    "percent",
  );
  for (const [i, name] of [
    "Unique orders",
    "Bookings counted",
    "Order margin",
  ].entries())
    await visual(p, "card", name, [], [name], [15 + i * 330, 15, 312, 130]);
  await visual(
    p,
    "matrix",
    "Orders by region",
    ["Order log · Region"],
    ["Unique orders", "Bookings counted", "Order margin"],
    [15, 165, 610, 300],
  );
  await visual(
    p,
    "list",
    "Regions",
    ["Order log · Region"],
    [],
    [650, 165, 315, 300],
  );
  await p.locator("[data-opt=multiSelect]").check();
  await counts(p, ["4", "5", "13%"]);
  const matrix = art(p, "Orders by region");
  const vals = await matrix
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  assert.deepEqual(vals, [
    ["East", "2", "2", "40%"],
    ["Other", "1", "1", "—"],
    ["West", "2", "2", "10%"],
    ["Grand total", "4", "5", "13%"],
  ]);
  const a = art(p, "Regions");
  await a.getByRole("button", { name: "East", exact: true }).click();
  await counts(p, ["2", "2", "40%"]);
  await a.getByRole("button", { name: "West", exact: true }).click();
  await counts(p, ["3", "4", "13%"]);
  await save(p);
}
export async function reopenFormulas(p) {
  await open(p, "Prepared bookings");
  await counts(p, ["3", "4", "13%"]);
  assert.equal(
    await art(p, "Regions").locator("[aria-pressed=true]").count(),
    2,
  );
  await art(p, "Regions").locator("[data-clear]").click();
  await counts(p, ["4", "5", "13%"]);
  await p.locator(".rail [data-action=model]").click();
  await p
    .locator("[data-edit-measure]")
    .filter({ hasText: "Unique orders" })
    .click();
  await p.getByLabel("DAX expression").fill("COUNTROWS('Order log')");
  await p.getByRole("button", { name: "Save measure" }).click();
  await p.locator(".rail [data-action=report]").click();
  await counts(p, ["5", "5", "13%"]);
  assert.deepEqual(
    await art(p, "Orders by region")
      .locator("tbody tr")
      .last()
      .locator("td")
      .allTextContents(),
    ["Grand total", "5", "5", "13%"],
  );
  await filter(p, "page", "Order log · Region", "Absent");
  await counts(p, ["—", "—", "—"]);
}
