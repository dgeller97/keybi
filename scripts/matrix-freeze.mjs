import assert from "node:assert/strict";
import {art,settled} from "./portfolio-ui.mjs";

// Hit-test the painted headings and labels, including the intersection of
// the sticky header bands. Bounds alone would miss another cell covering them.
export async function measureFreeze(grid) {
  return grid.locator(".vbody").evaluate(async body => {
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const rect = el => el.getBoundingClientRect();
    const headers = [...body.querySelectorAll("th[data-row-level]")];
    const bandBottom = rect(body.querySelector("thead")).bottom;
    const leaf = [...body.querySelectorAll("tbody tr:not(.matrix-total,.matrix-sub)")].find(tr =>
      rect(tr).top >= bandBottom-1 && rect(tr).bottom <= rect(body).bottom);
    if (!leaf) throw Error("No visible detail row beneath the pinned bands");
    const labels = [...leaf.querySelectorAll("[data-row-level]")];
    const visible = el => {
      const r = rect(el), x = (r.left+r.right)/2, y = (r.top+r.bottom)/2;
      return el.contains(document.elementFromPoint(x,y));
    };
    return {
      scrollLeft:body.scrollLeft, scrollTop:body.scrollTop, viewportWidth:body.clientWidth,
      headings:headers.map(th => th.textContent), path:JSON.parse(leaf.dataset.path),
      headersVisible:headers.map(visible), labelsVisible:labels.map(visible),
      aligned:headers.every((th,i) => Math.abs(rect(th).left-rect(labels[i]).left)<1 &&
        (!i || Math.abs(rect(th).left-rect(headers[i-1]).right)<1)),
      leadingEdge:rect(headers[0]).left-rect(body).left,
      labels:labels.map(td => td.textContent)
    };
  });
}

export async function checkFreeze(p,grid) {
  const toggle = p.getByLabel("Freeze row headers",{exact:true});
  assert.ok(await toggle.isChecked());
  await grid.locator(".vbody").evaluate(body => {
    const details=body.querySelectorAll("tbody tr:not(.matrix-total,.matrix-sub)");
    body.scrollTo(body.scrollWidth,details[details.length-1].offsetTop-body.querySelector("thead").offsetHeight-8);
  });
  const frozen = await measureFreeze(grid);
  assert.ok(frozen.scrollLeft>0 && Math.abs(frozen.leadingEdge)<1 && frozen.aligned && frozen.headersVisible.every(Boolean) &&
    frozen.labelsVisible.every(Boolean), JSON.stringify(frozen));
  let queryRequests=0;
  const count = req => { if (new URL(req.url()).pathname === "/api/query") queryRequests++; };
  p.on("request",count);
  try {
    await toggle.uncheck();
    const unfrozen = await measureFreeze(grid);
    assert.equal(unfrozen.scrollLeft,frozen.scrollLeft);
    assert.equal(unfrozen.scrollTop,frozen.scrollTop);
    assert.ok(unfrozen.headersVisible.some(seen => !seen), JSON.stringify(unfrozen));
    await toggle.check();
    const restored = await measureFreeze(grid);
    assert.deepEqual(restored,frozen);
    assert.equal(queryRequests,0);
    return {frozen,unfrozen,queryRequests};
  } finally { p.off("request",count); }
}

export async function benchmarkFreeze(p,truth) {
  const grid=art(p,"Revenue by product levels");
  await art(p,"Product hierarchy").getByLabel("Category",{exact:true}).uncheck();
  await settled(p);
  await grid.locator(".vhead strong").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-pick=groups]").selectOption({label:"Product · ProductKey"});
  await p.locator("[data-pick=columns]").selectOption({label:"Product · Category"});
  await settled(p);
  await p.locator("[data-tab=Format]").click();
  await p.getByLabel("Matrix layout",{exact:true}).selectOption("tabular");
  const categories=[...truth.map.keys()].sort();
  const rows=await grid.locator("tbody tr").evaluateAll(items => items.map(tr => [
    JSON.parse(tr.dataset.path),[...tr.cells].slice(2).map(td => td.textContent)
  ]));
  const money=new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  assert.equal(rows.length,truth.products.size*2+1);
  assert.deepEqual((await grid.locator("thead tr").first().locator("th").allTextContents()).slice(2),[...categories,"Total"]);
  for (const [path,values] of rows) {
    const id=Number(path[0]?.split(" ")[1]);
    if (path.length===2) assert.equal(Number(path[1]),id);
    const amount=path.length ? truth.products.get(id) : truth.tot[0];
    const category=String.fromCharCode(65+(id-1)%12);
    const expected=categories.map(key => !path.length ? money.format(truth.map.get(key)[0]/100)
      : key===category ? money.format(amount/100) : "—");
    assert.deepEqual(values,[...expected,money.format(amount/100)]);
  }
  const comparison=await checkFreeze(p,grid);
  const wrap=p.getByLabel("Wrap row headers",{exact:true}), wrapChanges=[];
  let queryRequests=0;
  const count=req => { if (new URL(req.url()).pathname === "/api/query") queryRequests++; };
  p.on("request",count);
  try {
    for (const enabled of [false,true,false,true]) {
      const timing=wrap.evaluate(el => new Promise(resolve => el.addEventListener("change",() => {
        const start=performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()-start)));
      },{once:true})));
      await wrap.setChecked(enabled);
      const ms=await timing;
      const pin=await checkFreeze(p,grid);
      assert.equal(pin.frozen.aligned,true);
      assert.equal(await grid.locator("tbody tr").last().locator("td").last().textContent(),money.format(truth.tot[0]/100));
      wrapChanges.push({enabled,ms,scrollLeft:pin.frozen.scrollLeft});
    }
    assert.equal(queryRequests,0);
  } finally { p.off("request",count); }
  return {rows:rows.length,valueColumns:categories.length+1,checkedValues:rows.length*(categories.length+1),
    ...comparison,wrapChanges,formattingQueries:queryRequests};
}
