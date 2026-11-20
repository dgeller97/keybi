import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

for (const budget of [false,true]) {
  const report=budget?"Budget vs. Actual":"Visual Gallery",page=budget?"Department cards":"Channel cards";
  const name=budget?"Posted variance by department":"Revenue by region and channel";
  const target=budget?"Spending detail tooltip":"Channel detail tooltip";
  const bookmark=budget?"February clinical departments":"March paired channels";
  await studio(async p=>{
    await open(p,report);
    const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    await art(p,name).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Tooltip page",{exact:true}).selectOption({label:target}); await settled(p);
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
    const tip=p.locator("#chart-tooltip"),card=art(p,name),proof=[];
    const cases=budget?[["Medicine","$2,200.00","$2,175.00"],["Surgery","$3,200.00","—"],["Facilities","$1,200.00","$1,153.00"]]:
      [["West › Retail","$143.00","11"],["East › Online","$169.00","13"],["West › Online","$240.00","16"]];
    for(const [i,[label,...values]] of cases.entries()) {
      const tile=card.getByRole("button",{name:label,exact:true});
      if(!i) await tile.hover(); else await tile.focus();
      await p.waitForFunction(({target,label})=>{
        const el=document.querySelector("#chart-tooltip:not([hidden])");
        return el?.querySelector("strong")?.textContent===label && el.querySelector(".tooltip-page-title")?.textContent===target;
      },{target,label});
      assert.deepEqual(await tip.locator(".kpi").allTextContents(),values);
      const total=await art(p,"Selection total").locator(".kpi").innerText();
      assert.equal(total,budget?"$25.00":"$312.00");
      assert.equal(await card.locator("[data-card-pick][aria-pressed=true]").count(),2);
      if(i===1) await capture(p,budget?"budget-department-preview":"gallery-channel-preview");
      await p.keyboard.press("Escape"); await tip.waitFor({state:"hidden"});
      proof.push({label,values,selectedTotal:total});
    }
    await writeFile(`portfolio-evidence/${budget?"budget":"gallery"}-category-tooltips.json`,JSON.stringify({target,proof},null,2)+"\n");
  });
}
