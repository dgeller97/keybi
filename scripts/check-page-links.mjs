import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { studio, open, art, settled, evidence } from "./portfolio-ui.mjs";
const entries = [
  ["Hospital Operations", "Monthly change", "Month change", "-3.42 pp"],
  ["Visual Gallery", "Channel contribution", "Selected revenue", "$844.00"],
];
const verified = [];
for (const [report, page, title, expected] of entries) {
  let link;
  await studio(async (p) => {
    await open(p, report);
    await p.locator("#pages .page").filter({ hasText: page }).click();
    await settled(p);
    await p.locator("header [data-action=library]").click();
    await p.locator("dialog [data-action=page-link]").click();
    link = await p.getByLabel("Local page link").inputValue();
  });
  await studio(async (p) => {
    await p.goto(link);
    await p.waitForFunction(() => document.querySelector("article"));
    await settled(p);
    assert.equal(await p.locator("#pages .page.active").innerText(), page);
    assert.equal(await art(p, title).locator(".kpi").innerText(), expected);
    await p.reload();
    await p.waitForFunction(() => document.querySelector("article"));
    await settled(p);
    assert.equal(await art(p, title).locator(".kpi").innerText(), expected);
  });
  verified.push({ report, page, link, result: expected });
}
await writeFile(
  evidence + "/page-links.json",
  JSON.stringify(verified, null, 2),
);
console.log(JSON.stringify(verified));
