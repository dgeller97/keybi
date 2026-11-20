import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {editFormula,formula} from "./formula-check.mjs";

const pageName="Channel share", matrix="Revenue share within each region", period="Dispatch period";
const total="Revenue across channels", share="Channel share of region";
const base="[Dispatch revenue]", cleared=`CALCULATE(${base}, REMOVEFILTERS('Dispatch'[Channel]))`;
const ratio=`DIVIDE(${base}, [${total}])`;
const cardNames=["Selected revenue","Regional revenue","Share of region"];
const tab=p => p.getByRole("button",{name:pageName,exact:true});
const row=(p,path) => art(p,matrix).locator(`tbody tr[data-path='${JSON.stringify(path)}']`);
const monthControl=p => art(p,period).locator("select");
async function setMonth(p,month) {
  const select=monthControl(p);
  if (month) await select.selectOption({label:month});
  else await select.selectOption({index:0});
  await settled(p);
}
await studio(async p => {
  await open(p,"Visual Gallery");
  if (await tab(p).count()) {
    let changed=false;
    for (const [name,expression] of [[total,cleared],[share,ratio]]) {
      await editFormula(p,name);
      const input=p.getByLabel("DAX expression");
      if (await input.inputValue() === expression) await p.keyboard.press("Escape");
      else {
        await input.fill(expression);
        await p.getByRole("button",{name:"Save measure"}).click();
        await p.locator("dialog").waitFor({state:"hidden"});
        changed=true;
      }
    }
    await p.locator(".rail [data-action=report]").click();
    if (changed) await save(p);
    return;
  }
  await addPage(p,pageName);
  await formula(p,total,cleared,"currency");
  await formula(p,share,ratio,"percent");
  await visual(p,"dropdown",period,["Dispatch · Period"],[],[18,20,226,115]);
  for (const [i,m] of ["Dispatch revenue",total,share].entries())
    await visual(p,"card",cardNames[i],[],[m],[257+i*243,20,230,115]);
  await visual(p,"matrix",matrix,["Dispatch · Region","Dispatch · Channel"],
    ["Dispatch revenue",total,share],[18,155,955,367]);
  await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
  await p.getByLabel("Row subtotal position").selectOption("top");
  await setMonth(p,"2026-03-01");
  await row(p,["West","Online"]).getByRole("button",{name:"$240.00",exact:true}).click();
  await settled(p);
  assert.equal(await art(p,cardNames[2]).locator(".kpi").innerText(),"62.66%");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const lines=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const header=lines.shift().split(",");
const ledger=lines.map(line => Object.fromEntries(line.split(",").map((v,i) => [header[i],v])));
const money=n=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
const percent=n=>new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2}).format(n);
await studio(async p => {
  await open(p,"Visual Gallery"); await tab(p).click(); await settled(p);
  const cards=() => Promise.all(cardNames.map(name => art(p,name).locator(".kpi").innerText()));
  assert.deepEqual(await cards(),["$240.00","$383.00","62.66%"]);
  await capture(p,"gallery-channel-share");
  const periods=["",...new Set(ledger.map(r => r.Period))], checks=[];
  for (const month of periods) {
    await setMonth(p,month);
    const entries=ledger.filter(r => !month || r.Period===month);
    const paths=[[],...["East","West"].flatMap(r=>[[r],[r,"Online"],[r,"Retail"]])];
    for (const path of paths) {
      const regional=entries.filter(r => !path.length || r.Region===path[0]);
      const numerator=regional.filter(r => path.length<2 || r.Channel===path[1])
        .reduce((n,r) => n+Number(r.Revenue),0);
      const denominator=regional.reduce((n,r) => n+Number(r.Revenue),0);
      const values=[money(numerator),money(denominator),percent(numerator/denominator)];
      assert.deepEqual(await row(p,path).locator("td:not([data-row-level])").allTextContents(),values);
      if (path.join("/") === "West/Online") assert.deepEqual(await cards(),values);
      checks.push({month:month||"All periods",path,values});
    }
  }
  await art(p,matrix).getByRole("button",{name:"Clear selection"}).click();
  await settled(p);
  assert.deepEqual(await cards(),["$732.00","$732.00","100%"]);
  await writeFile("portfolio-evidence/gallery-channel-share.json",JSON.stringify({
    url:await currentPageLink(p),cleared,ratio,checks,clearedSelection:await cards()
  },null,2)+"\n");
});
await studio(async p => {
  await open(p,"Visual Gallery"); await tab(p).click(); await settled(p);
  await editFormula(p,"Dispatch revenue");
  await p.getByLabel("DAX expression").fill("SUM('Dispatch'[Target])");
  await p.getByRole("button",{name:"Save measure"}).click();
  await p.locator(".rail [data-action=report]").click();
  await settled(p);
  const targets=await Promise.all(cardNames.map(name=>art(p,name).locator(".kpi").innerText()));
  assert.deepEqual(targets,["$200.00","$350.00","57.14%"]);
  assert.deepEqual(await row(p,["West","Online"]).locator("td:not([data-row-level])").allTextContents(),targets);
  await editFormula(p,"Dispatch revenue");
  await p.getByLabel("DAX expression").fill("["+share+"]");
  await p.getByRole("button",{name:"Save measure"}).click();
  const error=await p.locator("dialog [role=alert]").innerText();
  assert.match(error,/Circular measure reference.*Dispatch revenue.*Channel share of region.*Dispatch revenue/);
  await p.keyboard.press("Escape");
  await p.locator("dialog").waitFor({state:"hidden"});
});
