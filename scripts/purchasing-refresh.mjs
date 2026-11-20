import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, cp, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
const workspace = await mkdtemp(resolve("test-results/purchase-update-"));
for (const folder of ["reports", "tables"])
  await cp(join("portfolio", folder), join(workspace, folder), {
    recursive: true,
  });
process.env.FOLIO_URL = "http://127.0.0.1:4361/";
const { studio, open, art, save, settled, capture } = await import(
  "./portfolio-ui.mjs"
);
const { apply, reportMode } = await import("./refresh-check.mjs");
const server = spawn(resolve("target/release/keybi.exe"), [], {
  env: { ...process.env, FOLIO_DATA: workspace, FOLIO_PORT: "4361" },
  stdio: ["ignore", "pipe", "inherit"],
  windowsHide: true,
});
const title = "Budget vs. Actual",
  copy = title + " (copy)",
  delta = resolve("web/datasets/budget/CommitmentChanges.parquet");
async function purchasing(p, name) {
  await open(p, name);
  await p
    .locator("#pages .page")
    .filter({ hasText: "Purchasing commitments" })
    .click();
  await settled(p);
}
async function pick(p, file, mode) {
  await p.locator(".rail [data-action=model]").click();
  const card = p
    .locator(".modelcard")
    .filter({
      has: p.getByRole("heading", { name: "Commitments", exact: true }),
    });
  const chooser = p.waitForEvent("filechooser");
  await card.locator("[data-revise]").click();
  await (await chooser).setFiles(file);
  await p.getByLabel("Load mode").selectOption(mode);
}
const csv = async (name) =>
  (await readFile(resolve("web/datasets/budget", name + ".csv"), "utf8"))
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((r) => r.split(","))
    .filter((r) => r[0] === "4");
const original = await csv("Commitments"),
  changed = await csv("CommitmentChanges");
const amount = (rows) =>
  rows.reduce((sum, r) => sum + Math.round(Number(r[4]) * 100), 0) / 100;
const cash = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const proof = {};
async function check(p, rows, state) {
  const period = art(p, "Purchasing period").locator("option:checked");
  assert.equal(await period.textContent(), "2026-04");
  assert.equal(
    await art(p, "Committed amount").locator(".kpi").textContent(),
    cash(amount(rows)),
  );
  assert.equal(
    await art(p, "Order lines").locator(".kpi").textContent(),
    String(rows.length),
  );
  const matrix = art(p, "Posted spending and commitments");
  assert.deepEqual(await matrix.locator("thead th").allTextContents(), [
    "Department",
    "Posted spending",
    "Open commitments",
  ]);
  const cells = await matrix
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  assert.deepEqual(
    cells.map((r) => r.slice(1)),
    [
      ...["1", "2", "3"].map((key, i) => [
        cash([1273, 2256, 3270][i]),
        cash(amount(rows.filter((r) => r[1] === key))),
      ]),
      [cash(6799), cash(amount(rows))],
    ],
  );
  const lines = await art(p, "Purchase order lines")
    .locator("tbody tr")
    .evaluateAll((rs) => rs.map((r) => [...r.cells].map((c) => c.textContent)));
  assert.deepEqual(
    lines,
    rows
      .map((r) => [
        r[2],
        r[3],
        r[6] || "(Blank)",
        r[7] || "(Blank)",
        r[5],
        cash(Number(r[4])),
      ])
      .sort((a, b) => a[0].localeCompare(b[0])),
  );
  proof[state] = {
    orderLines: rows.length,
    amount: amount(rows),
    departmentTotals: cells,
  };
}
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Studio exited");
    }),
  ]);
  await studio(async (p) => {
    await purchasing(p, title);
    await check(p, original, "original");
    await p.locator("header [data-action=library]").click();
    await p.locator("dialog [data-action=copy]").click();
    await p.waitForFunction(
      (t) => document.querySelector("#report-name").textContent === t,
      copy,
    );
    await pick(p, delta, "append");
    assert.match(
      await p.locator("dialog").innerText(),
      /3 incoming rows · 8 currently loaded/,
    );
    assert.equal(await p.locator("#update-preview tbody tr").count(), 3);
    assert.match(
      await p.locator("#update-preview th").first().textContent(),
      /AuditValue/,
    );
    await apply(p);
    await reportMode(p);
    await check(p, [...original, ...changed], "appended");
    await save(p);
  });
  await studio(async (p) => {
    await purchasing(p, copy);
    await check(p, [...original, ...changed], "reopenedAppend");
    const manifest = JSON.parse(
      await readFile("portfolio/manifest.json", "utf8"),
    );
    const mismatch = Object.keys(manifest.files).find((n) =>
      n.endsWith(".parquet"),
    );
    await pick(p, resolve("portfolio", mismatch), "replace");
    await p.getByRole("button", { name: "Apply update" }).click();
    await p
      .locator("dialog .err")
      .filter({ hasText: "Missing Parquet field" })
      .waitFor();
    await p.getByRole("button", { name: "Cancel" }).click();
    await reportMode(p);
    await check(p, [...original, ...changed], "rejected");
    await pick(p, delta, "replace");
    await apply(p);
    await reportMode(p);
    await check(p, changed, "replaced");
    await save(p);
  });
  await studio(async (p) => {
    await purchasing(p, copy);
    await check(p, changed, "reopenedReplace");
    await capture(p, "purchasing-replacement");
  });
  await studio(async (p) => {
    await purchasing(p, title);
    await check(p, original, "independentOriginal");
  });
  await writeFile(
    "portfolio-evidence/purchasing-refresh.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(
    "CSV ledgers reconcile after append, failed replacement, successful replacement and fresh-session reopen. The original report retains its own table version.",
  );
} finally {
  if (server.exitCode === null) {
    const done = once(server, "exit");
    server.kill();
    await done;
  }
}
