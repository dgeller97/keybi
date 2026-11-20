import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,rename,settled,studio,visual,save,open} from "./portfolio-ui.mjs";
import {formula,editFormula} from "./formula-check.mjs";
const source="Site,Line,Qty,Rate\nEast,A,2,10\nEast,A,2,10\nEast,B,3,7\nWest,C,-1,8\nWest,D,0,99\nWest,E,4,\nNorth,F,,5\n";
const expression="SUMX('Lines', 'Lines'[Qty] * 'Lines'[Rate])",title="Line billing audit",ledger="Billing by site";
async function submit(p,name,expr){await p.locator(".ribbon [data-action=measure]").click();await p.locator("dialog [data-action=formula]").click();
  await p.getByLabel("Measure name").fill(name);await p.getByLabel("DAX expression").fill(expr);await p.getByRole("button",{name:"Save measure"}).click();}
export async function verifyRowExpression(){
  const baseline=process.env.FOLIO_ROW_BASELINE==="1";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"What was billed on the physical lines in each site?");
    const wait=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await wait).setFiles({name:"Lines.csv",mimeType:"text/csv",buffer:Buffer.from(source)});await p.getByTitle("Lines.Rate",{exact:true}).waitFor();
    if(baseline){
      await submit(p,"Billed",expression);const alert=p.getByRole("dialog").getByRole("alert");await alert.waitFor();assert.match(await alert.innerText(),/character|VALUES|function/i);
      await writeFile("portfolio-evidence/row-expression-before.json",JSON.stringify({formula:expression,error:await alert.innerText()},null,2));return;
    }
    await formula(p,"Billed",expression,"currency");
    await formula(p,"Adjusted","[Billed] * (1 + 0.1) + 3","currency");
    await formula(p,"Negative","-([Billed] + 1)","currency");
    await formula(p,"Product of sums","SUM('Lines'[Qty]) * SUM('Lines'[Rate])","currency");
    await formula(p,"Row fee","SUMX('Lines', ('Lines'[Qty] + 1) * 'Lines'[Rate])","currency");
    await formula(p,"Whole ledger","CALCULATE([Billed], REMOVEFILTERS('Lines'[Site]))","currency");
    await formula(p,"Both missing","BLANK() + BLANK()");
    await formula(p,"Multiplying blank","BLANK() * 0");
    await visual(p,"matrix",ledger,["Lines · Site"],["Billed","Adjusted","Negative","Product of sums","Row fee","Whole ledger","Both missing","Multiplying blank"],[12,136,976,390]);
    await visual(p,"dropdown","Site filter",["Lines · Site"],[],[12,12,435,105]);
    await save(p);
  });
  if(baseline)return;
  const expected=[
    ["East","$61.00","$70.10","-$62.00","$189.00","$88.00","$53.00","—","—"],
    ["North","—","$3.00","-$1.00","—","$5.00","$53.00","—","—"],
    ["West","-$8.00","-$5.80","$7.00","$321.00","$99.00","$53.00","—","—"],
    ["Grand total","$53.00","$61.30","-$54.00","$1,390.00","$192.00","$53.00","—","—"]
  ];
  await studio(async p=>{
    await open(p,title);const table=art(p,ledger),read=()=>table.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
    assert.deepEqual(await read(),expected);
    await art(p,"Site filter").locator("select").selectOption({label:"East"});await settled(p);
    assert.equal((await read()).at(-1)[1],"$61.00");assert.equal((await read()).at(-1)[6],"$53.00");
    await editFormula(p,"Billed");await p.getByLabel("DAX expression").fill("SUMX('Lines', 'Lines'[Qty] * ('Lines'[Rate] + 2))");
    await p.getByRole("button",{name:"Save measure",exact:true}).click();await p.locator("dialog").waitFor({state:"hidden"});await p.locator(".rail [data-action=report]").click();await settled(p);
    assert.equal((await read()).at(-1)[1],"$75.00");assert.equal((await read()).at(-1)[2],"$85.50");
    await writeFile("portfolio-evidence/row-expression.json",JSON.stringify({expression,expected,editedEast:75,dependentEast:85.5},null,2));
  });
}

