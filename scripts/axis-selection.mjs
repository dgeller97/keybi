import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,setInput,settled,studio} from "./portfolio-ui.mjs";

async function csv(name) {
  const [header,...rows]=(await readFile("web/datasets/"+name+".csv","utf8")).trim().split(/\r?\n/);
  const fields=header.split(",");
  return rows.map(row=>Object.fromEntries(row.split(",").map((v,i)=>[fields[i],v])));
}
const dispatch=await csv("gallery/Dispatch"),calendar=new Map((await csv("hospital/Calendar")).map(r=>[r.CalendarKey,r.Month]));
const encounters=(await csv("hospital/Encounter")).filter(r=>r.Status==="Closed" && r.Cohort==="Routine").map(r=>({...r,Month:calendar.get(r.CalendarKey)}));
for (const sample of [
  ["Visual Gallery","Comparisons","Regional revenue by channel","Revenue in selection","West across channels",dispatch,"Region","Revenue","West","East","gallery-west-axis"],
  ["Hospital Operations","Site volumes","Monthly encounter volume by site","Closed routine encounters","March across sites",encounters,"Month","Visits","2026-03","2026-04","hospital-month-axis"]
]) {
  const [report,page,source,card,bookmark,rows,field,measure,first,second,file]=sample;
  const chart=p=>art(p,source),button=(p,value)=>chart(p).getByRole("button",{name:field+" = "+value,exact:true});
  const proof=[];
  async function check(p,values,step) {
    const matching=rows.filter(r=>!values.length || values.includes(r[field]));
    const sum=matching.reduce((n,r)=>n+Number(r[measure]),0);
    const amount=report==="Visual Gallery"?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(sum):String(sum);
    assert.equal(await art(p,card).locator(".kpi").innerText(),amount,step);
    const pressed=await chart(p).locator("[data-axis-pick][aria-pressed=true]").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0]).sort());
    assert.deepEqual(pressed,values.slice().sort(),step);
    const marks=await chart(p).locator("[data-selection-key]").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey),e.getAttribute("aria-pressed")==="true"]));
    for(const [tuple,selected] of marks) assert.equal(selected,values.includes(tuple[0]),step);
    proof.push({step,values,sum,records:matching.length,visibleMarks:marks.length});
  }
  await studio(async p=>{
    await open(p,report); const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    await button(p,first).click(); await settled(p); await check(p,[first],"Select axis label");
    await p.locator(".ribbon [data-action=bookmarks]").click();
    const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
    if(await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
    else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
    await chart(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p); await check(p,[first],"Reopen bookmark");
    await capture(p,file);
    if(report==="Visual Gallery") {
      const highlighted=await art(p,"Channel contribution").locator(".highlight-value").evaluateAll(es=>es.map(el=>[
        JSON.parse(el.closest("[data-selection-key]").dataset.selectionKey),Number(el.dataset.end)-Number(el.dataset.start)]));
      assert.deepEqual(highlighted,[[["West","Online"],478],[["West","Retail"],390]]);
      await chart(p).getByRole("button",{name:"View records"}).click(); await settled(p);
      const ledger=await art(p,"Dispatch ledger").locator("tbody tr").evaluateAll(es=>es.map(tr=>[...tr.cells].map(td=>td.textContent)));
      assert.deepEqual(ledger,dispatch.filter(r=>r.Region==="West").map(Object.values).sort());
      await p.locator("[data-action=drill-back]").click(); await settled(p);
      await chart(p).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
      for(const kind of ["stackedColumn","dot","line","area","stackedArea","percentArea","clusteredBar"]) {
        await p.locator(`[data-kind="${kind}"]`).click(); await settled(p); await check(p,[first],kind);
      }
    }
    await button(p,second).press("Control+Enter"); await settled(p); await check(p,[first,second],"Add a second label");
    assert.equal(await p.evaluate(()=>document.activeElement.dataset.axisPick),JSON.stringify([second]));
    await button(p,first).press("Control+Space"); await settled(p); await check(p,[second],"Remove the first label");
    if(report==="Visual Gallery") {
      await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
      await check(p,[],"Remove East when only West qualifies");
    }
  });
  await writeFile("portfolio-evidence/"+file+".json",JSON.stringify({bookmark,proof},null,2)+"\n");
  console.log(bookmark,proof[0]);
}
