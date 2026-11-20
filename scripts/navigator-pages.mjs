import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const hidden="Dispatch records",tooltip="Channel detail tooltip",briefing="March briefing";
const tab=(p,name)=>p.locator("#pages").getByRole("button",{name,exact:true});
await studio(async p=>{
  await open(p,"Visual Gallery");
  const original=await p.locator(".page.active").getAttribute("data-page");
  await tab(p,hidden).click();await settled(p);
  await p.getByRole("button",{name:"Page settings for "+hidden}).press("Enter");
  await p.getByLabel("Hide page from navigators").check();
  await p.locator("#dlgform button[type=submit]").click();await settled(p);
  assert.equal(await tab(p,hidden).getAttribute("aria-description"),"Hidden from navigators by default");
  await p.locator('[data-page="'+original+'"]').click();await save(p);
});
await studio(async p=>{
  await open(p,"Visual Gallery");await tab(p,briefing).click();await settled(p);
  const nav=art(p,"Report pages"),links=nav.locator(".page-navigator button");
  const names=await links.allTextContents();
  assert.ok(!names.includes(hidden)&&!names.includes(tooltip));
  const tabs=await p.locator("#pages .page").allTextContents();
  assert.deepEqual(names,tabs.filter(name=>![hidden,tooltip].includes(name)));
  await nav.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
  let queries=0; p.on("request",r=>{if(r.url().endsWith("/api/query")) queries++;});
  const proof=[];
  for(const [includeHidden,includeTooltip] of [[false,true],[true,true],[true,false],[false,false]]) {
    await p.getByLabel("Include hidden pages").setChecked(includeHidden);
    await p.getByLabel("Include tooltip pages").setChecked(includeTooltip);
    const shown=await links.allTextContents();
    assert.deepEqual(shown,tabs.filter(name=>(includeHidden||name!==hidden)&&(includeTooltip||name!==tooltip)));
    proof.push({includeHidden,includeTooltip,count:shown.length});
  }
  assert.equal(queries,0);
  await capture(p,"gallery-navigator-pages");
  await nav.getByRole("button",{name:"Comparisons",exact:true}).click();await settled(p);
  const chart=art(p,"Regional revenue by channel"),mark=chart.locator('.plot-mark[aria-label*="Region East, Channel Retail"]');
  await mark.click();await settled(p);
  await chart.getByRole("button",{name:"View records"}).click();await settled(p);
  assert.equal(await p.locator("#pages .page.active").innerText(),hidden);
  const rows=await art(p,"Dispatch ledger").locator("tbody tr").allTextContents(); assert.equal(rows.length,3);
  await p.locator("[data-action=drill-back]").click(); await settled(p);
  assert.equal(await art(p,"Revenue in selection").locator(".kpi").innerText(),"$454.00");
  await writeFile("portfolio-evidence/navigator-pages.json",JSON.stringify({names,proof,formatQueries:0,hiddenPage:hidden,rows,selectedRevenue:454},null,2)+"\n");
  console.log({proof,rows});
});
