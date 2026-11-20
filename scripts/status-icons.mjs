import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,open,save,settled,studio} from "./portfolio-ui.mjs";

const reports=[
  {report:"Visual Gallery", page:"Channel comparison", visual:"Selected revenue compared with Online", measure:"Dispatch revenue", source:"Variance from Online", scope:"detail"},
  {report:"Budget vs. Actual", page:"Forecast review", visual:"Department forecast review", measure:"Actual", source:"Actual less forecast", scope:"all"}
];
for (const spec of reports) {
  const showPage=async p=>{
    await open(p,spec.report);
    const selected=await p.locator(".page.active").getAttribute("data-page");
    await p.getByRole("button",{name:spec.page,exact:true}).click();
    await settled(p);
    return selected;
  };
  const configure=async (p,measure=spec.measure)=>{
    await art(p,spec.visual).locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Apply to measure").selectOption({label:measure});
  };
  const budget=spec.report==="Budget vs. Actual";
  await studio(async p=>{
    const original=await showPage(p);
    await configure(p,spec.source);
    const previous=p.getByLabel("Show status icons"), migrated=await previous.isChecked();
    if (migrated) await previous.uncheck();
    await configure(p);
    const enabled=p.getByLabel("Show status icons");
    const color=p.getByLabel("Set background by value");
    if (budget && await enabled.isChecked() && await p.getByLabel("Base icons on").getByRole("option",{name:"Posted variance",exact:true}).count())
      spec.source="Posted variance";
    const colorReady=budget || (await color.isChecked() && await p.getByLabel("Base colors on").locator("option:checked").innerText()===spec.source);
    if (!migrated && colorReady && await enabled.isChecked() && await p.getByLabel("Base icons on").locator("option:checked").innerText()===spec.source &&
        await p.getByLabel("Icons apply to").inputValue()===spec.scope &&
        await p.getByLabel("Lower values are favorable").isChecked()===budget) return;
    await enabled.check();
    let queries=0;
    p.on("request",r=>{if (new URL(r.url()).pathname==="/api/query") queries++;});
    await p.getByLabel("Base icons on").selectOption({label:spec.source});
    await p.getByLabel("Icons apply to").selectOption(spec.scope);
    await p.getByLabel("Lower values are favorable").setChecked(budget);
    if (!budget) {
      await color.check();
      await p.getByLabel("Base colors on").selectOption({label:spec.source});
      await p.getByLabel("Color applies to").selectOption("detail");
      await p.getByLabel("Below threshold",{exact:true}).fill("#f6d7c8");
      await p.getByLabel("Above threshold",{exact:true}).fill("#d7eee3");
    }
    assert.equal(queries,0,"Already displayed source values should be reused");
    await p.locator(`[data-page="${original}"]`).click();
    await save(p);
  });
  await studio(async p=>{
    await showPage(p);
    const grid=art(p,spec.visual);
    const checks=await grid.locator("[data-icon-band]").evaluateAll(icons=>icons.map(icon=>({
      path:JSON.parse(icon.closest("tr").dataset.path),
      amount:icon.closest("td").textContent,band:icon.dataset.iconBand,
      fill:getComputedStyle(icon).backgroundColor,label:icon.getAttribute("aria-label"),
      width:icon.getBoundingClientRect().width, tone:icon.closest("td").dataset.cellTone ?? null
    })));
    if (budget) {
      const source=JSON.parse(await readFile("portfolio-evidence/cell-formatting.json","utf8")).forecast;
      const actual=["$1,273.00","$2,256.00","$3,270.00","$6,799.00"];
      assert.deepEqual(checks.map(c=>[c.path,c.amount,c.band]),
        source.map(([path,value,tone],i)=>[path,actual[i],tone==="above"?"high":"low"]));
      source.forEach(([,value],i)=>assert.ok(checks[i].label.includes(spec.source+" "+value)));
      for (const c of checks) assert.equal(c.fill,c.band==="high" ? "rgb(170, 64, 46)" : "rgb(32, 112, 78)");
    } else {
      assert.deepEqual(checks.map(c=>[c.path,c.amount,c.band]),[
        [["East","Online"],"$169.00","middle"],[["East","Retail"],"$180.00","high"],
        [["West","Online"],"$240.00","middle"],[["West","Retail"],"$143.00","low"]
      ]);
      assert.deepEqual(checks.map(c=>c.tone),[null,"above",null,"below"]);
    }
    for (const c of checks) assert.ok(c.width>5 && c.label);
    await capture(p,budget?"budget-variance-source":"gallery-variance-source");
    await configure(p);
    let queries=0;
    p.on("request",r=>{if (new URL(r.url()).pathname==="/api/query") queries++;});
    await p.getByLabel("Icons apply to").selectOption("totals");
    assert.equal(await grid.locator("[data-icon-band]").count(),budget?1:3);
    await p.getByLabel("Icon layout").selectOption("only");
    const first=grid.locator('[data-icon-layout="only"]').first();
    assert.ok(await first.getAttribute("title"));
    assert.equal(await first.locator(".cell-number").evaluate(el=>getComputedStyle(el).width),"1px");
    await p.getByLabel("Show status icons").uncheck();
    assert.equal(await grid.locator("[data-icon-band]").count(),0);
    assert.equal(queries,0);
    // Removing the source from Values keeps the example editable without a visible basis column.
    await p.getByLabel("Show status icons").check();
    await p.getByLabel("Base icons on").selectOption({label:spec.source});
    await p.getByLabel("Icons apply to").selectOption(spec.scope);
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-remove-field="metrics:2"]').click();
    await settled(p);
    assert.deepEqual(await grid.locator("[data-icon-band]").evaluateAll(icons=>icons.map(icon=>[
      icon.closest("td").textContent,icon.dataset.iconBand
    ])),checks.map(c=>[c.amount,c.band]));
    assert.equal(await grid.locator("th").filter({hasText:spec.source}).count(),0);
    await writeFile(`portfolio-evidence/${budget?"budget":"gallery"}-variance-source.json`,JSON.stringify({spec,checks,formattingQueries:0,hiddenSource:true},null,2)+"\n");
  });
  if (budget) await studio(async p=>{
    await showPage(p);
    const ledger=JSON.parse(await readFile("portfolio-evidence/budget-forecast.json","utf8"));
    const currency=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
    const matrix=art(p,spec.visual);
    for (const [month,{departments,totals}] of Object.entries(ledger)) {
      await art(p,"Forecast period").locator("select").selectOption({label:month});
      await settled(p);
      const rows=await matrix.locator("tbody tr").evaluateAll(trs=>trs.map(tr=>{
        const icon=tr.cells[1].querySelector("[data-icon-band]"),variance=tr.cells[3];
        return {path:JSON.parse(tr.dataset.path),actual:tr.cells[1].textContent,band:icon?.dataset.iconBand,
          label:icon?.getAttribute("aria-label"),variance:variance.textContent,background:getComputedStyle(variance).backgroundColor};
      }));
      for (const [i,[department,actual,,variance]] of [...departments,[null,...totals]].entries()) {
        const row=rows[i];
        assert.deepEqual(row.path,department?[department]:[]);
        assert.equal(row.actual,actual==null?"—":currency.format(actual));
        assert.equal(row.variance,currency.format(variance));
        if (spec.source==="Posted variance" && actual==null) assert.equal(row.band,undefined);
        else {
          assert.equal(row.band,variance===0?"middle":variance>0?"high":"low");
          assert.ok(row.label.includes(spec.source+" "+currency.format(variance)));
        }
      }
      if (month==="2026-01" && process.argv.includes("--capture-threshold-baseline")) {
        await configure(p,spec.source);
        const controls=await p.locator("[data-cell-setting]").evaluateAll(inputs=>inputs.map(el=>el.dataset.cellSetting));
        assert.equal(new Set(rows.slice(0,-1).map(row=>row.background)).size,1);
        await writeFile("portfolio-evidence/variance-gradient-baseline.json",JSON.stringify({month,rows,controls},null,2)+"\n");
      }
    }
  });
}
