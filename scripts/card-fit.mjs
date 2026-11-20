import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

export async function measureCallout(card) {
  return card.locator(".kpi").evaluate(el=>{
    const text=document.createRange();
    text.selectNodeContents(el);
    const bounds=text.getBoundingClientRect(), body=el.parentElement.getBoundingClientRect();
    return {value:el.textContent,fontSize:parseFloat(getComputedStyle(el).fontSize),
      width:bounds.width,available:body.width,overflowRight:Math.max(0,bounds.right-body.right),
      overflowLeft:Math.max(0,body.left-bounds.left),overflowTop:Math.max(0,body.top-bounds.top),
      overflowBottom:Math.max(0,bounds.bottom-body.bottom)};
  });
}
export async function checkCallout(card) {
  const result=await measureCallout(card);
  for (const side of ["overflowRight","overflowLeft","overflowTop","overflowBottom"])
    assert.ok(result[side]<1,JSON.stringify(result));
  return result;
}
export async function verifyBudgetCallouts() {
  await studio(async p=>{
    await open(p,"Budget vs. Actual");
    await p.getByRole("button",{name:"Forecast review",exact:true}).click(); await settled(p);
    const proof={};
    for(const month of ["2026-01","2026-02","2026-03","2026-04"]) {
      await art(p,"Forecast period").locator("select").selectOption({label:month}); await settled(p);
      proof[month]={};
      for(const name of ["Monthly forecast","Above forecast","Posted departments variance"])
        proof[month][name]=await checkCallout(art(p,name));
      if(month==="2026-02") await capture(p,"budget-posted-total");
    }
    const card=art(p,"Above forecast");
    await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    let queries=0;
    p.on("request",req=>{if(new URL(req.url()).pathname==="/api/query") queries++;});
    await setInput(p,"#card-text-size",30);
    assert.equal((await checkCallout(card)).fontSize,30);
    assert.equal(queries,0);
    await writeFile("portfolio-evidence/card-fit.json",JSON.stringify({months:proof,formattingQueries:queries},null,2)+"\n");
  });
}

async function galleryCallouts() {
  const names=["Selected channel revenue","Online revenue","Variance from Online"];
  await studio(async p=>{
    await open(p,"Visual Gallery");
    const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:"Channel comparison",exact:true}).click(); await settled(p);
    let changed=false;
    for(const name of names) {
      await art(p,name).locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
      if(await p.locator("#card-text-size").inputValue()!=="42") {
        await setInput(p,"#card-text-size",42);
        changed=true;
      }
    }
    if(changed) {
      await p.locator(`[data-page="${original}"]`).click();
      await save(p);
    }
  });
  await studio(async p=>{
    await open(p,"Visual Gallery"); await p.getByRole("button",{name:"Channel comparison",exact:true}).click(); await settled(p);
    const proof=[];
    for(const period of [{label:"2026-03-01"},{index:0}]) {
      await art(p,"Comparison period").locator("select").selectOption(period); await settled(p);
      for(const name of names) {
        const card=art(p,name);
        await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
        assert.equal(await p.locator("#card-text-size").inputValue(),"42");
        const value=await checkCallout(card);
        assert.ok(value.fontSize<=42.01);
        proof.push({period:period.label||"All",name,...value});
      }
    }
    await writeFile("portfolio-evidence/gallery-card-fit.json",JSON.stringify(proof,null,2)+"\n");
  });
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  await verifyBudgetCallouts(); await galleryCallouts();
}
