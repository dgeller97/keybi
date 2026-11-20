import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {addPage,art,open,position,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {defineParameter} from "./imported-field-parameter.mjs";
import {formula} from "./formula-check.mjs";

const parameter = "Compare measures", chart = "Desk performance", table = "Desk results";
const title = "Desk comparisons", billed = "Billed", margin = "Net yield";
const rows = (p,name) => art(p,name).locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
async function toggle(p,member,checked) {
  await art(p,parameter).getByLabel(member,{exact:true}).setChecked(checked);
  await settled(p);
}
export async function verifyMultiMeasure() {
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,title,"Which desk leads on billing and yield?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Claims.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Desk,Channel,Amount,Net\nEast,Online,100,40\nEast,Retail,300,30\nWest,Retail,900,90\n")});
    await p.getByTitle("Claims.Amount",{exact:true}).waitFor();
    await formula(p,billed,"SUM('Claims'[Amount])","currency");
    await formula(p,margin,"DIVIDE(SUM('Claims'[Net]),SUM('Claims'[Amount]))","percent");
    await defineParameter(p,parameter,[billed,margin],margin,true,"measure",true);
    await p.locator("[data-tab=Format]").click();
    await position(p,[18,18,430,112]);
    await defineParameter(p,"Analyze by",["Claims · Desk","Claims · Channel"],"Claims · Channel",true,"dimension");
    await p.locator("[data-tab=Format]").click();
    await position(p,[470,18,430,112]);
    await visual(p,"table",table,["Analyze by"],[parameter],[565,145,410,240]);
    await visual(p,"clusteredColumn",chart,["Analyze by"],[parameter],[18,145,530,300]);
    await visual(p,"matrix","Totals",["Claims · Desk"],[parameter],[18,466,530,235]);
    await visual(p,"card","First selected measure",[],[parameter],[565,466,410,125]);
    await toggle(p,billed,true);
    assert.deepEqual(await rows(p,table),[["Online","40%","$100.00"],["Retail","10%","$1,200.00"]]);
    await art(p,"Analyze by").getByRole("combobox").selectOption({label:"Desk"});
    await settled(p);
    assert.deepEqual(await art(p,table).locator("th").allTextContents(),["Desk",margin,billed]);
    assert.deepEqual(await rows(p,table),[["East","17.5%","$400.00"],["West","10%","$900.00"]]);
    assert.deepEqual(await art(p,"Totals").locator("tr.matrix-total td").allTextContents(),["Grand total","12.31%","$1,300.00"]);
    assert.equal(await art(p,"First selected measure").locator(".kpi").innerText(),"12.31%");
    await art(p,table).getByRole("button",{name:billed,exact:true}).click();
    await settled(p);
    assert.deepEqual(await rows(p,table),[["West","10%","$900.00"],["East","17.5%","$400.00"]]);
    await p.locator("[data-tab=Format]").click();
    const download = p.waitForEvent("download");
    await p.locator("[data-action=export-csv]").click();
    const csv = (await readFile(await (await download).path(),"utf8")).trim().split(/\r?\n/);
    assert.deepEqual(csv,['"Desk","Net yield","Billed"','"West","0.1","900"','"East","0.175","400"']);
    await art(p,chart).locator('[data-point][aria-label^="Desk West · Billed:"]').press("Enter");
    await settled(p);
    assert.deepEqual(await rows(p,table),[["West","10%","$900.00"]]);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("West with both measures");
    await p.locator("dialog button[type=submit]").click();
    await save(p);
  });
  await studio(async p => {
    await open(p,title);
    assert.equal(await art(p,"Analyze by").locator("option:checked").innerText(),"Desk");
    assert.deepEqual(await rows(p,table),[["West","10%","$900.00"]]);
    assert.equal(await art(p,table).locator('th[aria-sort="descending"]').innerText(),billed);
    await toggle(p,margin,false);
    assert.deepEqual(await rows(p,table),[["West","$900.00"]]);
    assert.equal(await art(p,"First selected measure").locator(".kpi").innerText(),"$900.00");
    await toggle(p,margin,true);
    assert.deepEqual(await rows(p,table),[["West","$900.00","10%"]]);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"West with both measures"}).click();
    await settled(p);
    assert.deepEqual(await rows(p,table),[["West","10%","$900.00"]]);
    await art(p,chart).getByRole("button",{name:"Clear selection"}).click();
    await settled(p);
    await toggle(p,billed,false);
    await art(p,parameter).getByLabel(margin,{exact:true}).press("Space");
    await settled(p);
    assert.deepEqual(await art(p,table).locator("th").allTextContents(),["Desk",billed,margin]);
    assert.deepEqual(await rows(p,table),[["West","$900.00","10%"],["East","$400.00","17.5%"]]);
  });
  console.log("Multi-measure table sorting, clustered series, weighted matrix totals, CSV, clearing, bookmarks and reopening passed.");
}

export async function benchmarkMultiMeasure(p,byCategory) {
  const revenue = "Billed revenue", ratio = "Margin";
  await addPage(p,"Side-by-side comparison");
  await defineParameter(p,parameter,[revenue,ratio],revenue,true,"measure",true);
  await p.locator("[data-tab=Format]").click();
  await position(p,[18,18,440,110]);
  await visual(p,"table",table,["Product · Category"],[parameter],[565,145,410,360]);
  await visual(p,"clusteredColumn",chart,["Product · Category"],[parameter],[18,145,530,300]);
  const control = art(p,parameter);
  const selection = [revenue], records = [];
  const currency = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  const percent = new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  for (const member of [ratio,revenue,revenue,ratio,ratio,revenue]) {
    const index = selection.indexOf(member);
    if (index < 0) selection.push(member);
    else selection.splice(index,1);
    await control.getByLabel(member,{exact:true}).evaluate(el => el.addEventListener("change",() => {window.multiStart=performance.now();},{once:true}));
    await control.getByLabel(member,{exact:true}).press("Space");
    await settled(p);
    const observed = await p.evaluate(async ({chart,table}) => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const ms = performance.now()-window.multiStart;
      const article = name => document.querySelector('article[aria-label="'+name+'"]');
      return {ms,marks:[...article(chart).querySelectorAll("[data-point]")].map(el => [el.getAttribute("aria-label"),Number(el.dataset.value)]),
        headings:[...article(table).querySelectorAll("th")].map(el => el.textContent),
        rows:[...article(table).querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.textContent))};
    },{chart,table});
    assert.deepEqual(observed.headings,["Category",...selection]);
    assert.equal(observed.marks.length,byCategory.size*selection.length);
    const expected = [];
    for (const [group,[r,n]] of [...byCategory].sort(([a],[b]) => a.localeCompare(b))) {
      const row = [group];
      for (const m of selection) {
        const value = m === revenue ? r/100 : n/r;
        const formatted = (m === revenue ? currency : percent).format(value);
        const mark = observed.marks.find(([label]) => label === "Category "+group+" · "+m+": "+formatted);
        assert.ok(mark && Math.abs(mark[1]-value) < 1e-6);
        row.push(formatted);
      }
      expected.push(row);
    }
    assert.deepEqual(observed.rows,expected);
    records.push({selection:[...selection],ms:observed.ms,marks:observed.marks.length,rows:expected.length});
  }
  return records;
}
