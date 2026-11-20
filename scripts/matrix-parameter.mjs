import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,open,position,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {defineParameter} from "./imported-field-parameter.mjs";
import {formula} from "./formula-check.mjs";

const parameter = "Group levels", matrix = "Yield by branch", title = "Booking hierarchy";
const branch = (grid,path) => grid.locator(`tr[data-path='${JSON.stringify(path)}']`);
async function act(p,locator) { await locator.click(); await settled(p); }
async function positionSelected(p,box) {
  await p.locator("[data-tab=Format]").click();
  await position(p,box);
}
export async function verifyMatrixParameter() {
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,title,"Compare booking yield by site and route");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Bookings.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Site,Route,Sales,Profit\nNorth,Web,100,40\nNorth,Rail,300,30\nSouth,Rail,900,90\nSouth,Web,100,10\n")});
    await p.getByTitle("Bookings.Site",{exact:true}).waitFor();
    await defineParameter(p,parameter,["Bookings · Site","Bookings · Route"],"Bookings · Site",true,"dimension",true);
    await positionSelected(p,[18,18,430,105]);
    await formula(p,"Yield","DIVIDE(SUM('Bookings'[Profit]),SUM('Bookings'[Sales]))","percent");
    await visual(p,"matrix",matrix,[parameter],["Yield"],[18,146,470,300]);
    await visual(p,"matrix","Pivoted yield",[],["Yield"],[500,146,475,300]);
    await p.locator("[data-tab=Build]").click();
    await p.locator("[data-pick=columns]").selectOption({label:parameter});
    await visual(p,"card","Selected yield",[],["Yield"],[500,18,475,105]);
    await visual(p,"clusteredBar","Sales detail",[parameter],["Bookings · Sales"],[18,459,600,280]);
    const levels = art(p,parameter), grid = art(p,matrix), pivot = art(p,"Pivoted yield"), chart = art(p,"Sales detail");
    await act(p,levels.getByLabel("Route",{exact:true}));
    await act(p,chart.getByRole("button",{name:"Expand all down one level"}));
    const point = chart.locator('[data-point][aria-label^="Site North, Route Web"]');
    assert.equal(await point.getAttribute("data-value"),"100");
    await point.press("Enter");
    await settled(p);
    assert.equal(await art(p,"Selected yield").locator(".kpi").innerText(),"40%");
    await act(p,chart.getByRole("button",{name:"Clear selection"}));
    assert.equal(await branch(grid,[]).locator("td").last().innerText(),"12.14%");
    assert.equal(await branch(grid,["North"]).locator("td").last().innerText(),"17.5%");
    await act(p,pivot.getByRole("button",{name:"Collapse South"}));
    await act(p,grid.getByRole("button",{name:"Collapse South"}));
    assert.equal(await branch(grid,["South","Web"]).count(),0);
    await act(p,branch(grid,["North","Web"]).getByRole("button",{name:"40%"}));
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("North web with south collapsed");
    await p.locator("dialog button[type=submit]").click();
    await act(p,levels.getByRole("button",{name:"Move Route earlier"}));
    assert.equal(await branch(grid,["Web","North"]).locator('[aria-pressed="true"]').innerText(),"40%");
    assert.equal(await grid.getByRole("button",{name:"Expand South"}).count(),0);
    await save(p);
  });
  await studio(async p => {
    await open(p,title);
    const grid = art(p,matrix), pivot = art(p,"Pivoted yield");
    assert.equal(await grid.locator("th").first().innerText(),"Route / Site");
    assert.equal(await branch(grid,["Web","North"]).locator('[aria-pressed="true"]').innerText(),"40%");
    assert.equal(await art(p,"Selected yield").locator(".kpi").innerText(),"40%");
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await act(p,p.getByRole("button",{name:"North web with south collapsed"}));
    assert.equal(await grid.locator("th").first().innerText(),"Site / Route");
    assert.equal(await branch(grid,["North","Web"]).locator('[aria-pressed="true"]').innerText(),"40%");
    assert.equal(await grid.getByRole("button",{name:"Expand South"}).count(),1);
    await act(p,grid.getByRole("button",{name:"Clear selection"}));
    assert.equal(await pivot.getByRole("button",{name:"Expand South"}).count(),1);
    assert.deepEqual(await pivot.locator("tr.matrix-total td").allTextContents(),["Grand total","10%","40%","17.5%","10%","12.14%"]);
    const chart = art(p,"Sales detail");
    await chart.locator(".vhead strong").click();
    await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="table"]').click();
    await settled(p);
    assert.deepEqual(await chart.locator("th").allTextContents(),["Site","Route","Sales"]);
    await act(p,art(p,parameter).getByRole("button",{name:"Move Route earlier"}));
    assert.deepEqual(await chart.locator("th").allTextContents(),["Route","Site","Sales"]);
  });
  console.log("Imported matrix row and column hierarchies, weighted subtotals, expanded chart selection, order, bookmarks and restart passed.");
}

export async function benchmarkMatrixHierarchy(p,truth,dir) {
  const name = "Product hierarchy", result = "Revenue by product levels";
  await addPage(p,"Product hierarchy");
  await defineParameter(p,name,["Product · Category","Product · Product"],"Product · Category",true,"dimension",true);
  await positionSelected(p,[18,18,480,105]);
  await visual(p,"matrix",result,[name],["Billed revenue"],[18,144,940,400]);
  const selector = art(p,name), grid = art(p,result), records = [];
  const productRows = (await readFile(join(dir,"Product.csv"),"utf8")).trim().split(/\r?\n/).slice(1);
  const products = productRows.map(line => {
    const [id,category,product] = line.split(",");
    return {category,product,cents:truth.products.get(Number(id))};
  });
  const money = cents => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
  for (const action of ["add","reverse","restore","remove","add","reverse"]) {
    const button = action === "add" || action === "remove" ? selector.getByLabel("Product",{exact:true})
      : selector.getByRole("button",{name:"Move "+(action === "reverse" ? "Product" : "Category")+" earlier"});
    await button.evaluate(el => el.addEventListener("click",() => {window.levelStart=performance.now();},{once:true}));
    await act(p,button);
    const data = await grid.evaluate(async el => {
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const ms = performance.now()-window.levelStart;
      return {ms,heading:el.querySelector("th").textContent,rows:[...el.querySelectorAll("tbody tr")].map(tr => [tr.dataset.path,tr.cells[1].textContent])};
    });
    const order = action === "reverse" ? ["product","category"] : action === "remove" ? ["category"] : ["category","product"];
    const expected = new Map();
    for (const prod of products) for (let depth=0;depth<=order.length;depth++) {
      const key = JSON.stringify(order.slice(0,depth).map(k => prod[k]));
      expected.set(key,(expected.get(key)||0)+prod.cents);
    }
    assert.equal(data.heading,order.map(k => k === "category" ? "Category" : "Product").join(" / "));
    assert.equal(data.rows.length,expected.size);
    for (const [key,value] of data.rows) { assert.equal(value,money(expected.get(key))); expected.delete(key); }
    assert.equal(expected.size,0);
    records.push({action,heading:data.heading,ms:data.ms,rows:data.rows.length});
  }
  return records;
}
