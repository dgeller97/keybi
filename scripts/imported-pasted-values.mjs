import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,filter,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

export async function verifyPastedValues() {
  const name="Racks for inspection",card="Units to inspect",slicer="Rack IDs";
  const ids=Array.from({length:2000},(_,i)=>"Rack-"+String(i+1).padStart(4,"0"));
  const units=ids.map((_,i)=>i%7+1),sum=units.reduce((a,b)=>a+b);
  const odd="O'Brien_%[A]",all=sum+7-3+41;
  const total=p=>art(p,card).locator(".kpi").innerText().then(s=>Number(s.replaceAll(",","")));
  async function apply(p) {
    const d=p.getByRole("dialog");await d.getByRole("button",{name:"Apply",exact:true}).click();await d.waitFor({state:"hidden"});await settled(p);
  }
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"Which racks were supplied for inspection?");
    const chooser=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    const lines=["Rack,Zone,Units",...ids.map((id,i)=>id+",East,"+units[i]),odd+",East,41",",East,7","(Blank),East,-3","Zero,East,0","Other,West,23"];
    await (await chooser).setFiles({name:"Racks.csv",mimeType:"text/csv",buffer:Buffer.from(lines.join("\n"))});
    await p.getByTitle("Racks.Units",{exact:true}).waitFor();
    await visual(p,"card",card,[],["Racks · Units"],[12,12,365,120]);
    await visual(p,"list",slicer,["Racks · Rack"],[],[400,12,560,310]);
    await p.locator("[data-tab=Format]").click();await p.getByLabel("Show search box").check();
    await filter(p,"page","Racks · Zone","East");assert.equal(await total(p),all);
    const picker=art(p,slicer),d=p.getByRole("dialog"),input=d.getByLabel("Values, one per line");
    const batches=[];
    p.on("request",req=>{
      if (req.url().endsWith("/api/query")) for (const q of req.postDataJSON().visuals)
        if (!q.metrics.length && q.filters.at(-1)?.op==="in" && q.groups.length) batches.push(q.filters.at(-1).value.length);
    });
    await picker.locator(".vhead").evaluate(el=>{
      const data=new DataTransfer();data.setData("text/plain","Rack-2000\r\nRack-0001\r\nOther");
      el.dispatchEvent(new ClipboardEvent("paste",{bubbles:true,cancelable:true,clipboardData:data}));
    });
    await d.getByText("2 matched · 1 unmatched").waitFor();await apply(p);
    assert.equal(await total(p),units[1999]+units[0]);
    await picker.getByRole("button",{name:"Paste values",exact:true}).click();
    await input.fill([odd,"(Blank)",'"(Blank)"',odd].join("\n"));await apply(p);assert.equal(await total(p),45);
    await picker.getByRole("button",{name:"Paste values",exact:true}).click();
    await input.fill("Rack-0001\tEast");await d.getByText("Paste one column of values.").waitFor();
    await input.fill("rack-0001");await d.getByText("0 matched · 1 unmatched").waitFor();
    await d.getByRole("button",{name:"Cancel"}).click();assert.equal(await total(p),45);
    await picker.getByRole("button",{name:"Paste values",exact:true}).click();batches.length=0;
    await input.fill([...ids,"Other","No rack",ids[1999]].join("\r\n"));
    await d.getByText("2000 matched · 2 unmatched").waitFor();assert.deepEqual(batches,[500,500,500,500,2]);
    await apply(p);assert.equal(await total(p),sum);await save(p);
  });
  await studio(async p=>{
    await open(p,name);assert.equal(await total(p),sum);
    const picker=art(p,slicer);
    await picker.locator("[data-slicer-paste]").click();
    const review=p.getByRole("dialog");await review.locator(".paste-values summary").click();
    await review.getByRole("checkbox",{name:"Rack-0001",exact:true}).waitFor();
    const mounted=await review.locator("[data-members] label").count();
    assert.ok(mounted<=150);
    await review.getByRole("button",{name:"Show selected (2000)",exact:true}).click();
    const selectedMounted=await review.locator("[data-members] label").count();assert.equal(selectedMounted,150);
    await review.getByRole("button",{name:"Next values"}).click();
    await review.getByRole("checkbox",{name:"Rack-0151",exact:true}).click();
    await review.getByRole("searchbox").fill("1999");
    assert.equal(await review.locator("[data-members] label").count(),1);
    await review.getByRole("checkbox",{name:"Rack-1999"}).click();
    await apply(p);
    const corrected=await total(p);assert.equal(corrected,sum-units[150]-units[1998]);
    await writeFile("portfolio-evidence/pasted-review.json",JSON.stringify({selected:2000,mounted,selectedMounted,
      removed:[ids[150],ids[1998]],remaining:1998,originalUnits:sum,correctedUnits:corrected},null,2));
    await picker.locator(".vhead").click();await p.locator("[data-tab=Build]").click();
    await p.locator('[data-kind="dropdown"]').click();await settled(p);
    await picker.locator("[data-slicer-paste]").click();
    const d=p.getByRole("dialog"),input=d.getByLabel("Values, one per line");
    let release,started;
    const hold=new Promise(r=>{release=r;}),arrived=new Promise(r=>{started=r;});
    await p.route("**/api/query",async route=>{
      const delayed=route.request().postDataJSON().visuals.some(q=>q.filters.at(-1)?.op==="in" && q.filters.at(-1).value[0]===ids[0]);
      if (delayed) {started();await hold;}
      await route.continue();
    });
    await input.fill(ids[0]);await arrived;await input.fill(odd);await d.getByText("1 matched · 0 unmatched").waitFor();release();
    await apply(p);assert.equal(await total(p),41);
    await picker.locator("[data-slicer-paste]").click();await input.fill(ids[0]);await apply(p);assert.equal(await total(p),1);
    await picker.locator("[data-clear]").click();await settled(p);
    await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
    await d.getByLabel("Field",{exact:true}).selectOption({label:"Racks · Units"});
    await d.getByLabel("Condition",{exact:true}).selectOption("in");await d.locator(".paste-values summary").click();
    await input.fill("0\n7\nbogus\n7");await d.getByText("2 matched · 1 unmatched").waitFor();
    await d.getByRole("button",{name:"Review matches"}).click();
    assert.equal(await d.getByRole("checkbox",{name:"0",exact:true}).isChecked(),true);
    await apply(p);assert.equal(await total(p),units.filter(v=>v===7).length*7+7);
  });
  console.log("Verified 2,000 pasted IDs, paged review and correction, blanks, numeric zero, literal punctuation, scoped and duplicate keys, stale responses, chart conversion and reopening.");
}
