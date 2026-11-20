import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function openGroupEditor(p,chart,field){
  await chart.locator(".vhead strong").click();await p.locator("[data-tab=Build]").click();
  await p.getByRole("button",{name:"Replace "+field,exact:true}).click();
  await p.getByRole("button",{name:/^(Create named groups|Edit named groups)$/}).click();
}
export async function verifyNamedGroups(){
  const report="Dispatch group assignments",chart="Units by coverage",total="Assigned units",field="Coverage";
  const baseline=process.env.FOLIO_GROUP_BASELINE==="1";
  const data=["Location,Units","North,8","North,6","O'Brien,4",",2","(Blank),7","Offline,5",...Array.from({length:64},(_,i)=>"Site "+String(i+1).padStart(2,"0")+",1")].join("\n");
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"Which dispatch sites share coverage?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles({name:"Sites.csv",mimeType:"text/csv",buffer:Buffer.from(data)});await p.getByTitle("Sites.Location",{exact:true}).waitFor();
    await visual(p,"card",total,[],["Sites · Units"],[12,12,435,110]);
    await visual(p,"clusteredColumn",chart,["Sites · Location"],["Sites · Units"],[12,138,965,310]);
    const plot=art(p,chart);await plot.locator(".vhead strong").click();await p.locator("[data-tab=Build]").click();
    await p.getByRole("button",{name:"Replace Location",exact:true}).click();
    const create=p.getByRole("button",{name:"Create named groups",exact:true});
    if(baseline){assert.equal(await create.count(),0);await writeFile("portfolio-evidence/named-groups-before.json",JSON.stringify({source:"Sites.Location",available:await p.locator("dialog button").allTextContents()},null,2));return;}
    await create.click();await p.getByLabel("Group field name",{exact:true}).fill(field);
    await p.getByLabel("Group label",{exact:true}).fill("Primary");
    await p.getByRole("checkbox",{name:"Include North",exact:true}).check();
    await p.getByRole("checkbox",{name:"Include O'Brien",exact:true}).check();
    await p.getByRole("button",{name:"Add group",exact:true}).click();
    await p.getByLabel("Group label",{exact:true}).fill("Investigate");
    await p.getByRole("button",{name:"Next values",exact:true}).click();
    await p.getByRole("checkbox",{name:"Include (Blank)",exact:true}).check();
    await p.getByRole("checkbox",{name:"Include Site 64",exact:true}).check();
    await p.getByLabel("Combine unassigned values").check();await p.getByLabel("Other label",{exact:true}).fill("Remaining");
    await p.getByRole("button",{name:"Save groups",exact:true}).click();await p.locator("dialog").waitFor({state:"hidden"});await settled(p);
    const values=()=>plot.locator(".plot-mark").evaluateAll(es=>Object.fromEntries(es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)])));
    assert.deepEqual(await values(),{Primary:18,Investigate:3,Remaining:75});
    await plot.locator('[data-selection-key=\'["Primary"]\']').press("Enter");await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"18");
    await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,report);const plot=art(p,chart);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"18");await plot.locator("[data-clear]").click();await settled(p);
    await openGroupEditor(p,plot,field);await p.getByLabel("Group label",{exact:true}).fill("Priority");
    await p.getByLabel("Find members",{exact:true}).fill("64");
    await p.getByRole("checkbox",{name:"Include Site 64",exact:true}).check();
    await p.getByLabel("Combine unassigned values").uncheck();
    await p.getByRole("button",{name:"Save groups",exact:true}).click();await p.locator("dialog").waitFor({state:"hidden"});await settled(p);
    await p.locator('[data-kind="clusteredBar"]').click();await settled(p);
    await plot.locator('[data-selection-key=\'["Priority"]\']').press("Enter");await settled(p);assert.equal(await art(p,total).locator(".kpi").innerText(),"19");
    await visual(p,"matrix","Coverage ledger",["Sites · Coverage"],["Sites · Units"],[12,458,965,205]);
    assert.equal(await art(p,"Coverage ledger").locator("tr.matrix-total td").last().textContent(),"19");
    await plot.locator("[data-clear]").click();await settled(p);
    await visual(p,"clusteredBar","Selected locations",["Sites · Location"],["Sites · Units"],[12,680,965,270]);
    const newPlot=art(p,"Selected locations");
    await newPlot.locator('[data-selection-key=\'["North"]\']').press("Enter");await settled(p);
    await newPlot.locator('[data-selection-key=\'["Offline"]\']').press("Control+Enter");await settled(p);
    assert.equal(await art(p,total).locator(".kpi").innerText(),"19");
    await p.locator("[data-tab=Build]").click();await p.getByRole("button",{name:"Group selected values",exact:true}).click();
    await p.getByLabel("Group field name",{exact:true}).fill("Coverage pair");
    await p.getByLabel("Group label",{exact:true}).fill("Shared cover");
    assert.ok(await p.getByRole("checkbox",{name:"Include North",exact:true}).isChecked());
    assert.ok(await p.getByRole("checkbox",{name:"Include Offline",exact:true}).isChecked());
    await p.getByRole("button",{name:"Save groups",exact:true}).click();await p.locator("dialog").waitFor({state:"hidden"});await settled(p);
    assert.equal(await newPlot.locator('[data-selection-key=\'["Shared cover"]\']').getAttribute("aria-pressed"),"true");
    assert.equal(await art(p,total).locator(".kpi").innerText(),"19");
    await save(p);
    await writeFile("portfolio-evidence/named-groups.json",JSON.stringify({sourceTotal:96,primary:18,investigate:3,remaining:75,editedPriority:19,singleBlank:2,quotedBlank:7,secondPage:"Site 64",reopened:true},null,2));
  });
}

