import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,measure,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyImportedRanking() {
  const report="Depot yield review",title="Units by depot",chart=p=>art(p,title);
  const bind=async p=>{await chart(p).locator(".vhead strong").click(); await p.locator("[data-tab=Build]").click();};
  const expect=async(p,depots)=>{
    const shown=await chart(p).locator("[data-axis-pick]").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0]));
    assert.deepEqual(shown,depots);
  };
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,report,"Which depots deliver the highest yield?");
    const picker=p.waitForEvent("filechooser"); await p.locator(".ribbon [data-action=import]").click();
    const data="Depot,Route,Units,Good\nEast,A,1,1\nEast,B,99,9\nWest,A,10,3\nWest,B,10,3\nSouth,A,0,0\n,A,10,1\nNorth,B,5,0\n";
    await (await picker).setFiles({name:"Shipments.csv",mimeType:"text/csv",buffer:Buffer.from(data)});
    await p.getByTitle("Shipments.Units",{exact:true}).waitFor();
    await measure(p,"Yield","Shipments · Good","Shipments · Units");
    await visual(p,"clusteredColumn",title,["Shipments · Depot"],["Shipments · Units"],[18,18,850,400]);
    await bind(p); await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1); await settled(p); await expect(p,["East"]);
    await p.getByLabel("Rank by measure",{exact:true}).selectOption({label:"Yield"}); await settled(p); await expect(p,["West"]);
    assert.equal(await chart(p).locator("[data-point]").getAttribute("data-value"),"20");
    await p.locator("[data-pick=legendFields]").selectOption({label:"Shipments · Route"}); await settled(p); await expect(p,["West"]);
    assert.deepEqual(await chart(p).locator("[data-point]").evaluateAll(es=>es.map(e=>Number(e.dataset.value))),[10,10]);
    await chart(p).getByRole("button",{name:"Show as a table"}).click();
    const table=p.getByRole("dialog").getByRole("table"); await table.waitFor();
    assert.deepEqual(await table.locator("th").allTextContents(),["Depot","Route","Units"]);
    await p.keyboard.press("Escape"); await p.locator("#rank-ties").check(); await settled(p); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await expect(p,["West"]); await bind(p);
    assert.ok(await p.locator("#rank-ties").isChecked());
    await p.locator("#rank-order").selectOption("asc"); await setInput(p,"#rank-limit",2); await settled(p);
    await expect(p,["North","East",null]);
    await p.locator("#rank-ties").uncheck(); await settled(p); await expect(p,["North","East"]);
    await p.locator("#rank-ties").check(); await setInput(p,"#rank-limit",5); await settled(p);
    const ascending=["North","East",null,"West","South"];
    await expect(p,ascending);
    await p.locator("[data-kind=line]").click(); await settled(p); await expect(p,ascending);
    await p.locator('[data-remove-field="legendFields:0"]').click(); await settled(p);
    await expect(p,ascending);
    await p.locator("[data-pick=metrics]").selectOption({label:"Shipments · Good"}); await settled(p);
    await p.locator("#rank-measure").selectOption({label:"Good"}); await p.locator("#rank-order").selectOption("desc");
    await setInput(p,"#rank-limit",1); await settled(p); await expect(p,["East"]);
    await p.locator('[data-well="metrics"] .wellrow').last().locator("[data-agg]").selectOption("avg"); await settled(p);
    assert.equal(await p.locator("#rank-measure option:checked").innerText(),"Average of Good");
    await p.locator('[data-well="metrics"] .wellrow').last().locator('[data-move-field="-1"]').click(); await settled(p);
    assert.equal(await p.locator("#rank-measure option:checked").innerText(),"Average of Good");
  });
  console.log("Ranked weighted yield before and after splitting routes, reopened the hidden ranking measure, retained a blank depot and ordered zero ahead of blank.");
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    const picker=p.waitForEvent("filechooser"); await p.locator(".ribbon [data-action=import]").click();
    const rows=Array.from({length:501},(_,i)=>"Depot "+String(i).padStart(3,"0")+",A,1");
    await (await picker).setFiles({name:"Same volume.csv",mimeType:"text/csv",buffer:Buffer.from(["Depot,Route,Units",...rows].join("\n"))});
    await p.getByTitle("Same volume.Units",{exact:true}).waitFor();
    await visual(p,"clusteredColumn","Equal volume",["Same volume · Depot"],["Same volume · Units"],[18,18,850,400]);
    await p.locator("[data-tab=Build]").click(); await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1);
    const bars=art(p,"Equal volume");
    for(const split of [false,true]) {
      if (split) await p.locator("[data-pick=legendFields]").selectOption({label:"Same volume · Route"});
      await p.locator("#rank-ties").check(); await settled(p);
      assert.match(await bars.locator(".vbody .err").innerText(),/More than 500 groups qualify/);
      assert.equal(await bars.locator("[data-point]").count(),0);
      await p.locator("#rank-ties").uncheck(); await settled(p);
      assert.deepEqual(await bars.locator("[data-axis-pick]").allTextContents(),["Depot 000"]);
    }
    await p.locator('[data-remove-field="legendFields:0"]').click(); await settled(p);
    await p.locator("[data-kind=card]").click(); await settled(p);
    await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",1);
    await p.locator("#rank-ties").check(); await settled(p);
    await p.locator('[data-remove-field="groups:0"]').click(); await settled(p);
    assert.equal(await bars.locator(".kpi").innerText(),"501");
  });
}

