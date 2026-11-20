import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {addSplit,panel} from "./small-multiples.mjs";

export async function verifyPagedPanels(){
  const rows=["Rack,Hour,Units"];
  for(let i=0;i<10;i++)for(let h=0;h<72;h++)if(i!==9 || ![1,2].includes(h))rows.push(["R"+i,h,(i+1)*h-25].join(","));
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,"Hourly rack profiles","How do hourly balances differ among ten racks?");
    const wait=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await wait).setFiles({name:"Racks.csv",mimeType:"text/csv",buffer:Buffer.from(rows.join("\n"))});
    await p.locator("#data details[data-tree]").waitFor();
    await visual(p,"card","Units in view",[],["Racks · Units"],[12,10,420,107],"number");
    await visual(p,"line","Hourly balances",["Racks · Hour"],["Racks · Units"],[12,135,968,410],"number");
    await addSplit(p,"Racks · Rack");const plot=art(p,"Hourly balances"),panels=plot.locator(".panel-heading");
    const names=()=>panels.allTextContents();
    assert.deepEqual(await names(),["R0","R1","R2","R3"]);assert.equal(await plot.locator(".plot-mark").count(),288);
    await plot.getByRole("button",{name:"Next panels",exact:true}).click();await settled(p);assert.deepEqual(await names(),["R4","R5","R6","R7"]);
    await plot.getByRole("button",{name:"Next panels",exact:true}).click();await settled(p);assert.deepEqual(await names(),["R8","R9"]);
    const last=panel(plot,"R9");assert.equal(await last.locator(".plot-mark").count(),70);
    assert.equal(await last.locator("polyline").count(),2);
    await last.locator('.plot-mark[data-value="685"]').press("Enter");await settled(p);
    assert.deepEqual(await names(),["R8","R9"]);assert.equal(await art(p,"Units in view").locator(".kpi").innerText(),"685");
    await plot.locator("[data-clear]").click();await settled(p);
    await plot.getByRole("button",{name:"Previous panels",exact:true}).click();await settled(p);assert.deepEqual(await names(),["R4","R5","R6","R7"]);
    await plot.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();await p.getByLabel("Panel order",{exact:true}).selectOption("desc");await settled(p);
    assert.deepEqual(await names(),["R9","R8","R7","R6"]);
    await save(p);await writeFile("portfolio-evidence/paged-panels.json",JSON.stringify({sourceRows:rows.length-1,pages:[4,4,2],lastPanelPoints:70,segments:2,selectedLastPoint:685,descending:await names()},null,2));
  });
}

