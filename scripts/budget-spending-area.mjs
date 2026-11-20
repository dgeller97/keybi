import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  art,
  visual,
  setInput,
  save,
  settled,
  capture,
  currentPageLink,
} from "./portfolio-ui.mjs";
const report = "Budget vs. Actual",
  page = "Period comparison";
const title = "Posted spending by department",
  pivot = "Variance by department and period";
async function go(p) {
  await p.locator("#pages .page").filter({ hasText: page }).click();
  await settled(p);
}
await studio(async (p) => {
  await open(p, report);
  await go(p);
  if (!(await art(p, title).count())) {
    await art(p, pivot).locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await setInput(p, '[data-dim="h"]', 220);
    await visual(
      p,
      "stackedArea",
      title,
      ["Period · Period"],
      ["Transaction · Actual"],
      [20, 255, 960, 335],
      "currency",
    );
    await p.getByLabel("Continuous date axis").check();
    await p.getByLabel("Data labels", { exact: true }).check();
    await p.locator("#drill-target").selectOption({ label: "Ledger evidence" });
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=legendFields]")
      .selectOption({ label: "Department · Department" });
    await settled(p);
  }
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const csv = async (name) =>
  (await readFile("web/datasets/budget/" + name + ".csv", "utf8"))
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","));
const [periods, depts, tx] = await Promise.all([
  csv("Period"),
  csv("Department"),
  csv("Transaction"),
]);
const proof = {};
await studio(async (p) => {
  await open(p, report);
  await go(p);
  proof.url = await currentPageLink(p);
  proof.periods = {};
  const plot = art(p, title);
  for (const [period, month] of periods) {
    let base = 0;
    const amounts = {};
    for (const [key, dept] of depts) {
      const records = tx.filter((r) => r[1] === period && r[2] === key);
      const band = plot.locator(
        '[data-area-point][aria-label*="' +
          month +
          '"][aria-label*="Department ' +
          dept +
          '"]',
      );
      if (!records.length) {
        assert.equal(await band.count(), 0);
        amounts[dept] = null;
        continue;
      }
      const n = records.reduce((s, r) => s + Number(r[3]), 0);
      assert.equal(Number(await band.getAttribute("data-start")), base);
      base += n;
      assert.equal(Number(await band.getAttribute("data-end")), base);
      assert.equal(Number(await band.getAttribute("data-value")), n);
      amounts[dept] = n;
    }
    proof.periods[month] = { amounts, total: base };
  }
  assert.equal(await plot.locator("[data-area-point]").count(), 11);
  const febX = await plot
    .locator('[data-area-point][aria-label*="2026-02"]')
    .first()
    .locator("circle")
    .getAttribute("cx");
  for (const path of await plot
    .locator('[data-area-point][aria-label*="Department Surgery"] path')
    .all()) {
    const xs = [
      ...(await path.getAttribute("d")).matchAll(/([\d.e+-]+),[\d.e+-]+/g),
    ].map((m) => Number(m[1]));
    assert.ok(
      xs.every((x) => x > Number(febX)) || xs.every((x) => x < Number(febX)),
    );
  }
  await capture(p, "budget-spending-area");
  const april = plot.locator(
    '[data-area-point][aria-label*="2026-04"][aria-label*="Department Facilities"]',
  );
  await april.press("Enter");
  await settled(p);
  assert.ok(
    (await art(p, pivot).locator("tbody").innerText()).includes("$1,273.00"),
  );
  await plot.locator("[data-through]").click();
  await settled(p);
  const rows = await art(p, "Posted transactions")
    .locator("tbody tr td:first-child")
    .allTextContents();
  assert.deepEqual(
    rows,
    tx.filter((r) => r[1] === "4" && r[2] === "1").map((r) => r[0]),
  );
  assert.equal(await art(p, "Budget lines").locator("tbody tr").count(), 0);
  proof.aprilFacilitiesPostings = rows;
});
await writeFile(
  "portfolio-evidence/budget-spending-area.json",
  JSON.stringify(proof, null, 2) + "\n",
);
console.log(
  "All 11 department/month bands match posted transactions. Surgery has no February posting. April Facilities drills to its two unbudgeted postings.",
);