export async function benchmarkRanking(p,truth,dir) {
  const dateRows=(await readFile(join(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1).map(r=>r.split(","));
  const dates=new Map(dateRows.map(([key,date])=>[Number(key),date]));
  const daily=new Map([...truth.daily].map(([key,values])=>[dates.get(key),values]));
  await addPage(p,"Ranked dates");
  const title="Profit on the three highest dates",chart=art(p,title),results=[];
  const margin="Daily margin for ranking";
  await measure(p,margin,"Sales · Profit","Sales · Revenue");
  await visual(p,"clusteredColumn",title,["Date · Date"],["Sales · Profit","Billed revenue"],[18,18,950,405]);
  await p.locator("[data-tab=Build]").click(); await p.locator("#rank-order").selectOption("desc"); await setInput(p,"#rank-limit",3); await settled(p);
  async function check(metric,mode) {
    const picker=p.getByLabel("Rank by measure",{exact:true});
    await picker.evaluate(el=>el.addEventListener("change",()=>{window.rankStart=performance.now();},{capture:true,once:true}));
    await picker.selectOption({label:metric}); await settled(p);
    const painted=await chart.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.rankStart,days:[...el.querySelectorAll("[data-axis-pick]")].map(e=>JSON.parse(e.dataset.axisPick)[0]),
        marks:[...el.querySelectorAll("[data-selection-key]")].map(e=>({day:JSON.parse(e.dataset.selectionKey)[0],label:e.getAttribute("aria-label"),cents:Math.round(Number(e.dataset.value)*100)}))};
    });
    const score=([revenue,profit])=>metric===margin?profit/revenue:metric==="Profit"?profit:revenue;
    const expected=[...daily].sort((a,b)=>score(b[1])-score(a[1]) || a[0].localeCompare(b[0])).slice(0,3);
    assert.deepEqual(painted.days,expected.map(([date])=>date));
    for(const [date,values] of expected) {
      const marks=painted.marks.filter(mark=>mark.day===date);
      if(mode==="displayed") {
        assert.equal(marks.length,2);
        for(const mark of marks) assert.equal(mark.cents,values[mark.label.includes("Billed revenue")?0:1]);
      } else {
        assert.equal(marks.length,mode==="legend"?truth.map.size:1);
        assert.equal(marks.reduce((n,m)=>n+m.cents,0),values[1]);
      }
    }
    results.push({mode,metric,ms:painted.ms,dates:painted.days,markCount:painted.marks.length});
  }
  await check("Billed revenue","displayed"); await check("Profit","displayed");
  await p.locator('[data-remove-field="metrics:1"]').click(); await settled(p);
  await check(margin,"hidden"); await check("Profit","hidden");
  await p.locator("[data-pick=legendFields]").selectOption({label:"Product · Category"}); await settled(p);
  await check(margin,"legend"); await check("Profit","legend"); await check(margin,"legend");
  assert.notDeepEqual(results.at(-1).dates,results.at(-2).dates);
  // Find a real tie in the imported ledger. The first tied position is the
  // cutoff, so choosing ties must add at least one date with the same count.
  const counts=[...truth.dailyCounts].map(([key,n])=>[dates.get(key),n]).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]));
  const cutoff=counts.findIndex((row,i)=>row[1]===counts[i+1]?.[1])+1;
  assert.ok(cutoff>0);
  await p.locator('[data-remove-field="legendFields:0"]').click(); await settled(p);
  await p.locator("[data-pick=metrics]").selectOption({label:"Sales · SaleID"});
  await p.locator('[data-well=metrics] .wellrow').last().locator("[data-agg]").selectOption("count"); await settled(p);
  const countOption=await p.locator("#rank-measure optgroup").first().locator("option").filter({hasText:"SaleID"}).innerText();
  await p.locator("#rank-measure").selectOption({label:countOption}); await setInput(p,"#rank-limit",cutoff); await settled(p);
  for(const include of [true,false,true]) {
    const toggle=p.getByLabel("Include ties at the cutoff");
    await toggle.evaluate(el=>el.addEventListener("change",()=>{window.rankStart=performance.now();},{capture:true,once:true}));
    await toggle.setChecked(include); await settled(p);
    const painted=await chart.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.rankStart,marks:[...el.querySelectorAll("[data-point]")].map(e=>[JSON.parse(e.dataset.selectionKey)[0],e.getAttribute("aria-label"),Number(e.dataset.value)])};
    });
    const expected=include?counts.filter(([,n])=>n>=counts[cutoff-1][1]):counts.slice(0,cutoff);
    assert.equal(painted.marks.length,expected.length*2);
    assert.deepEqual([...new Set(painted.marks.map(([day])=>day))],expected.map(([day])=>day));
    for(const [day,label,value] of painted.marks) {
      if(label.includes("SaleID")) assert.equal(value,truth.dailyCounts.get(Number(dateRows.find(r=>r[1]===day)[0])));
      else assert.equal(Math.round(value*100),daily.get(day)[1]);
    }
    results.push({mode:"cutoff",include,ms:painted.ms,cutoff,cutoffCount:counts[cutoff-1][1],dates:expected.map(([day])=>day)});
  }
  return results;
}
