import assert from "node:assert/strict";
import {addPage,art,filter,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";
import {editFormula,formula} from "./formula-check.mjs";

export async function verifyFilterContext() {
  const report="Route contribution", matrix="Gross by route", tickets="Tickets across channels and hubs";
  const amount="[Route gross]", adjusted=`CALCULATE(${amount}, REMOVEFILTERS('Routes'[Channel]))`;
  const row=(p,path) => art(p,matrix).locator(`tr[data-path='${JSON.stringify(path)}']`);
  const values=(p,path) => row(p,path).locator("td:not([data-row-level])").allTextContents();
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,report,"How much does each route contribute within its hub?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles([
      {name:"Routes.csv",mimeType:"text/csv",buffer:Buffer.from("RouteKey,Channel\n1,Web\n2,Shop\n3,Unused\n")},
      {name:"Jobs.csv",mimeType:"text/csv",buffer:Buffer.from("RouteKey,Hub,Shift,Gross,Ticket\n1,North,Day,20,X\n2,North,Day,60,X\n9,North,Day,20,Y\n1,South,Day,30,A\n2,South,Day,10,B\n1,Zero,Day,0,Z\n1,North,Night,400,Q\n")}
    ]);
    await p.getByTitle("Jobs.Gross",{exact:true}).waitFor();
    await p.locator(".ribbon [data-action=relationship]").click();
    await p.getByLabel("One-side key").selectOption({label:"Routes · RouteKey"});
    await p.getByLabel("Many-side key").selectOption({label:"Jobs · RouteKey"});
    await p.locator("dialog button[type=submit]").click();
    await p.locator("dialog").waitFor({state:"hidden"});
    await formula(p,"Route gross","SUM('Jobs'[Gross])","currency");
    await formula(p,"Hub gross",adjusted,"currency");
    await formula(p,"Route contribution",`DIVIDE(${amount},[Hub gross])`,"percent");
    await formula(p,tickets,"CALCULATE(DISTINCTCOUNT('Jobs'[Ticket]), REMOVEFILTERS('Routes'[Channel]), REMOVEFILTERS('Jobs'[Hub]))");
    await visual(p,"matrix",matrix,["Jobs · Hub","Routes · Channel"],["Route gross","Hub gross","Route contribution"],[18,152,950,390]);
    await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
    await filter(p,"page","Jobs · Shift","Day");
    await visual(p,"card",tickets,[],[tickets],[18,18,300,115]);
    await visual(p,"card","Selected contribution",[],["Route contribution"],[332,18,300,115]);
    await visual(p,"card","Regional gross",[],["Hub gross"],[647,18,300,115]);
    assert.deepEqual(await values(p,["North",null]),["$20.00","$100.00","20%"]);
    assert.deepEqual(await values(p,["Zero","Web"]),["$0.00","$0.00","—"]);
    assert.deepEqual(await values(p,[]),["$140.00","$140.00","100%"]);
    await row(p,["North","Web"]).getByRole("button",{name:"20%",exact:true}).click();
    await settled(p);
    assert.equal(await art(p,tickets).locator(".kpi").innerText(),"5");
    assert.equal(await art(p,"Selected contribution").locator(".kpi").innerText(),"20%");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,"Regional gross").locator(".kpi").innerText(),"$100.00");
    assert.equal(await art(p,"Selected contribution").locator(".kpi").innerText(),"20%");
    await row(p,["South","Web"]).getByRole("button",{name:"75%",exact:true}).click();
    await settled(p);
    assert.equal(await art(p,"Regional gross").locator(".kpi").innerText(),"$40.00");
    assert.equal(await art(p,tickets).locator(".kpi").innerText(),"5");
    await editFormula(p,"Route gross");
    await p.getByLabel("Measure name").fill("Route units");
    await p.getByLabel("DAX expression").fill("SUM('Jobs'[RouteKey])");
    await p.getByRole("button",{name:"Save measure"}).click();
    await p.locator("dialog").waitFor({state:"hidden"});
    await editFormula(p,"Route contribution");
    assert.equal(await p.getByLabel("DAX expression").inputValue(),"DIVIDE([Route units],[Hub gross])");
    await p.keyboard.press("Escape");
    await p.locator(".rail [data-action=report]").click();
    await settled(p);
    assert.equal(await art(p,"Regional gross").locator(".kpi").innerText(),"$3.00");
    assert.equal(await art(p,"Selected contribution").locator(".kpi").innerText(),"33.33%");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,"Selected contribution").locator(".kpi").innerText(),"33.33%");
    assert.deepEqual(await values(p,["North","Web"]),["$1.00","$12.00","8.33%"]);
    assert.match(await art(p,matrix).locator("thead").innerText(),/Route units/);
    await editFormula(p,"Route units");
    await p.getByLabel("DAX expression").fill("[Hub gross]");
    await p.getByRole("button",{name:"Save measure"}).click();
    assert.match(await p.locator("dialog [role=alert]").innerText(),/Circular measure reference.*Route units.*Hub gross.*Route units/);
    await p.getByLabel("DAX expression").fill("[Missing measure]");
    await p.getByRole("button",{name:"Save measure"}).click();
    assert.match(await p.locator("dialog [role=alert]").innerText(),/Unknown measure \[Missing measure\]/);
    await p.keyboard.press("Escape");
    await p.locator(".rail [data-action=report]").click();
    await settled(p);
    assert.equal(await art(p,"Regional gross").locator(".kpi").innerText(),"$3.00");
    await addPage(p,"Ticket counts");
    await formula(p,"Logged jobs","COUNTROWS('Jobs')");
    await formula(p,"Unique ticket rate","DIVIDE(DISTINCTCOUNT('Jobs'[Ticket]), [Logged jobs])","percent");
    await visual(p,"card","Ticket rate",[],["Unique ticket rate"],[18,18,350,135]);
    assert.equal(await art(p,"Ticket rate").locator(".kpi").innerText(),"85.71%");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,"Ticket rate").locator(".kpi").innerText(),"85.71%");
    await addPage(p,"Route comparisons");
    await formula(p,"Web gross",`CALCULATE(SUM('Jobs'[Gross]), 'Routes'[Channel] = "wEb")`,"currency");
    await formula(p,"Web inside Shop",`CALCULATE([Web gross], 'Routes'[Channel] = "Shop")`,"currency");
    await formula(p,"Between 20 and 30",`CALCULATE(SUM('Jobs'[Gross]), 'Jobs'[Gross] >= 20, 'Jobs'[Gross] <= 30)`,"currency");
    await formula(p,"Unmatched routes",`CALCULATE(SUM('Jobs'[Gross]), 'Routes'[Channel] == BLANK())`,"currency");
    await visual(p,"matrix","Channel comparison",["Jobs · Hub","Routes · Channel"],
      ["Jobs · Gross","Web gross","Web inside Shop","Between 20 and 30","Unmatched routes"],[18,155,955,367]);
    await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
    await filter(p,"page","Jobs · Shift","Day");
    const result=art(p,"Channel comparison");
    const values=path=>result.locator(`tr[data-path='${JSON.stringify(path)}'] td:not([data-row-level])`).allTextContents();
    assert.deepEqual(await values(["North","Shop"]),["60","$20.00","$20.00","—","$20.00"]);
    assert.deepEqual(await values(["Zero","Web"]),["0","$0.00","$0.00","—","—"]);
    assert.deepEqual(await values([]),["140","$50.00","$50.00","$70.00","$20.00"]);
    await visual(p,"card","Web comparison",[],["Web gross"],[18,18,320,115]);
    await result.locator(`tr[data-path='["North","Shop"]']`).getByRole("button",{name:"60",exact:true}).click();
    await settled(p);
    assert.equal(await art(p,"Web comparison").locator(".kpi").innerText(),"$20.00");
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await art(p,"Web comparison").locator(".kpi").innerText(),"$20.00");
    await addPage(p,"Ticket quality");
    await visual(p,"table","Ticket quality by hub",["Jobs · Hub"],["Unique ticket rate","Unmatched routes"],[18,18,750,350]);
    const table=art(p,"Ticket quality by hub");
    await p.getByLabel("Apply to measure").selectOption({label:"Unique ticket rate"});
    await p.getByLabel("Show status icons").check();
    await setInput(p,"[data-cell-setting=icon-upper]",95);
    await setInput(p,"[data-cell-setting=icon-lower]",75);
    await p.getByLabel("Icon layout").selectOption("after");
    const north=table.locator("tbody tr").filter({hasText:"North"});
    assert.equal(await north.locator("td").nth(1).innerText(),"75%");
    assert.equal(await north.locator('[data-icon-band="middle"]').count(),1);
    assert.equal(await table.locator('[data-icon-band="high"]').count(),2);
    await setInput(p,"[data-cell-setting=icon-lower]",80);
    assert.equal(await north.locator('[data-icon-band="low"]').count(),1);
    await p.getByLabel("Apply to measure").selectOption({label:"Unmatched routes"});
    await p.getByLabel("Show status icons").check();
    assert.equal(await table.locator("tbody tr").filter({hasText:"South"}).locator("td").last().innerText(),"—");
    assert.equal(await table.locator("tbody tr").filter({hasText:"South"}).locator("td").last().locator("[data-icon-band]").count(),0);
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    const table=art(p,"Ticket quality by hub");
    assert.equal(await table.locator('[data-icon-layout="after"] [data-icon-band="low"]').count(),1);
    assert.equal(await table.locator('[data-icon-layout="after"] [data-icon-band="high"]').count(),2);
  });
  console.log("Named-column filter removal retained the page filter, related channel, orphan sale, zero, subtotal, distinct count and saved selection.");
}

