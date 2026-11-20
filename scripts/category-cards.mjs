import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";

const cash = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const budgetLedger = JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
const dispatch = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/).slice(1).map(line=>line.split(","));
async function drag(p,field,card) {
  const button=p.getByTitle(field,{exact:true});
  const details=button.locator("xpath=ancestor::details[1]");
  if(!(await details.evaluate(el=>el.open))) await details.locator("summary").first().click();
  await button.dragTo(card.locator(".vbody"));
  await settled(p);
}
for (const budget of [true,false]) {
  const report=budget?"Budget vs. Actual":"Visual Gallery",page=budget?"Department cards":"Channel cards";
  const period=budget?"Period · Period":"Dispatch · Period",initial=budget?"2026-02":"2026-03-01";
  const value=budget?"Posted departments variance":"Dispatch revenue",title=budget?"Posted variance by department":"Revenue by region and channel";
  const refs=budget?[["Transaction · Actual","Actual"],["Forecast · Forecast","Forecast"]]:[["Dispatch · Orders","Orders"]];
  if(budget) await studio(async p=>{
    await open(p,report);
    await p.getByRole("button",{name:"Forecast review",exact:true}).click(); await settled(p);
    await art(p,"Forecast period").locator("select").selectOption({label:initial}); await settled(p);
    const card=art(p,value);
    assert.equal(await card.locator(".kpi").innerText(),"$28.00");
    await drag(p,"Department.Department",card);
    assert.deepEqual(await card.locator(".category-card").evaluateAll(tiles=>tiles.map(t=>[
      t.querySelector("button").textContent,t.querySelector(".kpi").textContent,t.querySelector("dt").textContent,t.querySelector("dd").textContent
    ])),[["Facilities","$3.00","Departments posted","1"],["Medicine","$25.00","Departments posted","1"],["Surgery","—","Departments posted","—"]]);
  });
  await studio(async p=>{
    await open(p,report);
    const original=await p.locator(".page.active").getAttribute("data-page");
    if(await p.getByRole("button",{name:page,exact:true}).count()) return;
    await addPage(p,page);
    await visual(p,"dropdown","Review period",[period],[],[18,18,260,115]);
    await visual(p,"card","Selection total",[],[value],[295,18,360,115]);
    await art(p,"Review period").locator("select").selectOption({label:initial}); await settled(p);
    await visual(p,"card",title,[],[value],[18,150,950,255]);
    const card=art(p,title);
    assert.equal(await card.locator(".kpi").innerText(),budget?"$28.00":"$732.00");
    await p.locator("[data-tab=Build]").click();
    for(const [field,caption] of refs) {
      await p.getByLabel("Reference labels",{exact:true}).selectOption({label:field});
      const input=p.locator("[data-reference-caption]").last();
      await input.fill(caption); await input.press("Tab");
    }
    for(const field of budget?["Department.Department"]:["Dispatch.Region","Dispatch.Channel"])
      await drag(p,field,card);
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Apply to measure").selectOption({label:value});
    await p.getByLabel("Set text color by value").check();
    if(!budget) await p.getByLabel("Base colors on").selectOption({label:"Variance from Online"});
    await p.getByLabel("Below threshold",{exact:true}).fill(budget?"#326a51":"#a63e31");
    await p.getByLabel("Above threshold",{exact:true}).fill(budget?"#a63e31":"#326a51");
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    const original=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    await art(p,title).locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Sort by",{exact:true}).selectOption("desc"); await settled(p);
    if(!budget) {
      await p.locator("[data-tab=Format]").click();
      await p.getByLabel("Cards per row",{exact:true}).selectOption("2");
      await setInput(p,"[data-dim=h]",320);
    }
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report); await p.getByRole("button",{name:page,exact:true}).click(); await settled(p);
    const card=art(p,title),select=art(p,"Review period").locator("select"),summary=art(p,"Selection total").locator(".kpi");
    const proof={page:await currentPageLink(p),periods:{}};
    for(const month of budget?Object.keys(budgetLedger):[...new Set(dispatch.map(row=>row[0]))]) {
      await select.selectOption({label:month}); await settled(p);
      const rows=await card.locator(".category-card").evaluateAll(tiles=>Object.fromEntries(tiles.map(tile=>[
        tile.querySelector("button").textContent,{amount:tile.querySelector(".kpi").textContent,color:tile.querySelector(".kpi").style.color,
          refs:[...tile.querySelectorAll("dd")].map(dd=>dd.textContent)}
      ])));
      const expected=budget?budgetLedger[month].departments:dispatch.filter(row=>row[0]===month);
      assert.equal(Object.keys(rows).length,expected.length);
      const ranked=Object.values(rows).map(row=>row.amount==="—"?-Infinity:Number(row.amount.replace(/[$,]/g,"")));
      assert.deepEqual(ranked,[...ranked].sort((a,b)=>b-a));
      for(const entry of expected) {
        const [label,amount,sign] = budget?[entry[0],entry[1]==null?null:entry[3],entry[1]==null?null:entry[3]]:
          [entry[1]+" › "+entry[2],+entry[4],entry[4]-expected.find(row=>row[1]===entry[1] && row[2]==="Online")[4]];
        const obs=rows[label];
        assert.equal(obs.amount,amount==null?"—":cash.format(amount));
        const red="rgb(166, 62, 49)",green="rgb(50, 106, 81)";
        assert.equal(obs.color,!sign?"":(sign>0)===budget?red:green);
        assert.deepEqual(obs.refs,budget?entry.slice(1,3).map(n=>n==null?"—":n.toLocaleString("en-US")):[entry[3]]);
      }
      proof.periods[month]=rows;
    }
    await select.selectOption({label:initial}); await settled(p);
    const label=budget?"Medicine":"West › Retail",pick=card.getByRole("button",{name:label,exact:true});
    await pick.focus(); await pick.press("Enter"); await settled(p);
    assert.equal(await pick.getAttribute("aria-pressed"),"true");
    assert.equal(await summary.innerText(),budget?"$25.00":"$143.00");
    await capture(p,budget?"budget-department-cards":"gallery-channel-cards");
    if(!budget) {
      await p.locator("[data-tab=Format]").click();
      const columns=p.getByLabel("Cards per row",{exact:true});
      assert.equal(await columns.inputValue(),"2");
      const shape=()=>card.locator(".category-card").evaluateAll(tiles=>{
        const tops=tiles.map(t=>t.offsetTop);
        return [...new Set(tops)].map(y=>tops.filter(top=>top===y).length);
      });
      let queries=0;
      const count=r=>{if(new URL(r.url()).pathname==="/api/query") queries++;};
      p.on("request",count);
      for(const [setting,expected] of [["2",[2,2]],["1",[1,1,1,1]],["",[4]],["2",[2,2]]]) {
        await columns.selectOption(setting); assert.deepEqual(await shape(),expected);
        assert.equal(await pick.getAttribute("aria-pressed"),"true");
      }
      p.off("request",count); assert.equal(queries,0);
      await setInput(p,"[data-dim=w]",260); await settled(p);
      assert.deepEqual(await shape(),[1,1,1,1]);
      await setInput(p,"[data-dim=w]",950); await settled(p);
      assert.deepEqual(await shape(),[2,2]);
      proof.layout={wide:[2,2],narrow:[1,1,1,1],layoutChangeQueries:queries};
      await p.locator("[data-tab=Build]").click();
      const down=p.locator('[data-well=groups] [data-move-field="1"]').first();
      await down.click(); await settled(p);
      assert.equal(await card.getByRole("button",{name:"Retail › West",exact:true}).getAttribute("aria-pressed"),"true");
      assert.equal(await summary.innerText(),"$143.00");
      await down.click(); await settled(p);
    }
    await pick.click(); await settled(p);
    assert.equal(await summary.innerText(),budget?"$28.00":"$732.00");
    assert.equal(await select.locator("option:checked").innerText(),initial);
    await card.locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await setInput(p,"#rank-limit",2); await settled(p);
    assert.deepEqual(await card.locator(".category-pick").allTextContents(),budget?["Medicine","Facilities"]:["West › Online","East › Retail"]);
    assert.equal(await card.getByRole("button",{name:"Next",exact:true}).count(),0);
    await p.getByLabel("Sort by",{exact:true}).selectOption("asc"); await settled(p);
    assert.deepEqual(await card.locator(".category-pick").allTextContents(),budget?["Facilities","Medicine"]:["West › Retail","East › Online"]);
    await setInput(p,"#rank-limit",""); await settled(p);
    await p.locator("[data-kind=table]").click(); await settled(p);
    assert.equal(await card.locator("tbody tr").count(),budget?3:4);
    await p.locator("[data-kind=card]").click(); await settled(p);
    assert.equal(await card.locator(".category-card").count(),budget?3:4);
    assert.equal(await card.locator(".category-card").first().locator("dd").count(),refs.length);
    await writeFile("portfolio-evidence/"+(budget?"budget":"gallery")+"-category-cards.json",JSON.stringify(proof,null,2)+"\n");
  });
}
