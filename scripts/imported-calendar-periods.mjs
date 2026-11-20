import assert from "node:assert/strict";
import {addPage,art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyCalendarPeriods() {
  const report="Closing periods", title="Load by calendar month";
  const records=[
    ["2023-11",2],["2024-01-31",9],["2024-02-29",4],
    ["2024-04-01T00:30:00+01:00",8],["2024-03-31T23:30:00-01:00",16],["",32],
  ];
  async function createBin(p,unit,name,count) {
    await p.getByTitle("Closing.Stamp",{exact:true}).click({button:"right"});
    await p.getByLabel("Interval unit").selectOption({label:unit});
    await p.getByLabel("Bin size").fill(String(count));await p.getByLabel("Bin field name").fill(name);
    await p.getByRole("button",{name:"Create bins",exact:true}).click();
    await p.getByTitle("Closing."+name,{exact:true}).waitFor();
  }
  const text=async(p,name)=>art(p,name).locator("tbody tr").evaluateAll(rows=>rows.map(r=>[...r.cells].map(c=>c.textContent)));
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"Which reporting periods contain postings?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await chooser).setFiles({name:"Closing.csv",mimeType:"text/csv",buffer:Buffer.from("Stamp,Units,Stamp (day)\n"+records.map(r=>r.join(",")+",unparsed").join("\n"))});
    await createBin(p,"Months","Month",1);
    await createBin(p,"Months","Two months",2);
    await createBin(p,"Years","Year",1);
    await visual(p,"card","Selected units",[],["Closing · Units"],[18,12,350,82]);
    await visual(p,"table","Annual totals",["Closing · Year"],["Closing · Units"],[18,320,450,225]);
    await visual(p,"table","Two-month totals",["Closing · Two months"],["Closing · Units"],[486,320,490,225]);
    assert.deepEqual(await text(p,"Annual totals"),[["2023","2"],["2024","37"],["(Blank)","32"]]);
    assert.deepEqual(await text(p,"Two-month totals"),[["2023-11–2023-12","2"],["2024-01–2024-02","13"],["2024-03–2024-04","24"],["(Blank)","32"]]);
    await visual(p,"clusteredColumn",title,["Closing · Month"],["Closing · Units"],[18,104,960,206]);
    await p.getByLabel("Show empty intervals").check();await settled(p);
    const plot=art(p,title);
    assert.deepEqual(await plot.locator("[data-axis-pick]").allTextContents(),["2023-11","2023-12","2024-01","2024-02","2024-03","2024-04","(Blank)"]);
    const pick=month=>plot.locator("[data-axis-pick='"+JSON.stringify([month+"-01T00:00:00.000Z"])+"']");
    await pick("2023-12").press("Enter");await settled(p);
    assert.equal(await art(p,"Selected units").locator(".kpi").innerText(),"—");
    await p.locator("[data-tab=Build]").click();await p.locator('[data-kind="clusteredBar"]').click();await settled(p);
    await p.locator("[data-agg]").first().selectOption("avg");await settled(p);
    const march=plot.locator(".plot-mark[data-value='8']");await march.press("Enter");await settled(p);
    assert.equal(await art(p,"Selected units").locator(".kpi").innerText(),"8");await save(p);
  });
  await studio(async p=>{
    await open(p,report);assert.equal(await art(p,"Selected units").locator(".kpi").innerText(),"8");
    assert.deepEqual(await text(p,"Annual totals"),[["2024","8"]]);
    await art(p,title).locator("[data-clear]").click();await settled(p);
    assert.equal(await art(p,"Selected units").locator(".kpi").innerText(),"71");
    await addPage(p,"Date drill");
    const name="Drill into closings";
    await visual(p,"clusteredColumn",name,["Closing · Stamp (day)"],["Closing · Units"],[18,24,965,390]);
    await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Replace Stamp (day)",exact:true}).click();
    await p.getByRole("button",{name:"Use date hierarchy",exact:true}).click();
    await p.getByRole("alert").filter({hasText:"invalid ISO"}).waitFor();
    assert.equal(await p.getByTitle("Closing.Stamp (day) (day)",{exact:true}).count(),0);
    await p.getByLabel("Replacement field").selectOption({label:"Closing · Stamp"});
    await p.getByRole("button",{name:"Replace",exact:true}).click();await settled(p);
    const plot=art(p,name);
    for (let i=0;i<2;i++) {
      await p.getByRole("button",{name:"Replace Stamp",exact:true}).click();
      await p.getByRole("button",{name:"Use date hierarchy",exact:true}).click();
      await p.getByRole("dialog").waitFor({state:"hidden"});await settled(p);
      for (const field of ["Year","Stamp (quarter)","Month","Stamp (day) 2"])
        assert.equal(await p.getByRole("button",{name:"Replace "+field,exact:true}).count(),1);
      assert.equal(await p.getByTitle("Closing.Stamp (year)",{exact:true}).count(),0);
      assert.equal(await p.getByTitle("Closing.Stamp (day) 3",{exact:true}).count(),0);
      await plot.locator('.plot-mark[data-value="37"]').press("Enter");await settled(p);
      await plot.locator('[data-drill="down"]').click();await settled(p);
      assert.deepEqual(await plot.locator(".plot-mark").evaluateAll(es=>es.map(e=>Number(e.dataset.value))),[21,16]);
      if (i===0) {
        await p.getByRole("button",{name:"Replace Stamp (quarter)",exact:true}).click();
        await p.getByRole("button",{name:"Use date column",exact:true}).click();await settled(p);
        assert.equal(await plot.locator("[data-drill]").count(),0);
        assert.equal(await plot.locator(".plot-mark").count(),records.length);
      }
    }
    await plot.locator('.plot-mark[data-value="21"]').press("Enter");await settled(p);await save(p);
    await p.reload();await settled(p);
    assert.equal(await plot.locator('.plot-mark[data-value="21"]').getAttribute("aria-pressed"),"true");
    assert.equal(await plot.locator(".drill-path").innerText(),"2024 › Stamp (quarter)");
    await addPage(p,"Leap-year coverage");
    await visual(p,"clusteredColumn","Choose months",["Closing · Month"],["Closing · Units"],[14,12,580,170]);
    await visual(p,"card","Selected entries",[],[["Closing · Units","count"]],[605,12,363,100]);
    await visual(p,"clusteredBar","Daily load",["Closing · Stamp (day) 2"],["Closing · Units"],[14,198,954,360]);
    await p.getByLabel("Show empty intervals").check();await settled(p);
    const month=art(p,"Choose months"),day=art(p,"Daily load");
    const key=(d)=>JSON.stringify([d+"T00:00:00.000Z"]);
    await month.locator(".plot-mark[data-selection-key='"+key("2024-02-01")+"']").press("Enter");await settled(p);
    await month.locator(".plot-mark[data-selection-key='"+key("2024-04-01")+"']").click({modifiers:["Control"]});await settled(p);
    const empty=await day.locator(".empty-interval").evaluateAll(es=>es.map(e=>JSON.parse(e.dataset.axisPick)[0].slice(0,10)));
    assert.deepEqual(empty,[
      ...Array.from({length:28},(_,i)=>"2024-02-"+String(i+1).padStart(2,"0")),
      ...Array.from({length:29},(_,i)=>"2024-04-"+String(i+2).padStart(2,"0")),
    ]);
    const facts=await day.locator(".plot-mark").evaluateAll(es=>es.map(e=>[JSON.parse(e.dataset.selectionKey)[0].slice(0,10),Number(e.dataset.value)]));
    assert.deepEqual(facts,[["2024-02-29",4],["2024-04-01",16]]);
    const first=day.locator("[data-axis-pick='"+key("2024-02-01")+"']");
    await first.press("Enter");await settled(p);assert.equal(await art(p,"Selected entries").locator(".kpi").innerText(),"0");
    await save(p);await p.reload();await settled(p);
    assert.equal(await first.getAttribute("aria-pressed"),"true");assert.equal(await day.locator(".empty-interval").count(),57);
    await day.locator("[data-clear]").click();await settled(p);assert.equal(await art(p,"Selected entries").locator(".kpi").innerText(),"2");
  });
  console.log("Verified imported calendar months, two-month and year groups, leap day, offset crossings, empty month and saved selection.");
}
