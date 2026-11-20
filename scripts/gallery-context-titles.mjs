import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const pageName="Regional trends",source="Dispatch channel caption",entered="Revenue across regions";
const expression='"Revenue · " & SELECTEDVALUE(Dispatch[Channel], "All channels")';
const baseline=process.env.FOLIO_TITLE_BASELINE==="1";
let link;
await studio(async p=>{
  await open(p,"Visual Gallery");
  const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
  await pages.getByRole("button",{name:pageName,exact:true}).click();await settled(p);
  const card=p.locator("#paper article").filter({has:p.locator(".kpi")});
  await card.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
  if (baseline) {
    assert.equal(await p.getByLabel("Title source",{exact:true}).count(),0);
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await art(p,"Channel to compare").locator("select").selectOption({label:"Online"});await settled(p);
    assert.equal(await card.locator(".vhead strong").innerText(),entered);
    await writeFile("portfolio-evidence/visual-title-before.json",JSON.stringify({filter:"Online",title:entered,amount:await card.locator(".kpi").innerText()},null,2));
    return;
  }
  const selector=p.getByLabel("Title source",{exact:true});
  if(!(await selector.locator("option").allTextContents()).includes(source))await formula(p,source,expression);
  await selector.selectOption({label:source});await settled(p);
  assert.equal(await card.locator(".vhead strong").innerText(),"Revenue · All channels");
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
if(!baseline)await studio(async p=>{
  const sums={"All channels":0};
  for(const line of (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1)){
    const row=line.split(","),amount=Number(row[4]);sums["All channels"]+=amount;sums[row[2]]=(sums[row[2]]||0)+amount;
  }
  await p.goto(link);await p.locator("#paper article").first().waitFor();await settled(p);
  for(const channel of ["All channels","Retail","Online"]){
    if(channel!=="All channels"){await art(p,"Channel to compare").locator("select").selectOption({label:channel});await settled(p);}
    const card=art(p,"Revenue · "+channel);
    assert.equal(await card.locator(".kpi").innerText(),new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(sums[channel]));
    assert.equal(await card.locator(".vhead strong").innerText(),"Revenue · "+channel);
  }
  await capture(p,"gallery-channel-caption");
  await writeFile("portfolio-evidence/gallery-channel-caption.json",JSON.stringify({link,expression,sums},null,2));
});

