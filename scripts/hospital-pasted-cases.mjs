import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const {link}=JSON.parse(await readFile("portfolio-evidence/encounter-search.json","utf8"));
const cases=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/).slice(1)
  .map(row=>row.split(",")).filter(r=>r[3]==="Routine");
const choice=["E002","E191","E192"],bookmark="Pasted case review",slicer="Find an encounter";
const expected=ids=>cases.filter(row=>ids.includes(row[0])).map(row=>[row[0],row[2],row[5]]);
const rows=p=>art(p,"Routine encounter register").locator("tbody tr").evaluateAll(rs=>rs.map(r=>[0,2,4].map(i=>r.cells[i].textContent)));
const count=p=>art(p,"Encounters in view").locator(".kpi").innerText();
async function apply(p) {
  const d=p.getByRole("dialog");await d.getByRole("button",{name:"Apply",exact:true}).click();
  await d.waitFor({state:"hidden"});await settled(p);
}
await studio(async p=>{
  await open(p,"Hospital Operations");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:"Encounter detail",exact:true}).click();await settled(p);
  await art(p,slicer).locator(".vhead").click();
  await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
  const d=p.getByRole("dialog");await d.getByLabel("Field",{exact:true}).selectOption({label:"Encounter · Encounter"});
  await d.getByLabel("Condition",{exact:true}).selectOption("in");
  await d.getByText("Paste values",{exact:true}).click();
  await d.getByLabel("Values, one per line").fill([...choice,"E002","E999"].join("\n"));
  await d.getByText("3 matched · 1 unmatched",{exact:true}).waitFor();
  await capture(p,"hospital-pasted-cases");await apply(p);assert.deepEqual(await rows(p),expected(choice));
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const prior=d.locator("[data-bookmark-go]").filter({hasText:bookmark});
  if (await prior.count()) await prior.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark);await p.getByRole("button",{name:"Add current view"}).click();}
  await p.locator('[data-remove-filter="page:0"]').click();await settled(p);
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const picker=art(p,slicer);await picker.waitFor();await settled(p);
  const d=p.getByRole("dialog"),input=d.getByLabel("Values, one per line");
  await picker.getByRole("button",{name:"Paste values"}).click();
  await input.fill("E001\nE999");await d.getByText("0 matched · 2 unmatched").waitFor();
  await d.getByRole("button",{name:"Apply"}).click();assert.ok(await d.isVisible());assert.equal(await count(p),String(cases.length));
  await input.fill("E192\nE191\nE002\nE001\nE002");await d.getByText("3 matched · 1 unmatched").waitFor();
  await d.getByRole("button",{name:"Review matches"}).click();
  await d.getByRole("checkbox",{name:"E191",exact:true}).click();
  assert.equal(await count(p),String(cases.length));
  await apply(p);assert.deepEqual(await rows(p),expected(["E002","E192"]));
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();await settled(p);
  assert.deepEqual(await rows(p),expected(choice));assert.equal(await count(p),"3");
  await p.locator("[data-action=reader-filters]").click();await d.getByText("Paste values",{exact:true}).click();
  await input.fill("E191\nE192");await apply(p);assert.deepEqual(await rows(p),expected(["E191","E192"]));
  await writeFile("portfolio-evidence/pasted-cases.json",JSON.stringify({link,bookmark,author:{lines:5,selected:choice,
    unmatched:["E999"],records:expected(choice)},slicer:{supplied:["E192","E191","E002","E001","E002"],unmatched:["E001"],removedBeforeApply:["E191"],records:expected(["E002","E192"])},
    reader:await rows(p)},null,2));
});
