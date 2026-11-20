import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {addPage,art,filter,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyVisualCopy() {
  const name="Transfer reconciliation",plot="Units by dock",filtered="Selected units",fixed="All units";
  const titles=[plot,filtered,fixed];
  const values=async p=>Promise.all([filtered,fixed].map(t=>art(p,t).locator(".kpi").innerText()));
  const point=(p,dock)=>art(p,plot).locator(".barrow").filter({hasText:dock});
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();
    await rename(p,name,"How do the selected dock and the depot total compare?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await picker).setFiles({name:"Transfers.csv",mimeType:"text/csv",buffer:Buffer.from("Dock,Units,Stage\nNorth,11,Posted\nEast,17,Posted\nNorth,3,Posted\nSouth,-2,Pending\n")});
    await p.getByTitle("Transfers.Units",{exact:true}).waitFor();
    await visual(p,"bar",plot,["Transfers · Dock"],["Transfers · Units"],[20,160,950,250]);
    await visual(p,"card",filtered,[],["Transfers · Units"],[20,15,460,125]);
    await visual(p,"card",fixed,[],["Transfers · Units"],[500,15,470,125]);
    await art(p,plot).locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
    await p.getByRole("checkbox",{name:fixed,exact:true}).uncheck();
    await filter(p,"visual","Transfers · Stage","Posted");
    assert.equal(await point(p,"South").count(),0);
    await point(p,"North").click();await settled(p);assert.deepEqual(await values(p),["14","29"]);
    for (const [i,title] of titles.entries())
      await art(p,title).locator(".vhead strong").click({modifiers:i?["Control"]:[]});
    await p.getByRole("button",{name:"Copy visuals",exact:true}).click();
    await addPage(p,"Dock comparison");
    await p.getByRole("button",{name:"Paste visuals",exact:true}).click();await settled(p);
    assert.equal(await point(p,"South").count(),0);
    assert.deepEqual(await values(p),["29","29"]);
    await point(p,"East").click();await settled(p);assert.deepEqual(await values(p),["17","29"]);
    await art(p,fixed).locator(".vhead strong").click();await p.keyboard.press("Control+d");await settled(p);
    assert.equal(await art(p,fixed).count(),2);
    assert.deepEqual(await art(p,fixed).locator(".kpi").allTextContents(),["29","29"]);
    await p.keyboard.press("Control+z");await settled(p);assert.equal(await art(p,fixed).count(),1);
    await p.locator("#pages").getByRole("button",{name:"Page 1",exact:true}).click();await settled(p);
    assert.deepEqual(await values(p),["14","29"]);
    await p.locator("#pages").getByRole("button",{name:"Dock comparison",exact:true}).click();await settled(p);
    assert.deepEqual(await values(p),["17","29"]);
    await save(p);
  });
  await studio(async p=>{
    await open(p,name);assert.deepEqual(await values(p),["17","29"]);
    assert.equal(await p.getByRole("button",{name:"Paste visuals",exact:true}).isDisabled(),true);
    await writeFile("portfolio-evidence/copy-visuals.json",JSON.stringify({sourceSelected:[14,29],initialCopies:[29,29],copySelected:[17,29],excludedDock:"South",duplicateIgnoredCard:29,reopened:[17,29]},null,2));
  });
  console.log("Copied three visuals with their visual filter and interaction settings. Source and destination selections remained independent after reopen.");
}
