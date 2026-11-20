import assert from "node:assert/strict";
import {addPage,art,open,position,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";

const report = "Claims comparison", parameter = "Claims metric", money = "Billed", ratio = "Net yield";
export async function defineParameter(p,name,members,initial,addSlicer=true,kind="measure",multiple=false) {
  await p.locator(".ribbon [data-action=new-parameter]").click();
  const d = p.locator("dialog");
  await d.getByLabel("Parameter name").fill(name);
  await d.getByLabel("Parameter type").selectOption(kind);
  for (const member of members) await d.getByLabel(member,{exact:true}).check();
  await d.getByLabel(kind === "dimension" ? "Default column" : "Default measure").selectOption({label:initial});
  if (multiple) await d.getByLabel("Allow readers to select multiple "+(kind === "dimension" ? "columns" : "measures")).check();
  await d.getByLabel("Add a slicer to this page").setChecked(addSlicer);
  await d.getByRole("button",{name:"Create parameter"}).click();
  await settled(p);
}
async function bookmark(p,name,create) {
  await p.locator(".ribbon [data-action=bookmarks]").click();
  if (create) {
    await p.getByLabel("New bookmark name").fill(name);
    await p.locator("dialog button[type=submit]").click();
  } else await p.getByRole("button",{name,exact:true}).click();
  await settled(p);
}
const rows = p => art(p,"By desk").locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
const choice = p => p.locator("article [data-parameter-choice]");
const top = p => art(p,"Highest desk").locator("[data-point]");
export async function verifyFieldParameter() {
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,report,"Which desk ranks first on the selected measure?");
    const file = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await file).setFiles({name:"Claims.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Desk,Amount,Net\nEast,100,40\nEast,300,30\nWest,900,90\n"
    )});
    await p.getByTitle("Claims.Amount",{exact:true}).waitFor();
    await formula(p,money,"SUM('Claims'[Amount])","currency");
    await formula(p,ratio,"DIVIDE(SUM('Claims'[Net]),SUM('Claims'[Amount]))","percent");
    await defineParameter(p,parameter,[money,ratio],ratio,false);
    await visual(p,"parameterSlicer","Compare",[],[],[18,18,260,110]);
    await visual(p,"table","By desk",["Claims · Desk"],[parameter],[340,18,590,216]);
    await visual(p,"clusteredColumn","Highest desk",["Claims · Desk"],[parameter],[18,250,610,285]);
    await p.locator("[data-tab=Build]").click();
    await p.locator("#rank-order").selectOption("desc");
    await p.locator("#rank-limit").fill("1");
    await p.locator("#rank-limit").press("Tab");
    await settled(p);
    assert.deepEqual(await rows(p),[["East","17.5%"],["West","10%"]]);
    assert.match(await top(p).getAttribute("aria-label"),/Desk East.*17.5%/);
    await bookmark(p,"Yield comparison",true);
    await top(p).press("Enter");
    await settled(p);
    assert.deepEqual(await rows(p),[["East","17.5%"]]);
    await choice(p).selectOption({label:money});
    await settled(p);
    assert.match(await top(p).getAttribute("aria-label"),/Desk West.*\$900\.00/);
    assert.deepEqual(await rows(p),[["East","$400.00"],["West","$900.00"]]);
    await top(p).press("Enter");
    await settled(p);
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.equal(await choice(p).locator("option:checked").innerText(),money);
    assert.deepEqual(await rows(p),[["West","$900.00"]]);
    await bookmark(p,"Yield comparison",false);
    assert.equal(await choice(p).locator("option:checked").innerText(),ratio);
    assert.deepEqual(await rows(p),[["East","17.5%"],["West","10%"]]);
    await formula(p,"Net dollars","SUM('Claims'[Net])","currency");
    await art(p,"Compare").locator(".vhead strong").click();
    await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Edit parameter",exact:true}).click();
    await p.getByLabel("Parameter name").fill("Performance measure");
    await p.getByLabel(ratio,{exact:true}).uncheck();
    await p.getByLabel("Net dollars",{exact:true}).check();
    await p.getByLabel("Default measure").selectOption({label:money});
    await p.getByRole("button",{name:"Save parameter"}).click();
    await settled(p);
    assert.equal(await choice(p).locator("option:checked").innerText(),money);
    assert.deepEqual(await rows(p),[["East","$400.00"],["West","$900.00"]]);
    await addPage(p,"Claim totals");
    await visual(p,"parameterSlicer","Measure",[],[],[18,18,280,100]);
    await visual(p,"card","All desks",[],["Performance measure"],[330,18,450,160]);
    await choice(p).selectOption({label:"Net dollars"});
    await settled(p);
    assert.equal(await art(p,"All desks").locator(".kpi").innerText(),"$160.00");
    await bookmark(p,"Yield comparison",false);
    assert.equal(await choice(p).locator("option:checked").innerText(),"Net dollars");
    assert.deepEqual(await rows(p),[["East","$70.00"],["West","$90.00"]]);
    await save(p);
  });
  await studio(async p => {
    await open(p,report);
    assert.deepEqual(await rows(p),[["East","$70.00"],["West","$90.00"]]);
    await p.locator("#pages .page").filter({hasText:"Claim totals"}).click();
    await settled(p);
    assert.equal(await choice(p).locator("option:checked").innerText(),"Net dollars");
    assert.equal(await art(p,"All desks").locator(".kpi").innerText(),"$160.00");
  });
  console.log("A blank imported report retained a nondefault choice, restored a bookmarked percentage and reranked both measures. Editing the member list and synchronizing two pages survived reopening.");
}

