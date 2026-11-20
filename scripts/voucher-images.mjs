import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {addPage,art,capture,currentPageLink,open,position,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
import {uploadVoucher,voucherPath} from "./report-images.mjs";

const title="Order voucher verification",picture="Voucher for selected order",slicer="Purchase order",total="Order amount";
const alt=order=>order==="P-01"?"Facilities voucher P-01 for $124.50":"Surgery voucher P-02 for $80.00";
const img=p=>art(p,picture).locator(".report-image");
async function bindImage(p,table,baseline){
  const f=name=>table+" · "+name;
  await visual(p,"dropdown",slicer,[f("Order")],[],[16,12,316,108]);
  await visual(p,"card",total,[],[f("Line amount")],[344,12,318,108],"currency");
  await p.locator(".ribbon [data-action=add]").click();await p.locator("[data-create=image]").click();
  if(baseline) await uploadVoucher(p,"P-01","Upload image");
  await p.locator("[data-tab=Format]").click();const input=p.getByLabel("Visual title",{exact:true});await input.fill(picture);await input.press("Tab");
  await position(p,[16,136,550,326]);
  if(!baseline){
    await p.locator("[data-tab=Build]").click();
    await p.getByLabel("Match image to field").selectOption({label:f("Order")});
    for(const order of ["P-01","P-02"]){
      await p.getByRole("button",{name:"Add image for value",exact:true}).click();
      const d=p.getByRole("dialog");await d.getByLabel("Field value",{exact:true}).selectOption({label:order});
      await d.getByLabel("Image file").setInputFiles(voucherPath(order));
      await d.getByLabel("Alternative text",{exact:true}).fill(alt(order));
      await d.getByRole("button",{name:"Apply",exact:true}).click();await d.waitFor({state:"hidden"});
    }
  }
}
async function pick(p,order){
  await art(p,slicer).locator("select").selectOption({label:order});await settled(p);
}
export async function verifyVoucherImages(){
  const baseline=process.env.FOLIO_VOUCHER_BASELINE==="1";let source;
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"Does the displayed voucher agree with the selected order?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();await(await picker).setFiles(resolve("web/datasets/budget/PurchaseReview.xlsx"));
    const d=p.getByRole("dialog");await d.getByRole("checkbox",{name:"Import Purchase lines",exact:true}).check();
    await d.getByRole("button",{name:"Import",exact:true}).click();await d.waitFor({state:"hidden"});
    await bindImage(p,"Purchase lines",baseline);await pick(p,"P-01");source=await img(p).getAttribute("src");
    assert.equal(await art(p,total).locator(".kpi").innerText(),"$124.50");
    await pick(p,"P-02");assert.equal(await art(p,total).locator(".kpi").innerText(),"$80.00");
    if(baseline){
      assert.equal(await img(p).getAttribute("src"),source);await capture(p,"voucher-selection-before");
      await writeFile("portfolio-evidence/voucher-selection-before.json",JSON.stringify({selection:"P-02",amount:80,picture:"P-01",sameImage:true},null,2));return;
    }
    assert.notEqual(await img(p).getAttribute("src"),source);assert.equal(await img(p).getAttribute("alt"),alt("P-02"));
    await pick(p,"P-03");assert.equal(await img(p).count(),0);assert.match(await art(p,picture).innerText(),/No image for P-03/);
    await pick(p,"P-02");await save(p);
  });
  if(baseline) return;
  await studio(async p=>{
    await open(p,title);assert.equal(await img(p).getAttribute("alt"),alt("P-02"));
    await p.getByRole("button",{name:"Reading view"}).click();await settled(p);
    await pick(p,"P-01");assert.equal(await img(p).getAttribute("alt"),alt("P-01"));
    await art(p,picture).getByRole("button",{name:"Enlarge "+alt("P-01")}).press("Enter");
    await p.getByRole("dialog").getByRole("img",{name:alt("P-01")}).waitFor();
    await p.keyboard.press("Escape");
    await art(p,slicer).locator("select").selectOption({index:0});await settled(p);assert.equal(await img(p).count(),0);
    assert.match(await art(p,picture).innerText(),/Select one Order/);
    await writeFile("portfolio-evidence/voucher-selection.json",JSON.stringify({first:{order:"P-01",amount:124.5},second:{order:"P-02",amount:80},unmapped:"P-03",clearedSelection:true,readerEnlarged:true},null,2));
  });
}
export async function saveBudgetVouchers(){
  let link;
  await studio(async p=>{
    await open(p,"Budget vs. Actual");
    const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
    const target=pages.getByRole("button",{name:"Purchase vouchers",exact:true});
    if(await target.count()) {
      await target.click();await settled(p);
      await art(p,picture).locator(".vbody").click({position:{x:15,y:40}});
      await p.locator("[data-tab=Format]").click();await position(p,[16,136,550,326]);
      await art(p,"Approval routing").locator(".vhead").click();await position(p,[580,136,403,210]);
    }
    else{
      await addPage(p,"Purchase vouchers");const table="Purchase approval review";
      await bindImage(p,table,false);
      await visual(p,"card","Above approval limit",[],[table+" · Excess over limit"],[675,12,308,108],"currency");
      await visual(p,"table","Approval routing",[table+" · Center",table+" · Approval owner"],[table+" · Single order limit"],[580,136,403,210],"currency");
      await p.locator("[data-tab=Filters]").click();await p.locator("[data-new-filter=page]").click();
      const d=p.getByRole("dialog");await d.getByLabel("Field",{exact:true}).selectOption({label:table+" · Excess over limit"});
      await d.getByLabel("Condition").selectOption("gt");await d.locator("[name=value]").fill("0");
      await d.getByRole("button",{name:"Apply",exact:true}).click();await d.waitFor({state:"hidden"});await settled(p);
    }
    await pick(p,"P-01");assert.equal(await img(p).getAttribute("alt"),alt("P-01"));await save(p);
    link=(await currentPageLink(p)).replace("/page/","/read/page/");await pages.locator('[data-page="'+origin+'"]').click();await save(p);
  });
  await studio(async p=>{
    await p.goto(link);await img(p).waitFor();await pick(p,"P-02");
    assert.equal(await img(p).getAttribute("alt"),alt("P-02"));
    assert.equal(await art(p,"Above approval limit").locator(".kpi").innerText(),"$5.00");
    assert.deepEqual(await art(p,"Approval routing").locator("tbody tr").first().locator("td").allTextContents(),["002","Surgery lead","$75.00"]);
    await capture(p,"budget-purchase-voucher");await writeFile("portfolio-evidence/budget-vouchers.json",JSON.stringify({link,order:"P-02",amount:80,limit:75,excess:5,owner:"Surgery lead"},null,2));
  });
}
