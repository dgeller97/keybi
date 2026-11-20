import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,open,position,save,settled,studio,visual} from "./portfolio-ui.mjs";

const pageName = "Compare groupings", parameter = "Group dispatch by", metric = "Operating measure";
const chart = "Dispatch by selected group", table = "Dispatch totals";
const tab = p => p.locator("#pages .page").filter({hasText:pageName});
const selector = (p,name) => art(p,name).getByRole("combobox");
async function change(p,name,choice) {
  if (name === metric && await art(p,"Measures to compare").count()) {
    const choices = art(p,"Measures to compare");
    await choices.getByLabel(choice,{exact:true}).check();
    await choices.getByLabel(choice === "Dispatch revenue" ? "Dispatch orders" : "Dispatch revenue",{exact:true}).uncheck();
  } else await selector(p,name).selectOption({label:choice});
  await settled(p);
}
await studio(async p => {
  await open(p,"Visual Gallery");
  if (await tab(p).count()) return;
  await addPage(p,pageName);
  await p.locator(".ribbon [data-action=new-parameter]").click();
  const d = p.locator("dialog");
  await d.getByLabel("Parameter name").fill(parameter);
  await d.getByLabel("Parameter type").selectOption("dimension");
  for (const name of ["Channel","Region"]) await d.getByLabel("Dispatch · "+name,{exact:true}).check();
  await d.getByLabel("Default column").selectOption({label:"Dispatch · Region"});
  await d.getByRole("button",{name:"Create parameter"}).click();
  await p.locator("[data-tab=Format]").click();
  await position(p,[20,20,365,114]);
  await visual(p,"parameterSlicer",metric,[],[],[400,20,365,114]);
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-parameter-binding]").selectOption({label:metric});
  await visual(p,"clusteredBar",chart,[parameter],[metric],[20,150,585,320]);
  await visual(p,"table",table,[parameter],[metric],[620,150,350,320]);
  await p.locator('[data-page="0"]').click();
  await save(p);
});
const lines = (await readFile("web/datasets/gallery/Dispatch.csv","utf8")).trim().split(/\r?\n/);
const header = lines.shift().split(",");
const ledger = (group,measure) => {
  const sums = {};
  for (const line of lines) {
    const cells = line.split(","), name = cells[header.indexOf(group)];
    sums[name] = (sums[name] || 0) + Number(cells[header.indexOf(measure)]);
  }
  return Object.fromEntries(Object.entries(sums).sort());
};
await studio(async p => {
  await open(p,"Visual Gallery");
  await tab(p).click();
  await settled(p);
  const plot = art(p,chart), detail = art(p,table);
  const rows = () => detail.locator("tbody tr").evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
  const evidence = [];
  for (const [group,value] of [["Region","Revenue"],["Channel","Revenue"],["Channel","Orders"],["Region","Orders"]]) {
    await change(p,parameter,group);
    const selected = "Dispatch "+value.toLowerCase();
    await change(p,metric,selected);
    const totals = ledger(group,value);
    assert.deepEqual(await detail.locator("th").allTextContents(),[group,selected]);
    assert.equal(await plot.locator("[data-point]").count(),Object.keys(totals).length);
    const expected = [];
    for (const [name,total] of Object.entries(totals)) {
      const formatted = value === "Revenue" ? "$"+total.toFixed(2) : String(total);
      const point = plot.locator('[data-point][aria-label^="'+group+' '+name+'"]');
      assert.ok((await point.getAttribute("aria-label")).includes(formatted));
      expected.push([name,formatted]);
    }
    assert.deepEqual(await rows(),expected);
    evidence.push({group,value,totals});
    if (group === "Region" && value === "Revenue") {
      await plot.locator('[data-point][aria-label^="Region West"]').press("Enter");
      await settled(p);
      assert.deepEqual(await rows(),[["West","$868.00"]]);
    }
  }
  await change(p,metric,"Dispatch revenue");
  const url = await currentPageLink(p);
  await capture(p,"gallery-dimension-parameter");
  await writeFile("portfolio-evidence/gallery-dimension-parameter.json",JSON.stringify({url,checks:evidence},null,2)+"\n");
  console.log("Verified both groupings and both measures against the CSV, including clearing the previous region selection.");
});
