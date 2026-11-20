import assert from "node:assert/strict";
import { studio, open, save, visual, art, settled } from "./portfolio-ui.mjs";
const title = "Prepared bookings",
  copy = title + " (copy)";
export async function pick(p, selector, name, content) {
  const input = p.waitForEvent("filechooser");
  await selector.click();
  await (
    await input
  ).setFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
}
export async function update(p, table, file, data, mode) {
  await p.locator(".rail [data-action=model]").click();
  const card = p
    .locator(".modelcard")
    .filter({ has: p.getByRole("heading", { name: table, exact: true }) });
  await pick(p, card.locator("[data-revise]"), file, data);
  await p.getByLabel("Load mode").selectOption(mode);
}
export async function apply(p) {
  await p.getByRole("button", { name: "Apply update" }).click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
export async function reportMode(p) {
  await p.locator(".rail [data-action=report]").click();
  await settled(p);
}
async function checkRows(p, names) {
  await settled(p);
  assert.deepEqual(
    await art(p, "Bookings").locator("tbody td").allTextContents(),
    names,
  );
}
export async function verifyRefresh() {
  await studio(async (p) => {
    await open(p, title);
    await p.locator('[data-page="0"]').click();
    await settled(p);
    await p.locator("header [data-action=library]").click();
    await p.locator("dialog [data-action=copy]").click();
    await p.waitForFunction(() =>
      document.querySelector("#report-name").textContent.endsWith("(copy)"),
    );
    if (await art(p, "Booked revenue").locator("[data-clear]").count()) {
      await art(p, "Booked revenue").locator("[data-clear]").click();
      await settled(p);
    }
    await pick(
      p,
      p.locator(".ribbon [data-action=import]"),
      "Territory.csv",
      "Region,Division\r\nEast,A\r\nWest,B\r\n",
    );
    await p.waitForFunction(
      () => document.querySelectorAll("#data details[data-tree]").length === 3,
    );
    await p.locator(".ribbon [data-action=relationship]").click();
    await p
      .getByLabel("One-side key")
      .selectOption({ label: "Territory · Region" });
    await p
      .getByLabel("Many-side key")
      .selectOption({ label: "Bookings · Region" });
    await p.locator("dialog button[type=submit]").click();
    await p.locator("dialog").waitFor({ state: "hidden" });
    await visual(
      p,
      "table",
      "By division",
      ["Territory · Division"],
      ["Bookings · Revenue"],
      [640, 190, 340, 240],
    );
    await update(
      p,
      "Bookings",
      "Month2.csv",
      "Amount,Unused,Job,Desk\r\n30,drop,004, West \r\n45,drop,005, East \r\n",
      "append",
    );
    assert.deepEqual(
      await p
        .locator("#update-preview tbody tr")
        .first()
        .locator("td")
        .allTextContents(),
      ["West", "004", "30"],
    );
    await apply(p);
    await reportMode(p);
    await checkRows(p, [
      "001",
      "20",
      "002",
      "55",
      "003",
      "25",
      "004",
      "30",
      "005",
      "45",
    ]);
    assert.deepEqual(
      await art(p, "By division").locator("tbody td").allTextContents(),
      ["A", "70", "B", "105"],
    );
    await save(p);
  });
  await studio(async (p) => {
    await open(p, copy);
    await checkRows(p, [
      "001",
      "20",
      "002",
      "55",
      "003",
      "25",
      "004",
      "30",
      "005",
      "45",
    ]);
    await update(
      p,
      "Territory",
      "Duplicate.csv",
      "Region,Division\r\nWest,B\r\n",
      "append",
    );
    await p.getByRole("button", { name: "Apply update" }).click();
    await p
      .locator("dialog .err")
      .filter({ hasText: "duplicate or blank" })
      .waitFor();
    await p.getByRole("button", { name: "Cancel" }).click();
    await update(
      p,
      "Bookings",
      "Bad.csv",
      "Desk,Job,Amount\r\nWest,006,unavailable\r\n",
      "replace",
    );
    await p.getByRole("button", { name: "Apply update" }).click();
    await p
      .locator("dialog .err")
      .filter({ hasText: "cannot be converted" })
      .waitFor();
    await p.getByRole("button", { name: "Cancel" }).click();
    await reportMode(p);
    assert.equal(
      await art(p, "All regions").locator(".kpi").innerText(),
      "175",
    );
    await update(
      p,
      "Bookings",
      "Replace.csv",
      "New region,Ticket,Amount\r\n West ,011,12\r\n",
      "replace",
    );
    await p
      .getByLabel("Source for Region", { exact: true })
      .selectOption({ label: "New region" });
    await p
      .getByLabel("Source for Job", { exact: true })
      .selectOption({ label: "Ticket" });
    await apply(p);
    await reportMode(p);
    await checkRows(p, ["011", "12"]);
    assert.deepEqual(
      await art(p, "By division").locator("tbody td").allTextContents(),
      ["B", "12"],
    );
    await save(p);
  });
  await studio(async (p) => {
    await open(p, copy);
    await checkRows(p, ["011", "12"]);
  });
  await studio(async (p) => {
    await open(p, title);
    await p.locator('[data-page="0"]').click();
    await settled(p);
    assert.equal(
      await art(p, "All regions").locator(".kpi").innerText(),
      "100",
    );
  });
  console.log(
    "CSV append and replace retained model bindings, relationships, leading zeros, and the original report. Invalid updates preserved the prior version.",
  );
}
