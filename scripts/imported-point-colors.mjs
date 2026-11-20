import assert from "node:assert/strict";
import {addPage,art,measure,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

const chosen="#243f76";
async function colorPoint(p,label,color) {
  await p.getByLabel("Data point",{exact:true}).selectOption({label});
  await p.getByLabel("Point color",{exact:true}).fill(color);
}
export async function verifyImportedPointColors() {
  const report="Depot color review",title="Delivered loads";
  const plot=p=>art(p,title);
  const mark=(p,values)=>plot(p).locator(`[data-selection-key='${JSON.stringify(values)}']`);
  const fill=async(p,values)=>mark(p,values).locator("rect,circle,i").first().evaluate(e=>getComputedStyle(e)[e.tagName==="I"?"backgroundColor":"fill"]);
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,report,"Which depot needs attention?");
    const chooser=p.waitForEvent("filechooser"); await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Loads.csv",mimeType:"text/csv",buffer:Buffer.from("Depot,Route,Loads,Passed,Checked\nEast,A,8,2,10\nEast,B,3,0,0\nWest,A,5,4,4\nWest,B,14,2,6\n,A,0,0,3\n(Blank),B,2,1,2\nUnrated,A,9,0,0\n")});
    await p.getByTitle("Loads.Loads",{exact:true}).waitFor();
    await measure(p,"Pass rate","Loads · Passed","Loads · Checked");
    await visual(p,"card","Total loads",[],["Loads · Loads"],[18,18,430,110]);
    await visual(p,"clusteredBar",title,["Loads · Depot"],["Loads · Loads"],[18,140,880,400]);
    await colorPoint(p,"East",chosen);
    await colorPoint(p,"(Blank)","#ff6600"); await colorPoint(p,'"(Blank)"',"#0088ff");
    assert.equal(await fill(p,[null]),"rgb(255, 102, 0)");assert.equal(await fill(p,["(Blank)"]),"rgb(0, 136, 255)");
    for (const kind of ["bar","stackedBar","percentBar","clusteredColumn","stackedColumn","percentColumn","dot"]) {
      await p.locator("[data-tab=Build]").click(); await p.locator('[data-kind="'+kind+'"]').click(); await settled(p);
      assert.equal(await fill(p,["East"]),"rgb(36, 63, 118)",kind);
    }
    await mark(p,["East"]).click(); await settled(p);
    assert.equal(await art(p,"Total loads").locator(".kpi").innerText(),"11");
    await plot(p).getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
    assert.equal(await mark(p,["East"]).count(),0);
    await setInput(p,"#rank-limit",""); await settled(p); assert.equal(await fill(p,["East"]),"rgb(36, 63, 118)");
    await p.locator("[data-pick=legendFields]").selectOption({label:"Loads · Route"}); await settled(p);
    await p.locator("[data-tab=Format]").click(); await colorPoint(p,"East › A","#bb0033");
    assert.equal(await fill(p,["East","A"]),"rgb(187, 0, 51)");assert.notEqual(await fill(p,["West","A"]),"rgb(187, 0, 51)");
    await save(p);
  });
  await studio(async p=>{
    await open(p,report); assert.equal(await fill(p,["East","A"]),"rgb(187, 0, 51)");
    await plot(p).locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();
    await p.locator('[data-remove-field="legendFields:0"]').click(); await settled(p);
    assert.equal(await fill(p,["East"]),"rgb(36, 63, 118)");
    await p.locator("[data-tab=Format]").click(); await p.getByLabel("Data point",{exact:true}).selectOption({label:"East"});
    await p.getByRole("button",{name:"Reset point color"}).click();
    assert.equal(await fill(p,["East"]),await fill(p,["West"]));
    await p.locator("[data-tab=Build]").click(); await p.locator("[data-kind=combo]").click();
    await p.locator("[data-pick=other]").selectOption({label:"Loads · Loads"}); await settled(p);
    await p.locator("[data-tab=Format]").click(); await colorPoint(p,"East",chosen);
    assert.equal(await plot(p).locator('[data-metric="0"] rect[fill="#243f76"]').count(),1);
    assert.equal(await plot(p).locator('[data-metric="1"] circle[fill="#243f76"]').count(),0);
    await colorPoint(p,"Unrated","#225588");
    await p.getByLabel("Set fill color by value").check();
    await p.getByLabel("Base colors on").selectOption({label:"Pass rate"}); await settled(p);
    await setInput(p,"[data-cell-setting=threshold]",50);
    const columnFill=(key)=>mark(p,[key]).and(plot(p).locator('[data-metric="0"]')).locator("rect").getAttribute("fill");
    for(const [key,color] of [["East","#a63e31"],["West","#43856b"],[null,"#a63e31"],["(Blank)","#0088ff"],["Unrated","#225588"]])
      assert.equal(await columnFill(key),color);
    const column = key => mark(p,[key]).and(plot(p).locator('[data-metric="0"]'));
    assert.equal(await column("(Blank)").getAttribute("aria-description"),"Pass rate is 50%, equal to the 50% threshold. Individual point color applies.");
    assert.equal(await column("Unrated").getAttribute("aria-description"),"Pass rate is blank. Individual point color applies.");
    assert.equal(await column(null).getAttribute("aria-description"),"Pass rate is 0%, below the 50% threshold.");
    assert.equal(await plot(p).locator('[data-metric="1"][aria-description]').count(),0);
    await p.getByLabel("Fill style").selectOption("gradient");
    await setInput(p,"[data-cell-setting=scale-max]",100);
    await p.locator("[data-cell-setting=scale-color-min]").fill("#0000ff"); await p.locator("[data-cell-setting=scale-color-max]").fill("#ff0000");
    for(const [key,color] of [["East","#3300cc"],["West","#990066"],[null,"#0000ff"],["(Blank)","#800080"],["Unrated","#225588"]])
      assert.equal(await columnFill(key),color);
    await column("East").focus();
    await p.getByRole("tooltip").getByText("Pass rate is 20% on a color scale from 0% to 100%.",{exact:true}).waitFor();
    await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    const rect=values=>mark(p,values).and(plot(p).locator('[data-metric="0"]')).locator("rect");
    assert.equal(await rect(["East"]).getAttribute("fill"),"#3300cc");
    await plot(p).locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();
    await p.locator("[data-kind=clusteredColumn]").click(); await settled(p);
    await p.locator("[data-pick=legendFields]").selectOption({label:"Loads · Route"}); await settled(p);
    assert.equal(await rect(["East","A"]).getAttribute("fill"),"#3300cc");
    assert.equal(await rect(["East","B"]).getAttribute("fill"),await plot(p).locator('[data-series-color="B"]').getAttribute("data-color"));
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p);
    assert.deepEqual(await plot(p).locator("[data-axis-pick]").allTextContents(),["West"]);
    assert.equal(await rect(["West","A"]).getAttribute("fill"),"#ff0000");
    assert.equal(await rect(["West","B"]).getAttribute("fill"),"#5500aa");
    const firstPage=await p.locator(".page.active").getAttribute("data-page");
    await addPage(p,"Review policy");
    await visual(p,"table","Depots for review",["Loads · Depot"],["Pass rate"],[18,18,640,380]);
    await p.locator("[data-tab=Filters]").click(); await p.locator('[data-measure-filter="new"]').click();
    await p.getByLabel("Measure",{exact:true}).selectOption({label:"Pass rate"});
    await p.getByLabel("Condition").selectOption("lt"); await p.getByLabel("Threshold (%)").fill("70");
    await p.locator("dialog button[type=submit]").click(); await settled(p);
    await p.locator('[data-page="'+firstPage+'"]').click(); await settled(p);
    await plot(p).locator(".vhead strong").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Fill style").selectOption("rule");
    const source=p.getByLabel("Threshold source",{exact:true});
    await source.selectOption(await source.locator("option").filter({hasText:"Depots for review / Pass rate"}).getAttribute("value"));
    assert.equal(await rect(["West","A"]).getAttribute("fill"),"#43856b");
    assert.equal(await rect(["West","B"]).getAttribute("fill"),"#a63e31"); await save(p);
  });
  await studio(async p=>{
    await open(p,report); const firstPage=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:"Review policy",exact:true}).click(); await settled(p);
    await art(p,"Depots for review").locator("[data-view-filters]").click();
    await p.locator('[data-measure-filter="0"]').click();
    await p.getByLabel("Threshold (%)").fill("20");await p.locator("dialog button[type=submit]").click();await settled(p);
    await p.locator('[data-page="'+firstPage+'"]').click(); await settled(p);
    assert.equal(await mark(p,["West","B"]).locator("rect").getAttribute("fill"),"#43856b");
    await mark(p,["West","B"]).focus();
    await p.getByRole("tooltip").getByText("Pass rate is 33.33%, above the 20% threshold.",{exact:true}).waitFor();
    await p.keyboard.press("Escape");
    await plot(p).locator(".vhead strong").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Tooltip page",{exact:true}).selectOption("new"); await settled(p);
    const tab=p.locator(".page.active");
    await tab.dblclick();
    await p.getByLabel("Page name").fill("Depot detail tooltip");
    await p.getByLabel("Tooltip canvas size").selectOption("fixed");
    await p.getByLabel("Canvas width (px)").fill("320");
    await p.getByLabel("Canvas height (px)").fill("240");
    await p.locator("#dlgform button[type=submit]").click(); await settled(p);
    await visual(p,"card","Route loads",[],["Loads · Loads"]);
    await setInput(p,"[data-dim=w]",260); await setInput(p,"[data-dim=h]",120);
    await setInput(p,"[data-dim=x]",500); await setInput(p,"[data-dim=y]",500);
    assert.deepEqual(await art(p,"Route loads").evaluate(el=>[el.offsetLeft,el.offsetTop,el.offsetWidth,el.offsetHeight]),[60,120,260,120]);
    await setInput(p,"[data-dim=x]",20);await setInput(p,"[data-dim=y]",16);
    await p.locator('[data-page="'+firstPage+'"]').click(); await settled(p); await save(p);
  });
  await studio(async p=>{
    await open(p,report);await mark(p,["West","B"]).focus();
    const tip=p.getByRole("tooltip");
    await tip.getByText("Pass rate is 33.33%, above the 20% threshold.",{exact:true}).waitFor();
    await tip.locator(".tooltip-page-title").waitFor();
    assert.equal(await tip.locator(".tooltip-page-title").innerText(),"Depot detail tooltip");
    assert.equal(await tip.locator(".kpi").innerText(),"14");
    assert.deepEqual(await tip.locator(".tooltip-sheet").evaluate(el=>[el.offsetWidth,el.offsetHeight,el.firstElementChild.offsetLeft,el.firstElementChild.offsetTop]),[320,240,20,16]);
    await p.keyboard.press("Escape");
    await p.locator("#pages").getByRole("button",{name:"Review policy",exact:true}).click();await settled(p);
    await p.getByRole("button",{name:"Page settings for Review policy"}).press("Enter");
    await p.getByLabel("Hide page from navigators").check();await p.locator("#dlgform button[type=submit]").click();
    await settled(p);await addPage(p,"Depot navigation");
    await visual(p,"navigator","Report views",[],[],[18,18,700,140]);
    await visual(p,"navigator","All review pages",[],[],[18,200,700,140]);
    await p.getByLabel("Include hidden pages").check(); await p.getByLabel("Include tooltip pages").check();await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    const reportViews=art(p,"Report views"),allPages=art(p,"All review pages");
    for (const name of ["Review policy","Depot detail tooltip"]) {
      assert.equal(await reportViews.getByRole("button",{name,exact:true}).count(),0);
      assert.equal(await allPages.getByRole("button",{name,exact:true}).count(),1);
    }
    await allPages.getByRole("button",{name:"Review policy",exact:true}).press("Enter");await settled(p);
    assert.equal(await p.locator(".page.active").innerText(),"Review policy");
    await p.getByRole("button",{name:"Page settings for Review policy"}).click();
    await p.getByLabel("Page name").fill("Delivery policy");await p.getByLabel("Hide page from navigators").uncheck();
    await p.locator("#dlgform button[type=submit]").click();await settled(p);
    await p.locator("#pages").getByRole("button",{name:"Depot navigation",exact:true}).click();await settled(p);
    assert.equal(await reportViews.getByRole("button",{name:"Delivery policy",exact:true}).count(),1);
    assert.equal(await allPages.getByRole("button",{name:"Review policy",exact:true}).count(),0);
  });
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    await visual(p,"navigator","Page index",[],[]);
    const active=await p.locator(".page.active").innerText();
    await p.getByRole("button",{name:"Page settings for "+active,exact:true}).click();
    await p.getByLabel("Hide page from navigators").check();
    await p.getByLabel("Use as tooltip page").check();
    await p.locator("#dlgform button[type=submit]").click();await settled(p);
    const nav=art(p,"Page index");
    await nav.getByText("No pages match this navigator’s settings.",{exact:true}).waitFor();
    await p.getByLabel("Include hidden pages").check();
    assert.equal(await nav.locator("[data-page]").count(),0);
    await p.getByLabel("Include tooltip pages").check();
    assert.equal(await nav.getByRole("button",{name:active,exact:true}).count(),1);
  });
  console.log("Verified point fills, weighted-ratio thresholds and gradients, zero, blank, exact equality, ranking and reopen.");
}

