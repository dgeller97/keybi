import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,setInput,settled,visual} from "./portfolio-ui.mjs";

export async function benchmarkChartSelection(p,truth,dir) {
  const dates=(await readFile(join(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
  const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  await addPage(p,"Selected bars");
  await visual(p,"card","Bar total",[],["Billed revenue"],[18,18,455,115]);
  await visual(p,"clusteredColumn","Revenue by date and category",["Date · Date"],["Billed revenue"],[18,145,950,405]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=legendFields]").selectOption({label:"Product · Category"});
  await setInput(p,"#rank-limit",3); await settled(p);
  const bars=art(p,"Revenue by date and category"),barTotal=art(p,"Bar total").locator(".kpi"),pairedBars=[];
  const first=[dates[0][1],"A"],second=[dates[1][1],"B"];
  for(const [tuple,members] of [[first,[first]],[second,[first,second]],[first,[second]],[first,[first,second]],[second,[first]],[first,[]]]) {
    const mark=bars.locator(`[data-selection-key='${JSON.stringify(tuple)}']`);
    await mark.evaluate(el=>el.addEventListener("click",()=>{window.barStart=performance.now();},{capture:true,once:true}));
    await mark.click({modifiers:["Control"]}); await settled(p);
    const paint=await barTotal.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.barStart,amount:el.textContent};
    });
    assert.deepEqual(await bars.locator('[data-selection-key][aria-pressed=true]').evaluateAll(es=>es.map(e=>e.dataset.selectionKey).sort()),members.map(m=>JSON.stringify(m)).sort());
    const cents=members.length?members.reduce((sum,[date,category])=>sum+truth.revenueByCategoryDate.get(category).get(Number(dates.find(row=>row[1]===date)[0])),0):truth.tot[0];
    assert.equal(paint.amount,money.format(cents/100)); pairedBars.push({...paint,members});
  }
  const legends=[];
  for (const [category,selected] of [["A",["A"]],["B",["A","B"]],["A",["B"]],["B",[]]]) {
    const button=bars.getByRole("button",{name:category,exact:true});
    await button.evaluate(el=>el.addEventListener("click",()=>{window.legendStart=performance.now();},{capture:true,once:true}));
    await button.click({modifiers:["Control"]}); await settled(p);
    const paint=await barTotal.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.legendStart,amount:el.textContent};
    });
    assert.deepEqual(await bars.locator("[data-legend-pick][aria-pressed=true]").allTextContents(),selected);
    assert.equal(await bars.locator("[data-selection-key][aria-pressed=true]").count(),3*selected.length);
    const cents=selected.length?selected.reduce((sum,key)=>sum+truth.map.get(key)[0],0):truth.tot[0];
    assert.equal(paint.amount,money.format(cents/100)); legends.push({...paint,selected});
  }
  const axes=[];
  for(const [date,selected] of [[first[0],[first[0]]],[second[0],[first[0],second[0]]],[first[0],[second[0]]],[second[0],[]]]) {
    const button=bars.getByRole("button",{name:"Date = "+date,exact:true});
    await button.evaluate(el=>el.addEventListener("click",()=>{window.axisStart=performance.now();},{capture:true,once:true}));
    await button.click({modifiers:["Control"]}); await settled(p);
    const paint=await barTotal.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.axisStart,amount:el.textContent};
    });
    const dateKeys=selected.map(day=>Number(dates.find(row=>row[1]===day)[0]));
    const cents=dateKeys.length?dateKeys.reduce((sum,id)=>sum+truth.daily.get(id)[0],0):truth.tot[0];
    assert.equal(paint.amount,money.format(cents/100));
    assert.equal(await bars.locator("[data-selection-key][aria-pressed=true]").count(),selected.length*truth.map.size);
    axes.push({...paint,selected});
  }
  const tableOpens=[];
  let queries=0;
  const countQuery=request=>{ if(request.url().endsWith("/api/query")) queries++; };
  p.on("request",countQuery);
  for(let i=0;i<3;i++) {
    const button=bars.getByRole("button",{name:"Show as a table",exact:true});
    await button.evaluate(el=>el.addEventListener("click",()=>{window.tableStart=performance.now();},{capture:true,once:true}));
    await button.click();
    const shown=p.locator("dialog .chart-summary table");
    const {rows,ms}=await shown.evaluate(async table=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {rows:[...table.tBodies[0].rows].map(r=>[...r.cells].map(c=>c.textContent)),ms:performance.now()-window.tableStart};
    });
    assert.equal(rows.length,3*truth.map.size); assert.equal(new Set(rows.map(r=>JSON.stringify(r.slice(0,2)))).size,rows.length);
    for(const [day,category,value] of rows) {
      const dateId=Number(dates.find(row=>row[1]===day)[0]); assert.ok(dateId>=1 && dateId<=3);
      assert.equal(value,money.format(truth.revenueByCategoryDate.get(category).get(dateId)/100));
    }
    tableOpens.push({ms,rows:rows.length,queries});
    await p.keyboard.press("Escape");
  }
  p.off("request",countQuery); assert.equal(queries,0);
  await addPage(p,"Scatter selections");
  await visual(p,"card","Selected category revenue",[],["Billed revenue"],[18,18,450,115]);
  await visual(p,"scatter","Category profit and revenue",["Product · Category"],["Sales · Profit"],[18,145,950,405]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=other]").selectOption({label:"Billed revenue"}); await settled(p);
  await p.locator("[data-tab=Format]").click();
  for (const [axis,index] of [["x",1],["primary",0]]) {
    const values=[...truth.map.values()].map(totals=>totals[index]/100),pad=(Math.max(...values)-Math.min(...values))*0.05;
    await setInput(p,`[data-axis-key="${axis}"][data-bound="max"]`,Math.ceil(Math.max(...values)+pad));
    await setInput(p,`[data-axis-key="${axis}"][data-bound="min"]`,Math.floor(Math.min(...values)-pad));
  }
  await settled(p);
  const scatter=art(p,"Category profit and revenue"),receiving=art(p,"Selected category revenue").locator(".kpi");
  const centers=await scatter.locator("[data-selection-key] circle").evaluateAll(es=>es.map(circle=>{
    const b=circle.getBoundingClientRect();
    return {key:JSON.parse(circle.parentElement.dataset.selectionKey)[0],x:b.x+b.width/2,y:b.y+b.height/2};
  }));
  assert.equal(centers.length,truth.map.size);
  // Find a rectangle containing several distinct category centers in the actual plot.
  let region,inside;
  for(const a of centers) for(const b of centers) {
    const box=[Math.min(a.x,b.x)-1,Math.min(a.y,b.y)-1,Math.max(a.x,b.x)+1,Math.max(a.y,b.y)+1];
    const contained=centers.filter(c=>c.x>=box[0] && c.x<=box[2] && c.y>=box[1] && c.y<=box[3]);
    if(box[2]-box[0]>=6 && contained.length>=2 && contained.length<=4) {region=box;inside=contained;}
  }
  assert.ok(region,"The scatter plot must expose separately selectable centers");
  const rectangles=[];
  for(const toggle of [false,true,true]) {
    const [x,y,u,v]=region;
    if(toggle) await p.keyboard.down("Control");
    await p.mouse.move(x,y); await p.mouse.down(); await p.mouse.move(u,v,{steps:6});
    await p.evaluate(()=>window.addEventListener("pointerup",()=>{window.rectangleStart=performance.now();},{capture:true,once:true}));
    await p.mouse.up(); if(toggle) await p.keyboard.up("Control"); await settled(p);
    const paint=await receiving.evaluate(async el=>{
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return {ms:performance.now()-window.rectangleStart,amount:el.textContent};
    });
    const selected=rectangles.length===1?[]:inside.map(c=>c.key).sort();
    const shown=await scatter.locator('[data-selection-key][aria-pressed=true]').evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.selectionKey)[0]).sort());
    assert.deepEqual(shown,selected);
    assert.equal(paint.amount,money.format((selected.length?selected.reduce((sum,cat)=>sum+truth.map.get(cat)[0],0):truth.tot[0])/100));
    rectangles.push({...paint,selected});
  }
  return {pairedBars,rectangles,legends,axes,tableOpens};
}
