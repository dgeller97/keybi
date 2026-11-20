import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  studio,
  open,
  art,
  save,
  visual,
  addPage,
  settled,
  capture,
} from "./portfolio-ui.mjs";
const report = "Budget vs. Actual",
  page = "Purchasing commitments",
  matrix = "Posted spending and commitments",
  slicer = "Purchasing period",
  detail = "Purchase order lines";
const headings = {
  [matrix]: { Actual: "Posted spending", LineAmount: "Open commitments" },
  [detail]: {
    PurchaseOrder: "Order number",
    OrderedOn: "Order date",
    "Vendor.Name": "Supplier",
    "Vendor.Ref": "Supplier code",
    LineAmount: "Amount",
  },
};
const tab = (p) => p.locator("#pages .page").filter({ hasText: page });
const field = (n) => "Commitments · " + n;
async function rows(name) {
  const [header, ...lines] = (
    await readFile(resolve("web/datasets/budget", name + ".csv"), "utf8")
  )
    .trim()
    .split(/\r?\n/);
  return lines.map((l) =>
    Object.fromEntries(l.split(",").map((v, i) => [header.split(",")[i], v])),
  );
}
const orders = await rows("Commitments"),
  transactions = await rows("Transaction"),
  departments = await rows("Department");
await studio(async (p) => {
  await open(p, report);
  if (
    !(await p.getByTitle("Commitments.LineAmount", { exact: true }).count())
  ) {
    const chooser = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await chooser
    ).setFiles(resolve("web/datasets/budget/Commitments.parquet"));
    await p
      .getByTitle("Commitments.LineAmount", { exact: true })
      .waitFor({ state: "attached" });
    for (const dim of ["Period", "Department"]) {
      await p.locator(".ribbon [data-action=relationship]").click();
      await p
        .getByLabel("One-side key")
        .selectOption({ label: dim + " · " + dim + "Key" });
      await p
        .getByLabel("Many-side key")
        .selectOption({ label: field(dim + "Key") });
      await p.locator("dialog button[type=submit]").click();
      await p.locator("dialog").waitFor({ state: "hidden" });
    }
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
      "Committed amount",
      [],
      [field("LineAmount")],
      [313, 18, 328, 118],
      "currency",
    );
    await visual(
      p,
      "card",
      "Order lines",
      [],
      [[field("PurchaseOrder"), "count"]],
      [656, 18, 322, 118],
    );
    await visual(
      p,
      "matrix",
      matrix,
      ["Department · Department"],
      ["Transaction · Actual", field("LineAmount")],
      [18, 152, 960, 208],
      "currency",
    );
    await visual(
      p,
      "table",
      detail,
      [
        "PurchaseOrder",
        "OrderedOn",
        "Vendor.Name",
        "Vendor.Ref",
        "Approved",
      ].map(field),
      [field("LineAmount")],
      [18, 374, 960, 250],
      "currency",
    );
  } else await tab(p).click();
  await settled(p);
  let queries = 0;
  p.on("request", (r) => {
    if (r.url().endsWith("/api/query")) queries++;
  });
  for (const [title, labels] of Object.entries(headings)) {
    await art(p, title).locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    for (const [source, label] of Object.entries(labels)) {
      const input = p.getByRole("textbox", {
        name: "Heading for " + source,
        exact: true,
      });
      await input.fill(label);
      await input.press("Tab");
    }
  }
  assert.equal(queries, 0, "Heading changes must reuse displayed values");
  await art(p, slicer).locator("select").selectOption({ label: "2026-04" });
  await settled(p);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const cash = (v) => (/\d/.test(v) ? Number(v.replace(/[^\d.-]/g, "")) : null);
const sum = (rows, key) => {
  const values = rows.map((r) => r[key]).filter((s) => s !== "");
  return values.length
    ? values.reduce((a, v) => a + Math.round(Number(v) * 100), 0) / 100
    : null;
};
await studio(async (p) => {
  await open(p, report);
  await tab(p).click();
  await settled(p);
  const control = art(p, slicer).locator("select");
  assert.equal(
    await control.locator("option:checked").textContent(),
    "2026-04",
  );
  const results = {};
  for (const [n, month] of [
    ["3", "2026-03"],
    ["4", "2026-04"],
  ]) {
    await control.selectOption({ label: month });
    await settled(p);
    const current = orders.filter((r) => r.PeriodKey === n),
      posted = transactions.filter((r) => r.PeriodKey === n);
    const expected = departments.map((d) => [
      d.Department,
      sum(
        posted.filter((r) => r.DepartmentKey === d.DepartmentKey),
        "Actual",
      ),
      sum(
        current.filter((r) => r.DepartmentKey === d.DepartmentKey),
        "LineAmount",
      ),
    ]);
    expected.push([
      "Grand total",
      sum(posted, "Actual"),
      sum(current, "LineAmount"),
    ]);
    const displayed = await art(p, matrix)
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    assert.deepEqual(
      displayed.map(([d, ...values]) => [d, ...values.map(cash)]),
      expected,
    );
    assert.equal(
      cash(await art(p, "Committed amount").locator(".kpi").innerText()),
      sum(current, "LineAmount"),
    );
    assert.equal(
      Number(await art(p, "Order lines").locator(".kpi").innerText()),
      current.length,
    );
    const detailRows = await art(p, detail)
      .locator("tbody tr")
      .evaluateAll((rows) =>
        rows.map((r) => [...r.cells].map((c) => c.textContent)),
      );
    for (const r of current) {
      const row = detailRows.find((c) => c[0] === r.PurchaseOrder);
      assert.ok(row, r.PurchaseOrder);
      assert.equal(row[1], r.OrderedOn);
      if (r["Vendor.Ref"]) assert.equal(row[3], r["Vendor.Ref"]);
      assert.equal(
        cash(row.at(-1)),
        r.LineAmount === "" ? null : Number(r.LineAmount),
      );
    }
    results[month] = { departmentTotals: expected, detailRows };
  }
  const expectedHeaders = {
    [matrix]: ["Department", "Posted spending", "Open commitments"],
    [detail]: [
      "Order number",
      "Order date",
      "Supplier",
      "Supplier code",
      "Approved",
      "Amount",
    ],
  };
  for (const [title, expected] of Object.entries(expectedHeaders)) {
    const a = art(p, title);
    assert.deepEqual(await a.locator("thead th").allTextContents(), expected);
    await a.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    const downloading = p.waitForEvent("download");
    await p.locator("[data-action=export-csv]").click();
    const exported = await readFile(await (await downloading).path(), "utf8");
    assert.equal(
      exported.replace(/^\uFEFF/, "").split(/\r?\n/)[0],
      expected.map((s) => '"' + s + '"').join(","),
    );
  }
  await p.locator("#paper").click({ position: { x: 5, y: 5 } });
  await capture(p, "budget-purchasing");
  await p.locator(".rail [data-action=model]").click();
  await p.getByText("Parquet field types", { exact: true }).click();
  const types = await p
    .locator(".modelcard details")
    .filter({ hasText: "Parquet field types" })
    .innerText();
  assert.match(types, /PurchaseOrder · UInt64 → Text/);
  assert.match(types, /LineAmount · Decimal128\(18, 2\) → Number/);
  assert.match(types, /AuditValue · Decimal128\(20, 2\) → Text/);
  await writeFile(
    "portfolio-evidence/budget-purchasing.json",
    JSON.stringify({ results, types, headings: expectedHeaders }, null, 2) +
      "\n",
  );
  console.log(
    "Verified two periods, eight exact order IDs, six department comparisons, source types and saved April state.",
  );
});
