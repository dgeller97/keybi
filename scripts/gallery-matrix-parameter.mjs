import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {defineParameter} from "./imported-field-parameter.mjs";

const pageName = "Dispatch hierarchy", parameter = "Dispatch row levels", matrix = "Revenue and orders by selected levels";
const revenueCard = "Revenue for branch", orderCard = "Orders for branch";
const tab = p => p.getByRole("button",{name:pageName,exact:true});
const row = (grid,path) => grid.locator(`tr[data-path='${JSON.stringify(path)}']`);
await studio(async p => {
  await open(p,"Visual Gallery");
  if (await tab(p).count()) {
    await tab(p).click();
    await settled(p);
    await art(p,matrix).locator(".vhead strong").click();
    await p.locator("[data-tab=Format]").click();
    if (await p.getByLabel("Matrix layout",{exact:true}).inputValue() === "tabular") return;
    await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
    await p.locator('[data-page="0"]').click();
    await save(p);
    return;
  }
  await addPage(p,pageName);
  await defineParameter(p,parameter,["Dispatch · Region","Dispatch · Channel"],"Dispatch · Region",true,"dimension",true);
  await p.locator("[data-tab=Format]").click();
  await position(p,[20,20,398,115]);
  await visual(p,"card",revenueCard,[],["Dispatch revenue"],[433,20,322,115]);
  await visual(p,"card",orderCard,[],["Dispatch orders"],[770,20,205,115]);
  await visual(p,"matrix",matrix,[parameter],["Dispatch revenue","Dispatch orders"],[20,152,955,395]);
  await art(p,parameter).getByLabel("Channel",{exact:true}).check();
  await settled(p);
  const grid = art(p,matrix);
  await grid.getByRole("button",{name:"Collapse East",exact:true}).click();
  await settled(p);
  await art(p,matrix).locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Row subtotal position").selectOption("top");
  await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const lines = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const header = lines.shift().split(",");
const transactions = lines.map(line => Object.fromEntries(line.split(",").map((v,i) => [header[i],v])));
await studio(async p => {
  await open(p,"Visual Gallery");
  await tab(p).click();
  await settled(p);
  const grid = art(p,matrix), selector = art(p,parameter), checks = [];
  async function check(levels,collapsed=[]) {
    assert.deepEqual(await grid.locator("th[data-row-level]").allTextContents(),levels);
    const totals = new Map();
    for (const t of transactions) for (let i=0;i<=levels.length;i++) {
      const path = levels.slice(0,i).map(k => t[k]), key = JSON.stringify(path);
      if (path.length > 1 && collapsed.includes(path[0])) continue;
      const [rev,orders] = totals.get(key) || [0,0];
      totals.set(key,[rev+Number(t.Revenue),orders+Number(t.Orders)]);
    }
    const actual = await grid.locator("tbody tr").evaluateAll(rows => rows.map(tr => [tr.dataset.path,[...tr.querySelectorAll("td:not([data-row-level])")].map(td => td.textContent)]));
    const headers = await grid.locator("tbody tr").evaluateAll(rows => rows.map(tr => [...tr.querySelectorAll("td[data-row-level]")].map(td => td.textContent)));
    assert.equal(actual.length,totals.size);
    for (const [index,[key,values]] of actual.entries()) {
      const path = JSON.parse(key);
      const labels = levels.map((_,i) => !path.length && !i ? "Grand total" : path[i] ?? "");
      if (path.length && path.length < levels.length) labels[path.length-1] += " subtotal";
      assert.deepEqual(headers[index],labels);
      const [r,o] = totals.get(key);
      assert.deepEqual(values,["$"+r.toLocaleString("en-US")+".00",String(o)]);
    }
    checks.push({levels,collapsed,headers,rows:Object.fromEntries(actual)});
  }
  await check(["Region","Channel"],["East"]);
  assert.deepEqual(await grid.locator("tbody tr").evaluateAll(rows => rows.map(tr => JSON.parse(tr.dataset.path))),
    [["East"],["West"],["West","Online"],["West","Retail"],[]]);
  await capture(p,"gallery-tabular-matrix");
  await grid.getByRole("button",{name:"Expand East",exact:true}).click();
  await settled(p);
  await check(["Region","Channel"]);
  await row(grid,["West","Online"]).getByRole("button",{name:"$478.00"}).click();
  await settled(p);
  assert.equal(await art(p,revenueCard).locator(".kpi").innerText(),"$478.00");
  assert.equal(await art(p,orderCard).locator(".kpi").innerText(),"33");
  await selector.getByRole("button",{name:"Move Channel earlier"}).click();
  await settled(p);
  await check(["Channel","Region"]);
  assert.equal(await row(grid,["Online","West"]).getByRole("button",{name:"$478.00"}).getAttribute("aria-pressed"),"true");
  assert.equal(await art(p,revenueCard).locator(".kpi").innerText(),"$478.00");
  await selector.getByLabel("Region",{exact:true}).uncheck();
  await settled(p);
  await check(["Channel"]);
  assert.equal(await art(p,revenueCard).locator(".kpi").innerText(),"$1,731.00");
  await writeFile("portfolio-evidence/gallery-tabular-matrix.json",JSON.stringify({url:await currentPageLink(p),checks},null,2)+"\n");
});
