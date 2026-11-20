import assert from "node:assert/strict";
import {
  studio,
  open,
  visual,
  art,
  save,
  settled,
  addPage,
  capture,
} from "./portfolio-ui.mjs";
const bookmark = "March dispatch detail",
  briefing = "March briefing",
  button = "Open March records",
  text = "March dispatch results",
  nav = "Report pages";
const visit = async (p, n) => {
  await p.locator("#pages .page").filter({ hasText: n }).click();
  await settled(p);
};
async function build(p) {
  await open(p, "Visual Gallery");
  await visit(p, "Detail");
  const range = art(p, "Period filter");
  await range.locator("[data-range='0']").fill("2026-03-01");
  await settled(p);
  await range.locator("[data-range='1']").fill("2026-03-01");
  await settled(p);
  assert.equal(
    await art(p, "Revenue in selection").locator(".kpi").innerText(),
    "$732.00",
  );
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
  await range.locator("[data-clear]").click();
  await settled(p);
  if (await p.locator("#pages .page").filter({ hasText: briefing }).count())
    await visit(p, briefing);
  else await addPage(p, briefing);
  if (!(await art(p, text).count())) {
    await visual(p, "textBox", text, [], [], [18, 18, 958, 140]);
    await p.locator("[data-tab=Build]").click();
    const el = p.getByLabel("Report text");
    await el.fill(
      "March revenue was $732 against a $670 target. West contributed $383 and overtook East at $349. Open the saved March view to inspect the underlying period and region detail.",
    );
    await el.press("Tab");
    await visual(p, "actionButton", button, [], [], [18, 178, 330, 110]);
    await p.locator("[data-tab=Build]").click();
    await p
      .getByLabel("Action destination")
      .selectOption({ label: "Bookmark · " + bookmark });
    await p.getByLabel("Button text").fill("Inspect March records");
    await p.getByLabel("Button text").press("Tab");
    await visual(p, "navigator", nav, [], [], [18, 310, 958, 125]);
  }
  await visit(p, "Comparisons");
  await save(p);
}
await studio(build);
await studio(async (p) => {
  await open(p, "Visual Gallery");
  await visit(p, briefing);
  assert.match(
    await art(p, text).locator(".report-text").innerText(),
    /West contributed \$383/,
  );
  await capture(p, "gallery-briefing");
  await art(p, button)
    .getByRole("button", { name: "Inspect March records" })
    .click();
  await settled(p);
  assert.equal(
    await art(p, "Revenue in selection").locator(".kpi").innerText(),
    "$732.00",
  );
  assert.deepEqual(
    await art(p, "Period filter")
      .locator("input")
      .evaluateAll((es) => es.map((e) => e.value)),
    ["2026-03-01", "2026-03-01"],
  );
  await art(p, "Period filter").locator("[data-clear]").click();
  await settled(p);
  assert.equal(
    await art(p, "Revenue in selection").locator(".kpi").innerText(),
    "$1,731.00",
  );
  await visit(p, briefing);
  await art(p, nav)
    .getByRole("button", { name: "Trends", exact: true })
    .click();
  await settled(p);
  assert.ok(await art(p, "Revenue and order volume").isVisible());
  await visit(p, "Comparisons");
  await save(p);
});
console.log(
  "Bookmark action restored March filters and $732; page navigator and authored text survived reopening.",
);
