import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";
import {editFormula,formula} from "./formula-check.mjs";

export async function verifyFormatSources() {
  const title="Receiving quality", tableName="Received cost", gridName="Cost by zone and desk";
  const quality="Inspection pass rate", total="Received dollars";
  const desks=Array.from({length:33},(_,i)=>i+1);
  const desk=i=>"Desk "+String(i).padStart(2,"0");
  // One QA-only desk, two uninspected desks, a real zero and unequal denominators.
  const inspections=desks.filter(i=>![2,3].includes(i)).map(i=>({i,n:i===33?900:10,pass:i===33?0:i%11}));
  const ratio=rows=>rows.length ? rows.reduce((n,r)=>n+r.pass,0)/rows.reduce((n,r)=>n+r.n,0) : null;
  const band=n=>n==null?null:n<0.3?"low":n>0.7?"high":"middle";
  const csv=(name,lines)=>({name:name+".csv",mimeType:"text/csv",buffer:Buffer.from(lines.join("\n")+"\n")});
  const rule=async (p,visualTitle)=>{
    await art(p,visualTitle).locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Apply to measure").selectOption({label:total});
    await p.getByLabel("Show status icons").check();
    await p.getByLabel("Base icons on").selectOption({label:quality});
    await settled(p);
    await setInput(p,"[data-cell-setting=icon-upper]",70);
    await setInput(p,"[data-cell-setting=icon-lower]",30);
    await p.getByLabel("Set background by value").check();
    await p.getByLabel("Base colors on").selectOption({label:quality});
    await setInput(p,"[data-cell-setting=threshold]",50);
  };
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    await rename(p,title,"Which desks need an inspection review?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles([
      csv("Desks",["Key,Desk,Zone",...desks.map(i=>[i,desk(i),i<17?"North":"South"].join(","))]),
      csv("Receipts",["Key,Cost",...desks.slice(0,32).map(i=>[i,i*100].join(","))]),
      csv("QA",["Key,Inspected,Passed",...inspections.map(r=>[r.i,r.n,r.pass].join(","))])
    ]);
    await p.getByTitle("QA.Passed",{exact:true}).waitFor();
    for (const fact of ["Receipts","QA"]) {
      await p.locator(".ribbon [data-action=relationship]").click();
      await p.getByLabel("One-side key").selectOption({label:"Desks · Key"});
      await p.getByLabel("Many-side key").selectOption({label:fact+" · Key"});
      await p.locator("dialog button[type=submit]").click();
      await p.locator("dialog").waitFor({state:"hidden"});
    }
    await formula(p,total,"SUM('Receipts'[Cost])","currency");
    await formula(p,quality,"DIVIDE(SUM('QA'[Passed]),SUM('QA'[Inspected]))","percent");
    await visual(p,"table",tableName,["Desks · Desk"],[total],[18,18,435,430]);
    await rule(p,tableName);
    await visual(p,"matrix",gridName,["Desks · Zone","Desks · Desk"],[total],[472,18,505,430]);
    await rule(p,gridName);
    await save(p);
  });
  await studio(async p=>{
    await open(p,title);
    const grid=art(p,gridName),table=art(p,tableName);
    const matrixValue=path=>grid.locator(`tr[data-path='${JSON.stringify(path)}'] td:not([data-row-level])`).last();
    for (const [path,rows] of [[[],inspections],[["North"],inspections.filter(r=>r.i<17)],
        [["South"],inspections.filter(r=>r.i>=17)]]) {
      assert.equal(await matrixValue(path).locator("[data-icon-band]").getAttribute("data-icon-band"),band(ratio(rows)));
    }
    assert.equal(await matrixValue([]).innerText(),"$52,800.00");
    assert.equal(await grid.locator(`tr[data-path='["South","Desk 33"]']`).count(),0);
    const seen=[];
    for (let page=0;page<2;page++) {
      for (const tr of await table.locator("tbody tr").all()) {
        const cells=tr.locator("td"),i=Number((await cells.first().innerText()).slice(4));
        assert.equal(await cells.count(),2);
        assert.equal(await cells.last().textContent(),new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(i*100));
        const rate=ratio(inspections.filter(r=>r.i===i));
        assert.deepEqual(await cells.last().locator("[data-icon-band]").evaluateAll(icons=>icons.map(el=>el.dataset.iconBand)),rate==null?[]:[band(rate)]);
        assert.equal(await cells.last().getAttribute("data-cell-tone"),rate==null || rate===0.5?null:rate<0.5?"below":"above");
        seen.push(i);
      }
      if (!page) {await table.getByRole("button",{name:"Next"}).click(); await settled(p);}
    }
    assert.deepEqual(seen,desks.slice(0,32));
    await table.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    const downloading=p.waitForEvent("download");
    await p.getByRole("button",{name:"Download chart data"}).click();
    const exported=(await readFile(await (await downloading).path(),"utf8")).trim().split(/\r?\n/);
    assert.equal(exported.length,8);
    assert.equal(exported[0],'"Desk","Received dollars"');
    assert.equal(exported.at(-1),'"Desk 32","3200"');
    await p.getByLabel("Base colors on").selectOption({label:"QA · Passed"});
    await settled(p);
    await p.getByLabel("Color source aggregation").selectOption("max"); await settled(p);
    await setInput(p,"[data-cell-setting=threshold]",8);
    assert.equal(await table.locator("tbody tr").last().locator("td").last().getAttribute("data-cell-tone"),"above");
    await editFormula(p,quality); await p.getByLabel("Measure name").fill("Accepted percentage");
    await p.getByRole("button",{name:"Save measure"}).click();
    await p.locator(".rail [data-action=report]").click(); await settled(p);
    assert.match(await matrixValue([]).locator("[data-icon-band]").getAttribute("aria-label"),/Accepted percentage/);
    await table.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Base colors on").selectOption({label:"Accepted percentage"}); await settled(p);
    await p.getByLabel("Background style").selectOption("gradient");
    await setInput(p,"[data-cell-setting=scale-min]",0);
    await setInput(p,"[data-cell-setting=scale-max]",100);
    await p.getByLabel("Minimum color",{exact:true}).fill("#ffffff");
    await p.getByLabel("Maximum color",{exact:true}).fill("#000000");
    assert.equal(await p.getByLabel("Use a center color").isChecked(),false);
    await save(p);
  });
  await studio(async p=>{
    await open(p,title);
    const table=art(p,tableName);
    const previous=table.getByRole("button",{name:"Previous",exact:true});
    if (await previous.isEnabled()) {await previous.click(); await settled(p);}
    for (let page=0;page<2;page++) {
      for (const tr of await table.locator("tbody tr").all()) {
        const i=Number((await tr.locator("td").first().textContent()).slice(4));
        const rate=ratio(inspections.filter(r=>r.i===i));
        const cell=tr.locator("td").last();
        const color=await cell.evaluate(td=>td.style.backgroundColor);
        if (rate==null) assert.equal(color,"");
        else {
          const channel=Math.round(255-255*rate);
          assert.equal(color,`rgb(${channel}, ${channel}, ${channel})`);
          if (rate===1) assert.equal(await cell.evaluate(td=>getComputedStyle(td).color),"rgb(255, 255, 255)");
        }
      }
      if (!page) {await table.getByRole("button",{name:"Next"}).click(); await settled(p);}
    }
    await table.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    assert.equal(await p.getByLabel("Maximum value (%)",{exact:true}).inputValue(),"100");
    await setInput(p,"[data-cell-setting=scale-max]",0);
    assert.equal(await p.getByLabel("Maximum value (%)",{exact:true}).inputValue(),"100");
  });
}
