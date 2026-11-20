import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";

const pageName="Channel performance",revenue="Revenue for selection",chart="Regional contribution by channel";
const placed=[revenue,chart,"Revenue attainment for selection","Operating measure"];
const omitted=["Channel operating results","Revenue by channel and region","Channel and region detail"];
const rows=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(s=>s.split(","));
const sum=(region,channel)=>rows.filter(r=>!region||r[1]===region&&r[2]===channel).reduce((n,r)=>n+Number(r[4]),0);
const format=n=>n.toLocaleString("en-US",{style:"currency",currency:"USD"});
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");const origin=await p.locator("#pages .active").getAttribute("data-page");
  await p.locator("#pages").getByRole("button",{name:pageName,exact:true}).click();await settled(p);
  link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await p.getByRole("button",{name:"Page settings for "+pageName}).click();
  const dlg=p.getByRole("dialog");await dlg.getByLabel("Use a phone layout").check();
  for (const name of omitted) await dlg.getByLabel("Show "+name+" on phone",{exact:true}).uncheck();
  for (const [i,name] of placed.entries()) {
    while ((await dlg.locator("#phone-order li span").allTextContents()).indexOf(name)>i)
      await dlg.getByLabel("Move "+name+" up",{exact:true}).click();
    await dlg.getByLabel(name+" height in pixels",{exact:true}).fill(String([96,235,96,110][i]));
  }
  await dlg.getByRole("button",{name:"Save",exact:true}).click();await dlg.waitFor({state:"hidden"});
  await art(p,chart).locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
  const pin=p.getByRole("button",{name:"Pin displayed colors",exact:true});
  if (await pin.count()) await pin.click();
  assert.ok(await p.getByRole("button",{name:"Displayed colors pinned"}).isDisabled());
  await p.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.setViewportSize({width:390,height:700});await p.goto(link);await p.locator(".phone-page").waitFor();await settled(p);
  const layout=p.getByLabel("Page layout",{exact:true}),picker=p.getByLabel("Focus visual",{exact:true});
  const titles=()=>p.locator("#paper .visual:visible .vhead strong").allTextContents();
  const amount=()=>art(p,revenue).locator(".kpi").innerText();
  const westColor=()=>art(p,chart).locator('[data-series-color="West"]').getAttribute("data-color");
  const west=await westColor();assert.equal(west,"#d7863a");
  assert.deepEqual(await titles(),placed);assert.equal(await amount(),format(sum()));
  assert.deepEqual(await picker.locator("option").allTextContents(),["Focus visual…",...placed]);
  const height=(await p.locator("#paper").boundingBox()).height;
  await capture(p,"gallery-channel-phone");
  await picker.selectOption({label:chart});
  assert.deepEqual(await picker.locator("option").allTextContents(),["Back to report",...placed]);
  await p.getByRole("button",{name:"Back to report"}).click();
  await layout.selectOption("desktop");assert.equal((await titles()).length,7);
  const comparison=art(p,omitted[1]);
  await comparison.locator('[data-point][aria-label*="Online"][aria-label*="West"]').press("Enter");await settled(p);
  assert.equal(await amount(),format(sum("West","Online")));
  await layout.selectOption("phone");assert.deepEqual(await titles(),placed);
  assert.equal(await amount(),format(sum("West","Online")));
  assert.equal(await westColor(),west);
  assert.equal(await art(p,chart).locator('[data-point] rect').first().getAttribute("fill"),west);
  const context=p.getByRole("group",{name:"Selections on other visuals"});
  assert.match(await context.innerText(),/Region = West/);assert.match(await context.innerText(),/Channel = Online/);
  await capture(p,"gallery-phone-selection");
  await context.getByRole("button",{name:/Clear .*Revenue by channel and region/}).click();await settled(p);
  assert.equal(await amount(),format(sum()));assert.equal(await context.isVisible(),false);
  await art(p,chart).locator('[data-point][aria-label*="East"][aria-label*="Retail"]').press("Enter");await settled(p);
  assert.equal(await amount(),format(sum("East","Retail")));
  const result={link,visible:placed,desktopCount:7,height,allRevenue:sum(),omittedSourceSelection:sum("West","Online"),afterClearing:sum(),visibleSourceSelection:sum("East","Retail"),westColorAcrossLayouts:west};
  await writeFile("portfolio-evidence/phone-visibility.json",JSON.stringify(result,null,2)+"\n");console.log(result);
});
