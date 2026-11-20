import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const root = await mkdtemp(resolve("test-results/package-"));
const source = join(root, "source"),
  target = join(root, "destination");
await mkdir(source);
await mkdir(target);
const env = { ...process.env };
delete env.FOLIO_POSTGRES;
execFileSync(process.execPath, ["scripts/prepare-workflow.mjs"], {
  env: { ...env, FOLIO_TEST_DATA: source },
  windowsHide: true,
  stdio: "inherit",
});
const port = "4357",
  url = "http://127.0.0.1:" + port + "/";
process.env.FOLIO_URL = url;
const { studio, open, art, save, settled, rename } = await import(
  "./portfolio-ui.mjs"
);
const title = "Prepared bookings (copy)",
  file = join(root, "Bookings.keybi");
let server;
async function start(data) {
  server = spawn(resolve("target/release/keybi.exe"), [], {
    env: { ...env, FOLIO_DATA: data, FOLIO_PORT: port },
    windowsHide: true,
    stdio: ["ignore", "pipe", "inherit"],
  });
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Server exited");
    }),
  ]);
}
async function stop() {
  if (!server || server.exitCode !== null) return;
  const ended = once(server, "exit");
  server.kill();
  await ended;
  server = null;
}
const doc = async (id) => (await fetch(url + "api/reports/" + id)).json();
const reports = async () => (await fetch(url + "api/reports")).json();
const idOf = (p) => new URL(p.url()).hash.slice(1);
async function chooseFile(p, path) {
  const picker = p.waitForEvent("filechooser");
  await p.locator("#home [data-action=import-package]").click();
  await (await picker).setFiles(path);
}
async function importFile(p) {
  await chooseFile(p, file);
  await p.waitForFunction(
    () =>
      location.hash.startsWith("#r") &&
      !document.body.classList.contains("at-home"),
  );
  await settled(p);
  assert.equal(await p.locator("#report-name").innerText(), title);
  assert.deepEqual(
    await art(p, "Bookings").locator("tbody td").allTextContents(),
    ["011", "12"],
  );
  assert.deepEqual(
    await art(p, "By division").locator("tbody td").allTextContents(),
    ["B", "12"],
  );
  return idOf(p);
}
const canonical = (document) => {
  const copy = structuredClone(document);
  for (const key of ["id", "revision", "updated"]) delete copy[key];
  copy.tables.forEach((t) => delete t.storageId);
  return copy;
};
let original, first, second;
try {
  await start(source);
  await studio(async (p) => {
    await open(p, title);
    await p.locator("[data-page='1']").click();
    await settled(p);
    const filter = art(p, "Regions");
    if (await filter.locator("[data-clear]").count())
      await filter.locator("[data-clear]").click();
    await settled(p);
    await filter.getByRole("button", { name: "East", exact: true }).click();
    await settled(p);
    assert.equal(
      await art(p, "Order margin").locator(".kpi").innerText(),
      "40%",
    );
    await p.locator("[data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("East orders");
    await p.getByRole("button", { name: "Add current view" }).click();
    await filter.locator("[data-clear]").click();
    await settled(p);
    await p.locator("[data-page='0']").click();
    await save(p);
    original = await doc(idOf(p));
    await p.locator("header [data-action=library]").click();
    const download = p.waitForEvent("download");
    await p.locator("dialog [data-action=export-package]").click();
    const d = await download;
    assert.equal(d.suggestedFilename(), title + ".keybi");
    await d.saveAs(file);
  });
  await stop();
  await start(target);
  assert.deepEqual(await reports(), []);
  await studio(async (p) => {
    first = await importFile(p);
  });
  await studio(async (p) => {
    second = await importFile(p);
  });
  assert.notEqual(first, second);
  const one = await doc(first),
    two = await doc(second);
  for (const copy of [one, two]) {
    assert.deepEqual(canonical(copy), canonical(original));
    assert.equal(copy.revision, 1);
  }
  const ids = [...one.tables, ...two.tables].map((t) => t.storageId);
  assert.equal(new Set(ids).size, ids.length);
  const before = (await readdir(join(target, "tables"))).sort();
  const bytes = await readFile(file);
  const broken = Buffer.from(bytes);
  broken[broken.length - 1] ^= 1;
  const badPath = join(root, "Damaged.keybi");
  await writeFile(badPath, broken);
  await studio(async (p) => {
    await chooseFile(p, badPath);
    await p
      .locator("#toast")
      .filter({ hasText: "Checksum mismatch" })
      .waitFor();
    assert.equal(await p.locator("#report-cards button").count(), 2);
  });
  // A damaged final table forces rollback after earlier tables have been installed.
  const partial = Buffer.from(bytes);
  partial[partial.length - 33] ^= 1;
  createHash("sha256")
    .update(partial.subarray(0, -32))
    .digest()
    .copy(partial, partial.length - 32);
  const response = await fetch(url + "api/packages", {
    method: "POST",
    body: partial,
  });
  assert.equal(response.status, 400);
  assert.deepEqual((await readdir(join(target, "tables"))).sort(), before);
  assert.equal((await reports()).length, 2);
  await stop();
  await start(target);
  await studio(async (p) => {
    await p.goto(url + "#" + first);
    await p.locator("article").first().waitFor();
    await settled(p);
    await p.locator("[data-action=bookmarks]").click();
    await p.getByRole("button", { name: "East orders", exact: true }).click();
    await settled(p);
    assert.equal(
      await art(p, "Order margin").locator(".kpi").innerText(),
      "40%",
    );
    await art(p, "Regions").locator("[data-clear]").click();
    await settled(p);
    assert.equal(
      await art(p, "Order margin").locator(".kpi").innerText(),
      "13%",
    );
    await rename(p, "Transferred bookings", "Which region booked the most?");
    await save(p);
  });
  assert.deepEqual(canonical(await doc(second)), canonical(original));
  await writeFile(
    "portfolio-evidence/report-package.json",
    JSON.stringify(
      {
        bytes: bytes.length,
        sourceTables: original.tables.map((t) => ({
          name: t.name,
          rows: t.rows,
        })),
        pages: original.pages.map((p) => p.name),
        bookmark: "East orders",
        joinedDivision: { B: 12 },
        selectedMargin: "40%",
        overallMargin: "13%",
        independentCopies: 2,
        sourceOffline: true,
        restart: true,
        damagedPackageRolledBack: true,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Two independent imports retained updated rows, relationships, measures, pages, preparation, and the 40% bookmark after restart. Both corruption checks preserved the destination.",
  );
} finally {
  await stop();
}
