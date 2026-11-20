import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {open,studio} from "./portfolio-ui.mjs";

await studio(async p=>{
  await open(p,"Budget vs. Actual");
  await p.locator("#pages").getByRole("button",{name:"Approval limits",exact:true}).click();
  await p.locator(".ribbon [data-action=calculation]").click();
  const d=p.getByRole("dialog");
  await d.getByLabel("Name",{exact:true}).fill("Excess over limit");
  await d.getByLabel("Left column").selectOption({label:"Purchase lines · Line amount"});
  await d.getByLabel("Operator").selectOption("-");
  await d.getByLabel("Right column").selectOption({label:"AuthorizationLimits · Single order limit"});
  await d.getByRole("button",{name:"Create",exact:true}).click();
  const message="Provide a name. Calculated columns require fields from one table.";
  await d.getByText(message,{exact:true}).waitFor();
  assert.equal(await p.getByRole("button",{name:"Merge tables",exact:true}).count(),0);
  await d.screenshot({path:"portfolio-evidence/merge-before.png"});
  await writeFile("portfolio-evidence/merge-before.json",JSON.stringify({page:"Approval limits",message},null,2));
});
