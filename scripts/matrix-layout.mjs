import assert from "node:assert/strict";
import {addPage,art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
import {checkFreeze} from "./matrix-freeze.mjs";
import {dragWidth,editWidth,widths} from "./matrix-widths.mjs";
import {writeFile} from "node:fs/promises";

const title = "Booking statement", matrix = "Billings and yield";
const row = (grid,path) => grid.locator(`tbody tr[data-path='${JSON.stringify(path)}']`);
const labels = (grid,path) => row(grid,path).locator("td[data-row-level]").allTextContents();
const layout = p => p.getByLabel("Matrix layout",{exact:true});
async function format(p) {
  await art(p,matrix).locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
}
export async function verifyMatrixLayout() {
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,title,"Which desks and services account for billed revenue?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    const csv = "Area,Desk,Service,Year,Quarter,Amount,Net\nNorth,Central,Rail,2025,Q4,100,40\nNorth,Central,Rail,2026,Q1,300,30\nNorth,Central,Web,2026,Q1,200,20\nNorth,Remote,Rail,2026,Q2,0,0\nSouth,Central,Rail,2026,Q1,900,90\nSouth,Central,Web,2026,Q2,100,10\n";
    await (await picker).setFiles({name:"Bookings.csv",mimeType:"text/csv",buffer:Buffer.from(csv)});
    await p.getByTitle("Bookings.Area",{exact:true}).waitFor();
    await formula(p,"Billed","SUM('Bookings'[Amount])","currency");
    await formula(p,"Yield","DIVIDE(SUM('Bookings'[Net]),SUM('Bookings'[Amount]))","percent");
    await visual(p,"matrix",matrix,["Area","Desk","Service"].map(n => "Bookings · "+n),["Billed","Yield"],[18,132,950,400]);
    await p.locator("[data-tab=Build]").click();
    for (const c of ["Year","Quarter"]) await p.locator("[data-pick=columns]").selectOption({label:"Bookings · "+c});
    await p.getByLabel("Heading for Area",{exact:true}).fill("Market");
    await p.getByLabel("Heading for Area",{exact:true}).press("Tab");
    await visual(p,"card","Selected billings",[],["Billed"],[18,18,380,105]);
    const grid = art(p,matrix);
    await format(p);
    assert.deepEqual(await grid.locator("th[data-row-level]").allTextContents(),["Market / Desk / Service"]);
    let requests = 0;
    const countQuery = r => { if (new URL(r.url()).pathname === "/api/query") requests++; };
    p.on("request",countQuery);
    await layout(p).selectOption("outline");
    assert.equal(await p.getByLabel("Row subtotal position").inputValue(),"top");
    assert.deepEqual(await labels(grid,["South","Central","Rail"]),["","","Rail"]);
    await p.getByLabel("Row subtotal position").selectOption("bottom");
    assert.deepEqual(await labels(grid,["South","Central","Rail"]),["South","Central","Rail"]);
    assert.deepEqual(await labels(grid,["South","Central","Web"]),["","","Web"]);
    await layout(p).selectOption("tabular");
    assert.deepEqual(await grid.locator("th[data-row-level]").allTextContents(),["Market","Desk","Service"]);
    assert.deepEqual(await grid.locator("th[data-row-level]").evaluateAll(ths => ths.map(th => th.rowSpan)),[3,3,3]);
    assert.deepEqual(await labels(grid,["South","Central","Web"]),["South","Central","Web"]);
    assert.deepEqual(await labels(grid,[]),["Grand total","",""]);
    await p.getByLabel("Repeat parent labels").uncheck();
    assert.deepEqual(await labels(grid,["South","Central","Web"]),["","","Web"]);
    await p.getByLabel("Repeat parent labels").check();
    await p.getByLabel("Hierarchy subtotals").uncheck();
    assert.deepEqual(await labels(grid,["North","Central"]),["North","Central",""]);
    await p.getByLabel("Hierarchy subtotals").check();
    assert.equal(requests,0);
    p.off("request",countQuery);
    assert.deepEqual((await row(grid,[]).locator("td").allTextContents()).slice(-2),["$1,600.00","11.88%"]);
    assert.deepEqual((await row(grid,["North"]).locator("td").allTextContents()).slice(-2),["$600.00","15%"]);
    await grid.getByRole("button",{name:"Collapse North",exact:true}).click();
    await settled(p);
    // Select the actual year/quarter leaf, whose billed amount also equals its subtotal.
    const fiscalCell = row(grid,["South","Central","Rail"]).locator("[data-matrix-pick]").filter({hasText:"$900.00"});
    const key = await fiscalCell.evaluateAll(items => items.map(el => el.dataset.matrixPick).find(raw => JSON.parse(raw).length === 5));
    assert.ok(key);
    await fiscalCell.and(grid.locator(`[data-matrix-pick='${key}']`)).click();
    await settled(p);
    assert.equal(await art(p,"Selected billings").locator(".kpi").innerText(),"$900.00");
    await save(p);
  });
  await studio(async p => {
    await open(p,title);
    const grid = art(p,matrix);
    assert.deepEqual(await grid.locator("th[data-row-level]").allTextContents(),["Market","Desk","Service"]);
    assert.deepEqual(await labels(grid,["South","Central","Rail"]),["South","Central","Rail"]);
    assert.equal(await grid.getByRole("button",{name:"Expand North",exact:true}).count(),1);
    assert.equal(await art(p,"Selected billings").locator(".kpi").innerText(),"$900.00");
    await format(p);
    for (const mode of ["outline","compact","tabular"]) {
      await layout(p).selectOption(mode);
      assert.equal(await row(grid,["South","Central","Rail"]).locator('[aria-pressed="true"]').first().innerText(),"$900.00");
    }
    const height = p.locator("[data-dim=h]");
    await height.fill("205"); await height.press("Tab");
    await settled(p);
    const pinned = await grid.locator(".vbody").evaluate(async body => {
      body.scrollTop = body.scrollHeight;
      await new Promise(requestAnimationFrame);
      const headers = [...body.querySelectorAll("thead tr")].map(tr => tr.getBoundingClientRect());
      return {scrolled:body.scrollTop,top:headers[0].top-body.getBoundingClientRect().top,
        stacked:headers.slice(1).every((r,i) => r.top >= headers[i].bottom-1)};
    });
    assert.ok(pinned.scrolled > 0 && Math.abs(pinned.top) < 12 && pinned.stacked,JSON.stringify(pinned));
    const width = p.locator("[data-dim=w]");
    await width.fill("470"); await width.press("Tab");
    await height.fill("265"); await height.press("Tab");
    await settled(p);
    const comparison = await checkFreeze(p,grid);
    assert.ok(comparison.frozen.scrollTop > 0);
    assert.deepEqual(comparison.frozen.labels,comparison.frozen.path);
    const selectedValue=await row(grid,["South","Central","Rail"]).getByRole("button",{name:"$900.00",pressed:true}).evaluate(async cell => {
      const body=cell.closest(".vbody"), rect=el => el.getBoundingClientRect();
      const tr=cell.closest("tr"), labels=[...tr.querySelectorAll("[data-row-level]")];
      const scale=rect(body).width/body.offsetWidth, band=rect(body.querySelector("thead")).height;
      const pinnedWidth=labels.reduce((sum,td) => sum+rect(td).width,0);
      const x=rect(cell).left+rect(cell).width/2, y=rect(cell).top+rect(cell).height/2;
      body.scrollBy((x-rect(body).left-(rect(body).width+pinnedWidth)/2)/scale,
        (y-rect(body).top-band-rect(cell).height)/scale);
      await new Promise(requestAnimationFrame);
      const hit=el => { const r=rect(el); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); };
      const lastBand=rect(body.querySelector("thead tr:last-child"));
      const heading=document.elementFromPoint(rect(cell).x+rect(cell).width/2,lastBand.y+lastBand.height/2);
      return {amount:cell.textContent,heading:heading?.textContent,visible:hit(cell),labels:labels.filter(hit).map(td => td.textContent),
        scrollLeft:body.scrollLeft,scrollTop:body.scrollTop};
    });
    assert.deepEqual(selectedValue.labels,["South","Central","Rail"]);
    assert.ok(selectedValue.visible && selectedValue.heading==="Billed" && selectedValue.amount==="$900.00",JSON.stringify(selectedValue));
    assert.ok(await p.getByLabel("Wrap row headers").isChecked());
    await p.getByLabel("Wrap row headers").uncheck();
    const singleLine = await checkFreeze(p,grid);
    assert.deepEqual(singleLine.frozen.headings,comparison.frozen.headings);
    assert.equal(await grid.locator("td[data-row-level]").first().evaluate(td => getComputedStyle(td).whiteSpace),"nowrap");
    await p.getByLabel("Freeze row headers").uncheck();
    const original = await widths(grid);
    const billed = "2026 / Q1 / Billed";
    await editWidth(p,billed,132);
    assert.deepEqual(await widths(grid),{...original,[billed]:132});
    await grid.locator(".vbody").evaluate(body => body.scrollTo(0,0));
    await dragWidth(p,grid,"Market",27);
    assert.equal((await widths(grid)).Market,original.Market+27);
    await save(p);
    await writeFile("portfolio-evidence/booking-matrix-freeze.json",JSON.stringify({...comparison,selectedValue},null,2)+"\n");
  });
  await studio(async p => {
    await open(p,title);
    await format(p);
    assert.equal(await p.getByLabel("Freeze row headers").isChecked(),false);
    assert.equal(await p.getByLabel("Wrap row headers").isChecked(),false);
    assert.equal(await art(p,"Selected billings").locator(".kpi").innerText(),"$900.00");
    const grid = art(p,matrix), billed = "2026 / Q1 / Billed";
    const reopened=await widths(grid);
    assert.equal(reopened[billed],132);
    await p.getByLabel("Freeze row headers").check();
    await grid.getByRole("button",{name:"Collapse 2026",exact:true}).click();
    await settled(p);
    assert.equal((await widths(grid))[billed],undefined);
    await grid.getByRole("button",{name:"Expand 2026",exact:true}).click();
    await settled(p);
    assert.equal((await widths(grid))[billed],132);
    await checkFreeze(p,grid);
    await editWidth(p,billed,null);
    const reset=await widths(grid);
    assert.ok(reset[billed]!==132 && reset.Market===reopened.Market);
    await grid.locator('th[data-column-label="Market"] .matrix-width-grip').dblclick();
    assert.ok((await widths(grid)).Market<reopened.Market);
    await addPage(p,"Yearly billings");
    await visual(p,"combo","Amount and yield",["Bookings · Year"],["Bookings · Amount"],[18,134,920,365],"currency");
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=other]").selectOption({label:"Yield"});
    await settled(p);
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Number format for Yield").selectOption("auto");
    const chart=art(p,"Amount and yield");
    const mark=value => chart.locator(`[data-point][aria-label="${value}"]`);
    assert.equal(await mark("Year 2025 · Yield: 40%").count(),1);
    assert.equal(await mark("Year 2026 · Amount: $1,500.00").count(),1);
    await p.locator("[data-tab=Build]").click();
    for (const kind of ["clusteredColumn","combo"]) {
      await p.locator(`[data-kind="${kind}"]`).click();
      await settled(p);
      assert.equal(await mark("Year 2026 · Yield: 10%").count(),1);
    }
    await visual(p,"card","Year billings",[],["Billed"],[18,18,380,105]);
    await mark("Year 2026 · Yield: 10%").click();
    await settled(p);
    await save(p);
  });
  await studio(async p => {
    await open(p,title);
    assert.equal(await art(p,"Year billings").locator(".kpi").innerText(),"$1,500.00");
    assert.equal(await art(p,"Amount and yield").locator('[aria-label="Year 2026 · Yield: 10%"][aria-pressed="true"]').count(),1);
  });
  console.log("Three row levels and two pivot levels kept their headings, amounts, selected cell and collapsed branch across layouts and reopen.");
}

