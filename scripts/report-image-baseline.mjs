import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {studio} from "./portfolio-ui.mjs";
await studio(async p=>{
  await p.locator("#home [data-action=new]").click();
  await p.locator(".ribbon [data-action=add]").click();const d=p.getByRole("dialog");
  const objects=await d.locator("[data-create]").evaluateAll(bs=>bs.map(b=>b.dataset.create));
  assert.ok(objects.includes("shape"));assert.ok(!objects.includes("image"));
  await d.screenshot({path:"portfolio-evidence/image-before.png"});
  await writeFile("portfolio-evidence/image-before.json",JSON.stringify({requested:"Attach a purchase voucher image",available:objects.filter(k=>["textBox","shape","actionButton","navigator","image"].includes(k))},null,2));
});
