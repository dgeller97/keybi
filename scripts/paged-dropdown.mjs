import assert from "node:assert/strict";
import {
  open,
  art,
  studio,
  visual,
  settled,
  rename,
  save,
  filter,
} from "./portfolio-ui.mjs";

export async function verifyPagedDropdown() {
  const report = "Depot lookup",
    selector = "Choose depot",
    total = "Units";
  const codes = Array.from(
    { length: 506 },
    (_, i) => "Depot-" + String(i + 1).padStart(3, "0"),
  );
  const chosen = codes.at(-1);
  async function check(p, label, amount) {
    await settled(p);
    assert.equal(await art(p, total).locator(".kpi").innerText(), amount);
    assert.equal(
      await art(p, selector).locator("option:checked").innerText(),
      label,
    );
  }
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, report, "Which depot is being inspected?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await picker
    ).setFiles({
      name: "Stock.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        ["Depot,Units,Zone", ...codes.map((code,i) => code + ",1,"+(i%2 ? "East" : "West")),",7,Pending","(Blank),-7,Pending"].join("\n"),
      ),
    });
    await p.locator("#data details[data-tree]").waitFor();
    await visual(p, "card", total, [], ["Stock · Units"], [20, 20, 240, 125]);
    await visual(
      p,
      "dropdown",
      selector,
      ["Stock · Depot"],
      [],
      [290, 20, 320, 190],
    );
    const chart = art(p, selector);
    await chart.getByRole("button", { name: "Next" }).click();
    await settled(p);
    await chart.locator("select").selectOption({ label: chosen });
    await check(p, chosen, "1");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, report);
    await check(p, chosen, "1");
    const chart = art(p, selector);
    await chart.getByRole("button", { name: "Next" }).click();
    await check(p, chosen, "1");
    assert.equal(
      await chart.getByRole("option", { name: chosen, exact: true }).count(),
      1,
    );
    await chart.getByRole("button", { name: "Previous" }).click();
    await check(p, chosen, "1");
    await chart.locator("select").selectOption({ label: "All" });
    await check(p, "All", "506");
    await chart.locator(".vhead").click();await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Show search box").check();await settled(p);
    const search=chart.getByRole("searchbox"),finding=chart.getByRole("option",{name:chosen,exact:true});
    await search.fill("bLaNk");await chart.getByRole("option",{name:"(Blank)",exact:true}).waitFor({state:"attached"});
    assert.deepEqual((await chart.locator("select option").allTextContents()).sort(),['"(Blank)"',"(Blank)","All"].sort());
    await chart.locator("select").selectOption({label:"(Blank)"});await check(p,"(Blank)","7");
    await chart.locator("select").selectOption({label:'"(Blank)"'});await check(p,'"(Blank)"',"-7");
    await chart.locator("select").selectOption({label:"All"});await check(p,"All","506");
    let releaseSlow,startedSlow;
    const waiting=new Promise(resolve=>{releaseSlow=resolve;}),started=new Promise(resolve=>{startedSlow=resolve;});
    await p.route("**/api/query",async route=>{
      const queries=route.request().postDataJSON().visuals;
      if (queries.some(q=>q.filters.some(f=>f.op==="contains" && f.value==="depot-1"))) {
        assert.equal(queries.length,1);
        startedSlow();await waiting;
      }
      await route.continue();
    });
    await search.fill("depot-1");await started;await search.fill("Ot-50");
    try {await finding.waitFor({state:"attached"});} finally {releaseSlow();}
    await settled(p);
    assert.equal(await chart.locator("select option").count(),8);
    assert.equal(await search.evaluate(el=>el===document.activeElement),true);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"506");
    await chart.locator("select").selectOption({label:chosen});await check(p,chosen,"1");
    await search.fill("unknown");await chart.getByText("No matching values").waitFor();
    await check(p,chosen,"1");await save(p);
    await p.reload();await search.waitFor();await check(p,chosen,"1");assert.equal(await search.inputValue(),"");
    await chart.locator("[data-clear]").click();await settled(p);
    await chart.locator(".vhead").click();await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="list"]').click();await settled(p);
    await search.fill("Ot-50");await chart.getByRole("button",{name:chosen,exact:true}).click();await settled(p);
    await search.fill("t-00");await chart.getByRole("button",{name:codes[0],exact:true}).click({modifiers:["Control"]});
    await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"2");
    await p.locator("[data-tab=Format]").click();await p.getByLabel("Show search box").uncheck();
    await settled(p);assert.equal(await search.count(),0);assert.equal(await art(p,total).locator(".kpi").innerText(),"2");
    await chart.locator("[data-clear]").click();await settled(p);
    await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="dropdown"]').click();await settled(p);
    await filter(p,"page","Stock · Zone","East");assert.equal(await art(p,total).locator(".kpi").innerText(),"253");
    await chart.locator(".vhead").click();await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Select multiple values").check();await p.getByLabel("Show search box").check();await settled(p);
    const choose=chart.locator("[data-slicer-values]"),d=p.getByRole("dialog");
    await choose.click();const find=d.getByRole("searchbox"),box=name=>d.getByRole("checkbox",{name,exact:true});
    await find.fill("t-50");await box(chosen).check();assert.equal(await box("Depot-505").count(),0);
    await find.fill("ot-00");await box(codes[1]).check();await d.getByRole("button",{name:"Apply",exact:true}).click();await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"2");await save(p);
    await p.reload();await choose.waitFor();await settled(p);assert.match(await choose.innerText(),/2 selected/);
    await choose.click();assert.ok(await box(chosen).isChecked());assert.ok(await box(codes[1]).isChecked());
    await box("All values").check();await d.getByRole("button",{name:"Cancel",exact:true}).click();await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"2");
    await chart.locator(".vhead").click();await p.locator("[data-tab=Format]").click();await p.getByLabel("Select multiple values").uncheck();
    await check(p,"2 selected","2");
    await chart.locator("[data-slice-drop]").selectOption({label:"Depot-004"});await check(p,"Depot-004","1");
  });
  console.log(
    "Searched 506 depots through a dropdown and list, kept focus, ignored a delayed result, kept selections across searches, and reopened the formatted visual.",
  );
}