export async function benchmarkMatrixLayout(p,truth) {
  // The preceding hierarchy workload finishes with Product above Category.
  const grid = art(p,"Revenue by product levels");
  await grid.locator(".vhead strong").click();
  await p.locator("[data-tab=Format]").click();
  assert.deepEqual(await grid.locator("th[data-row-level]").allTextContents(),["Product / Category"]);
  let queries = 0;
  const count = r => { if (new URL(r.url()).pathname === "/api/query") queries++; };
  p.on("request",count);
  const records = [], money = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  try {
    for (const mode of ["tabular","outline","compact","tabular","outline","compact"]) {
      await layout(p).evaluate(el => el.addEventListener("change",() => {window.layoutStart=performance.now();},{once:true}));
      await layout(p).selectOption(mode);
      const data = await grid.evaluate(async el => {
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
        const ms = performance.now()-window.layoutStart;
        return {ms,headers:[...el.querySelectorAll("th[data-row-level]")].map(th => th.textContent),
          rows:[...el.querySelectorAll("tbody tr")].map(tr => [JSON.parse(tr.dataset.path),[...tr.cells].map(td => td.textContent)])};
      });
      assert.deepEqual(data.headers,mode === "compact" ? ["Product / Category"] : ["Product","Category"]);
      assert.equal(data.rows.length,truth.products.size*2+1);
      const seen = new Set();
      for (const [path,cells] of data.rows) {
        const id = Number(path[0]?.split(" ")[1]), cents = path.length ? truth.products.get(id) : truth.tot[0];
        assert.equal(cells.pop(),money.format(cents/100));
        if (path.length === 2) assert.equal(path[1],String.fromCharCode(65+(id-1)%12));
        const caption = path.length === 2 ? path[1] : path.length ? path[0]+" subtotal" : "Grand total";
        const expected = mode === "compact" ? [caption] : path.length === 2 ? [mode === "tabular" ? path[0] : "",caption] : [caption,""];
        assert.deepEqual(cells,expected);
        seen.add(JSON.stringify(path));
      }
      assert.equal(seen.size,data.rows.length);
      records.push({mode,ms:data.ms,rows:data.rows.length,queryRequests:queries});
    }
    assert.equal(queries,0);
  } finally { p.off("request",count); }
  return records;
}
