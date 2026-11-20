import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,filter,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {verifyBinTotals} from "./imported-bins.mjs";

export async function verifyTimeBins() {
  const name="Chronometer readings",chart="Quarter-second load",card="Total load";
  const key=ms=>new Date(ms).toISOString();
  const selector=ms=>"[data-selection-key='"+JSON.stringify([ms==null ? null : key(ms)])+"']";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which readings fall in each UTC interval?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Clock.csv",mimeType:"text/csv",buffer:Buffer.from([
      "At,Station,Units","1969-12-31T23:59:59.999Z,A,2","1970-01-01T01:00:00.001+01:00,B,3",
      "1970-01-01T00:00:00.249Z,C,5","1970-01-01 00:00:00.250,D,7","1970-01-01T00:00:00.751Z,E,11",",F,13"].join("\n"))});
    await p.getByTitle("Clock.At",{exact:true}).waitFor();
    await p.locator(".ribbon [data-action=calculation]").click();
    await p.getByRole("button",{name:"Create time bins"}).click();
    const dialog=p.getByRole("dialog"),source=dialog.getByLabel("Source column");
    await source.selectOption({label:"Clock · Station"});
    await dialog.getByRole("button",{name:"Create bins"}).click();
    await dialog.getByRole("alert").filter({hasText:"invalid ISO"}).waitFor();
    assert.equal(await p.getByTitle("Clock.Station (bins)",{exact:true}).count(),0);
    await source.selectOption({label:"Clock · At"});await dialog.getByLabel("Bin field name").fill("Quarter second");
    await dialog.getByLabel("Interval unit").selectOption({label:"Milliseconds"});
    await dialog.getByLabel("Bin size").fill("250");
    await dialog.getByRole("button",{name:"Create bins"}).click();await dialog.waitFor({state:"hidden"});
    await visual(p,"card",card,[],["Clock · Units"],[18,10,400,100]);
    await visual(p,"clusteredColumn",chart,["Clock · Quarter second"],["Clock · Units"],[18,126,960,360]);
    await p.getByLabel("Show empty intervals").check();await settled(p);
    await p.locator("[data-tab=Build]").click();
    for (const kind of ["clusteredColumn","clusteredBar"]) {
      await p.locator('[data-kind="'+kind+'"]').click();await settled(p);
      const marks=await art(p,chart).locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)]));
      assert.deepEqual(marks,[[key(-250),2],[key(0),8],[key(250),7],[key(750),11],[null,13]]);
    }
    const gap=art(p,chart).locator("[data-axis-pick='"+JSON.stringify([key(500)])+"']");
    await gap.press("Enter");await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"—");
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    const zero=art(p,chart).locator(selector(0));
    assert.equal(Number(await zero.getAttribute("data-value")),4);
    assert.match(await zero.getAttribute("aria-label"),/00:00:00\.000–<00:00:00\.250 UTC/);
    await zero.press("Enter");await settled(p);assert.equal(await art(p,card).locator(".kpi").innerText(),"8");
    await save(p);
  });
  await studio(async p=>{
    await open(p,name);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"8");
    const blank=art(p,chart).locator(selector(null));await blank.press("Enter");await settled(p);
    assert.equal(await art(p,card).locator(".kpi").innerText(),"13");
    await blank.press("Enter");await settled(p);assert.equal(await art(p,card).locator(".kpi").innerText(),"41");
    await addPage(p,"Fortnightly load");
    await p.getByTitle("Clock.At",{exact:true}).click({button:"right"});
    await p.getByLabel("Bin field name").fill("Sunday fortnight");
    await p.getByLabel("Interval unit").selectOption({label:"Weeks"});
    await p.getByLabel("Week starts on").selectOption({label:"Sunday"});
    await p.getByLabel("Bin size").fill("2");
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Clock.Sunday fortnight",{exact:true}).waitFor();
    await visual(p,"table","Fortnightly totals",["Clock · Sunday fortnight"],["Clock · Units"],[18,18,850,320]);
    assert.deepEqual(await art(p,"Fortnightly totals").locator("tbody td").allTextContents(),
      ["1969-12-28–<1970-01-11 UTC","28","(Blank)","13"]);
  });
  console.log("UTC intervals retained millisecond boundaries, blank, signed epoch, average and selections after reopening.");
}

