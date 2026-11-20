import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,capture,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

for(const budget of [false,true]) {
  const report=budget?"Budget vs. Actual":"Visual Gallery",source=budget?"Department cards":"Channel cards";
  const target=budget?"Ledger evidence":"Dispatch records",title=budget?"Posted variance by department":"Revenue by region and channel";
  const bookmark=budget?"February clinical departments":"March paired channels";
  await studio(async p=>{
    await open(p,report);
    const original=await p.locator(".page.active").getAttribute("data-page");
    if(!budget && !(await p.getByRole("button",{name:target,exact:true}).count())) {
      await addPage(p,target);
      await visual(p,"table","Dispatch ledger",["Dispatch · Period","Dispatch · Region","Dispatch · Channel"],
        ["Dispatch · Orders","Dispatch · Revenue","Dispatch · Target","Dispatch · Change"],[18,18,950,450]);
    }
    await p.getByRole("button",{name:source,exact:true}).click(); await settled(p);
    const card=art(p,title);
    await card.locator(".vhead").click(); await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Detail page",{exact:true}).selectOption({label:target}); await settled(p);
    if(budget) {
      await card.getByRole("button",{name:"Medicine",exact:true}).click(); await settled(p);
      await card.getByRole("button",{name:"Surgery",exact:true}).click({modifiers:["Control"]}); await settled(p);
      await p.locator(".ribbon [data-action=bookmarks]").click();
      const saved=p.locator("dialog [data-bookmark-go]").filter({hasText:bookmark});
      if(await saved.count()) await saved.locator("..").locator("[data-bookmark-update]").click();
      else {await p.getByLabel("New bookmark name").fill(bookmark); await p.getByRole("button",{name:"Add current view"}).click();}
      await card.getByRole("button",{name:"Clear selection"}).click(); await settled(p);
    }
    await p.locator(`[data-page="${original}"]`).click(); await save(p);
  });
  await studio(async p=>{
    await open(p,report);
    await p.locator(".ribbon [data-action=bookmarks]").click();
    await p.getByRole("button",{name:bookmark,exact:true}).click(); await settled(p);
    const card=art(p,title),summary=art(p,"Selection total").locator(".kpi");
    assert.equal(await summary.innerText(),budget?"$25.00":"$312.00");
    await card.getByRole("button",{name:"View records"}).click(); await settled(p);
    const rows=await art(p,budget?"Posted transactions":"Dispatch ledger").locator("tbody tr").evaluateAll(
      trs=>trs.map(tr=>[...tr.cells].map(td=>td.textContent)));
    if(budget) {
      assert.deepEqual(rows.map(row=>row[0]),["T12","T13","T14"]);
      assert.deepEqual(rows.map(row=>row.at(-1)),["724","725","726"]);
    } else assert.deepEqual(rows,[
      ["2026-03-01","East","Online","13","169","150","19"],
      ["2026-03-01","West","Retail","11","143","150","-7"]
    ]);
    await capture(p,budget?"budget-clinical-postings":"gallery-paired-records");
    await p.locator("[data-action=drill-back]").click(); await settled(p);
    assert.equal(await card.locator(".category-pick[aria-pressed=true]").count(),2);
    assert.equal(await summary.innerText(),budget?"$25.00":"$312.00");
    await writeFile(`portfolio-evidence/${budget?"budget":"gallery"}-card-drillthrough.json`,JSON.stringify({bookmark,source,target,rows},null,2)+"\n");
  });
}
