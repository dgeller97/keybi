import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { studio, open, art, settled, save, setInput } from "./portfolio-ui.mjs";
const pie = "Share of regional revenue",
  donut = "Share of orders by channel",
  source = "Channel revenue by region";
const bookmark = "East retail contribution";
const csv = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
  .trim()
  .split(/\r?\n/);
const facts = csv
  .slice(1)
  .map((row) =>
    Object.fromEntries(row.split(",").map((v, i) => [csv[0].split(",")[i], v])),
  );
const sum = (rows, key) => rows.reduce((n, r) => n + Number(r[key]), 0);
const chosen = facts.filter(
  (r) => r.Region === "East" && r.Channel === "Retail",
);
async function visit(p) {
  await open(p, "Visual Gallery");
  await p.locator("#pages .page").filter({ hasText: "Distributions" }).click();
  await settled(p);
}
async function format(p, title) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
}
async function selectEast(p) {
  await art(p, source)
    .getByRole("button", { name: /Region East, Channel Retail/ })
    .focus();
  await p.keyboard.press("Enter");
  await settled(p);
}
async function angles(chart) {
  return chart.locator(".plot-mark").evaluateAll((marks) =>
    marks.map((m) => {
      function arc(cls) {
        const path = m.querySelector(cls);
        if (!path) return null;
        const d = path.getAttribute("d");
        const radii = [...d.matchAll(/A ([\d.e+-]+) /g)].map((x) =>
          Number(x[1]),
        );
        const outer = radii[0],
          inner = radii[2] || 0;
        // The SVG perimeter is two radial edges plus the outer and inner arc lengths.
        const share =
          (path.getTotalLength() - 2 * (outer - inner)) /
          (2 * Math.PI * (outer + inner));
        return {
          share,
          hole: inner / outer,
          opening: d.slice(0, d.indexOf(" A ")),
        };
      }
      return {
        title: m.getAttribute("aria-label"),
        total: Number(m.dataset.value),
        selected:
          m.dataset.highlight === "" ? null : Number(m.dataset.highlight),
        base: arc(".slice-total"),
        overlay: arc(".slice-selected"),
        label: [...m.querySelectorAll("text")].map((t) => t.textContent),
      };
    }),
  );
}
const close = (a, b, tolerance = 0.0015) =>
  assert.ok(Math.abs(a - b) < tolerance, a + " versus " + b);
await studio(async (p) => {
  await visit(p);
  await format(p, source);
  for (const title of [pie, donut])
    await p
      .getByLabel("Interaction with " + title, { exact: true })
      .selectOption("highlight");
  await format(p, pie);
  await p.locator("#vformat").selectOption("currency");
  await format(p, donut);
  await setInput(p, "[data-opt=holePercent]", 62);
  await setInput(p, "[data-opt=sliceAngle]", 30);
  await p.getByLabel("Data labels", { exact: true }).check();
  await p
    .getByLabel("Slice label", { exact: true })
    .selectOption("categoryPercent");
  await selectEast(p);
  assert.equal(
    await art(p, "Revenue in selection").locator(".kpi").innerText(),
    "$454.00",
  );
  await p.locator("[data-action=bookmarks]").click();
  const old = p
    .locator("dialog [data-bookmark-go]")
    .filter({ hasText: bookmark });
  if (await old.count())
    await old.locator("..").locator("[data-bookmark-update]").click();
  else {
    await p.getByLabel("New bookmark name").fill(bookmark);
    await p.getByRole("button", { name: "Add current view" }).click();
  }
  await art(p, source).locator("[data-clear]").click();
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await open(p, "Visual Gallery");
  await p.locator("[data-action=bookmarks]").click();
  await p.getByRole("button", { name: bookmark, exact: true }).click();
  await settled(p);
  const values = {};
  for (const [title, group, amount] of [
    [pie, "Region", "Revenue"],
    [donut, "Channel", "Orders"],
  ]) {
    values[title] = await angles(art(p, title));
    const all = sum(facts, amount);
    for (const mark of values[title]) {
      const category = mark.title.split(" ")[1];
      const total = sum(
        facts.filter((r) => r[group] === category),
        amount,
      );
      const selected = chosen.filter((r) => r[group] === category);
      assert.equal(mark.total, total);
      close(mark.base.share, total / all);
      if (selected.length) {
        assert.equal(mark.selected, sum(selected, amount));
        close(mark.overlay.share, sum(selected, amount) / all);
        assert.equal(mark.overlay.opening, mark.base.opening);
      } else {
        assert.equal(mark.selected, null);
        assert.equal(mark.overlay, null);
      }
      if (title === donut) {
        close(mark.base.hole, 0.62);
        assert.ok(mark.label[0].startsWith(category + " · "));
      }
    }
  }
  await p.setViewportSize({ width: 1680, height: 1350 });
  await p.mouse.move(5, 5);
  await p.screenshot({
    path: "portfolio-evidence/gallery-slice-highlights.png",
  });
  const a = art(p, pie);
  await a.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-agg]").first().selectOption("avg");
  await settled(p);
  const paired = await angles(a);
  const east = paired.find((m) => m.title.startsWith("Region East "));
  assert.ok(east.selected > east.total);
  close(east.overlay.share, 1);
  close(east.base.share, 863 / 1731);
  assert.match(
    await a.locator(".highlight-key").innerText(),
    /Each chart shows its own shares/,
  );
  await p.locator('[data-kind="donut"]').click();
  await settled(p);
  close((await angles(a))[0].base.hole, 0.55);
  await art(p, source).locator("[data-clear]").click();
  await settled(p);
  assert.equal(await a.locator(".slice-selected").count(), 0);
  await format(p, donut);
  assert.equal(await p.getByLabel("Start angle (degrees)").inputValue(), "30");
  await setInput(p, "[data-opt=holePercent]", 100);
  assert.equal(await p.getByLabel("Inner radius (%)").inputValue(), "62");
  await writeFile(
    "portfolio-evidence/slice-highlights.json",
    JSON.stringify({ bookmark, values, paired }, null, 2) + "\n",
  );
  console.log(
    "Browser-measured pie and donut arcs, overlapping starts, 62% hole, saved formatting, missing groups, and independently normalized averages passed.",
  );
});
