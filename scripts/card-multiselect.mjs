import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const bookmark="March paired channels",page="Channel cards";
const ledger=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const cards=p=>art(p,"Revenue by region and channel"),total=p=>art(p,"Selection total");
const east="East › Online",west="West › Retail";
const proof=[];
async function check(p,labels,period="2026-03-01") {
  const rows=ledger.filter(([date,region,channel])=>date===period && (!labels.length || labels.includes(region+" › "+channel)));
  const revenue=rows.reduce((n,row)=>n+Number(row[4]),0),orders=rows.reduce((n,row)=>n+Number(row[3]),0);
  assert.deepEqual((await cards(p).locator(".category-pick[aria-pressed=true]").allTextContents()).sort(),[...labels].sort());
  assert.equal(await total(p).locator(".kpi").innerText(),money.format(revenue));
  assert.deepEqual(await total(p).locator("dd").allTextContents(),[String(orders),money.format(revenue/orders)]);
  assert.equal(await art(p,"Review period").locator("option:checked").innerText(),period);
  proof.push({period,selected:labels,revenue,orders,average:money.format(revenue/orders)});
}
async function pick(p,label,ctrl=false) {
  await cards(p).getByRole("button",{name:label,exact:true}).click({modifiers:ctrl?["Control"]:[]});
  await settled(p);
}
async function restore(p) {
  await p.locator(".ribbon [data-action=bookmarks]").click();
  await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
}
await studio(async p=>{
  await open(p,"Visual Gallery");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
  await total(p).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
  const well=p.locator('[data-well=references]');
  for(const [i,[name,caption]] of [["Dispatch · Orders","Orders"],["Average dispatch order value","Per order"]].entries()) {
    if(await well.locator(".wellrow").count()<=i) await well.getByRole("combobox",{name:"Reference labels",exact:true}).selectOption({label:name});
    const input=well.locator("[data-reference-caption]").nth(i);
    await input.fill(caption); await input.press("Tab"); await settled(p);
  }
  await pick(p,east); await pick(p,west,true); await check(p,[east,west]);
  await p.locator(".ribbon [data-action=bookmarks]").click();
  const saved=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
  if(await saved.count()) await saved.locator("..").locator("[data-bookmark-update]").click();
  else {
    await p.getByLabel("New bookmark name").fill(bookmark);
    await p.getByRole("button",{name:"Add current view"}).click();
  }
  await cards(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
  await p.locator(`[data-page="${original}"]`).click(); await save(p);
});
await studio(async p=>{
  await open(p,"Visual Gallery"); await restore(p); await check(p,[east,west]);
  await capture(p,"gallery-paired-channels");
  await pick(p,east,true); await check(p,[west]);
  await pick(p,west,true); await check(p,[]);
  await cards(p).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Select multiple categories").check();
  await pick(p,east); await pick(p,west); await pick(p,"West › Online"); await check(p,[east,west,"West › Online"]);
  await pick(p,"West › Online"); await check(p,[east,west]);
  await p.locator("[data-tab=Build]").click();
  const down=p.locator('[data-well=groups] [data-move-field="1"]').first();
  await down.click(); await settled(p);
  assert.deepEqual((await cards(p).locator("[data-card-pick][aria-pressed=true]").allTextContents()).sort(),["Online › East","Retail › West"]);
  assert.equal(await total(p).locator(".kpi").innerText(),"$312.00");
  await down.click(); await settled(p); await check(p,[east,west]);
  await art(p,"Review period").locator("select").selectOption({label:"2026-02-01"}); await settled(p);
  await check(p,[east,west],"2026-02-01");
  await restore(p); await check(p,[east,west]);
});
await writeFile("portfolio-evidence/gallery-paired-channels.json",JSON.stringify({bookmark,checks:proof},null,2)+"\n");