export async function verifyTimestampSort() {
  const report="Shift handovers",ledger="Event ledger",events=[];
  const start=Date.UTC(2026,10,1,4,30);
  for(let i=0;i<57;i++) {
    const instant=start+Math.floor(i/3)*7*60000,offset=[-5,0,2][i%3];
    const stamp=new Date(instant+offset*3600000).toISOString().slice(0,19)+["-05:00","Z","+02:00"][i%3];
    events.push({id:"E"+String(i).padStart(2,"0"),stamp,units:(i*13)%11});
  }
  events.push({id:"E57",stamp:"",units:12});
  const ranked=direction=>[...events].sort((a,b)=>{
    if (!a.stamp || !b.stamp) return Number(!a.stamp)-Number(!b.stamp);
    return direction*(Date.parse(a.stamp)-Date.parse(b.stamp)) || b.units-a.units || a.id.localeCompare(b.id);
  });
  async function verifyPages(p,sorted) {
    const table=art(p,ledger),actual=[];
    for (let page=0;page<3;page++) {
      actual.push(...await table.locator("tbody tr").evaluateAll(es=>es.map(e=>[...e.querySelectorAll("td")].map(c=>c.textContent))));
      const next=table.getByRole("button",{name:"Next",exact:true});
      if (page===2) assert.ok(await next.isDisabled());
      else {await next.click();await settled(p);}
    }
    assert.deepEqual(actual,sorted.map(r=>[r.stamp||"(Blank)",r.id,String(r.units)]));
  }
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"Which handovers occurred first?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Shifts.csv",mimeType:"text/csv",buffer:Buffer.from("When,Ticket,Units\n"+events.map(r=>[r.stamp,r.id,r.units].join(",")).join("\n"))});
    await p.getByTitle("Shifts.When",{exact:true}).waitFor();
    await visual(p,"table",ledger,["Shifts · When","Shifts · Ticket"],["Shifts · Units"],[16,18,950,480]);
    await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Sort Ticket by UTC time").check();
    await p.locator("#toast").filter({hasText:"ISO dates"}).waitFor();
    assert.equal(await p.getByLabel("Sort Ticket by UTC time").isChecked(),false);
    await p.getByLabel("Sort When by UTC time").check();
    const table=art(p,ledger);
    await table.locator('th[aria-sort="ascending"]').waitFor();
    await table.locator('[data-table-sort="2"]').click({modifiers:["Shift"]});await settled(p);
    await verifyPages(p,ranked(1));
    // Clicking a header makes it primary again. Reapply the secondary ordering.
    await table.locator('[data-table-sort="0"]').click();await settled(p);
    await table.locator('[data-table-sort="2"]').click({modifiers:["Shift"]});await settled(p);
    await save(p);
  });
  await studio(async p=>{await open(p,report);await verifyPages(p,ranked(-1));});
  console.log("Chronological sort preserved raw offset strings, 58 records, blank last and secondary values across three pages and reopening.");
}

