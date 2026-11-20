import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,currentPageLink,open,save,settled,studio} from "./portfolio-ui.mjs";
import {formula} from "./formula-check.mjs";
const source="Department caption",expr='"Department · " & SELECTEDVALUE(\'Cost centers\'[Department], "All departments")',title="Recalculated cost";
let link;
await studio(async p=>{
  await open(p,"Budget vs. Actual");const pages=p.locator("#pages"),origin=await pages.locator(".active").getAttribute("data-page");
  await pages.getByRole("button",{name:"Purchase price check",exact:true}).click();await settled(p);
  const card=art(p,title);await card.locator(".vhead strong").click();await p.locator("[data-tab=Format]").click();
  if(!(await p.getByLabel("Title source",{exact:true}).locator("option").allTextContents()).includes(source))await formula(p,source,expr);
  if(!await p.getByLabel("Subtitle source",{exact:true}).isVisible())await p.getByText("Subtitle and heading style",{exact:true}).click();
  await p.getByLabel("Subtitle source",{exact:true}).selectOption({label:source});await settled(p);
  await p.getByLabel("Title size (px)",{exact:true}).fill("16");await p.getByLabel("Title size (px)",{exact:true}).press("Tab");
  const color=p.getByLabel("Heading color",{exact:true});await color.fill("#285644");await color.dispatchEvent("change");await settled(p);
  await save(p);link=(await currentPageLink(p)).replace("/page/","/read/page/");
  await pages.locator('[data-page="'+origin+'"]').click();await save(p);
});
await studio(async p=>{
  await p.goto(link);const card=art(p,title);await card.locator(".vsubtitle").waitFor();await settled(p);
  const values={};
  for(const [label,expected] of [["All departments","$225.75"],["Facilities","$112.25"]]){
    if(label==="Facilities"){await art(p,"Purchasing department").locator("select").selectOption({label});await settled(p);}
    assert.equal(await card.locator(".vsubtitle").innerText(),"Department · "+label);
    assert.equal(await card.locator(".kpi").innerText(),expected);
    const fits=await card.locator(".vsubtitle").evaluate(e=>e.scrollWidth<=e.clientWidth);
    assert.equal(fits,true);values[label]=expected;
  }
  await capture(p,"budget-price-subtitle");
  await writeFile("portfolio-evidence/budget-price-subtitle.json",JSON.stringify({link,expr,values},null,2));
});

