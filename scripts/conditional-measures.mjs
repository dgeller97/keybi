import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {art,open,rename,save,setInput,settled,studio,visual} from "./portfolio-ui.mjs";
import {checkCallout} from "./card-fit.mjs";
import {formula,editFormula} from "./formula-check.mjs";

export async function verifyConditionalMeasures() {
  const title="Posted amounts and estimates", table="Posting review";
  const csv=(name,data)=>({name:name+".csv",mimeType:"text/csv",buffer:Buffer.from(data)});
  const guarded="IF(ISBLANK([Posted]), BLANK(), [Posted] - SUM('Estimate'[Amount]))";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click(); await rename(p,title,"Which estimates have a posting?");
    const picker=p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles([csv("Desk","ID,Desk\n1,Credit\n2,Missing\n3,Posted\n4,Zero\n5,Unused\n"),
      csv("Entry","ID,Amount\n1,-10\n3,60\n3,40\n4,0\n"),csv("Estimate","ID,Amount\n1,5\n2,70\n3,90\n4,20\n")]);
    await p.getByTitle("Estimate.Amount",{exact:true}).waitFor();
    for (const fact of ["Entry","Estimate"]) {
      await p.locator(".ribbon [data-action=relationship]").click();
      await p.getByLabel("One-side key").selectOption({label:"Desk · ID"});
      await p.getByLabel("Many-side key").selectOption({label:fact+" · ID"});
      await p.locator("dialog button[type=submit]").click(); await p.locator("dialog").waitFor({state:"hidden"});
    }
    await formula(p,"Posted","SUM('Entry'[Amount])");
    await formula(p,"Posting variance",guarded);
    await formula(p,"Posting code","IF([Posted] == 0, 7, IF([Posted] = 0, -1, 1))");
    await formula(p,"Positive posting","IF([Posted] > 0, [Posted])");
    await formula(p,"All desks","CALCULATE([Posting variance], REMOVEFILTERS('Desk'[Desk]))");
    await formula(p,"Matched total","SUMX(VALUES('Desk'[Desk]), [Posting variance])");
    await formula(p,"Sum of desk averages","SUMX(VALUES('Desk'[Desk]), CALCULATE(AVERAGE('Entry'[Amount])))");
    await visual(p,"matrix",table,["Desk · Desk"],["Posted","Posting variance","Posting code","Positive posting","All desks","Matched total","Sum of desk averages"],[18,18,970,448]);
    await formula(p,"Reserved funds","-1234567890.75","currency");
    await visual(p,"card","Reserve",[],["Reserved funds"],[18,476,300,120]);
    await setInput(p,"#card-text-size",37);
    await save(p);
  });
  const expected=[
    ["Credit","-10","-15","1","—","-95","-15","-10"],["Missing","—","—","-1","—","-95","—","—"],
    ["Posted","100","10","1","100","-95","10","50"],["Unused","—","—","-1","—","-95","—","—"],
    ["Zero","0","-20","7","—","-95","-20","0"],["Grand total","90","-95","1","90","-95","-25","40"]
  ];
  await studio(async p=>{
    await open(p,title);
    const card=art(p,"Reserve");
    await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    assert.equal(await p.getByLabel("Maximum text size (px)").inputValue(),"37");
    const initial=await checkCallout(card);
    assert.equal(initial.value,"-$1,234,567,890.75");
    await setInput(p,'[data-dim="w"]',160); await settled(p);
    assert.ok((await checkCallout(card)).fontSize<initial.fontSize);
    await setInput(p,'[data-dim="w"]',600); await settled(p);
    assert.equal((await checkCallout(card)).fontSize,37);
    const rows=()=>art(p,table).locator("tbody tr").evaluateAll(trs=>trs.map(tr=>[...tr.cells].map(td=>td.textContent.trim())));
    assert.deepEqual(await rows(),expected);
    await editFormula(p,"Posted"); await p.getByLabel("Measure name").fill("Booked amount");
    await p.getByRole("button",{name:"Save measure"}).click();
    await p.locator(".rail [data-action=report]").click(); await settled(p);
    assert.deepEqual(await rows(),expected);
    await editFormula(p,"Posting variance");
    assert.equal(await p.getByLabel("DAX expression").inputValue(),guarded.replaceAll("[Posted]","[Booked amount]"));
    await p.getByLabel("DAX expression").fill("IF(ISBLANK([Booked amount]), 99, )");
    await p.getByRole("button",{name:"Save measure"}).click();
    assert.ok(await p.locator("dialog [role=alert]").innerText());
    await p.keyboard.press("Escape");
    await p.locator(".rail [data-action=report]").click(); await settled(p);
    assert.deepEqual(await rows(),expected);
  });
  await studio(async p=>{
    await open(p,title);
    const card=art(p,"Reserve");
    await card.locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    const picker=p.locator('[data-pick="references"]'), well=p.locator('[data-well="references"]');
    await picker.selectOption({label:"Matched total"}); await settled(p);
    await picker.selectOption({label:"Entry · Amount"}); await settled(p);
    await well.getByLabel("Aggregation").selectOption("max"); await settled(p);
    const caption=well.locator("[data-reference-caption]").last();
    let queries=0;
    const count=req=>{if(new URL(req.url()).pathname==="/api/query") queries++;};
    p.on("request",count);
    await caption.fill('Largest "posting"'); await caption.press("Tab");
    assert.equal(queries,0); p.off("request",count);
    await well.locator(".wellrow").last().locator('[data-move-field="-1"]').click(); await settled(p);
    assert.deepEqual(await card.locator(".card-references dd").allTextContents(),["60","-25"]);
    await p.locator("[data-tab=Format]").click();
    const format=p.getByLabel("Number format for Matched total",{exact:true});
    await format.selectOption("currency");
    assert.deepEqual(await card.locator(".card-references dd").allTextContents(),["60","-$25.00"]);
    const download=p.waitForEvent("download");
    await p.getByRole("button",{name:"Download chart data"}).click();
    const csv=(await readFile(await (await download).path(),"utf8")).trim().split(/\r?\n/);
    assert.deepEqual(csv,['"Reserved funds","Largest ""posting""","Matched total"','"-1234567890.75","60","-25"']);
    await save(p);
  });
  await studio(async p=>{
    await open(p,title);
    const card=art(p,"Reserve");
    assert.deepEqual(await card.locator(".card-references dt,.card-references dd").allTextContents(),['Largest "posting"',"60","Matched total","-$25.00"]);
    await card.locator(".vhead").click(); await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="table"]').click(); await settled(p);
    assert.deepEqual(await card.locator("tbody td").allTextContents(),["-$1,234,567,890.75","60","-$25.00"]);
    await p.locator('[data-kind="card"]').click(); await settled(p);
    assert.deepEqual(await card.locator(".card-references dd").allTextContents(),["60","-$25.00"]);
    await p.locator('[data-remove-field="references:0"]').click(); await settled(p);
    assert.deepEqual(await card.locator(".card-references dd").allTextContents(),["-$25.00"]);
    assert.equal(await card.locator(".kpi").innerText(),"-$1,234,567,890.75");
    await formula(p,"Posting coverage","DIVIDE([Posted], SUM('Estimate'[Amount]))","percent");
    await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Apply to measure").selectOption({label:"Reserved funds"});
    await p.getByLabel("Set text color by value").check();
    await p.getByLabel("Base colors on").selectOption({label:"Posting coverage"}); await settled(p);
    assert.equal(await p.getByLabel("Rule threshold (%)",{exact:true}).count(),1);
    let queries=0;
    const count=req=>{if(new URL(req.url()).pathname==="/api/query") queries++;};
    p.on("request",count);
    await setInput(p,"[data-cell-setting=threshold]",50);
    await p.getByLabel("Below threshold",{exact:true}).fill("#773300");
    await p.getByLabel("Above threshold",{exact:true}).fill("#224466");
    assert.equal(queries,0); p.off("request",count);
    assert.equal(await card.locator(".kpi").evaluate(el=>el.style.color),"rgb(119, 51, 0)");
    const file=p.waitForEvent("download");
    await p.getByRole("button",{name:"Download chart data"}).click();
    assert.equal((await readFile(await (await file).path(),"utf8")).trim().split(/\r?\n/)[0],'"Reserved funds","Matched total"');
    for(const [desk,color] of [["Posted","rgb(34, 68, 102)"],["Missing",""],["Zero","rgb(119, 51, 0)"]]) {
      const row=art(p,table).locator(`tr[data-path='["${desk}"]']`);
      await row.locator("td:not([data-row-level])").first().getByRole("button").click(); await settled(p);
      assert.equal(await card.locator(".kpi").evaluate(el=>el.style.color),color);
    }
  });
}
