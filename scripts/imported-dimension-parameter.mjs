import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {addPage,art,open,position,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {defineParameter} from "./imported-field-parameter.mjs";

export async function verifyDimensionParameter() {
  const title = "Bookings by desk or service", name = "Break down by";
  const selector = p => art(p,name).getByRole("combobox");
  const rows = p => art(p,"Amounts").locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
  await studio(async p => {
    await p.locator("#home [data-action=new]").click();
    await rename(p,title,"How do bookings compare by desk and service?");
    const chooser = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Bookings.csv",mimeType:"text/csv",buffer:Buffer.from(
      "Desk,Service,Amount\nSouth,Rail,10\nNorth,Rail,20\nNorth,Bus,40\n")});
    await p.getByTitle("Bookings.Desk",{exact:true}).waitFor();
    await defineParameter(p,name,["Bookings · Service","Bookings · Desk"],"Bookings · Desk",true,"dimension");
    await visual(p,"table","Amounts",[name],["Bookings · Amount"],[500,180,465,220]);
    await visual(p,"clusteredColumn","Booked",["Bookings · Desk"],["Bookings · Amount"],[18,180,460,300]);
    await p.locator("[data-tab=Build]").click();
    await p.getByTitle(name,{exact:true}).dragTo(p.locator("[data-well=groups] .wellrow"));
    await settled(p);
    assert.equal(await p.locator("[data-well=groups] .bound-name span").innerText(),name);
    await art(p,"Booked").locator('[data-point][aria-label^="Desk North"]').press("Enter");
    await settled(p);
    assert.deepEqual(await rows(p),[["North","60"]]);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByLabel("New bookmark name").fill("North bookings");
    await p.locator("dialog button[type=submit]").click();
    await selector(p).selectOption({label:"Service"});
    await settled(p);
    assert.deepEqual(await rows(p),[["Bus","40"],["Rail","30"]]);
    await save(p);
  });
  await studio(async p => {
    await open(p,title);
    assert.equal(await selector(p).locator("option:checked").innerText(),"Service");
    assert.deepEqual(await rows(p),[["Bus","40"],["Rail","30"]]);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:"North bookings",exact:true}).click();
    await settled(p);
    assert.equal(await selector(p).locator("option:checked").innerText(),"Desk");
    assert.deepEqual(await rows(p),[["North","60"]]);
    assert.equal(await art(p,"Booked").locator('[data-point][aria-label^="Desk North"]').getAttribute("aria-pressed"),"true");
    await art(p,"Booked").locator('[data-point][aria-label^="Desk North"]').press("Enter");
    await settled(p);
    assert.deepEqual(await rows(p),[["North","60"],["South","10"]]);
  });
}

export async function benchmarkDimension(p,truth,dir) {
  const name = "Analyze sales by", chart = "Highest revenue groups", table = "Sales breakdown";
  await addPage(p,"Product and calendar comparison");
  await defineParameter(p,name,["Product · Category","Date · Date"],"Product · Category",true,"dimension");
  await p.locator("[data-tab=Format]").click();
  await position(p,[18,18,320,108]);
  await visual(p,"clusteredBar",chart,[name],["Billed revenue"],[18,145,540,345]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("#rank-order").selectOption("desc");
  await p.locator("#rank-limit").fill("5");
  await p.locator("#rank-limit").press("Tab");
  await visual(p,"table",table,[name],["Billed revenue"],[575,145,390,380]);
  const calendar = (await readFile(join(dir,"Date.csv"),"utf8")).trim().split(/\r?\n/).slice(1);
  const daily = new Map(calendar.map(line => {
    const [key,date] = line.split(",");
    return [date,truth.daily.get(Number(key))];
  }).filter(([,pair]) => pair));
  const currency = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
  const control = art(p,name).getByRole("combobox"), records = [];
  for (const member of ["Date","Category","Date","Category","Date","Category"]) {
    await control.evaluate(el => el.addEventListener("change",() => {window.groupStarted=performance.now();},{once:true}));
    await control.selectOption({label:member});
    await settled(p);
    const {ms,marks,head,rows} = await p.evaluate(async ({chart,table}) => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const ms = performance.now()-window.groupStarted;
      const article = name => document.querySelector('article[aria-label="'+name+'"]');
      return {ms,marks:[...article(chart).querySelectorAll("[data-point]")].map(m => [m.getAttribute("aria-label"),Number(m.dataset.value)]),
        head:article(table).querySelector("th").textContent,rows:[...article(table).querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.textContent))};
    },{chart,table});
    const values = member === "Date" ? daily : truth.map;
    const ranked = [...values].sort((a,b) => b[1][0]-a[1][0]).slice(0,5);
    assert.equal(head,member);
    assert.equal(marks.length,5);
    for (const [i,[key,[cents]]] of ranked.entries()) {
      assert.ok(marks[i][0].startsWith(member+" "+key+" "),marks[i][0]);
      assert.ok(Math.abs(marks[i][1]-cents/100) < 0.00001);
    }
    const expected = [...values.keys()].sort().slice(0,25);
    assert.deepEqual(rows,expected.map(k => [k,currency.format(values.get(k)[0]/100)]));
    records.push({member,ms,groups:values.size,top:ranked[0][0],rows:rows.length});
  }
  return records;
}
