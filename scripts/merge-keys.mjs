import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";

const file=(name,source)=>({name:name+".csv",mimeType:"text/csv",buffer:Buffer.from(source)});
const title="Composite dispatch merge";
export async function verifyMergeKeys(){
  let observations={};
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"Which depot and area combinations have a rate?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles([file("Dispatches","Site,Area,Order,Amount\n001,N,A,18\n001,S,B,0\n009,N,C,-2\n,N,D,5\n"),
      file("Rates","Depot,Area,Price,Tag\n001,N,7,N1\n001,N,0,N2\n001,S,4,S1\n,N,5,Blank depot\n004,N,3,Unused\n")]);
    await p.locator("#data details[data-tree]").nth(1).waitFor();await p.getByRole("button",{name:"Model view"}).click();
    await p.getByRole("button",{name:"Merge tables",exact:true}).click();const d=p.getByRole("dialog");
    await d.getByLabel("Left table",{exact:true}).selectOption({label:"Dispatches"});await d.getByLabel("Right table",{exact:true}).selectOption({label:"Rates"});
    const left=d.getByLabel("Left match column"),right=d.getByLabel("Right match column");
    await left.selectOption({label:"Site"});await right.selectOption({label:"Price"});
    const preview=async()=>{await d.getByRole("button",{name:"Preview rows"}).click();};
    await preview();await d.locator(".merge-preview").getByText(/same data type/).waitFor();
    await right.selectOption({label:"Depot"});await d.getByRole("button",{name:"Add match column"}).click();
    await left.nth(1).selectOption({label:"Area"});await right.nth(1).selectOption({label:"Area"});
    await d.getByLabel("Area",{exact:true}).check();await d.getByLabel("Prefix with right table name").uncheck();
    await preview();await d.locator(".merge-preview").getByText(/already contains/).waitFor();
    await d.getByLabel("Prefix with right table name").check();
    for (const box of ["Depot","Area","Price"]) await d.getByLabel(box,{exact:true}).uncheck();
    await d.getByLabel("Tag",{exact:true}).check();
    const read=async()=>{await preview();await d.locator(".merge-preview tbody tr").first().waitFor();
      return (await d.locator(".merge-preview tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));};
    const expected=[["001","N","A","18","N1"],["001","N","A","18","N2"],["001","S","B","0","S1"],["009","N","C","-2","(Blank)"],["(Blank)","N","D","5","Blank depot"]];
    const sort=rs=>rs.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
    observations.left=await read();assert.deepEqual(observations.left,sort(expected));
    await d.getByLabel("Join kind").selectOption("inner");observations.inner=await read();assert.deepEqual(observations.inner,sort(expected.filter(r=>r[2]!=="C")));
    await d.getByLabel("Join kind").selectOption("anti");observations.anti=await read();assert.deepEqual(observations.anti,[["009","N","C","-2"]]);
    await d.getByLabel("Output table").fill("Unrated dispatches");await d.getByRole("button",{name:"Create table"}).click();await d.waitFor({state:"hidden"});
    await p.locator('[data-action="report"]').click();
    await visual(p,"table","Unrated orders",["Unrated dispatches · Order","Unrated dispatches · Site"],["Unrated dispatches · Amount"],[15,15,940,275],"currency");
    await save(p);
  });
  await studio(async p=>{await open(p,title);await settled(p);assert.deepEqual(await art(p,"Unrated orders").locator("tbody tr").first().locator("td").allTextContents(),["C","009","-$2.00"]);});
  await writeFile("portfolio-evidence/merge-keys.json",JSON.stringify(observations,null,2));
}