export async function benchmarkFilterContext(p,truth,dir) {
  const {readFile}=await import("node:fs/promises");
  const {join}=await import("node:path");
  const dates=(await readFile(join(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1)
    .map(line => line.split(","));
  const selectedDates=[dates[0],dates[Math.floor(dates.length/2)],dates.at(-1)];
  await addPage(p,"Selected-day shares");
  const sum="[Billed revenue]", base=`CALCULATE(${sum},REMOVEFILTERS('Product'[Category]))`;
  await formula(p,"Revenue across categories",base,"currency");
  await formula(p,"Category share",`IF(ISBLANK(${sum}), BLANK(), DIVIDE(${sum},[Revenue across categories]))`,"percent");
  await formula(p,"Category A revenue",`CALCULATE(${sum}, 'Product'[Category] = "A")`,"currency");
  await formula(p,"Qualifying revenue",`IF([Category share] > 0.0833, ${sum})`,"currency");
  await formula(p,"Revenue above 8.33% share","SUMX(VALUES('Product'[Category]), [Qualifying revenue])","currency");
  await formula(p,"Qualifying categories","SUMX(VALUES('Product'[Category]), CALCULATE(IF([Category share] > 0.0833, 1)))");
  await visual(p,"dropdown","Day",["Date · Date"],[],[18,18,290,115]);
  await visual(p,"card","Revenue above 8.33% share",[],["Revenue above 8.33% share"],[325,18,460,115]);
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Reference labels",{exact:true}).selectOption({label:"Qualifying categories"}); await settled(p);
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({label:"Revenue above 8.33% share"});
  await p.getByLabel("Set text color by value").check();
  await p.getByLabel("Base colors on").selectOption({label:"Qualifying categories"});
  await setInput(p,"[data-cell-setting=threshold]",5);
  await p.getByLabel("Below threshold",{exact:true}).fill("#a63e31");
  await p.getByLabel("Above threshold",{exact:true}).fill("#326a51");
  await visual(p,"matrix","Category shares",["Product · Category"],["Billed revenue","Revenue across categories","Category share","Category A revenue"],[18,146,945,400]);
  const grid=art(p,"Category shares"), select=art(p,"Day").locator("select"), records=[];
  const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  const percent=new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  for (const [key,date] of [...selectedDates,["",""],...selectedDates]) {
    await select.evaluate(el => el.addEventListener("change",() => {window.shareStart=performance.now();},{once:true}));
    await select.selectOption(date ? {label:date} : {index:0});
    await settled(p);
    const data=await grid.evaluate(async el => {
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.shareStart,rows:[...el.querySelectorAll("tbody tr")].map(tr => [
        JSON.parse(tr.dataset.path),[...tr.cells].slice(1).map(td => td.textContent)
      ])};
    });
    const total=key ? truth.daily.get(Number(key))[0] : truth.tot[0];
    const fixed=key ? truth.revenueByCategoryDate.get("A").get(Number(key)) : truth.map.get("A")[0];
    const eligible=[...truth.map.keys()].map(cat=>key ? truth.revenueByCategoryDate.get(cat).get(Number(key)) : truth.map.get(cat)[0])
      .filter(cents=>cents!=null && cents/total>0.0833);
    const iterated=eligible.length ? money.format(eligible.reduce((a,b)=>a+b,0)/100) : "—";
    assert.equal(await art(p,"Revenue above 8.33% share").locator(".kpi").innerText(),iterated);
    assert.equal(await art(p,"Revenue above 8.33% share").locator(".card-references dd").innerText(),eligible.length ? String(eligible.length) : "—");
    const ink=await art(p,"Revenue above 8.33% share").locator(".kpi").evaluate(el=>el.style.color);
    assert.equal(ink,eligible.length===5 || !eligible.length?"":eligible.length<5?"rgb(166, 62, 49)":"rgb(50, 106, 81)");
    assert.deepEqual(data.rows.flatMap(([path]) => path).sort(),[...truth.map.keys()].sort());
    for (const [[cat],values] of data.rows) {
      const cents=!cat ? total : key ? truth.revenueByCategoryDate.get(cat).get(Number(key)) : truth.map.get(cat)[0];
      assert.deepEqual(values,[cents==null ? "—" : money.format(cents/100),money.format(total/100),
        cents==null || !total ? "—" : percent.format(cents/total),fixed==null ? "—" : money.format(fixed/100)]);
    }
    records.push({date:date || "All",ms:data.ms,categories:data.rows.length-1,denominator:money.format(total/100),categoryA:money.format(fixed/100),iterated,qualifyingCategories:eligible.length});
  }
  await select.selectOption({index:0});
  await settled(p);
  await editFormula(p,"Billed revenue");
  await p.getByLabel("DAX expression").fill("SUM('Sales'[Profit])");
  await p.getByRole("button",{name:"Save measure"}).click();
  await p.locator("dialog").waitFor({state:"hidden"});
  await p.locator(".rail [data-action=report]").click();
  await settled(p);
  const total=truth.tot[1];
  for (const tr of await grid.locator("tbody tr").all()) {
    const [cat]=JSON.parse(await tr.getAttribute("data-path"));
    const cents=cat ? truth.map.get(cat)[1] : total;
    assert.deepEqual(await tr.locator("td:not([data-row-level])").allTextContents(),
      [money.format(cents/100),money.format(total/100),percent.format(cents/total),money.format(truth.map.get("A")[1]/100)]);
  }
  await grid.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({label:"Billed revenue"});
  let queries=0;
  const countQuery=r=>{if (new URL(r.url()).pathname==="/api/query") queries++;};
  p.on("request",countQuery);
  await p.getByLabel("Show status icons").check();
  await p.getByLabel("Base icons on").selectOption({label:"Category share"});
  await p.getByLabel("Set background by value").check();
  await p.getByLabel("Base colors on").selectOption({label:"Category share"});
  await setInput(p,"[data-cell-setting=threshold]",8.33);
  await setInput(p,"[data-cell-setting=icon-upper]",8.36);
  await setInput(p,"[data-cell-setting=icon-lower]",8.29);
  const scope=p.getByLabel("Icons apply to"), paints=[];
  for (const selection of ["detail","all","totals","all"]) {
    await scope.evaluate(el=>el.addEventListener("change",()=>{window.iconStart=performance.now();},{once:true,capture:true}));
    await scope.selectOption(selection);
    const paint=await grid.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.iconStart,rows:[...el.querySelectorAll("tbody tr")].map(tr=>[
        JSON.parse(tr.dataset.path),tr.querySelector("[data-icon-band]")?.dataset.iconBand??null
      ])};
    });
    for (const [[cat],band] of paint.rows) {
      const share=cat?truth.map.get(cat)[1]/total:1;
      const visible=selection==="all" || (selection==="detail")===Boolean(cat);
      assert.equal(band,visible ? (share<0.0829?"low":share>0.0836?"high":"middle") : null);
    }
    paints.push({selection,ms:paint.ms});
  }
  p.off("request",countQuery);
  assert.equal(queries,0);
  await p.locator("[data-tab=Build]").click();
  await p.locator('[data-remove-field="metrics:2"]').click();
  await settled(p);
  await editFormula(p,"Billed revenue");
  await p.getByLabel("DAX expression").fill("SUM('Sales'[Revenue])");
  await p.getByRole("button",{name:"Save measure"}).click();
  await p.locator(".rail [data-action=report]").click(); await settled(p);
  const hidden=[];
  for (const [key,date] of [...selectedDates,["",""],...selectedDates]) {
    await select.evaluate(el=>el.addEventListener("change",()=>{window.basisStart=performance.now();},{once:true,capture:true}));
    await select.selectOption(date ? {label:date} : {index:0});
    await settled(p);
    const paint=await grid.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.basisStart,rows:[...el.querySelectorAll("tbody tr")].map(tr=>[
        JSON.parse(tr.dataset.path),tr.cells.length,tr.cells[1].textContent,tr.cells[1].dataset.cellTone??null,
        tr.cells[1].querySelector("[data-icon-band]")?.dataset.iconBand??null
      ])};
    });
    const denominator=key ? truth.daily.get(Number(key))[0] : truth.tot[0];
    assert.equal(paint.rows.length,truth.map.size+1);
    for (const [[cat],width,value,tone,band] of paint.rows) {
      const cents=!cat?denominator:key?truth.revenueByCategoryDate.get(cat).get(Number(key)):truth.map.get(cat)[0];
      const share=cents==null?null:cents/denominator;
      assert.equal(width,4);
      assert.equal(value,cents==null?"—":money.format(cents/100));
      assert.equal(tone,share==null || share===0.0833?null:share<0.0833?"below":"above");
      assert.equal(band,share==null?null:share<0.0829?"low":share>0.0836?"high":"middle");
    }
    hidden.push({date:date||"All",ms:paint.ms,checkedRows:paint.rows.length});
  }
  await grid.locator(".vhead").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Apply to measure").selectOption({label:"Billed revenue"});
  p.on("request",countQuery);
  await p.getByLabel("Background style").selectOption("gradient");
  await setInput(p,"[data-cell-setting=scale-max]",9);
  await setInput(p,"[data-cell-setting=scale-min]",8);
  await p.getByLabel("Minimum color",{exact:true}).fill("#ffffff");
  await p.getByLabel("Maximum color",{exact:true}).fill("#000000");
  p.off("request",countQuery);
  assert.equal(queries,0);
  const gradient=[];
  for (const [key,date] of [["",""],...selectedDates]) {
    await select.evaluate(el=>el.addEventListener("change",()=>{window.scaleStart=performance.now();},{once:true,capture:true}));
    await select.selectOption(date ? {label:date} : {index:0}); await settled(p);
    const paint=await grid.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.scaleStart,rows:[...el.querySelectorAll("tbody tr")].map(tr=>[
        JSON.parse(tr.dataset.path),tr.cells[1].style.backgroundColor
      ])};
    });
    const denominator=key ? truth.daily.get(Number(key))[0] : truth.tot[0];
    assert.equal(paint.rows.length,truth.map.size+1);
    for (const [[cat],color] of paint.rows) {
      const cents=!cat?denominator:key?truth.revenueByCategoryDate.get(cat).get(Number(key)):truth.map.get(cat)[0];
      const intensity=Math.round(255*(1-Math.min(1,Math.max(0,(cents/denominator-0.08)/0.01))));
      assert.equal(color,cents==null?"":`rgb(${intensity}, ${intensity}, ${intensity})`);
    }
    gradient.push({date:date||"All",ms:paint.ms,checkedRows:paint.rows.length});
  }
  const checkedRows=await grid.locator("tbody tr").count();
  await addPage(p,"Daily category cards");
  await visual(p,"dropdown","Sales date",["Date · Date"],[],[18,18,290,115]);
  await visual(p,"card","Sales by category",["Product · Category"],["Billed revenue"],[18,145,950,405]);
  await p.locator("[data-tab=Build]").click();
  await p.getByLabel("Reference labels",{exact:true}).selectOption({label:"Category share"}); await settled(p);
  const day=art(p,"Sales date").locator("select"), card=art(p,"Sales by category"), categoryCards=[];
  for(const [key,date] of [...selectedDates,["",""],...selectedDates]) {
    await day.evaluate(el=>el.addEventListener("change",()=>{window.tileStart=performance.now();},{once:true,capture:true}));
    await day.selectOption(date?{label:date}:{index:0}); await settled(p);
    const paint=await card.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.tileStart,tiles:[...el.querySelectorAll(".category-card")].map(tile=>[
        tile.querySelector("button").textContent,tile.querySelector(".kpi").textContent,tile.querySelector("dd").textContent
      ])};
    });
    const denominator=key?truth.daily.get(+key)[0]:truth.tot[0];
    const expected=[...truth.map.keys()].flatMap(cat=>{
      const cents=key?truth.revenueByCategoryDate.get(cat).get(+key):truth.map.get(cat)[0];
      return cents==null?[]:[[cat,money.format(cents/100),percent.format(cents/denominator)]];
    });
    assert.deepEqual(paint.tiles.sort(),expected.sort());
    categoryCards.push({date:date||"All",ms:paint.ms,verifiedTiles:expected.length});
  }
  await addPage(p,"Paired category selections");
  await visual(p,"card","Selected revenue",[],["Billed revenue"],[18,18,450,115]);
  await visual(p,"card","Daily categories",["Date · Date","Product · Category"],["Billed revenue"],[18,145,950,405]);
  const source=art(p,"Daily categories"),selected=art(p,"Selected revenue").locator(".kpi");
  const left={label:dates[0][1]+" › A",cents:truth.revenueByCategoryDate.get("A").get(Number(dates[0][0]))};
  const right={label:dates[1][1]+" › B",cents:truth.revenueByCategoryDate.get("B").get(Number(dates[1][0]))};
  const paired=[];
  for (const [pick,members] of [[left,[left]],[right,[left,right]],[left,[right]],[left,[left,right]],[right,[left]],[left,[]]]) {
    const header=source.getByRole("button",{name:pick.label,exact:true});
    await header.evaluate(el=>el.addEventListener("click",()=>{window.pairStart=performance.now();},{capture:true,once:true}));
    await header.click({modifiers:["Control"]}); await settled(p);
    const paint=await selected.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.pairStart,amount:el.textContent};
    });
    const labels=members.map(m=>m.label).sort();
    assert.deepEqual((await source.locator(".category-pick[aria-pressed=true]").allTextContents()).sort(),labels);
    assert.equal(paint.amount,money.format((members.length?members.reduce((sum,m)=>sum+m.cents,0):truth.tot[0])/100));
    paired.push({...paint,labels});
  }
  return {selections:records,afterBaseEdit:{expression:"SUM('Sales'[Profit])",total:money.format(total/100),checkedRows},statusIcons:{paints,queries},hiddenSource:hidden,colorScale:gradient,categoryCards,paired};
}
