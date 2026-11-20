import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,open,position,rename,save,settled,studio} from "./portfolio-ui.mjs";

const name="Purchasing image evidence",title="Purchase voucher",alt="Facilities purchase P-01 for $124.50";
export const voucherPath=order=>resolve("web/datasets/budget",order+"-voucher.png");
const digest=async order=>createHash("sha256").update(await readFile(voucherPath(order))).digest("hex");
export async function uploadVoucher(p,order,label){
  const picker=p.waitForEvent("filechooser");await p.getByRole("button",{name:label,exact:true}).click();
  await(await picker).setFiles(voucherPath(order));await p.locator(".last-load").filter({hasText:order+"-voucher.png"}).waitFor();
}
export async function verifyImages(){
  const first=await digest("P-01"),second=await digest("P-02");
  let buffer;
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,name,"What amount does the order voucher show?");
    await p.locator(".ribbon [data-action=add]").click();await p.locator("[data-create=image]").click();
    await uploadVoucher(p,"P-01","Upload image");
    await p.getByLabel("Alternative text",{exact:true}).fill(alt);await p.getByLabel("Alternative text",{exact:true}).press("Tab");
    await p.locator("[data-tab=Format]").click();const titleBox=p.getByLabel("Visual title",{exact:true});
    await titleBox.fill(title);await titleBox.press("Tab");await position(p,[20,20,590,365]);
    const img=art(p,title).locator("img.report-image");
    for(const mode of ["cover","none","fill","contain"]){
      await p.getByLabel("Image fit").selectOption(mode);assert.equal(await img.evaluate(el=>getComputedStyle(el).objectFit),mode);
    }
    await p.getByLabel("Corner radius (px)").fill("8");await p.getByLabel("Corner radius (px)").press("Tab");
    assert.equal(await img.getAttribute("alt"),alt);assert.equal(await img.getAttribute("src"),"/api/images/"+first);
    await p.locator("[data-tab=Build]").click();await uploadVoucher(p,"P-02","Replace image");
    assert.equal(await img.getAttribute("src"),"/api/images/"+second);
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);assert.equal(await img.getAttribute("src"),"/api/images/"+first);
    await p.getByRole("button",{name:"Redo",exact:true}).click();await settled(p);assert.equal(await img.getAttribute("src"),"/api/images/"+second);
    await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
    for (const format of ["jpeg","webp"]) {
      const data=await img.evaluate((image,format)=>{
        const c=document.createElement("canvas");c.width=120;c.height=81;
        c.getContext("2d").drawImage(image,0,0,120,81);return c.toDataURL("image/"+format).split(",")[1];
      },format);
      const chooser=p.waitForEvent("filechooser");await p.getByRole("button",{name:"Replace image"}).click();
      await(await chooser).setFiles({name:"voucher."+format,mimeType:"image/"+format,buffer:Buffer.from(data,"base64")});
      await p.locator(".last-load").filter({hasText:"voucher."+format}).waitFor();
      const response=await p.request.get(new URL(await img.getAttribute("src"),p.url()).href);
      assert.equal(response.headers()["content-type"],"image/"+format);
      await p.getByRole("button",{name:"Undo",exact:true}).click();await settled(p);
    }
    // A rejected replacement retains the prior bytes and their description.
    const chooser=p.waitForEvent("filechooser");await p.getByRole("button",{name:"Replace image"}).click();
    await(await chooser).setFiles({name:"damaged.png",mimeType:"image/png",buffer:Buffer.from("not an image")});
    await p.locator("#toast").getByText(/could not be read/).waitFor();assert.equal(await img.getAttribute("src"),"/api/images/"+first);
    await save(p);
  });
  await studio(async p=>{
    await open(p,name);const source=art(p,title);
    await source.click({position:{x:100,y:110}});
    await p.keyboard.press("Control+c");await addPage(p,"Voucher copy");await p.keyboard.press("Control+v");await settled(p);
    await art(p,title).locator("img.report-image").waitFor();
    await save(p);await p.getByRole("button",{name:"Reading view",exact:true}).click();await settled(p);
    const button=art(p,title).getByRole("button",{name:"Enlarge "+alt});
    await button.press("Enter");
    const d=p.getByRole("dialog");await d.getByRole("img",{name:alt}).waitFor();
    await d.getByRole("button",{name:"Actual size"}).click();
    assert.equal(await d.locator("img").evaluate(el=>el.clientWidth),960);
    await p.keyboard.press("Escape");await p.getByRole("button",{name:"Edit report"}).click();await settled(p);
    await p.locator("header [data-action=library]").click();const exporting=p.waitForEvent("download");
    await p.locator("dialog [data-action=export-package]").click();const download=await exporting;
    buffer=await readFile(await download.path());
  });
  const bytes=await readFile(voucherPath("P-01"));
  assert.ok(buffer.indexOf(bytes)>0);assert.equal(buffer.indexOf(bytes),buffer.lastIndexOf(bytes));
  await studio(async p=>{
    if(process.env.FOLIO_IMAGE_DESTINATION) {await p.goto(process.env.FOLIO_IMAGE_DESTINATION);await p.locator("#home h1").waitFor();
      assert.equal((await p.request.get(process.env.FOLIO_IMAGE_DESTINATION+"/api/images/"+first)).ok(),false);}
    const picker=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();
    await(await picker).setFiles({name:"Voucher.keybi",mimeType:"application/octet-stream",buffer});
    await art(p,title).waitFor();await settled(p);
    const url=new URL("/api/images/"+first,p.url()).href;const response=await p.request.get(url);
    assert.equal(response.headers()["content-type"],"image/png");assert.deepEqual(await response.body(),bytes);
    assert.equal(await art(p,title).locator("img").getAttribute("alt"),alt);
    await writeFile("portfolio-evidence/report-images.json",JSON.stringify({image:first,width:960,height:646,bytes:bytes.length,formats:["png","jpeg","webp"],fitModes:4,invalidReplacementPreserved:true,packageCopies:1,independentDestination:!!process.env.FOLIO_IMAGE_DESTINATION},null,2));
  });
}
