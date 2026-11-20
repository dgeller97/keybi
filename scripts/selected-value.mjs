import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,rename,settled,studio,visual,save,open} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const name="Selection context",scope="Scope caption",unit="Selected rate",test="Rows with one route";
const expr='SELECTEDVALUE(Dispatch[Route], "Several or no routes")';
export async function verifySelectedValues(){
  const baseline=process.env.FOLIO_SELECTED_BASELINE==="1";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which route and rate does the current context represent?");
    const wait=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await wait).setFiles({name:"Dispatch.csv",mimeType:"text/csv",buffer:Buffer.from("Batch,Route,Rate,Units\nB1,East,0,2\nB1,East,0,3\nB2,West,8,1\nB3,,,4\nB4,East,9,1\nB4,,,1\nB5,O'Brien,2,1\n")});await p.getByTitle("Dispatch.Rate",{exact:true}).waitFor();
    if(baseline){
      await p.locator(".ribbon [data-action=measure]").click();await p.locator("dialog [data-action=formula]").click();await p.getByLabel("Measure name").fill(scope);await p.getByLabel("DAX expression").fill(expr);
      await p.getByRole("button",{name:"Save measure"}).click();const error=await p.getByRole("dialog").getByRole("alert").innerText();assert.match(error,/supported aggregate/);
      await writeFile("portfolio-evidence/selected-value-before.json",JSON.stringify({expression:expr,error},null,2));return;
    }
    await formula(p,"Route in view",expr);
    await formula(p,scope,'"Route · " & [Route in view]');
    await formula(p,unit,"SELECTEDVALUE(Dispatch[Rate], -1)");
    await formula(p,test,"IF(HASONEVALUE(Dispatch[Route]), SUM(Dispatch[Units]), BLANK())");
    await formula(p,"Fallback amount","SELECTEDVALUE(Dispatch[Rate], SUM(Dispatch[Units]) + 20)");
    await formula(p,"Route when unique",'IF(HASONEVALUE(Dispatch[Route]), SELECTEDVALUE(Dispatch[Route]))');
    await visual(p,"dropdown","Batch to inspect",["Dispatch · Batch"],[],[14,12,475,113]);
    await visual(p,"card",scope,[],[scope],[14,140,965,114]);
    await visual(p,"matrix","Context by batch",["Dispatch · Batch"],["Route in view",unit,test,"Fallback amount"],[14,272,965,280]);
    await visual(p,"card","Units in context",[],["Dispatch · Units"],[508,12,471,113]);
    await p.locator("[data-tab=Format]").click();
    const source=p.getByLabel("Title source",{exact:true});
    await source.selectOption({label:"Route when unique"});await settled(p);
    assert.equal(await art(p,"Units in context").locator(".kpi").innerText(),"13");
    await source.selectOption({label:"Fallback amount"});await settled(p);
    assert.equal(await art(p,"33").locator(".kpi").innerText(),"13");
    await source.selectOption({label:"Entered title"});await settled(p);
    assert.equal(await art(p,"Units in context").locator(".kpi").innerText(),"13");
    await source.selectOption({label:"Route when unique"});await settled(p);
    await save(p);
  });
  if(baseline)return;
  const expected=[["B1","East","0","5","0"],["B2","West","8","1","8"],["B3","—","—","4","—"],["B4","Several or no routes","-1","—","22"],["B5","O'Brien","2","1","2"],["Grand total","Several or no routes","-1","—","33"]];
  await studio(async p=>{
    await open(p,name);const card=art(p,scope).locator(".kpi"),matrix=art(p,"Context by batch");
    assert.deepEqual(await matrix.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent))),expected);
    assert.equal(await card.innerText(),"Route · Several or no routes");
    const select=art(p,"Batch to inspect").locator("select");await select.selectOption({label:"B1"});await settled(p);assert.equal(await card.innerText(),"Route · East");
    assert.equal(await art(p,"East").locator(".kpi").innerText(),"5");
    await select.selectOption({label:"B5"});await settled(p);assert.equal(await card.innerText(),"Route · O'Brien");
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);await select.selectOption({label:"B3"});await settled(p);assert.equal((await card.innerText()).trim(),"Route ·");
    assert.equal(await art(p,"Units in context").locator(".kpi").innerText(),"4");
    await select.selectOption({label:"B5"});await settled(p);
    assert.equal(await art(p,"O'Brien").locator(".kpi").innerText(),"1");
    await writeFile("portfolio-evidence/selected-value.json",JSON.stringify({expected,single:"Route · East",quoted:"Route · O'Brien",blank:"Route ·",several:"Route · Several or no routes",reopened:true},null,2));
  });
}

