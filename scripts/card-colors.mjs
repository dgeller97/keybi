import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

const good="#326a51", bad="#a63e31", lowCoverage="#86540f";
const rgb=hex=>"rgb("+[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)).join(", ")+")";
for (const budget of [true,false]) {
  const report=budget?"Budget vs. Actual":"Visual Gallery", page=budget?"Forecast review":"Channel comparison";
  const name=budget?"Posted departments variance":"Selected channel revenue";
  async function show(p) {
    await open(p,report);
    const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    return original;
  }
  await studio(async p=>{
    const original=await show(p);
    await art(p,name).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    async function rule(target,source,threshold,below,above) {
      await p.getByLabel("Apply to measure").selectOption({label:target});
      await p.getByLabel("Set text color by value").check();
      await p.getByLabel("Base colors on").selectOption({label:source}); await settled(p);
      await setInput(p,"[data-cell-setting=threshold]",threshold);
      await p.getByLabel("Below threshold",{exact:true}).fill(below);
      await p.getByLabel("Above threshold",{exact:true}).fill(above);
    }
    if(budget) {
      await rule(name,"Displayed value",0,good,bad);
      await rule("Departments posted","Displayed value",2.5,lowCoverage,good);
    } else await rule("Dispatch revenue","Variance from Online",0,bad,good);
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await show(p);
    const card=art(p,name),proof=[];
    async function check(key,value,color,refColor) {
      const result=await card.evaluate(el=>({value:el.querySelector(".kpi").textContent,
        color:getComputedStyle(el.querySelector(".kpi")).color,refs:[...el.querySelectorAll("dd")].map(dd=>({value:dd.textContent,color:getComputedStyle(dd).color}))}));
      assert.equal(result.value,value); assert.equal(result.color,rgb(color));
      if(refColor) assert.equal(result.refs[0].color,rgb(refColor));
      proof.push({key,...result});
    }
    if(budget) {
      for(const [period,amount,ink,coverage] of [["2026-01","$289.00",bad,good],["2026-02","$28.00",bad,lowCoverage],["2026-03","-$70.00",good,good],["2026-04","-$51.00",good,good]]) {
        await art(p,"Forecast period").locator("select").selectOption({label:period}); await settled(p);
        await check(period,amount,ink,coverage);
        if(period==="2026-02") await capture(p,"budget-posted-card");
      }
    } else {
      await check("West Retail","$143.00",bad);
      await capture(p,"gallery-channel-card");
      const grid=art(p,"Selected revenue compared with Online");
      for(const [path,amount,ink] of [[["East","Retail"],"$180.00",good],[["East","Online"],"$169.00",null]]) {
        await grid.locator(`tr[data-path='${JSON.stringify(path)}'] td:not([data-row-level])`).first().getByRole("button").click(); await settled(p);
        if(ink) await check(path.join(" "),amount,ink);
        else {
          assert.equal(await card.locator(".kpi").innerText(),amount);
          assert.equal(await card.locator(".kpi").evaluate(el=>el.style.color),"");
        }
      }
    }
    await writeFile(`portfolio-evidence/${budget?"budget":"gallery"}-card-colors.json`,JSON.stringify(proof,null,2)+"\n");
  });
}
