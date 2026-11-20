import assert from "node:assert/strict";
import {
  studio,
  open,
  save,
  art,
  settled,
  capture,
  setInput,
} from "./portfolio-ui.mjs";
const chart = "Monthly encounter volume and target attainment";
async function visit(p, report, page) {
  await open(p, report);
  await p.locator("#pages .page").filter({ hasText: page }).click();
  await settled(p);
}
async function format(p, title) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
}
async function bound(p, axis, key, n) {
  await setInput(
    p,
    '[data-axis-key="' + axis + '"][data-bound="' + key + '"]',
    n,
  );
  await settled(p);
}
await studio(async (p) => {
  await visit(p, "Hospital Operations", "Volume and attainment");
  await format(p, chart);
  await bound(p, "secondary", "min", 0);
  await bound(p, "secondary", "max", 1);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async (p) => {
  await visit(p, "Hospital Operations", "Volume and attainment");
  const a = art(p, chart);
  const axis = a.locator('[data-scale="secondary"]');
  assert.equal(await axis.getAttribute("data-max"), "1");
  const labels = await axis.locator("text").allTextContents();
  assert.equal(labels[0], "0%");
  assert.equal(labels.at(-1), "100%");
  const [first, last] = await axis
    .locator("text")
    .evaluateAll((es) => [
      Number(es[0].getAttribute("y")) - 3,
      Number(es.at(-1).getAttribute("y")) - 3,
    ]);
  const march = a.locator('[data-point="2"][data-axis="secondary"] circle');
  assert.ok(
    Math.abs(
      Number(await march.getAttribute("cy")) -
        (first - ((first - last) * 23) / 39),
    ) < 1e-7,
  );
  await capture(p, "hospital-volume-attainment");
  await format(p, chart);
  await bound(p, "secondary", "min", 2);
  assert.equal(await p.getByLabel("Line axis min").inputValue(), "0");
  await bound(p, "secondary", "max", "");
  assert.equal(await axis.getAttribute("data-max"), "0.6");
});
await studio(async (p) => {
  await visit(p, "Visual Gallery", "Channel contribution");
  const a = art(p, "Revenue by region");
  const labels = await a
    .locator('[data-scale="primary"] text')
    .allTextContents();
  assert.equal(labels[0], "$0");
  assert.equal(labels.at(-1), "$1,000");
  await capture(p, "gallery-cross-highlight");
  await visitDifferentPage(p, "Distributions");
  const name = "Orders and revenue",
    scatter = art(p, name);
  await format(p, name);
  await bound(p, "x", "max", 26);
  assert.equal(
    await scatter.locator('[data-scale="x"]').getAttribute("data-max"),
    "26",
  );
  assert.ok(await scatter.locator("[data-plot-clip]").count());
  await bound(p, "x", "max", "");
  assert.ok(
    Number(
      await scatter.locator('[data-scale="x"]').getAttribute("data-max"),
    ) >= 27,
  );
});
async function visitDifferentPage(p, name) {
  await p.locator("#pages .page").filter({ hasText: name }).click();
  await settled(p);
}
console.log(
  "Independent combo/scatter axes, persisted bounds, automatic ticks, currency labels, clipping and March geometry verified.",
);
