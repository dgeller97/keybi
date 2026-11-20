import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
import {checkCallout} from "./card-fit.mjs";

const budget={report:"Budget vs. Actual",page:"Forecast review",title:"Posted departments variance",slicer:"Forecast period"};
const gallery={report:"Visual Gallery",page:"Channel comparison",title:"Selected channel revenue",slicer:"Comparison period"};
async function show(p,spec) {
  await open(p,spec.report);
  const original=await p.locator(".page.active").getAttribute("data-page");
  await p.getByRole("button",{name:spec.page,exact:true}).click(); await settled(p);
  return original;
}
async function build(p,spec) {
  await art(p,spec.title).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
}
export const referenceValues=card=>card.locator(".card-references > div").evaluateAll(items=>
  items.map(row=>[row.querySelector("dt").textContent,row.querySelector("dd").textContent]));
const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
for (const spec of [budget,gallery]) {
  const isBudget=spec===budget;
  const calc=isBudget?"Departments with postings":"Average dispatch order value";
  const dax=isBudget?"SUMX(VALUES('Department'[Department]), CALCULATE(IF(ISBLANK(SUM('Transaction'[Actual])), BLANK(), 1)))":
    "DIVIDE([Dispatch revenue], SUM('Dispatch'[Orders]))";
  const labels=isBudget?[[calc,"Departments posted"]]:[["Dispatch · Orders","Orders"],[calc,"Per order"]];
  await studio(async p=>{
    const original=await show(p,spec); await build(p,spec);
    const pick=p.getByRole("combobox",{name:"Reference labels",exact:true});
    if (!(await pick.getByRole("option",{name:calc,exact:true}).count())) {
      await formula(p,calc,dax,isBudget?"number":"currency"); await settled(p);
    }
    const well=p.locator('[data-well="references"]');
    for (const [i,[field,caption]] of labels.entries()) {
      if(await well.locator(".wellrow").count()<=i) {await pick.selectOption({label:field}); await settled(p);}
      const input=well.locator("[data-reference-caption]").nth(i);
      await input.fill(caption); await input.press("Tab");
    }
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await show(p,spec);
    const card=art(p,spec.title),select=art(p,spec.slicer).locator("select"),proof=[];
    const check=async (period,callout,refs)=>{
      await select.selectOption(period?{label:period}:{index:0}); await settled(p);
      assert.equal(await card.locator(".kpi").innerText(),callout);
      assert.deepEqual(await referenceValues(card),refs);
      const fit=await checkCallout(card);
      const clips=await card.locator(".card-references").evaluate(dl=>{
        const body=dl.closest(".vbody").getBoundingClientRect();
        return [...dl.querySelectorAll("dt, dd")].some(el=>{const b=el.getBoundingClientRect();return b.right>body.right+1||b.bottom>body.bottom+1;});
      });
      assert.equal(clips,false);
      proof.push({period:period||"All",callout,refs,fontSize:fit.fontSize});
    };
    if(isBudget) {
      const ledger=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
      for(const [period,{departments}] of Object.entries(ledger)) {
        const posted=departments.filter(row=>row[1]!=null);
        await check(period,money.format(posted.reduce((s,row)=>s+row[3],0)),[["Departments posted",String(posted.length)]]);
        if(period==="2026-02") await capture(p,"budget-card-reference");
      }
    } else {
      await check("2026-03-01","$143.00",[["Orders","11"],["Per order","$13.00"]]);
      await capture(p,"gallery-card-reference");
      await check("","$390.00",[["Orders","30"],["Per order","$13.00"]]);
      await art(p,"Selected revenue compared with Online").getByRole("button",{name:"Clear selection"}).click(); await settled(p);
      await check("2026-03-01","$732.00",[["Orders","55"],["Per order","$13.31"]]);
    }
    await writeFile(`portfolio-evidence/${isBudget?"budget":"gallery"}-card-reference.json`,JSON.stringify(proof,null,2)+"\n");
  });
}
