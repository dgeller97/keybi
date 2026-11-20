import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {checkFreeze,measureFreeze} from "./matrix-freeze.mjs";

const name = "Dispatch by period", matrix = "Monthly dispatch by region and channel";
const revenue = "Dispatch revenue in selection", orders = "Orders in selection";
const tab = p => p.getByRole("button",{name,exact:true});
await studio(async p => {
  await open(p,"Visual Gallery");
  if (await tab(p).count()) return;
  await addPage(p,name);
  await visual(p,"matrix",matrix,["Dispatch · Region","Dispatch · Channel"],
    ["Dispatch revenue","Dispatch orders"],[20,25,610,379]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=columns]").selectOption({label:"Dispatch · Period"});
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
  await p.getByLabel("Wrap row headers").uncheck();
  await visual(p,"card",revenue,[],["Dispatch revenue"],[650,25,325,180]);
  await visual(p,"card",orders,[],["Dispatch orders"],[650,224,325,180]);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const [heading,...csv] = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const names=heading.split(",");
const ledger=csv.map(line => Object.fromEntries(line.split(",").map((value,i) => [names[i],value])));
await studio(async p => {
  await open(p,"Visual Gallery");
  await tab(p).click();
  await settled(p);
  const grid=art(p,matrix);
  await grid.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  const wrap=p.getByLabel("Wrap row headers");
  assert.equal(await wrap.isChecked(),false);
  const heights=() => grid.locator("tbody tr").evaluateAll(rows => rows.map(tr => [tr.dataset.path,tr.offsetHeight]));
  const singleLine=await heights();
  await wrap.check();
  const wrapped=await heights();
  assert.ok(wrapped.at(-1)[1]>singleLine.at(-1)[1]);
  await wrap.uncheck();
  assert.deepEqual(await heights(),singleLine);
  const comparison=await checkFreeze(p,grid);
  const records=ledger.filter(t => t.Region==="West" && t.Channel==="Online");
  const total=key => records.reduce((sum,r) => sum+Number(r[key]),0);
  const amount="$"+total("Revenue").toFixed(2);
  const leaf=grid.locator(`tr[data-path='["West","Online"]']`);
  await leaf.getByRole("button",{name:amount,exact:true}).click();
  await settled(p);
  assert.equal(await art(p,revenue).locator(".kpi").innerText(),amount);
  assert.equal(await art(p,orders).locator(".kpi").innerText(),String(total("Orders")));
  assert.equal(await leaf.getByRole("button",{name:amount,exact:true}).getAttribute("aria-pressed"),"true");
  const selected=await measureFreeze(grid);
  assert.ok(selected.scrollLeft>0 && selected.aligned && selected.labelsVisible.every(Boolean));
  await capture(p,"gallery-frozen-matrix");
  await writeFile("portfolio-evidence/gallery-frozen-matrix.json",JSON.stringify({
    url:await currentPageLink(p),...comparison,selected,amount,orders:total("Orders"),singleLine,wrapped
  },null,2)+"\n");
});
