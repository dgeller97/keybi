import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const baseline=process.argv.includes("--baseline"),bookmark="First-quarter spending";
const {link,observed}=JSON.parse(await readFile("portfolio-evidence/calendar-quarter.json","utf8"));
async function cards(p) {
  return Promise.all(["Posted actual","Authorized budget","Actual less budget"].map(title=>art(p,title).locator(".kpi").innerText()));
}
await studio(async p=>{
  await open(p,"Budget vs. Actual");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:"Quarterly spending",exact:true}).click();
  await art(p,"Actual and budget by calendar quarter").locator(".vhead").click();await p.locator("[data-tab=Filters]").click();
  await p.locator("[data-new-filter=page]").click();
  await p.getByLabel("Field",{exact:true}).selectOption({label:"Period · Calendar quarter"});
  await p.getByLabel("Equals",{exact:true}).fill("2026 Q1");await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  const actual=await cards(p);
  if (baseline) {
    assert.notDeepEqual(actual,observed[0].cards);
    await writeFile("portfolio-evidence/period-filter-before.json",JSON.stringify({entered:"2026 Q1",actual,expected:observed[0].cards},null,2));
    return;
  }
  assert.deepEqual(actual,observed[0].cards);
  assert.ok(await p.getByText("2026 Q1",{exact:true}).count());
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if (await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark);await p.getByRole("button",{name:"Add current view"}).click();}
  if (await p.getByRole("dialog").count()) await p.keyboard.press("Escape");
  await p.locator('[data-remove-filter="page:0"]').click();await settled(p);
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);await art(p,"Posted actual").waitFor();await settled(p);
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();await settled(p);
  assert.deepEqual(await cards(p),observed[0].cards);
  await p.locator("[data-action=reader-filters]").click();
  const field=p.getByLabel("Calendar quarter",{exact:true});
  await field.selectOption({label:"2026 Q2"});
  await capture(p,"budget-quarter-filter");
  await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.deepEqual(await cards(p),observed[1].cards);
  await p.locator("[data-action=reader-filters]").click();
  await field.selectOption({label:"Enter exact value…"});await p.getByLabel("Exact value for Calendar quarter").fill("2026 Q3");
  await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  const vacant=await cards(p);assert.deepEqual(vacant,["—","—","—"]);
  await writeFile("portfolio-evidence/period-filter.json",JSON.stringify({link,bookmark,q1:observed[0].cards,q2:observed[1].cards,q3:vacant},null,2));
});
