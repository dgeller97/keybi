import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,settled,studio} from "./portfolio-ui.mjs";
import {sweep} from "./canvas-rectangle.mjs";

await studio(async p=>{
  await open(p,"Budget vs. Actual");
  await p.locator("#pages").getByRole("button",{name:"Purchase authorizations",exact:true}).click();await settled(p);
  const plot=art(p,"Authorized amount by department");
  await plot.locator('[data-selection-key=\'["Facilities"]\']').press("Enter");await settled(p);
  const titles=["Authorized amount","Purchase line count","Average line amount"];
  const amounts=()=>Promise.all(titles.map(t=>art(p,t).locator(".kpi").innerText()));
  const expected=["$112.25","3","$37.42"];assert.deepEqual(await amounts(),expected);
  let queries=0;p.on("request",r=>{if(new URL(r.url()).pathname==="/api/query")queries++;});
  await sweep(p,2,2,976,135,{during:()=>capture(p,"budget-select-card-row")});
  assert.deepEqual(await p.locator("#paper .visual.selected .vhead strong").allTextContents(),titles);
  const result=await amounts();assert.deepEqual(result,expected);assert.equal(queries,0);
  await writeFile("portfolio-evidence/budget-card-layout.json",JSON.stringify({enclosed:titles,selectedDepartment:"Facilities",values:result,queries},null,2));
});
