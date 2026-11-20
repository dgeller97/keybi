import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";

async function trend(p) {
  await open(p,"Visual Gallery");
  await p.getByRole("button",{name:"Trends",exact:true}).click();
  await settled(p);
  const chart=art(p,"Revenue and order volume");
  await chart.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  return chart;
}
const revenue=p => p.getByLabel("Number format for Revenue",{exact:true});
await studio(async p => {
  await trend(p);
  if (await revenue(p).inputValue()==="currency") return;
  await revenue(p).selectOption("currency");
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const [header,...lines]=(await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const fields=header.split(","), sums=new Map();
for (const line of lines) {
  const values=line.split(","), month=values[fields.indexOf("Period")];
  const pair=sums.get(month) || [0,0];
  pair[0]+=Number(values[fields.indexOf("Revenue")]); pair[1]+=Number(values[fields.indexOf("Orders")]);
  sums.set(month,pair);
}
await studio(async p => {
  const chart=await trend(p);
  assert.equal(await revenue(p).inputValue(),"currency");
  const labels=() => chart.locator("[data-point]").evaluateAll(ms => ms.map(m => m.getAttribute("aria-label")));
  const marks=await labels(), axes=await chart.locator("svg text").allTextContents();
  for (const [month,[amount,orders]] of sums) {
    assert.ok(marks.includes(`Period ${month} · Revenue: $${amount.toFixed(2)}`));
    assert.ok(marks.includes(`Period ${month} · Orders: ${orders}`));
  }
  assert.ok(axes.some(t => /^\$\d/.test(t)) && axes.some(t => /^\d+$/.test(t)));
  let queryRequests=0;
  p.on("request",r => { if (new URL(r.url()).pathname==="/api/query") queryRequests++; });
  await revenue(p).selectOption("");
  assert.ok((await labels()).includes("Period 2026-03-01 · Revenue: 732"));
  await revenue(p).selectOption("currency");
  assert.deepEqual(await labels(),marks);
  assert.equal(queryRequests,0);
  await capture(p,"gallery-combo-formats");
  await writeFile("portfolio-evidence/gallery-combo-formats.json",JSON.stringify({
    url:await currentPageLink(p),marks,axes,queryRequests
  },null,2)+"\n");
});
