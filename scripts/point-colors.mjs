import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const sales=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
const revenue=name=>sales.filter(r=>r[1]===name).reduce((n,r)=>n+Number(r[4]),0);
const budget=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
for(const [report,page,title,point,color,file] of [
  ["Visual Gallery","Compare groupings","Dispatch by selected group","East","#243f76","gallery-east-revenue"],
  ["Budget vs. Actual","Forecast review","Actual and forecast by department","Surgery › Forecast","#773e82","budget-surgery-forecast"],
]) {
  const gallery=report==="Visual Gallery",bookmark="East dispatch revenue",marks=p=>art(p,title).locator("[data-point]");
  const status=p=>marks(p).evaluateAll(es=>es.map(e=>({category:JSON.parse(e.dataset.selectionKey)[0],measure:Number(e.dataset.metric),
    value:Number(e.dataset.value),fill:e.querySelector("rect,circle").getAttribute("fill"),text:e.querySelector("text")?.getAttribute("fill")})));
  const enter=async p=>{await art(p,title).locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();};
  const read=async(p,period="2026-04")=>{
    const points=await status(p);
    const selected=points.filter(m=>m.fill===color); assert.equal(selected.length,1);
    assert.equal(selected[0].category,gallery?"East":"Surgery");
    assert.equal(selected[0].value,gallery?revenue("East"):budget[period].departments.find(r=>r[0]==="Surgery")[2]);
    if(gallery) {
      assert.equal(points.find(m=>m.category==="West").value,revenue("West"));
      assert.equal(selected[0].text,"#fff");
    }
    return points;
  };
  await studio(async p=>{
    await open(p,report); const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    if(gallery) {await art(p,"Measures to compare").getByLabel("Dispatch orders",{exact:true}).uncheck(); await settled(p);}
    await enter(p); await p.getByLabel("Data point",{exact:true}).selectOption({label:point});
    let queries=0; p.on("request",r=>{if(r.url().endsWith("/api/query")) queries++;});
    await p.getByLabel("Point color",{exact:true}).fill(color);
    const points=await read(p);assert.equal(queries,0);
    await capture(p,file);
    await writeFile("portfolio-evidence/"+file+".json",JSON.stringify({report,page,title,point,points,queries},null,2)+"\n");
    if(gallery) {
      await p.locator(".ribbon [data-action=bookmarks]").click();
      const existing=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
      if(await existing.count()) await existing.locator("..").locator("[data-bookmark-update]").click();
      else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
      await art(p,"Measures to compare").getByLabel("Dispatch orders",{exact:true}).check(); await settled(p);
    }
    await p.locator('[data-page="'+original+'"]').click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    if(gallery) {await p.locator(".ribbon [data-action=bookmarks]").click();await p.getByRole("button",{name:bookmark,exact:true}).click();}
    else await p.getByRole("button",{name:page,exact:true}).click();
    await settled(p); await read(p); await enter(p);
    if(!gallery) {
      await art(p,"Forecast period").locator("select").selectOption({label:"2026-02"}); await settled(p); await read(p,"2026-02");
    }
    await p.getByLabel("Data point",{exact:true}).selectOption({label:point}); await p.getByRole("button",{name:"Reset point color"}).click();
    assert.ok((await status(p)).every(m=>m.fill!==color));
  });
  console.log("Verified",report,point,color);
}