export async function benchmarkParameter(p,byCategory) {
  const selectorName = "Sales metric", revenue = "Billed revenue", margin = "Margin";
  const chartName = "Categories by selected metric", tableName = "Category detail", cardName = "Selected metric total";
  await addPage(p,"Revenue and margin comparison");
  await formula(p,revenue,"SUM('Sales'[Revenue])","currency");
  await defineParameter(p,selectorName,[revenue,margin],revenue);
  await p.locator("[data-tab=Format]").click();
  await position(p,[18,18,300,110]);
  await visual(p,"card",cardName,[],[selectorName],[340,18,610,110]);
  await visual(p,"clusteredColumn",chartName,["Product · Category"],[selectorName],[18,146,600,330]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("#rank-order").selectOption("desc");
  await visual(p,"table",tableName,["Product · Category"],[selectorName],[640,146,320,360]);
  const selector = art(p,selectorName).getByRole("combobox"), chart = art(p,chartName);
  const all = [...byCategory.values()].reduce(([r,p],[rr,pp]) => [r+rr,p+pp],[0,0]);
  const cols = [...byCategory.keys()].sort(), records = [];
  const currency = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  const percent = new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:2});
  for (const [i,member] of [margin,revenue,margin,revenue,margin,revenue,margin,revenue].entries()) {
    if (i === 4) {
      await chart.locator('[data-point][aria-label^="Category A "]').press("Enter");
      await settled(p);
    }
    await selector.evaluate(el => el.addEventListener("change",() => {window.parameterStart=performance.now();},{once:true}));
    await selector.selectOption({label:member});
    await settled(p);
    const {ms,marks,rows,header,card} = await p.evaluate(async ({chartName,tableName,cardName}) => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const ms = performance.now()-window.parameterStart;
      const article = name => document.querySelector('article[aria-label="'+name+'"]');
      return {ms,marks:[...article(chartName).querySelectorAll("[data-point]")].map(m => [
        m.getAttribute("aria-label").match(/^Category (\w+)/)[1],Number(m.dataset.value)
      ]),rows:[...article(tableName).querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.textContent)),
        header:article(tableName).querySelector("th:last-child").textContent,card:article(cardName).querySelector(".kpi").textContent};
    },{chartName,tableName,cardName});
    const value = ([r,p]) => member === revenue ? r/100 : p/r;
    const format = pair => (member === revenue ? currency : percent).format(value(pair));
    const ranked = [...byCategory].sort((a,b) => value(b[1])-value(a[1]));
    assert.deepEqual(marks.map(([name]) => name),ranked.map(([name]) => name));
    for (const [name,n] of marks) assert.ok(Math.abs(n-value(byCategory.get(name))) < 1e-6);
    assert.equal(header,member);
    assert.deepEqual(rows,(i >= 4 ? ["A"] : cols).map(k => [k,format(byCategory.get(k))]));
    assert.equal(card,format(i >= 4 ? byCategory.get("A") : all));
    assert.ok(Number.isFinite(ms));
    records.push({member,selected:i>=4 ? "A" : null,ms,marks:marks.length,tableRows:rows.length,total:card});
  }
  return records;
}
