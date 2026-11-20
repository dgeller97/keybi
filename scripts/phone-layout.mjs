import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";

const names = ["Encounter count","Median wait (minutes)","Encounters by site","Status by site"];
const pageName = "Encounter workload";
const tab = p=>p.locator("#pages").getByRole("button",{name:pageName,exact:true});
let link;
await studio(async p=>{
  await open(p,"Hospital Operations");
  const original = await p.locator("#pages .active").getAttribute("data-page");
  await tab(p).click();await settled(p);
  link = (await currentPageLink(p)).replace("/page/","/read/page/");
  await p.getByRole("button",{name:"Page settings for "+pageName}).click();
  const dlg = p.getByRole("dialog");
  await dlg.getByLabel("Use a phone layout").check();
  if ((await dlg.locator("#phone-order li span").allTextContents())[1] !== names[1])
    await dlg.getByLabel("Move Median wait (minutes) up").click();
  assert.deepEqual(await dlg.locator("#phone-order li span").allTextContents(),names);
  for (const [i,h] of [96,100,256,300].entries()) {
    await dlg.getByLabel(names[i]+" height in pixels").fill(String(h));
    await dlg.getByLabel(names[i]+" phone width").selectOption(i<2 ? "half" : "full");
  }
  await dlg.getByRole("button",{name:"Save",exact:true}).click();
  await dlg.waitFor({state:"hidden"});
  await p.locator('[data-page="'+original+'"]').click();await save(p);
});
await studio(async p=>{
  await p.setViewportSize({width:390,height:700});
  await p.goto(link);
  const chart=art(p,names[2]),card=art(p,names[0]),median=art(p,names[1]),picker=p.getByLabel("Page layout",{exact:true});
  await chart.waitFor();await settled(p);
  const activeTab=p.locator('#pages [aria-current="page"]');
  const tabBounds=await activeTab.boundingBox();
  assert.ok(tabBounds.x>=-1 && tabBounds.x+tabBounds.width<=391);
  await activeTab.press("Home");
  assert.equal(await p.locator(":focus").textContent(),"Site performance");
  await p.keyboard.press("End");assert.equal(await p.locator(":focus").textContent(),pageName);
  await p.keyboard.press("ArrowLeft");await p.keyboard.press("Enter");await settled(p);
  assert.equal(await p.locator("#pages :focus").textContent(),"Attainment exceptions");
  await p.keyboard.press("ArrowRight");await p.keyboard.press("Enter");await settled(p);
  assert.equal(await activeTab.textContent(),pageName);
  const order=()=>p.locator("#paper .visual .vhead strong").allTextContents();
  assert.deepEqual(await order(),names);
  const geometry=()=>chart.evaluate(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,label:el.querySelector("svg text").getBoundingClientRect().height}));
  const phone=await geometry();
  assert.ok(phone.width>340 && phone.label>=12);assert.equal(phone.height,256);
  assert.equal(await card.locator(".kpi").innerText(),"25");
  const savedReport=async()=> (await p.request.get(new URL("/api/reports/"+link.split("#")[1].split("/")[0],link).href)).json();
  const original=await savedReport();
  let queries=0;p.on("request",r=>{if (r.method()==="POST" && r.url().endsWith("/api/query")) queries++;});
  await picker.selectOption("desktop");
  const desktop=await geometry();assert.ok(desktop.width<200);
  await picker.selectOption("auto");assert.deepEqual(await geometry(),phone);
  await p.setViewportSize({width:1000,height:800});
  await p.waitForFunction(()=>!document.querySelector(".phone-page"));
  await picker.selectOption("phone");assert.deepEqual(await order(),names);
  const pairs=[];
  for (const width of [320,390]) {
    await p.setViewportSize({width,height:700});
    await p.waitForFunction(w=>Math.abs(document.querySelectorAll("#paper .visual")[2].getBoundingClientRect().width-w)<1,phone.width-(390-width));
    const [count,wait,plot,frame]=await Promise.all([card.boundingBox(),median.boundingBox(),chart.boundingBox(),p.locator("#viewport").boundingBox()]);
    assert.equal(count.y,wait.y);assert.equal(count.width,wait.width);
    assert.equal(wait.x-count.x-count.width,8);assert.equal(plot.y-wait.y-wait.height,8);
    assert.equal(plot.width,count.width+8+wait.width);
    assert.ok(plot.y+plot.height<=frame.y+frame.height);
    for(const el of [card,median]) {
      const label=await el.locator(".vhead strong").evaluate(e=>({w:e.offsetWidth,h:e.offsetHeight,sw:e.scrollWidth,sh:e.scrollHeight}));
      assert.ok(label.w>=label.sw && label.h>=label.sh,JSON.stringify(label));
    }
    assert.equal(await median.locator(".kpi").innerText(),"41");
    pairs.push({width,count,wait,plot,fullyVisibleCards:2});
    await capture(p,"hospital-paired-"+width);
  }
  assert.equal(queries,0);
  await capture(p,"hospital-phone-layout");
  await p.locator("[data-action=reader-filters]").click();
  await p.getByLabel("Status",{exact:true}).selectOption({label:"Closed"});
  await p.getByRole("button",{name:"Apply"}).click();await settled(p);
  assert.equal(await card.locator(".kpi").innerText(),"149");
  assert.equal(await median.locator(".kpi").innerText(),"42");
  const harbor = chart.locator('.plot-mark[aria-label*="Harbor"]');
  const expected = Number(await harbor.getAttribute("data-value"));
  await harbor.click();await settled(p);
  assert.equal(await card.locator(".kpi").innerText(),String(expected));
  const ledger=art(p,names[3]);
  await ledger.scrollIntoViewIfNeeded();const scroll=()=>p.locator("#viewport").evaluate(el=>el.scrollTop);
  const pos=await scroll();assert.ok(pos>100);
  await ledger.getByLabel("Focus mode").click();await ledger.getByRole("button",{name:"Back to report"}).click();
  assert.ok(Math.abs(await scroll()-pos)<2);
  assert.equal(await card.locator(".kpi").innerText(),String(expected));
  await ledger.getByLabel("Focus mode").click();
  const context=p.getByRole("group",{name:"Selections on other visuals"});
  await context.getByRole("button",{name:/Clear .*Harbor.* from Encounters by site/}).click();await settled(p);
  await ledger.getByRole("button",{name:"Back to report"}).click();
  assert.equal(await card.locator(".kpi").innerText(),"149");
  assert.deepEqual(await savedReport(),original);
  const result={link,phone,pairs,desktopAt390:desktop,order:names,layoutQueries:0,openVisits:25,closedVisits:149,closedHarbor:expected,restoredScroll:pos,currentTab:tabBounds};
  await writeFile("portfolio-evidence/phone-layout.json",JSON.stringify(result,null,2)+"\n");
  console.log(result);
});
