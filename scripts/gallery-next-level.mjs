import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { art, capture, currentPageLink, open, save, settled, studio } from "./portfolio-ui.mjs";

const title = "Revenue by region";
const bookmark = "Revenue by region and channel";
const records = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8")).trim()
  .split(/\r?\n/).slice(1).map(line => line.split(","));
async function visit(p) {
  await open(p, "Visual Gallery");
  await p.locator("#pages .page").filter({hasText:"Channel contribution"}).click();
  await settled(p);
  return art(p,title);
}
await studio(async p => {
  const chart = await visit(p);
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=groups]").selectOption({label:"Dispatch · Channel"});
  await settled(p);
  const slicer = art(p,"Channel selection").locator("select");
  await slicer.selectOption({label:"All"});
  await settled(p);
  await chart.locator("[data-drill=expand]").click();
  await settled(p);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const existing = p.locator(".bookmark-row").filter({hasText:bookmark});
  if (await existing.count()) await existing.locator("[data-bookmark-update]").click();
  else {
    await p.getByLabel("New bookmark name").fill(bookmark);
    await p.locator("dialog button[type=submit]").click();
  }
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  await slicer.selectOption({label:"Retail"});
  await settled(p);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
await studio(async p => {
  const chart = await visit(p);
  const url = await currentPageLink(p);
  await chart.getByRole("button", {name:"Go to next level (Channel)"}).click();
  await settled(p);
  const results = [];
  for (const month of ["","2026-03-01"]) {
    await art(p,"Month selection").locator("select").selectOption(month ? {label:month} : {label:"All"});
    await settled(p);
    for (const channel of ["Retail","Online"]) {
      const expected = records.filter(([date,,c]) => c === channel && (!month || date === month))
        .reduce((n,r) => n + Number(r[4]),0);
      const mark = chart.locator('[data-point][aria-label^="Channel ' + channel + ' ·"]');
      assert.equal(Number(await mark.getAttribute("data-value")),expected);
      const highlighted = await mark.getAttribute("data-highlight");
      if (channel === "Retail") assert.equal(Number(highlighted),expected);
      else assert.ok(highlighted === null || highlighted === "");
      results.push({month:month || "All",channel,revenue:expected,highlighted});
    }
  }
  assert.equal(await art(p,"Selected revenue").locator(".kpi").innerText(),"$323.00");
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await capture(p,"gallery-all-channels");
  await chart.locator("[data-drill=up]").click();
  await settled(p);
  assert.equal(await chart.locator('[data-point][aria-label^="Region West"]').getAttribute("data-value"),"383");
  await writeFile("portfolio-evidence/gallery-all-channels.json",JSON.stringify({url,results},null,2)+"\n");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click();
  await settled(p);
  assert.deepEqual(await chart.locator("[data-axis-parent]").allTextContents(),["East","West"]);
  assert.deepEqual(await chart.locator("[data-axis-child]").allTextContents(),["Online","Retail","Online","Retail"]);
  const combinations = [];
  for (const region of ["East","West"]) {
    for (const channel of ["Online","Retail"]) {
      const revenue = records.filter(([,r,c]) => r === region && c === channel)
        .reduce((sum,row) => sum + Number(row[4]),0);
      const mark = chart.locator('[data-point][aria-label^="Region ' + region + ', Channel ' + channel + ' ·"]');
      assert.equal(Number(await mark.getAttribute("data-value")),revenue);
      await mark.press("Enter");
      await settled(p);
      assert.equal(await art(p,"Selected revenue").locator(".kpi").innerText(),"$"+revenue+".00");
      combinations.push({region,channel,revenue});
      if (region === "East" && channel === "Online") await capture(p,"gallery-expanded-revenue");
    }
  }
  await writeFile("portfolio-evidence/gallery-expanded-revenue.json",JSON.stringify({url,combinations},null,2)+"\n");
  console.log("Whole-axis channel totals, Retail highlight, March filter and return to Region reconciled to Dispatch.csv.");
});
