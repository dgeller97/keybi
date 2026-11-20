import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const findings = [];
for (const test of [
  {report:"Visual Gallery",page:"Comparisons",source:"Regional revenue by channel",target:"Channel detail tooltip",match:"Region East, Channel Retail",values:["$454.00","41"],width:520,height:380},
  {report:"Hospital Operations",page:"Site volumes",source:"Monthly encounter volume by site",target:"Site and month detail",match:"2026-03, Site Harbor",values:["13","53.85%"],width:550,height:405},
]) {
  const {report,page,source,target,match,values,width,height} = test;
  await studio(async p=>{
    await open(p,report);
    const original = await p.locator(".page.active").getAttribute("data-page");
    const tab = p.getByRole("button",{name:target,exact:true});
    await tab.click(); await settled(p);
    await p.getByRole("button",{name:"Page settings for "+target,exact:true}).press("Enter");
    await p.getByLabel("Tooltip canvas size").selectOption("fixed");
    await p.getByLabel("Canvas width (px)").fill("300");
    await p.getByLabel("Canvas height (px)").fill(String(height));
    await p.locator("#dlgform button[type=submit]").click();
    await p.getByRole("alert").filter({hasText:"The visuals need at least"}).waitFor();
    await p.getByLabel("Canvas width (px)").fill(String(width));
    await p.locator("#dlgform button[type=submit]").click(); await settled(p);
    assert.deepEqual(await p.locator("#paper").evaluate(s=>[s.offsetWidth,s.offsetHeight]),[width,height]);
    await p.locator('[data-page="'+original+'"]').click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    const point = art(p,source).locator('.plot-mark[aria-label*="'+match+'"]');
    for (const viewport of [{width:1680,height:980},{width:760,height:640},{width:390,height:580}]) {
      await p.setViewportSize(viewport);
      await point.focus();
      const tip=p.getByRole("tooltip");
      await tip.locator(".tooltip-page-title").waitFor();
      const box=await tip.locator(".tooltip-sheet").evaluate(s=>({
        width:s.offsetWidth,height:s.offsetHeight,x:s.firstElementChild.offsetLeft,y:s.firstElementChild.offsetTop,
      }));
      assert.deepEqual(box,{width,height,x:18,y:18});
      assert.deepEqual(await tip.locator(".kpi").allTextContents(),values);
      const rect=await tip.boundingBox();
      assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.width<=viewport.width && rect.y+rect.height<=viewport.height);
      findings.push({report,viewport,canvas:box,values,displayedWidth:rect.width,displayedHeight:rect.height});
      if (viewport.width===1680) await capture(p,report.startsWith("Visual")?"gallery-sized-tooltip":"hospital-sized-tooltip");
      await p.keyboard.press("Escape"); await tip.waitFor({state:"hidden"});
      await point.evaluate(el=>el.blur());
    }
    await p.setViewportSize({width:1680,height:980});
    const tab=p.getByRole("button",{name:target,exact:true}); await tab.click(); await settled(p); await tab.dblclick();
    await p.getByLabel("Tooltip canvas size").selectOption("auto");await p.locator("#dlgform button[type=submit]").click();await settled(p);
    assert.equal(await p.locator("#paper").evaluate(s=>s.offsetWidth),1000);
    await p.getByRole("button",{name:page,exact:true}).click();await settled(p);await point.focus();
    const sheet=p.getByRole("tooltip").locator(".tooltip-sheet");await sheet.waitFor();
    assert.deepEqual(await sheet.evaluate(s=>[s.firstElementChild.offsetLeft,s.firstElementChild.offsetTop]),[0,0]);
  });
}
await writeFile("portfolio-evidence/tooltip-canvas-sizes.json",JSON.stringify(findings,null,2)+"\n");
console.log(findings);
