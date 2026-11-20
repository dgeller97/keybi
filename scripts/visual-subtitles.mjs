import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
const report="Bookings by branch",chart="Booked units",caption="Booking channel",detail="Selected branch";
export async function verifyVisualSubtitles(){
  const baseline=process.env.FOLIO_SUBTITLE_BASELINE==="1";
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,report,"Which channel and branch do these bookings cover?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles({name:"Bookings.csv",mimeType:"text/csv",buffer:Buffer.from("Channel,Branch,Units\nDirect,North,8\nDirect,South,14\nPartner,North,5\nPartner,,2\n")});
    await p.getByTitle("Bookings.Units",{exact:true}).waitFor();
    await visual(p,"dropdown","Channel filter",["Bookings · Channel"],[],[12,12,460,110]);
    await visual(p,"dropdown","Branch filter",["Bookings · Branch"],[],[495,12,480,110]);
    await visual(p,"clusteredColumn",chart,["Bookings · Branch"],["Bookings · Units"],[12,136,963,340]);
    if(baseline){
      await p.locator("[data-tab=Format]").click();
      assert.equal(await p.getByLabel("Visual subtitle",{exact:true}).count(),0);
      await writeFile("portfolio-evidence/subtitle-before.json",JSON.stringify({title:chart,subtitleControl:false},null,2));return;
    }
    await formula(p,caption,'"Units · " & SELECTEDVALUE(Bookings[Channel], "All channels")');
    await formula(p,detail,'SELECTEDVALUE(Bookings[Branch], "All branches")');
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Title source",{exact:true}).selectOption({label:caption});
    await p.getByText("Subtitle and heading style",{exact:true}).click();
    await p.getByLabel("Visual subtitle",{exact:true}).fill("Branch unspecified");await p.getByLabel("Visual subtitle",{exact:true}).press("Tab");
    await p.getByLabel("Subtitle source",{exact:true}).selectOption({label:detail});
    await p.getByLabel("Title size (px)",{exact:true}).fill("18");await p.getByLabel("Title size (px)",{exact:true}).press("Tab");
    await p.getByLabel("Heading alignment",{exact:true}).selectOption("center");
    const color=p.getByLabel("Heading color",{exact:true});
    await color.fill("#305f54");await color.dispatchEvent("change");await settled(p);await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,report);let plot=art(p,"Units · All channels");
    assert.equal(await plot.locator(".vsubtitle").innerText(),"All branches");
    const style=await plot.locator(".vhead strong").evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.fontSize,s.textAlign];});
    assert.deepEqual(style,["rgb(48, 95, 84)","18px","center"]);
    await art(p,"Channel filter").locator("select").selectOption({label:"Partner"});await settled(p);plot=art(p,"Units · Partner");
    await art(p,"Branch filter").locator("select").selectOption({label:"North"});await settled(p);
    assert.equal(await plot.locator(".vsubtitle").innerText(),"North");assert.equal(await plot.locator(".plot-mark").getAttribute("data-value"),"5");
    await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    await art(p,"Branch filter").locator("select").selectOption({label:"(Blank)"});await settled(p);
    assert.equal(await plot.locator(".vsubtitle").innerText(),"Branch unspecified");assert.equal(await plot.locator(".plot-mark").getAttribute("data-value"),"2");
    await writeFile("portfolio-evidence/visual-subtitles.json",JSON.stringify({all:"All branches",filteredTitle:"Units · Partner",north:5,blank:2,style,reopened:true},null,2));
  });
}

