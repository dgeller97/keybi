import assert from "node:assert/strict";
import {
  studio,
  open,
  save,
  rename,
  visual,
  art,
  settled,
} from "./portfolio-ui.mjs";
import { pick, update, apply, reportMode } from "./refresh-check.mjs";
const title = "Depot monthly volumes",
  copy = title + " (copy)",
  table = "Volume",
  total = "Reported units";
export async function verifyUnpivot() {
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "How many units did each depot report per month?");
    await pick(
      p,
      p.locator("[data-action=prepare]"),
      "Volume.csv",
      "Depot,Jan,Feb,Note\n 001 ,0,4,ok\n002,8, ,ok\n",
    );
    await p.getByLabel("Trim Depot").check();
    await p.getByLabel("Type for Depot").selectOption("text");
    await p.getByLabel("Keep Note").uncheck();
    for (const col of ["Jan", "Feb"]) {
      await p.getByLabel("Unpivot " + col).check();
      await p.getByLabel("Trim " + col).check();
      await p.getByLabel("Type for " + col).selectOption("number");
    }
    await p.getByLabel("Attribute column").fill("Month");
    await p.getByLabel("Value column").fill("Units");
    assert.deepEqual(
      await p.locator("#csv-preview tbody td").allTextContents(),
      ["001", "Jan", "0", "001", "Feb", "4", "002", "Jan", "8"],
    );
    await p.getByRole("button", { name: "Load table" }).click();
    await p.locator("dialog").waitFor({ state: "hidden" });
    await visual(
      p,
      "dropdown",
      "Depot",
      ["Volume · Depot"],
      [],
      [20, 20, 280, 120],
    );
    await visual(p, "card", total, [], ["Volume · Units"], [320, 20, 340, 120]);
    await visual(
      p,
      "matrix",
      "Depot volumes",
      ["Volume · Depot", "Volume · Month"],
      ["Volume · Units"],
      [20, 160, 640, 340],
    );
    await art(p, "Depot").locator("select").selectOption({ label: "001" });
    await settled(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "4");
    await save(p);
    await p.locator("header [data-action=library]").click();
    await p.locator("dialog [data-action=copy]").click();
    await p.waitForFunction(
      (t) => document.querySelector("#report-name").textContent === t,
      copy,
    );
    await update(
      p,
      table,
      "Next.csv",
      "Feb,Depot,Jan\n10, 001 ,\n,002,7\n",
      "append",
    );
    assert.deepEqual(
      await p.locator("#update-preview tbody td").allTextContents(),
      ["001", "Feb", "10", "002", "Jan", "7"],
    );
    await apply(p);
    await reportMode(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "14");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, copy);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "14");
    await update(p, table, "Bad.csv", "Depot,Feb,Jan\n001,oops,1\n", "replace");
    await p.getByRole("button", { name: "Apply update" }).click();
    await p
      .locator("dialog .err")
      .filter({ hasText: "Row 2, column Feb cannot be converted" })
      .waitFor();
    await p.getByRole("button", { name: "Cancel" }).click();
    await reportMode(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "14");
    await update(
      p,
      table,
      "Corrected.csv",
      "Code,Feb,Jan\n001,2,8\n002,5,0\n",
      "replace",
    );
    await p.getByLabel("Source for Depot").selectOption({ label: "Code" });
    assert.deepEqual(
      await p.locator("#update-preview tbody td").allTextContents(),
      [
        "001",
        "Jan",
        "8",
        "001",
        "Feb",
        "2",
        "002",
        "Jan",
        "0",
        "002",
        "Feb",
        "5",
      ],
    );
    await apply(p);
    await reportMode(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "10");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, copy);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "10");
    await art(p, "Depot").locator("[data-clear]").click();
    await settled(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "15");
  });
  await studio(async (p) => {
    await open(p, title);
    assert.equal(await art(p, total).locator(".kpi").innerText(), "4");
  });
  console.log(
    "Unpivot kept zeroes and depot codes, omitted trimmed blanks, reapplied saved mappings on append and replace, and preserved an independent copy after a rejected update.",
  );
}
