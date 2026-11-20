import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,filter,open,save,settled,studio} from "./portfolio-ui.mjs";

const before=process.argv.includes("--baseline"),name="January and March spending";
const {link,observed}=JSON.parse(await readFile("portfolio-evidence/calendar-quarter.json","utf8"));
const monthly=observed.flatMap(q=>q.lines),sum=dates=>[1,2,3].map(i=>
  monthly.filter(r=>dates.includes(r[0])).reduce((n,r)=>n+Number(r[i].replace(/[$,]/g,"")),0)
    .toLocaleString("en-US",{style:"currency",currency:"USD"}));
const fields=["Posted actual","Authorized budget","Actual less budget"];
const cards=p=>Promise.all(fields.map(f=>art(p,f).locator(".kpi").innerText()));
const desired=["2026-01","2026-03"];
await studio(async p=>{
  await open(p,"Budget vs. Actual");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:"Quarterly spending",exact:true}).click();
  await art(p,fields[0]).locator(".vhead").click();
  if (before) {
    for (const value of desired) await filter(p,"page","Period · Period",value);
    const actual=await cards(p);assert.notDeepEqual(actual,sum(desired));
    await writeFile("portfolio-evidence/multiple-filter-before.json",JSON.stringify({fields:desired,actual,expected:sum(desired)},null,2));return;
  }
  await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
  await p.getByLabel("Field",{exact:true}).selectOption({label:"Period · Period"});
  await p.getByLabel("Condition",{exact:true}).selectOption({label:"Is one of"});
  for (const m of desired) await p.getByRole("checkbox",{name:m,exact:true}).check();
  await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.deepEqual(await cards(p),sum(desired));
  await p.getByRole("button",{name:"Edit Period filter",exact:true}).click();
  assert.ok(await p.getByRole("checkbox",{name:desired[1],exact:true}).isChecked());await p.keyboard.press("Escape");
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:name});
  if (await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
  else {await p.getByLabel("New bookmark name").fill(name);await p.getByRole("button",{name:"Add current view"}).click();}
  await p.locator('[data-remove-filter="page:0"]').click();await settled(p);
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
if (!before) await studio(async p=>{
  await p.goto(link);await art(p,fields[0]).waitFor();await settled(p);
  await p.locator("[data-action=reader-bookmarks]").click();await p.getByRole("button",{name,exact:true}).click();await settled(p);
  assert.deepEqual(await cards(p),sum(desired));
  await p.locator("[data-action=reader-filters]").click();
  await p.getByRole("checkbox",{name:"2026-03",exact:true}).uncheck();await p.getByRole("checkbox",{name:"2026-04",exact:true}).check();
  await capture(p,"budget-selected-months");
  await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  const changed=["2026-01","2026-04"];assert.deepEqual(await cards(p),sum(changed));
  await p.locator("[data-action=reader-filters]").click();await p.getByRole("checkbox",{name:"All values",exact:true}).check();
  await p.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
  assert.deepEqual(await cards(p),sum(monthly.map(r=>r[0])));
  await writeFile("portfolio-evidence/multiple-filter.json",JSON.stringify({link,bookmark:name,selected:desired,totals:sum(desired),changed,changedTotals:sum(changed)},null,2));
});
