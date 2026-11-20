import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const pageName="Channel comparison", matrix="Selected revenue compared with Online";
const online="Online revenue", delta="Variance from Online";
const fixed=`CALCULATE([Dispatch revenue], 'Dispatch'[Channel] = "Online")`;
const cardNames=["Selected channel revenue",online,delta];
const bindings=["Dispatch revenue",online,delta];
const tab=p=>p.getByRole("button",{name:pageName,exact:true});
const row=(p,path)=>art(p,matrix).locator(`tr[data-path='${JSON.stringify(path)}']`);
const month=p=>art(p,"Comparison period").locator("select");
const cards=p=>Promise.all(cardNames.map(n=>art(p,n).locator(".kpi").innerText()));

await studio(async p=>{
  await open(p,"Visual Gallery");
  if (await tab(p).count()) return;
  await addPage(p,pageName);
  await formula(p,online,fixed,"currency");
  await formula(p,delta,"[Dispatch revenue] - [Online revenue]","currency");
  await visual(p,"dropdown","Comparison period",["Dispatch · Period"],[],[18,20,220,115]);
  for (const [i,name] of cardNames.entries())
    await visual(p,"card",name,[],[bindings[i]],[250+i*243,20,232,115]);
  await visual(p,"matrix",matrix,["Dispatch · Region","Dispatch · Channel"],bindings,[18,155,955,367]);
  await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
  await p.getByLabel("Row subtotal position").selectOption("top");
  await month(p).selectOption({label:"2026-03-01"});
  await settled(p);
  await row(p,["West","Retail"]).getByRole("button",{name:"$143.00",exact:true}).click();
  await settled(p);
  assert.deepEqual(await cards(p),["$143.00","$240.00","-$97.00"]);
  await p.locator('[data-page="0"]').click();
  await save(p);
});

const lines=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const header=lines.shift().split(",");
const ledger=lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[header[i],v])));
const revenue=records=>records.reduce((sum,r)=>sum+Number(r.Revenue),0);
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
await studio(async p=>{
  await open(p,"Visual Gallery"); await tab(p).click(); await settled(p);
  assert.deepEqual(await cards(p),["$143.00","$240.00","-$97.00"]);
  await capture(p,"gallery-channel-comparison");
  const checks=[];
  for (const period of ["",...new Set(ledger.map(r=>r.Period))]) {
    await month(p).selectOption(period ? {label:period} : {index:0});
    await settled(p);
    const entries=ledger.filter(r=>!period || r.Period===period);
    for (const path of [[],...["East","West"].flatMap(r=>[[r],[r,"Online"],[r,"Retail"]])]) {
      const regional=entries.filter(r=>!path.length || r.Region===path[0]);
      const actual=revenue(regional.filter(r=>path.length<2 || path[1]===r.Channel));
      const reference=revenue(regional.filter(r=>r.Channel==="Online"));
      const expected=[actual,reference,actual-reference].map(n=>money.format(n));
      assert.deepEqual(await row(p,path).locator("td:not([data-row-level])").allTextContents(),expected);
      if (path.join("/") === "West/Retail") assert.deepEqual(await cards(p),expected);
      checks.push({period:period||"All",path,expected});
    }
  }
  await row(p,["East","Retail"]).locator("td:not([data-row-level])").first().getByRole("button").click();
  await settled(p);
  assert.deepEqual(await cards(p),["$180.00","$169.00","$11.00"]);
  await art(p,matrix).getByRole("button",{name:"Clear selection"}).click();
  await settled(p);
  assert.deepEqual(await cards(p),["$732.00","$409.00","$323.00"]);
  await writeFile("portfolio-evidence/gallery-channel-comparison.json",JSON.stringify({
    url:await currentPageLink(p),fixed,checks,cleared:await cards(p)
  },null,2)+"\n");
});
