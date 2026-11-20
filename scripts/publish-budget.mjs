import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,settled,studio} from "./portfolio-ui.mjs";

let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");await p.locator("header [data-action=library]").click();
  await p.getByRole("button",{name:"Publish report",exact:true}).click();const d=p.getByRole("dialog");
  await d.getByLabel("Opening page",{exact:true}).selectOption({label:"Purchase vouchers"});
  await d.getByRole("button",{name:/^(Publish version|Update published version)$/}).click();
  await d.getByLabel("Published link",{exact:true}).waitFor();link=await d.getByLabel("Published link",{exact:true}).inputValue();
});
await studio(async p=>{
  await p.goto(link);await art(p,"Order amount").waitFor();await settled(p);
  assert.equal(await art(p,"Order amount").locator(".kpi").innerText(),"$124.50");
  await art(p,"Purchase order").locator("select").selectOption({label:"P-02"});await settled(p);
  assert.equal(await art(p,"Voucher for selected order").locator("img").getAttribute("alt"),"Surgery voucher P-02 for $80.00");
  assert.equal(await art(p,"Above approval limit").locator(".kpi").innerText(),"$5.00");
  const revision=await p.locator("#save-state").innerText();assert.match(revision,/Published · revision \d+/);
  await capture(p,"published-budget-vouchers");
  await p.getByRole("button",{name:"Get reading link"}).click();
  const pageLink=await p.getByLabel("Local page link").inputValue();assert.match(pageLink,/#p[a-f0-9]+\/read\/page\//);
  await writeFile("portfolio-evidence/published-budget.json",JSON.stringify({link,pageLink,revision,entry:"Purchase vouchers",readerOrder:"P-02",amount:80,excess:5},null,2));
});
