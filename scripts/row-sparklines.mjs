import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {create,studio,art,visual,measure,save,open,settled} from "./portfolio-ui.mjs";

const title="Regional dispatch trends", ledger="Regional results", byChannel="Dispatch channel";
export async function configureSpark(p,{name,axis="Dispatch · Period",source="Dispatch · Revenue",format="currency",type="line",markers="last",aggregation="sum",existing}){
  await p.locator('[data-tab="Build"]').click();
  await p.getByRole("button",{name:existing?"Edit "+existing:"Add sparkline",exact:true}).click();
  const d=p.getByRole("dialog");
  await d.getByLabel("Value source",{exact:true}).selectOption({label:source});
  const agg=d.getByLabel("Aggregation",{exact:true});if(await agg.isEnabled())await agg.selectOption(aggregation);
  await d.getByLabel("Trend axis",{exact:true}).selectOption({label:axis});
  await d.getByLabel("Column heading",{exact:true}).fill(name);
  await d.getByLabel("Value format",{exact:true}).selectOption(format);
  await d.getByLabel("Chart type",{exact:true}).selectOption(type);
  await d.getByLabel("Markers",{exact:true}).selectOption(markers);
  await d.getByRole("button",{name:"Apply sparkline",exact:true}).click();await d.waitFor({state:"hidden"});await settled(p);
}
export async function sparkValues(p,row,heading){
  const button=row.getByRole("button",{name:"Inspect "+heading,exact:true});await button.click();
  const d=p.getByRole("dialog");await d.getByRole("heading",{name:heading,exact:true}).waitFor();
  const values=await d.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
  await p.keyboard.press("Escape");return values;
}
const periods=["2026-01-01","2026-02-01","2026-03-01"];
const series=vals=>periods.map((v,i)=>[v,vals[i]]);
export async function verifySparklines(){
  const baseline=process.env.FOLIO_SPARK_BASELINE==="1";
  await studio(async p=>{
    await create(p,title,"Which region's revenue and attainment changed most?","gallery",["Dispatch"]);
    await measure(p,"Revenue attainment","Dispatch · Revenue","Dispatch · Target");
    await visual(p,"dropdown",byChannel,["Dispatch · Channel"],[],[18,16,450,130]);
    await visual(p,"table",ledger,["Dispatch · Region"],["Dispatch · Revenue","Revenue attainment"],[18,172,960,300]);
    const table=art(p,ledger);
    assert.deepEqual(await table.locator("tbody tr td:first-child").allTextContents(),["East","West"]);
    const displayed=await table.locator("tbody tr").allInnerTexts();
    await p.locator('[data-tab="Build"]').click();
    if(baseline){assert.equal(await p.getByRole("button",{name:"Add sparkline",exact:true}).count(),0);
      await writeFile("portfolio-evidence/sparklines-before.json",JSON.stringify({displayed,periodsVisible:0},null,2));return;}
    await configureSpark(p,{name:"Monthly revenue"});
    await configureSpark(p,{name:"Monthly attainment",source:"Revenue attainment",format:"auto",type:"columns",markers:"high"});
    assert.deepEqual(await sparkValues(p,table.locator("tbody tr").first(),"Monthly revenue"),series(["$216.00","$298.00","$349.00"]));
    assert.deepEqual(await sparkValues(p,table.locator("tbody tr").last(),"Monthly attainment"),series(["97.27%","96.79%","109.43%"]));
    await configureSpark(p,{existing:"Monthly revenue",name:"Average revenue",aggregation:"avg",type:"columns",markers:"all"});
    assert.deepEqual(await sparkValues(p,table.locator("tbody tr").last(),"Average revenue"),series(["$107.00","$135.50","$191.50"]));
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
    const select=art(p,byChannel).locator("select");await select.selectOption({label:"Retail"});await settled(p);
    assert.deepEqual(await sparkValues(p,table.locator("tbody tr").first(),"Monthly revenue"),series(["$120.00","$154.00","$180.00"]));
    await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,title);const table=art(p,ledger);
    assert.deepEqual(await sparkValues(p,table.locator("tbody tr").last(),"Monthly revenue"),series(["$130.00","$117.00","$143.00"]));
    await table.locator(".vhead").click();await p.locator('[data-tab="Build"]').click();await p.locator('[data-kind="matrix"]').click();
    await p.locator('[data-pick="columns"]').selectOption({label:"Dispatch · Channel"});await settled(p);
    await art(p,byChannel).locator("select").selectOption({label:"All"});await settled(p);
    const total=table.locator('tr[data-path="[]"]');
    assert.deepEqual(await sparkValues(p,total,"Total / Monthly attainment"),series(["100%","103.45%","109.25%"]));
    assert.deepEqual(await sparkValues(p,table.locator('tr[data-path=\'["East"]\']'),"Retail / Monthly revenue"),series(["$120.00","$154.00","$180.00"]));
    await save(p);await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    assert.deepEqual(await sparkValues(p,total,"Online / Monthly revenue"),series(["$180.00","$298.00","$409.00"]));
    await writeFile("portfolio-evidence/row-sparklines.json",JSON.stringify({periods,tableEast:[216,298,349],tableWest:[214,271,383],westAverage:[107,135.5,191.5],matrixOnline:[180,298,409],totalAttainment:["100%","103.45%","109.25%"],reopened:true},null,2));
  });
}