export async function benchmarkCalendarPeriod(p,daily,dir,quarter=false) {
  const name=quarter ? "Calendar quarter" : "Monday week";
  const title="Revenue by "+name,totals=new Map();
  const dates=(await readFile(join(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1);
  for (const line of dates) {
    const [key,stamp]=line.split(","),start=new Date(stamp+"T00:00:00Z");
    if (quarter) start.setUTCMonth(3*Math.floor(start.getUTCMonth()/3),1);
    else start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
    const lower=start.toISOString();
    if (daily.has(Number(key))) totals.set(lower,(totals.get(lower)||0)+daily.get(Number(key))[0]);
  }
  await addPage(p,title);
  await visual(p,"card","Selected period revenue",[],["Sales · Revenue"],[18,16,360,104],"currency");
  await p.getByTitle("Date.Date",{exact:true}).click({button:"right"});
  await p.getByLabel("Interval unit").selectOption({label:quarter ? "Quarters" : "Weeks"});
  if (!quarter) await p.getByLabel("Week starts on").selectOption({label:"Monday"});
  await p.getByLabel("Bin field name").fill(name);
  await p.getByRole("button",{name:"Create bins",exact:true}).click();
  await p.getByTitle("Date."+name,{exact:true}).waitFor();
  await visual(p,"clusteredColumn",title,["Date · "+name],["Sales · Revenue"],[18,134,940,300],"currency");
  const result=await verifyBinTotals(p,title,totals,[...totals.keys()].sort().slice(0,3));
  if (quarter) {
    const drillTitle="Revenue by calendar hierarchy";
    await addPage(p,drillTitle);
    await visual(p,"clusteredColumn",drillTitle,["Date · Date"],["Sales · Revenue"],[18,18,940,350],"currency");
    await p.locator("[data-tab=Build]").click();await p.getByRole("button",{name:"Replace Date",exact:true}).click();
    const action=p.getByRole("button",{name:"Use date hierarchy",exact:true});
    await action.evaluate(el=>el.addEventListener("click",()=>{window.dateHierarchyStart=performance.now();},{capture:true,once:true}));
    await action.click();
    const expected=[...totals.values()].reduce((a,b)=>a+b,0);
    await p.waitForFunction(cents=>{
      const marks=document.querySelectorAll("#paper .plot-mark");
      return document.querySelector("#paper")?.dataset.pending==="false" && marks.length===1 &&
        Math.round(Number(marks[0].dataset.value)*100)===cents;
    },expected,{polling:"raf"});
    const authorMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.dateHierarchyStart;});
    const plot=art(p,drillTitle);
    await plot.locator('[data-drill="next"]').click();await settled(p);
    const bars=await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Math.round(Number(e.dataset.value)*100)]));
    assert.deepEqual(bars,result.intervals);
    result.hierarchy={annualCents:expected,authorMs,quarterCount:bars.length};
    await addPage(p,"January coverage");
    await visual(p,"card","Daily revenue",[],["Sales · Revenue"],[14,12,360,100],"currency");
    await visual(p,"clusteredColumn","Daily postings",["Date · Date (day)"],["Sales · Revenue"],[14,124,955,245],"currency");
    await p.getByLabel("Show empty intervals").check();await settled(p);
    await filter(p,"page","Date · Date (month)","2025-01");await filter(p,"page","Sales · DateKey","12");
    const coverage=art(p,"Daily postings"),value=daily.get(12)[0];
    const slots=await coverage.locator(".empty-interval").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0]));
    assert.equal(slots.length,30);assert.equal(await coverage.locator(".plot-mark").count(),1);
    assert.equal(Math.round(Number(await coverage.locator(".plot-mark").getAttribute("data-value"))*100),value);
    const samples=[];
    for (const day of [1,12,31,12,1,31]) {
      const key="2025-01-"+String(day).padStart(2,"0")+"T00:00:00.000Z";
      const target=coverage.locator(day===12 ? ".plot-mark" : ".empty-interval[data-axis-pick='"+JSON.stringify([key])+"']");
      await target.evaluate(el=>el.addEventListener("keydown",()=>{window.coverageStart=performance.now();},{capture:true,once:true}));
      await target.press("Enter");
      const amount=day===12 ? (value/100).toLocaleString("en-US",{style:"currency",currency:"USD"}) : "—";
      await p.waitForFunction(a=>document.querySelector(".kpi")?.textContent===a && document.querySelector("#paper").dataset.pending==="false",
        amount,{polling:"raf"});
      const ms=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.coverageStart;});
      assert.equal(await target.getAttribute("aria-pressed"),"true");samples.push({day,amount,ms});
    }
    result.coverage={slots:slots.length,observedCents:value,samples};
    await addPage(p,"Compare posting dates");
    await visual(p,"card","Revenue on selected dates",[],["Sales · Revenue"],[18,10,420,110],"currency");
    await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
    const dialog=p.getByRole("dialog"),box=name=>dialog.getByRole("checkbox",{name,exact:true});
    await dialog.getByLabel("Field",{exact:true}).selectOption({label:"Date · Date"});
    await dialog.getByLabel("Condition",{exact:true}).selectOption("in");
    const jan="2025-01-12",dec="2025-12-31";
    await box(jan).check();assert.equal(await box(dec).count(),0);
    const search=dialog.getByRole("searchbox",{name:"Search values"});
    await search.evaluate(el=>el.addEventListener("input",()=>{window.memberSearchStart=performance.now();},{once:true}));
    await search.fill("2025-12");
    await p.waitForFunction(last=>{
      const items=document.querySelectorAll("dialog [data-members] label");
      return items.length===31 && items[30].textContent===last;
    },dec,{polling:"raf"});
    const searchMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.memberSearchStart;});
    const matched=await dialog.locator("[data-members] label").allTextContents();
    assert.deepEqual(matched,Array.from({length:31},(_,i)=>"2025-12-"+String(i+1).padStart(2,"0")));
    await box(dec).check();await search.fill("");
    await box("2025-01-01").waitFor();
    assert.ok(await box(jan).isChecked());
    const apply=dialog.getByRole("button",{name:"Apply",exact:true});
    await apply.evaluate(el=>el.addEventListener("click",()=>{window.valueFilterStart=performance.now();},{capture:true,once:true}));
    await apply.click();
    const cents=daily.get(12)[0]+daily.get(365)[0],amount=(cents/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
    await p.waitForFunction(a=>document.querySelector(".kpi")?.textContent===a && document.querySelector("#paper").dataset.pending==="false",
      amount,{polling:"raf"});
    const applyMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.valueFilterStart;});
    result.valueList={nextPageClicks:0,search:"2025-12",matched:matched.length,searchMs,selected:[jan,dec],cents,applyMs};
    await p.locator('[data-remove-filter="page:0"]').click();await settled(p);
    await visual(p,"dropdown","Posting date lookup",["Date · Date"],[],[18,136,460,170]);
    await p.getByLabel("Show search box").check();await settled(p);
    const picker=art(p,"Posting date lookup"),searchBox=picker.getByRole("searchbox");
    const allSales=await art(p,"Revenue on selected dates").locator(".kpi").innerText();
    const lookupRequest=p.waitForRequest(req=>req.url().endsWith("/api/query") && req.postDataJSON()?.visuals?.some(q=>q.filters?.some(f=>f.op==="contains")));
    await searchBox.fill("2025-12");assert.equal((await lookupRequest).postDataJSON().visuals.length,1);
    await p.waitForFunction(()=>document.querySelector("[data-slice-drop]")?.options.length===32);
    assert.equal(await art(p,"Revenue on selected dates").locator(".kpi").innerText(),allSales);
    await p.getByLabel("Select multiple values",{exact:true}).check();await settled(p);
    await picker.locator("[data-slicer-values]").click();await box(jan).check();
    await dialog.getByRole("searchbox").fill("2025-12");await box(dec).check();
    await apply.evaluate(el=>el.addEventListener("click",()=>{window.slicerApplyStart=performance.now();},{once:true,capture:true}));
    await apply.click();await p.waitForFunction(a=>document.querySelector(".kpi")?.textContent===a &&
      document.querySelector("[data-slicer-values]")?.textContent.includes("2 selected") &&
      document.querySelector("#paper").dataset.pending==="false",amount,{polling:"raf"});
    const slicerMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.slicerApplyStart;});
    result.dropdown={searchQueries:1,matched:31,before:allSales,selected:[jan,dec],amount,applyMs:slicerMs};
    await picker.locator("[data-clear]").click();await settled(p);
    await picker.locator("[data-slicer-paste]").click();
    const pasted=dialog.getByLabel("Values, one per line");
    const keys=[...daily.keys()].sort((a,b)=>a-b).filter(day=>day%11===0);
    const stamps=keys.map(day=>new Date(Date.UTC(2025,0,day)).toISOString().slice(0,10));
    const supplied=[...stamps,stamps[0],"2025-02-31"];
    await pasted.evaluate((el,text)=>{
      const clipboardData=new DataTransfer();clipboardData.setData("text/plain",text);
      const transfer=new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData});
      el.closest(".filter-values").dispatchEvent(transfer);
    },supplied.join("\r\n"));
    await dialog.getByText(stamps.length+" matched · 1 unmatched",{exact:true}).waitFor();
    const bulkAmount=(keys.reduce((sum,day)=>sum+daily.get(day)[0],0)/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
    await apply.evaluate(el=>el.addEventListener("click",()=>{window.bulkStart=performance.now();},{once:true,capture:true}));
    await apply.click();await p.waitForFunction(([label,n])=>document.querySelector(".kpi")?.textContent===label &&
      document.querySelector("[data-slicer-values]")?.textContent.includes(n+" selected") &&
      document.querySelector("#paper").dataset.pending==="false",[bulkAmount,stamps.length],{polling:"raf"});
    result.paste={lines:supplied.length,matched:stamps.length,unmatched:["2025-02-31"],amount:bulkAmount,
      applyMs:await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.bulkStart;})};
    const reconciliation="Posting reconciliation";
    await addPage(p,reconciliation);
    await visual(p,"card","Reconciled revenue",[],["Sales · Revenue"],[18,12,420,115],"currency");
    const tabs=p.locator("#pages");
    await tabs.getByRole("button",{name:"Compare posting dates",exact:true}).click();await settled(p);
    await art(p,"Posting date lookup").locator(".vhead").click();await p.locator("[data-tab=Format]").click();
    await p.getByRole("button",{name:"Sync slicers",exact:true}).click();
    await dialog.getByLabel(reconciliation,{exact:true}).selectOption({label:"Filter page only"});
    await apply.click();await settled(p);
    const target=tabs.getByRole("button",{name:reconciliation,exact:true});
    await target.evaluate(el=>el.addEventListener("click",()=>{window.syncStart=performance.now();},{capture:true,once:true}));
    await target.click();await p.waitForFunction(amount=>document.querySelector(".kpi")?.textContent===amount &&
      document.querySelector("#paper").dataset.pending==="false",bulkAmount,{polling:"raf"});
    const navigateMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.syncStart;});
    await p.locator("#other-selections button").click();await settled(p);
    const full=(expected/100).toLocaleString("en-US",{style:"currency",currency:"USD"});
    assert.equal(await art(p,"Reconciled revenue").locator(".kpi").innerText(),full);
    result.sync={selectedDates:stamps.length,revenue:bulkAmount,navigateMs,afterClear:full};
    const historySamples=[];
    for (const [name,label] of [["Undo",bulkAmount],["Redo",full]]) {
      const button=p.getByRole("button",{name,exact:true});
      await button.evaluate(el=>el.addEventListener("click",()=>{window.historyStart=performance.now();},{capture:true,once:true}));
      await button.click();
      await p.waitForFunction(amount=>document.querySelector(".kpi")?.textContent===amount &&
        document.querySelector("#paper")?.dataset.pending==="false",label,{polling:"raf"});
      const ms=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.historyStart;});
      historySamples.push({action:name,revenue:label,ms});
    }
    result.history=historySamples;
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
    const reconciled=art(p,"Reconciled revenue");
    assert.equal(await reconciled.locator(".kpi").innerText(),bulkAmount);
    await reconciled.locator(".vhead strong").click();
    await p.getByRole("button",{name:"Copy visuals",exact:true}).click();
    await addPage(p,"All posting dates");
    const paste=p.getByRole("button",{name:"Paste visuals",exact:true});
    await paste.evaluate(el=>el.addEventListener("click",()=>{window.visualPasteStart=performance.now();},{capture:true,once:true}));
    await paste.click();
    await p.waitForFunction(amount=>document.querySelector(".kpi")?.textContent===amount &&
      document.querySelector("#paper")?.dataset.pending==="false",full,{polling:"raf"});
    const pasteMs=await p.evaluate(async()=>{await new Promise(requestAnimationFrame);return performance.now()-window.visualPasteStart;});
    result.copyVisual={sourceRevenue:bulkAmount,sourceDates:stamps.length,destinationRevenue:full,pasteMs};
  }
  return result;
}
