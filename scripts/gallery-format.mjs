import assert from "node:assert/strict";
import {
  studio,
  open,
  save,
  art,
  settled,
  setInput,
  capture,
} from "./portfolio-ui.mjs";
const title = "Regional revenue by channel";
async function selected(p) {
  await open(p, "Visual Gallery");
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
}
const values = (a) =>
  a
    .locator("[data-point]")
    .evaluateAll((es) => es.map((e) => Number(e.dataset.value)));
await studio(async (p) => {
  await selected(p);
  const a = art(p, title);
  await p.locator("#rank-order").selectOption("desc");
  await setInput(p, "#rank-limit", 1);
  await settled(p);
  assert.deepEqual(await values(a), [478, 390]);
  await p.locator("[data-tab=Format]").click();
  await p.locator('[data-color-key="Online"]').fill("#773e82");
  await p.locator("[data-opt=tooltips]").uncheck();
  await save(p);
});
await studio(async (p) => {
  await selected(p);
  const a = art(p, title);
  assert.deepEqual(await values(a), [478, 390]);
  assert.equal(await a.locator("[data-point] title").count(), 0);
  assert.equal(
    await a.locator("[data-point] rect").first().getAttribute("fill"),
    "#773e82",
  );
  await p.locator("#rank-order").selectOption("asc");
  await settled(p);
  assert.deepEqual(await values(a), [409, 454]);
  await p.locator("#rank-order").selectOption("category");
  await setInput(p, "#rank-limit", "");
  await settled(p);
  const fields = async () =>
    p.locator("[data-well] .wellrow span").allTextContents();
  const original = await fields();
  for (const kind of [
    "stackedColumn",
    "percentBar",
    "clusteredColumn",
    "dot",
    "area",
    "line",
    "clusteredBar",
  ]) {
    await p.locator("[data-kind=" + kind + "]").click();
    await settled(p);
    assert.deepEqual(await fields(), original);
    const tuples=await a.locator("[data-point]").evaluateAll(es=>Object.fromEntries(es.map(e=>{
      const label=e.getAttribute("aria-label").split(" · ")[0];return [label,Number(e.dataset.value)];
    })));
    assert.deepEqual(tuples,{"Region East, Channel Online":409,"Region East, Channel Retail":454,"Region West, Channel Online":478,"Region West, Channel Retail":390});
  }
  await p.locator("[data-tab=Format]").click();
  await p.locator("[data-opt=tooltips]").check();
  await save(p);
  await p.locator("#pages .page").filter({ hasText: "Trends" }).click();
  await settled(p);
  const combo = art(p, "Revenue and order volume");
  await combo.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.locator("[data-opt=secondaryAxis]").uncheck();
  await settled(p);
  assert.equal(await combo.locator('[data-axis="primary"]').count(), 3);
  await p.locator("[data-opt=secondaryAxis]").check();
  await settled(p);
  assert.equal(await combo.locator('[data-axis="secondary"]').count(), 3);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
console.log(
  "Whole-category top N, compatible switches, saved series color, tooltips and secondary-axis controls passed.",
);
