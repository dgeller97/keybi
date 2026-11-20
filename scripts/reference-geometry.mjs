import assert from "node:assert/strict";
import { art } from "./portfolio-ui.mjs";

export async function formatChart(p, title) {
  await art(p, title).locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
}
export async function configureLine(
  p,
  axis,
  {
    value,
    name,
    source,
    statistic,
    measure,
    percentile,
    color = "#91452e",
    pattern = "dashed",
    label = "both",
    position = "end",
  },
  existing,
) {
  if (existing)
    await p
      .locator("[data-edit-reference]")
      .filter({ hasText: existing })
      .click();
  else await p.locator('[data-add-reference="' + axis + '"]').click();
  if (statistic) {
    await p.locator("#ref-source").selectOption(statistic);
    await p.getByLabel("Chart measure").selectOption({ label: measure });
    if (statistic === "percentile")
      await p.getByLabel("Percentile (0–100)").fill(String(percentile));
  } else if (source) {
    await p.locator("#ref-source").waitFor();
    const match = p.locator("#ref-source option").filter({ hasText: source });
    assert.equal(await match.count(), 1);
    await p
      .locator("#ref-source")
      .selectOption(await match.getAttribute("value"));
    assert.ok(await p.locator("#ref-value").isDisabled());
    assert.equal(await p.locator("#ref-value").inputValue(), String(value));
  } else {
    await p.locator("#ref-source").selectOption("constant");
    await p.locator("#ref-value").fill(String(value));
  }
  await p.getByLabel("Name", { exact: true }).fill(name);
  await p.getByLabel("Line color").fill(color);
  await p.getByLabel("Line style").selectOption(pattern);
  await p.getByLabel("Data label", { exact: true }).selectOption(label);
  await p.getByLabel("Label position").selectOption(position);
  await p.locator("dialog button[type=submit]").click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
export async function verifyGeometry(chart, axis, value, vertical, name) {
  const scale = chart.locator('[data-scale="' + axis + '"]');
  const [lo, hi] = await scale.evaluate((g) => [
    +g.dataset.min,
    +g.dataset.max,
  ]);
  const node = chart
    .locator('[data-reference-axis="' + axis + '"]')
    .and(chart.getByRole("img", { name }));
  assert.equal(await node.count(), 1);
  const actual = Number(await node.getAttribute("data-reference-value"));
  assert.ok(
    Math.abs(actual - value) <= 1e-12 * Math.max(1, Math.abs(value)),
    String(actual) + " vs " + value,
  );
  const xy = await node
    .locator("line")
    .evaluate((l) =>
      ["x1", "y1", "x2", "y2"].map((k) => Number(l.getAttribute(k))),
    );
  const ends = await scale
    .locator("text")
    .evaluateAll(
      (ts, vertical) =>
        [ts[0], ts.at(-1)].map((t) =>
          vertical
            ? Number(t.getAttribute("x"))
            : Number(t.getAttribute("y")) - 3,
        ),
      vertical,
    );
  const expected = ends[0] + ((ends[1] - ends[0]) * (value - lo)) / (hi - lo);
  assert.ok(
    Math.abs(xy[vertical ? 0 : 1] - expected) < 1e-7,
    JSON.stringify({ xy, expected, lo, hi, value }),
  );
  assert.equal(xy[vertical ? 0 : 1], xy[vertical ? 2 : 3]);
  assert.ok(xy[vertical ? 3 : 2] > xy[vertical ? 1 : 0]);
  assert.ok((await node.getAttribute("aria-label")).includes(name));
  return {
    axis,
    domain: [lo, hi],
    value,
    coordinate: xy[vertical ? 0 : 1],
    axisEnds: ends,
  };
}
