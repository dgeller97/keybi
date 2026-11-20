import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  studio,
  open,
  save,
  addPage,
  visual,
  art,
  settled,
  capture,
} from "./portfolio-ui.mjs";
const report = "Visual Gallery",
  page = "Depot coverage",
  bookmark = "Pacific depots";
const chart = "Loads by depot",
  card = "Scheduled loads",
  filter = "Depot network";
const path = resolve("web/datasets/gallery/Depots.csv");
const [, ...lines] = (await readFile(path, "utf8")).trim().split(/\r?\n/);
const ledger = lines.map((line) => {
  const [network, name, lat, lng, size] = line.split(",");
  return { network, name, lat: +lat, lng: +lng, size: +size };
});
const tab = (p) => p.locator("#pages .page").filter({ hasText: page });
async function region(p, name) {
  await art(p, filter).locator("select").selectOption({ label: name });
  await settled(p);
}
async function view(p, action) {
  await art(p, chart)
    .getByRole("button", { name: action, exact: true })
    .click();
}
async function marks(p) {
  return art(p, chart)
    .locator("[data-lng]")
    .evaluateAll((es) =>
      es.map((e) => {
        const circle = e.querySelector("circle"),
          pt = new DOMPoint(0, 0).matrixTransform(e.getScreenCTM());
        return {
          name: e.querySelector("text").textContent,
          lat: +e.dataset.lat,
          lng: +e.dataset.lng,
          size: +e.dataset.size,
          radius: circle.r.baseVal.value,
          x: pt.x,
          y: pt.y,
          visible: getComputedStyle(e).display !== "none",
        };
      }),
    );
}
async function total(p) {
  return Number(await art(p, card).locator(".kpi").innerText());
}
function close(a, b, tolerance = 0.01) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} differs from ${b}`);
}
function width(points) {
  return (
    Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x))
  );
}
async function verify(p, network) {
  const points = await marks(p),
    rows = ledger.filter((r) => r.network === network);
  assert.equal(points.length, rows.length);
  for (const p of points) {
    const r = rows.find((r) => r.name === p.name);
    assert.ok(r);
    assert.deepEqual([p.lat, p.lng, p.size], [r.lat, r.lng, r.size]);
    assert.ok(p.visible);
    close(
      p.radius,
      8 * Math.sqrt(r.size / Math.max(...rows.map((r) => r.size))) + 0.01,
    );
  }
  return points;
}
if (!process.argv.includes("--verify-only"))
  await studio(async (p) => {
    await open(p, report);
    if (
      !(await p
        .locator("#data details summary")
        .filter({ hasText: "Depots" })
        .count())
    ) {
      const chooser = p.waitForEvent("filechooser");
      await p.locator(".ribbon [data-action=import]").click();
      await (await chooser).setFiles(path);
      await p
        .locator("#data details summary")
        .filter({ hasText: "Depots" })
        .waitFor();
    }
    if (!(await tab(p).count())) {
      await addPage(p, page);
      await visual(
        p,
        "dropdown",
        filter,
        ["Depots · Network"],
        [],
        [18, 18, 348, 106],
      );
      await visual(
        p,
        "card",
        card,
        [],
        ["Depots · Loads"],
        [382, 18, 595, 106],
      );
      await visual(
        p,
        "map",
        chart,
        ["Depots · Depot"],
        ["Depots · Latitude"],
        [18, 140, 959, 426],
      );
      await p.locator("[data-tab=Build]").click();
      await p.locator("[data-agg-well=metrics]").selectOption("min");
      await p.locator("[data-agg-well=metrics]").selectOption("avg");
      await p
        .locator("[data-pick=other]")
        .selectOption({ label: "Depots · Longitude" });
      await p
        .locator("[data-pick=size]")
        .selectOption({ label: "Depots · Loads" });
      await p.locator("[data-tab=Format]").click();
      await p.getByLabel("Data labels", { exact: true }).check();
    } else await tab(p).click();
    await settled(p);
    await region(p, "Pacific");
    await view(p, "Fit locations");
    const pacific = await verify(p, "Pacific");
    assert.equal(await total(p), 62);
    const east = pacific.find((p) => p.name === "East quay"),
      west = pacific.find((p) => p.name === "West quay"),
      south = pacific.find((p) => p.name === "South quay");
    assert.ok(east.x > west.x && west.x > south.x && south.y > east.y);
    close((east.x - west.x) / (west.x - south.x), 0.35 / 0.08);
    await p.locator("[data-action=bookmarks]").click();
    const existing = p
      .locator("dialog [data-bookmark-go]")
      .filter({ hasText: bookmark });
    if (await existing.count())
      await existing.locator("..").locator("[data-bookmark-update]").click();
    else {
      await p.getByLabel("New bookmark name").fill(bookmark);
      await p.getByRole("button", { name: "Add current view" }).click();
    }
    await region(p, "Lakeshore");
    await view(p, "Fit locations");
    await p.locator('[data-page="0"]').click();
    await save(p);
  });
await studio(async (p) => {
  await open(p, report);
  await tab(p).click();
  await settled(p);
  const map = art(p, chart),
    fitted = await verify(p, "Lakeshore");
  assert.equal(await total(p), 88);
  let queries = 0;
  p.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/query") queries++;
  });
  await view(p, "Show world");
  const world = await verify(p, "Lakeshore");
  assert.ok(width(world) < 2);
  await view(p, "Fit locations");
  const restored = await verify(p, "Lakeshore");
  assert.ok(width(restored) > 150);
  for (const [i, point] of restored.entries()) {
    close(point.x, fitted[i].x);
    close(point.y, fitted[i].y);
    close(point.radius, world[i].radius);
  }
  const plot = map.locator(".analytic-plot"),
    box = await plot.boundingBox();
  const x = box.x + box.width * 0.42,
    y = box.y + box.height * 0.35;
  await p.mouse.move(x, y);
  await p.mouse.down();
  await p.mouse.move(x + 40, y + 15, { steps: 6 });
  await p.mouse.up();
  const moved = await verify(p, "Lakeshore");
  for (const [i, point] of moved.entries()) {
    close(point.x - restored[i].x, 40, 0.1);
    close(point.y - restored[i].y, 15, 0.1);
  }
  await plot.focus();
  await p.keyboard.press("ArrowRight");
  await p.keyboard.press("Home");
  await view(p, "Zoom out");
  const out = await verify(p, "Lakeshore");
  close(width(restored) / width(out), 2);
  await view(p, "Zoom in");
  assert.equal(queries, 0);
  await map.getByRole("button", { name: /Depot Junction ·/ }).click();
  await settled(p);
  assert.equal(await total(p), 41);
  await view(p, "Zoom to selected location");
  const focused = (await marks(p)).find((pt) => pt.name === "Junction");
  close(focused.x, box.x + box.width / 2, 0.1);
  close(focused.y, box.y + box.height / 2, 0.1);
  await map.locator("[data-clear]").click();
  await settled(p);
  assert.equal(await total(p), 88);
  await p.locator("[data-action=bookmarks]").click();
  await p
    .locator("dialog [data-bookmark-go]")
    .filter({ hasText: bookmark })
    .click();
  await settled(p);
  const pacific = await verify(p, "Pacific");
  assert.equal(await total(p), 62);
  assert.ok(width(pacific) > 200);
  const grid = map.locator(".map-grid text");
  const labels = await grid.allTextContents();
  assert.ok(
    labels.includes("180°") &&
      labels.some((s) => s.endsWith("°W")) &&
      labels.some((s) => s.endsWith("°E")),
  );
  await map.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Coordinate grid when zoomed").uncheck();
  await settled(p);
  assert.equal(await grid.count(), 0);
  await p.getByLabel("Coordinate grid when zoomed").check();
  await settled(p);
  assert.deepEqual(await grid.allTextContents(), labels);
  await p.locator("[data-tab=Build]").click();
  await p.mouse.move(2, 2);
  await capture(p, "gallery-pacific-depots");
  const proof = {
    worldClusterWidthPx: width(world),
    fittedClusterWidthPx: width(restored),
    pacificWidthPx: width(pacific),
    panScreenPx: [40, 15],
    queriesDuringNavigation: 0,
    selectionLoads: 41,
    networkTotals: { Lakeshore: 88, Pacific: 62 },
    pacific,
    gridLabels: labels,
  };
  await writeFile(
    "portfolio-evidence/map-navigation.json",
    JSON.stringify(proof, null, 2) + "\n",
  );
  console.log(JSON.stringify(proof));
});
