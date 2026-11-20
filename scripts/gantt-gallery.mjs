import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  studio,
  open,
  addPage,
  visual,
  art,
  settled,
  save,
  setInput,
} from "./portfolio-ui.mjs";
const report = "Visual Gallery",
  page = "Delivery schedule",
  title = "Depot rollout",
  effort = "Planned crew-days",
  filter = "Workstream";
const file = resolve("web/datasets/gallery/Schedule.csv");
const [header, ...lines] = (await readFile(file, "utf8")).trim().split(/\r?\n/);
const facts = lines.map((line) =>
  Object.fromEntries(line.split(",").map((v, i) => [header.split(",")[i], v])),
);
const tabs = (p) => p.locator("#pages .page").filter({ hasText: page });
await studio(async (p) => {
  await open(p, report);
  if (
    !(await p
      .locator("#data details summary")
      .filter({ hasText: "Schedule" })
      .count())
  ) {
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles(file);
    await p
      .locator("#data details summary")
      .filter({ hasText: "Schedule" })
      .waitFor();
  }
  if (await tabs(p).count()) {
    await tabs(p).click();
    await settled(p);
  } else await addPage(p, page);
  const chart = art(p, title);
  if (!(await chart.count())) {
    await visual(
      p,
      "dropdown",
      filter,
      ["Schedule · Workstream"],
      [],
      [18, 18, 350, 112],
    );
    await visual(
      p,
      "card",
      effort,
      [],
      ["Schedule · CrewDays"],
      [385, 18, 585, 112],
    );
    await visual(
      p,
      "gantt",
      title,
      ["Schedule · Task"],
      ["Schedule · Complete"],
      [18, 146, 952, 430],
    );
    await p.locator("[data-tab=Build]").click();
    for (const [well, column] of [
      ["startFields", "Start"],
      ["endFields", "Finish"],
      ["phaseFields", "Workstream"],
      ["tooltipFields", "CrewDays"],
    ])
      await p
        .locator("[data-pick=" + well + "]")
        .selectOption({ label: "Schedule · " + column });
    await setInput(p, "[data-tip-label='0']", "Planned crew-days");
  }
  await chart.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Data labels", { exact: true }).check();
  await p.getByLabel("Shade weekends", { exact: true }).check();
  await p.locator('[data-page="0"]').click();
  await save(p);
});
async function visit(p) {
  await open(p, report);
  await tabs(p).click();
  await settled(p);
  return art(p, title);
}
await studio(async (p) => {
  const chart = await visit(p);
  const marks = chart.locator(".plot-mark");
  assert.equal(await marks.count(), facts.length);
  const output = [];
  for (const row of facts) {
    const mark = chart.getByRole("button", {
      name: new RegExp("Task " + row.Task + ","),
    });
    const d = (Date.parse(row.Finish) - Date.parse(row.Start)) / 86400000;
    if (!row.Finish) assert.equal(await mark.locator(".milestone").count(), 1);
    else {
      assert.equal(Number(await mark.getAttribute("data-duration")), d);
      const [duration, progress] = await mark
        .locator(".duration,.progress")
        .evaluateAll((rs) => rs.map((r) => Number(r.getAttribute("width"))));
      assert.ok(Math.abs(progress / duration - Number(row.Complete)) < 1e-9);
      output.push({
        task: row.Task,
        elapsedDays: d,
        completedFraction: progress / duration,
        svgWidth: duration,
      });
    }
  }
  const unit = output[0].svgWidth / output[0].elapsedDays;
  for (const item of output)
    assert.ok(Math.abs(item.svgWidth / item.elapsedDays - unit) < 1e-9);
  await p.mouse.move(1, 1);
  await p.screenshot({ path: "portfolio-evidence/gallery-gantt.png" });
  const pilot = chart.getByRole("button", { name: /Task Pilot routes,/ });
  await pilot.focus();
  await p.getByRole("tooltip").locator("td").waitFor();
  assert.equal(await p.getByRole("tooltip").locator("td").innerText(), "18");
  await p.keyboard.press("Enter");
  await settled(p);
  assert.equal(await art(p, effort).locator(".kpi").innerText(), "18");
  await chart.locator("[data-clear]").click();
  await settled(p);
  await chart.getByRole("button", { name: "Collapse Network" }).click();
  await settled(p);
  assert.equal(await marks.count(), 5);
  await chart.getByRole("button", { name: "Expand Network" }).click();
  await settled(p);
  await art(p, filter).locator("select").selectOption({ label: "Warehouse" });
  await settled(p);
  assert.equal(await marks.count(), 3);
  assert.equal(await art(p, effort).locator(".kpi").innerText(), "24");
  await chart.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.locator("[data-schedule-bound=from]").fill("2026-02-20");
  await p.locator("[data-schedule-bound=through]").fill("2026-02-28");
  await settled(p);
  assert.equal(await marks.count(), 2);
  const install = chart.getByRole("button", { name: /Task Install scanners,/ });
  assert.equal(await install.getAttribute("data-duration"), "16");
  assert.equal(
    Number(await install.locator(".progress").getAttribute("width")),
    0,
  );
  await p.locator("[data-schedule-bound=from]").fill("");
  await p.locator("[data-schedule-bound=through]").fill("");
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-agg-well=metrics]").selectOption("max");
  await settled(p);
  assert.equal(Number(await install.getAttribute("data-value")), 0.5);
  await p.locator("[data-kind=line]").click();
  await settled(p);
  assert.equal(
    await p
      .locator("[data-well=metrics] .wellrow")
      .innerText()
      .then((s) => s.includes("Complete")),
    true,
  );
  await writeFile(
    "portfolio-evidence/gantt.json",
    JSON.stringify(
      {
        tasks: facts.length,
        milestones: facts.filter((r) => !r.Finish).map((r) => r.Task),
        durations: output,
        filteredCrewDays: 24,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "Eight tasks, six elapsed durations, two milestones, completion geometry, clipping, workstream collapse, selection, tooltips and compatible chart conversion passed.",
  );
});
