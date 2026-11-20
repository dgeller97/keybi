import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import {
  studio,
  open,
  rename,
  visual,
  art,
  settled,
  save,
  addPage,
} from "./portfolio-ui.mjs";
export async function verifyParquetImport(workspace) {
  const title = "CSV and Parquet reconciliation";
  const buffer = (name) => readFile(resolve("web/datasets/budget", name));
  const csv = await buffer("Commitments.csv");
  const ledger = csv
    .toString()
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","));
  const tableNames = ["CSV orders", "Typed orders"];
  const tableFiles = async () =>
    (await readdir(join(workspace, "tables"))).sort();
  async function choose(p, files) {
    const chooser = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles(files);
  }
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(
      p,
      title,
      "Do the same purchase orders reconcile across source formats?",
    );
    const sample = await p.request.post(
      new URL("/api/csv-preview", p.url()).href,
      { data: "Audit,Cost,ID\n1234567890123456.12,120.15,001\n" },
    );
    assert.deepEqual((await sample.json()).numericRows, [[null, 120.15, 1]]);
    const before = await tableFiles();
    const response = p.waitForResponse((r) => r.url().endsWith("/api/import"));
    await choose(p, [
      {
        name: "Temporary.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Value\n42\n"),
      },
      {
        name: "Broken.parquet",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("invalid"),
      },
    ]);
    assert.equal((await response).ok(), false);
    await p
      .locator("#toast")
      .filter({ hasText: /Parquet|footer|file size/i })
      .waitFor();
    assert.equal(await p.locator("#data details[data-tree]").count(), 0);
    assert.deepEqual(await tableFiles(), before);
    await choose(p, [
      {
        name: "Period.csv",
        mimeType: "text/csv",
        buffer: await buffer("Period.csv"),
      },
      { name: "CSV orders.csv", mimeType: "text/csv", buffer: csv },
      {
        name: "Typed orders.PARQUET",
        mimeType: "application/octet-stream",
        buffer: await buffer("Commitments.parquet"),
      },
    ]);
    await p
      .getByTitle("Typed orders.LineAmount", { exact: true })
      .waitFor({ state: "attached" });
    await visual(
      p,
      "dropdown",
      "Shared month",
      ["Period · Period"],
      [],
      [18, 18, 280, 110],
    );
    for (const [i, name] of tableNames.entries()) {
      await p.locator(".ribbon [data-action=relationship]").click();
      await p
        .getByLabel("One-side key")
        .selectOption({ label: "Period · PeriodKey" });
      await p
        .getByLabel("Many-side key")
        .selectOption({ label: name + " · PeriodKey" });
      await p.locator("dialog button[type=submit]").click();
      await p.locator("dialog").waitFor({ state: "hidden" });
      const fields = [
        "PurchaseOrder",
        "OrderedOn",
        "Approved",
        "Vendor.Name",
        "Vendor.Ref",
        "AuditValue",
      ].map((f) => name + " · " + f);
      await visual(
        p,
        "table",
        name,
        fields,
        [name + " · LineAmount"],
        [18, 140 + i * 228, 960, 216],
        "currency",
      );
    }
    const table = art(p, "Typed orders");
    await table.locator(".vhead").click();
    await p.locator("[data-tab=Build]").click();
    const label = p.getByRole("textbox", {
      name: "Heading for LineAmount",
      exact: true,
    });
    for (const next of ["Provisional", "", "Invoice amount"]) {
      await label.fill(next);
      await label.press("Tab");
      assert.equal(
        await table.locator("thead th").last().textContent(),
        next || "LineAmount",
      );
    }
    const agg = p.locator("[data-agg]").last();
    await agg.selectOption("avg");
    await settled(p);
    assert.equal(
      await table.locator("thead th").last().textContent(),
      "Invoice amount",
    );
    await agg.selectOption("sum");
    await settled(p);
    await art(p, "Shared month")
      .locator("select")
      .selectOption({ label: "2026-03" });
    await settled(p);
    await addPage(p, "Pivot");
    await visual(
      p,
      "matrix",
      "Approval by period",
      ["Period · Period"],
      ["Typed orders · LineAmount"],
      [18, 18, 940, 340],
      "currency",
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=columns]")
      .selectOption({ label: "Typed orders · Approved" });
    await settled(p);
    for (const [source, next] of [
      ["Period", "Order month"],
      ["Approved", "Approved?"],
      ["LineAmount", "Amount"],
    ]) {
      const input = p.getByRole("textbox", {
        name: "Heading for " + source,
        exact: true,
      });
      await input.fill(next);
      await input.press("Tab");
    }
    await p.locator('[data-page="0"]').click();
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    assert.equal(
      await art(p, "Typed orders").locator("thead th").last().textContent(),
      "Invoice amount",
    );
    assert.equal(
      await art(p, "CSV orders").locator("thead th").last().textContent(),
      "LineAmount",
    );
    const control = art(p, "Shared month").locator("select");
    assert.equal(
      await control.locator("option:checked").textContent(),
      "2026-03",
    );
    for (const [key, label] of [
      ["3", "2026-03"],
      ["4", "2026-04"],
    ]) {
      await control.selectOption({ label });
      await settled(p);
      const reference = ledger
        .filter((r) => r[0] === key)
        .map((r) => [
          r[2],
          r[3],
          r[5],
          r[6] || "(Blank)",
          r[7] || "(Blank)",
          r[8],
          r[4]
            ? new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: "USD",
              }).format(Number(r[4]))
            : "—",
        ])
        .sort((a, b) => a[0].localeCompare(b[0]));
      for (const name of tableNames) {
        const actual = await art(p, name)
          .locator("tbody tr")
          .evaluateAll((rs) =>
            rs.map((r) => [...r.cells].map((c) => c.textContent)),
          );
        assert.deepEqual(actual, reference, name + " " + label);
      }
    }
    await p.locator('[data-page="1"]').click();
    await settled(p);
    const pivot = art(p, "Approval by period");
    const head = await pivot.locator("thead th").allTextContents();
    for (const caption of [
      "Order month",
      "Approved? · false",
      "Approved? · true",
      "Amount",
    ])
      assert.ok(head.includes(caption), caption);
    const april = await pivot
      .locator("tbody tr")
      .filter({ hasText: "2026-04" })
      .locator("td")
      .allTextContents();
    assert.deepEqual(april, ["2026-04", "$94.60", "$255.36", "$349.96"]);
  });
  console.log(
    "Mixed picker, batch rollback and exact CSV/Parquet detail parity passed across two months after reopening.",
  );
}
