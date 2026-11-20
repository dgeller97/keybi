import assert from "node:assert/strict";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import {
  studio,
  open,
  save,
  visual,
  art,
  filter,
  settled,
  addPage,
  capture,
  evidence,
} from "./portfolio-ui.mjs";
const charts = [
  [
    "Change and ranking",
    "waterfall",
    "Retail revenue above or below plan",
    "Period",
    "Change",
    {},
  ],
  [
    "Change and ranking",
    "ribbon",
    "Regional revenue rank",
    "Period",
    "Revenue",
    { legendFields: "Region" },
  ],
  [
    "Change and ranking",
    "gauge",
    "Revenue against plan",
    null,
    "Revenue",
    { other: "Target" },
  ],
  [
    "Change and ranking",
    "treemap",
    "Regional revenue mix",
    "Region",
    "Revenue",
    { legendFields: "Channel" },
  ],
  [
    "Detail",
    "decomposition",
    "Explain regional revenue",
    "Region",
    "Revenue",
    { groups: "Channel" },
  ],
  [
    "Pipeline",
    "map",
    "Qualified deals by office",
    "Office",
    "Latitude",
    { other: "Longitude", size: "Deals" },
  ],
  ["Pipeline", "funnel", "Deals by stage", "Stage", "Deals", {}],
];
const pg = (p, n) => p.locator("#pages .page").filter({ hasText: n }).first();
async function visit(p, name) {
  await pg(p, name).click();
  await settled(p);
}
const fields = (n) => (n === "Pipeline" ? "Pipeline · " : "Dispatch · ");
async function build(p) {
  await open(p, "Visual Gallery");
  if (
    !(await p
      .locator("#data details summary")
      .filter({ hasText: "Pipeline" })
      .count())
  ) {
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles(resolve("web/datasets/gallery/Pipeline.csv"));
    await p.waitForFunction(
      () => document.querySelectorAll("#data details[data-tree]").length === 2,
    );
  }
  for (const [name, kind, title, g, m, extra] of charts) {
    if (!(await pg(p, name).count())) await addPage(p, name);
    else await visit(p, name);
    if (await art(p, title).count()) continue;
    const i = await p.locator("article").count(),
      source = fields(name),
      box = [18 + (i % 2) * 490, 15 + Math.floor(i / 2) * 255, 470, 244];
    if (name === "Detail") box.splice(0, 4, 506, 610, 472, 234);
    await visual(p, kind, title, g ? [source + g] : [], [source + m], box);
    await p.locator("[data-tab=Build]").click();
    const agg = p.locator("[data-well=metrics] [data-agg]");
    await agg.selectOption("max");
    await agg.selectOption(kind === "map" ? "avg" : "sum");
    for (const [key, field] of Object.entries(extra))
      await p
        .locator("[data-pick=" + key + "]")
        .selectOption({ label: source + field });
    if (kind === "waterfall")
      await filter(p, "visual", source + "Channel", "Retail");
    if (kind === "map")
      await filter(p, "visual", source + "Stage", "1 · Qualified");
    await p.locator("[data-tab=Format]").click();
    await p.locator("#vaccent").fill("#357a79");
    if (["waterfall", "ribbon", "map", "treemap", "funnel"].includes(kind))
      await p.locator("[data-opt=labels]").check();
    await save(p);
  }
  await visit(p, "Comparisons");
  await save(p);
}
async function verify(p) {
  await open(p, "Visual Gallery");
  for (const [name, kind, title] of charts) {
    await visit(p, name);
    const a = art(p, title),
      marks = await a.locator("[data-point]").evaluateAll((es) =>
        es.map((e) => ({
          ...e.dataset,
          label: e.getAttribute("aria-label"),
        })),
      );
    if (kind === "waterfall") {
      assert.deepEqual(
        marks.map((e) => [+e.start, +e.end]),
        [
          [0, 10],
          [10, 1],
          [1, 4],
        ],
      );
    } else if (kind === "ribbon") {
      assert.deepEqual(
        marks.map((e) => [e.label.match(/East|West/)[0], +e.value, +e.rank]),
        [
          ["East", 216, 1],
          ["West", 214, 2],
          ["East", 298, 1],
          ["West", 271, 2],
          ["West", 383, 1],
          ["East", 349, 2],
        ],
      );
    } else if (kind === "gauge") {
      assert.equal(
        await a.locator("[data-target-value]").getAttribute("data-value"),
        "1731",
      );
      assert.equal(
        await a
          .locator("[data-target-value]")
          .getAttribute("data-target-value"),
        "1650",
      );
      continue;
    } else if (kind === "treemap") {
      const total = marks.reduce((n, e) => n + Number(e.area), 0);
      for (const e of marks)
        assert.ok(
          Math.abs(Number(e.area) / total - Number(e.value) / 1731) < 1e-8,
        );
    } else if (kind === "map") {
      assert.deepEqual(
        marks.map((e) => [+e.lat, +e.lng, +e.size]),
        [
          [51.51, -0.13, 60],
          [-33.87, 151.21, 34],
          [43.65, -79.38, 48],
        ],
      );
      assert.equal(await a.locator("image").getAttribute("href"), "/land.svg");
      assert.ok((await p.request.get(new URL("/land.svg", p.url()).href)).ok());
    } else if (kind === "funnel") {
      assert.deepEqual(
        marks.map((e) => +e.value),
        [142, 77, 39],
      );
      marks.forEach((e) =>
        assert.ok(Math.abs(Number(e.fraction) - Number(e.value) / 142) < 1e-8),
      );
    } else if (kind === "decomposition") {
      assert.match(await a.locator(".tree-trail b").innerText(), /1,731/);
      await a.locator("[data-tree-step]").first().click();
      await settled(p);
      assert.match(await a.locator(".tree-trail b").innerText(), /863/);
      assert.deepEqual(
        await a.locator("[data-matrix-pick] b").allTextContents(),
        ["409", "454"],
      );
      await a.locator("[data-matrix-pick]").first().click();
      await settled(p);
      assert.equal(
        await art(p, "Revenue in selection").locator(".kpi").innerText(),
        "$409.00",
      );
      await a.locator("[data-clear]").click();
      await a.locator("[data-tree-up]").click();
      await settled(p);
      continue;
    }
    await a.locator("[data-point]").first().focus();
    await p.keyboard.press("Enter");
    await settled(p);
    assert.equal(await a.locator("[aria-pressed=true]").count(), 1);
    if (kind === "ribbon")
      assert.equal(
        await art(p, "Revenue against plan")
          .locator("[data-target-value]")
          .getAttribute("data-value"),
        "216",
      );
    if (kind === "map")
      assert.deepEqual(
        await art(p, "Deals by stage")
          .locator("[data-point]")
          .evaluateAll((es) => es.map((e) => Number(e.dataset.value))),
        [60, 26, 17],
      );
    await a.locator("[data-clear]").click();
    await settled(p);
  }
  await visit(p, "Change and ranking");
  await capture(p, "gallery-change");
  await visit(p, "Pipeline");
  await capture(p, "gallery-pipeline");
  await visit(p, "Comparisons");
  await save(p);
  const entry = {
    title: "Visual Gallery",
    url: p.url(),
    specialized: charts.map((c) => c[1]),
    checked: new Date().toISOString(),
  };
  await writeFile(
    evidence + "/gallery-specialized.json",
    JSON.stringify(entry, null, 2),
  );
}
if (process.argv[2] !== "verify") await studio(build);
await studio(verify);
console.log(
  "Specialized controls, values, branch totals, rank changes, and geographic positions verified.",
);