export async function benchmarkPointColors(p,truth) {
  await addPage(p,"Color by category"); const title="Revenue by product category",plot=art(p,title);
  await visual(p,"clusteredBar",title,["Product · Category"],["Billed revenue"],[18,18,950,460]);
  let queries=0; const count=r=>{if(r.url().endsWith("/api/query")) queries++;}; p.on("request",count);
  const timings=[];
  const paint=()=>plot.evaluate(async el=>{
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    return {ms:performance.now()-window.fillStart,marks:[...el.querySelectorAll("[data-point]")].map(g=>[JSON.parse(g.dataset.selectionKey)[0],g.querySelector("rect").getAttribute("fill"),Math.round(Number(g.dataset.value)*100)])};
  });
  try {
    for(const [category,color] of [["A",chosen],["B","#ad4b1f"],["A","#cfeec9"]]) {
      await p.getByLabel("Data point",{exact:true}).selectOption({label:category});
      const input=p.getByLabel("Point color",{exact:true});
      await input.evaluate(e=>e.addEventListener("change",()=>{window.fillStart=performance.now();},{capture:true,once:true}));
      await input.fill(color);
      const {ms,marks}=await paint();
      assert.equal(marks.length,truth.map.size);
      assert.equal(marks.find(m=>m[0]===category)[1],color);
      for(const [key,,cents] of marks) assert.equal(cents,truth.map.get(key)[0]);
      timings.push({category,color,ms,queries,amount:truth.map.get(category)[0]/100});
    }
    assert.equal(queries,0);
    await p.getByLabel("Set fill color by value").check();
    const threshold=p.locator("[data-cell-setting=threshold]");
    await setInput(p,"[data-cell-setting=threshold]",22.5);
    const source=p.getByLabel("Base colors on");
    await source.evaluate(e=>e.addEventListener("change",()=>{window.fillStart=performance.now();},{capture:true,once:true}));
    await source.selectOption({label:"Margin"}); await settled(p);
    // The threshold was entered in currency units. Set it in percentage
    // units once the source changes, and then exercise cached threshold edits.
    const initial=await paint(); assert.equal(queries,1);
    for(const [key,fill,cents] of initial.marks) {
      assert.equal(fill,"#a63e31");assert.equal(cents,truth.map.get(key)[0]);
    }
    timings.push({source:"Margin",ms:initial.ms,queries});
    for (const limit of [22.49,22.51,22.49]) {
      await threshold.evaluate(e=>e.addEventListener("change",()=>{window.fillStart=performance.now();},{capture:true,once:true}));
      await setInput(p,"[data-cell-setting=threshold]",limit);const {ms,marks}=await paint();
      const below=[];
      for(const [key,fill,cents] of marks) {
        const [revenue,profit]=truth.map.get(key);assert.equal(cents,revenue);
        if(profit/revenue<limit/100) below.push(key);
        assert.equal(fill,profit/revenue<limit/100?"#a63e31":"#43856b");
      }
      timings.push({threshold:limit,ms,below,additionalQueries:queries-1});
    }
    assert.equal(queries,1);
    const picker=p.getByLabel("Threshold source",{exact:true});
    const link=picker.locator("option").filter({hasText:"Margin thresholds / Revenue by category / Margin"});
    await picker.evaluate(e=>e.addEventListener("change",()=>{window.fillStart=performance.now();},{capture:true,once:true}));
    await picker.selectOption(await link.getAttribute("value"));
    const linked=await paint(),ordered=[...truth.map].sort((a,b)=>a[1][1]/a[1][0]-b[1][1]/b[1][0]);
    const expected=ordered.slice(0,9).map(([cat])=>cat).sort();
    assert.deepEqual(linked.marks.filter(([,fill])=>fill==="#a63e31").map(([cat])=>cat).sort(),expected);
    assert.equal(queries,1);
    timings.push({source:"Margin thresholds / Revenue by category",ms:linked.ms,below:expected,additionalQueries:queries-1});
    for (const index of [0,11,0]) {
      const [category,[revenue,profit]] = ordered[index];
      const point = plot.locator(`[data-selection-key='${JSON.stringify([category])}']`);
      const rate = new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2}).format(profit/revenue);
      const reason = await point.getAttribute("aria-description");
      assert.ok(reason.startsWith("Margin is "+rate+", "+(index===11?"above":"below")+" the "),reason);
      await point.evaluate(el=>el.addEventListener("focus",()=>{window.fillStart=performance.now();},{once:true}));
      await point.focus();
      await p.getByRole("tooltip").getByText(reason,{exact:true}).waitFor();
      const {ms} = await paint();
      assert.equal(queries,1);
      timings.push({focus:category,reason,ms,additionalQueries:queries-1});
    }
    await p.keyboard.press("Escape");
    const sourcePage=await p.locator(".page.active").getAttribute("data-page");
    await p.getByLabel("Tooltip page",{exact:true}).selectOption("new");await settled(p);
    await p.locator(".page.active").dblclick();
    await p.getByLabel("Page name").fill("Category detail tooltip");
    await p.getByLabel("Tooltip canvas size").selectOption("fixed");
    await p.getByLabel("Canvas width (px)").fill("320"); await p.getByLabel("Canvas height (px)").fill("240");
    await p.locator("#dlgform button[type=submit]").click();await settled(p);
    await visual(p,"card","Category revenue",[],["Billed revenue"]);
    await setInput(p,"[data-dim=w]",280);await setInput(p,"[data-dim=h]",160);
    await setInput(p,"[data-dim=x]",20);await setInput(p,"[data-dim=y]",30);
    await p.locator('[data-page="'+sourcePage+'"]').click();await settled(p);
    const before=queries;
    for (const [i,category] of ["A","B","A"].entries()) {
      const point=plot.locator(`[data-selection-key='${JSON.stringify([category])}']`);
      const expected=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(truth.map.get(category)[0]/100);
      const elapsed=await point.evaluate(async(el,value)=>{
        const start=performance.now();
        el.focus();
        for (let i=0;i<300;i++) {
          await new Promise(requestAnimationFrame);
          const tip=document.querySelector("#chart-tooltip:not([hidden])");
          if (tip?.querySelector("strong")?.textContent===el.getAttribute("aria-label") && tip.querySelector(".kpi")?.textContent===value) {
            await new Promise(requestAnimationFrame);
            return performance.now()-start;
          }
        }
        throw Error("Category tooltip did not display the expected revenue");
      },expected);
      const sheet=p.getByRole("tooltip").locator(".tooltip-sheet");
      assert.deepEqual(await sheet.evaluate(el=>[el.offsetWidth,el.offsetHeight,el.firstElementChild.offsetLeft,el.firstElementChild.offsetTop]),[320,240,20,30]);
      assert.equal(queries-before,Math.min(i+1,2));
      timings.push({preview:category,canvas:[320,240],amount:expected,ms:elapsed,queries:queries-before});
    }
  } finally {p.off("request",count);}
  return timings;
}
