import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formatChart} from "./reference-geometry.mjs";

const baseline=process.argv.includes("--baseline");
const name="Encounter detail",ledger="Routine encounter register",slicer="Find an encounter",card="Encounters in view";
const bookmark="Two encounters for review",first="E002",last="E192";
const records=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/).slice(1)
  .map(row=>row.split(",")).filter(row=>row[3]==="Routine");
const expected=records.filter(row=>[first,last].includes(row[0])).map(row=>[row[0],row[2],row[5]]);
const entries=p=>art(p,ledger).locator("tbody tr").evaluateAll(rows=>rows.map(r=>[r.cells[0],r.cells[2],r.cells[4]].map(c=>c.textContent)));
let link,bulkEntry;
await studio(async p=>{
  await open(p,"Hospital Operations");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name,exact:true}).click();await settled(p);
  if (!(await art(p,slicer).count())) {
    await visual(p,"dropdown",slicer,["Encounter · Encounter"],[],[20,12,570,132]);
    await visual(p,"card",card,[],[["Encounter · Encounter","count"]],[600,12,380,132]);
  }
  const picker=art(p,slicer);await formatChart(p,slicer);
  if (baseline) {
    const options=await picker.locator("select option").allTextContents();
    assert.equal(options.length,records.length+1);assert.equal(options.at(-1),last);
    assert.equal(await picker.getByRole("searchbox").count(),0);
    await writeFile("portfolio-evidence/encounter-search-before.json",JSON.stringify({slicer,available:options.length-1,last,search:false},null,2));return;
  }
  for (const [title,box] of [[ledger,[20,177,960,370]],[card,[600,12,380,154]],[slicer,[20,12,570,154]]]) {
    await formatChart(p,title);await position(p,box);
  }
  await p.getByLabel("Show search box").check();await settled(p);
  const input=picker.getByRole("searchbox");
  await input.fill("e19");await picker.getByRole("option",{name:last,exact:true}).waitFor({state:"attached"});
  await p.waitForFunction(()=>document.querySelector('[data-slice-drop]')?.options.length===4);
  await picker.locator("select").selectOption({label:last});await settled(p);
  assert.deepEqual(await entries(p),expected.slice(-1));assert.equal(await art(p,card).locator(".kpi").innerText(),"1");
  await picker.locator("[data-clear]").click();await settled(p);await input.fill("");
  await picker.getByRole("option",{name:first,exact:true}).waitFor({state:"attached"});
  await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
  const d=p.getByRole("dialog");await d.getByLabel("Field",{exact:true}).selectOption({label:"Encounter · Encounter"});
  await d.getByLabel("Condition",{exact:true}).selectOption("in");
  bulkEntry={supplied:[first,last],multilineInputs:await d.locator("textarea").count(),
    pasteButtons:await d.getByRole("button",{name:/paste/i}).count(),searches:0,checkboxes:0};
  for (const [text,id] of [["002",first],["e19",last]]) {
    await d.getByRole("searchbox").fill(text);await d.getByRole("checkbox",{name:id,exact:true}).check();
    bulkEntry.searches++;bulkEntry.checkboxes++;
  }
  await d.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.deepEqual(await entries(p),expected);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const row=d.locator("[data-bookmark-go]").filter({hasText:bookmark});
  if (await row.count()) await row.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(bookmark);await p.getByRole("button",{name:"Add current view"}).click();}
  await p.locator('[data-remove-filter="page:0"]').click();await settled(p);await save(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!baseline) await studio(async p=>{
  await p.goto(link);const picker=art(p,slicer);await picker.getByRole("searchbox").waitFor();await settled(p);
  await picker.getByRole("searchbox").fill("e19");await p.waitForFunction(()=>document.querySelector('[data-slice-drop]')?.options.length===4);
  assert.equal(await art(p,card).locator(".kpi").innerText(),String(records.length));
  await picker.locator("select").selectOption({label:last});await settled(p);
  assert.deepEqual(await entries(p),expected.slice(-1));
  const bounds=await picker.boundingBox(),select=await picker.locator("select").boundingBox();
  assert.ok(select.y+select.height<bounds.y+bounds.height);
  await capture(p,"hospital-encounter-search");
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();await settled(p);
  assert.deepEqual(await entries(p),expected);
  await p.locator("[data-action=reader-filters]").click();const d=p.getByRole("dialog");
  await d.getByRole("searchbox").fill("e19");await d.getByRole("checkbox",{name:last,exact:true}).uncheck();
  await d.getByRole("checkbox",{name:"E191",exact:true}).check();await d.getByRole("button",{name:"Apply"}).click();await settled(p);
  assert.deepEqual(await entries(p),[expected[0],["E191","Harbor","34"]]);
  await writeFile("portfolio-evidence/encounter-search.json",JSON.stringify({link,search:"e19",routine:records.length,
    matches:records.filter(row=>row[0].startsWith("E19")).map(row=>row[0]),bookmark,saved:expected,changed:await entries(p),bulkEntry},null,2));
});
