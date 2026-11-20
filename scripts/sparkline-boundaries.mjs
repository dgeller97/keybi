import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,rename,settled,studio,visual} from "./portfolio-ui.mjs";
import {configureSpark,sparkValues} from "./row-sparklines.mjs";

export async function verifySparkBoundaries(){
  const rows=["Rack,Week,Net,Window"];
  for(let i=0;i<31;i++){
    const rack="R"+String(i).padStart(2,"0");
    for(let week=1;week<=4;week++){
      if(i===30 && week===3)continue;
      rows.push([rack,week,week===1?-i:week===2?0:i+week,"Review"].join(","));
    }
  }
  for(let week=5;week<=53;week++)rows.push("R00,"+week+",1,Archive");
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,"Sparse weekly trends","Which weekly balances crossed zero?");
    const wait=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await (await wait).setFiles({name:"Balance.csv",mimeType:"text/csv",buffer:Buffer.from(rows.join("\n"))});
    await p.locator("#data details[data-tree]").waitFor();
    await visual(p,"dropdown","Review window",["Balance · Window"],[],[18,12,480,116]);
    await visual(p,"table","Rack balances",["Balance · Rack"],["Balance · Net"],[18,150,960,390],"number");
    const table=art(p,"Rack balances"),window=art(p,"Review window").locator("select");
    await configureSpark(p,{name:"Weekly net",axis:"Balance · Week",source:"Balance · Net",format:"number",markers:"none"});
    assert.match(await table.locator(".spark-error").first().innerText(),/52 values/);
    await window.selectOption({label:"Review"});await settled(p);
    assert.equal(await table.locator(".spark-error").count(),0);assert.equal(await table.locator("tbody tr").count(),25);
    await table.getByRole("button",{name:"Next",exact:true}).click();await settled(p);
    const last=table.locator("tbody tr").last();assert.equal(await last.locator("td").first().innerText(),"R30");
    const actual=await sparkValues(p,last,"Weekly net");assert.deepEqual(actual,[["1","-30"],["2","0"],["3","—"],["4","34"]]);
    const svg=last.locator(".spark-cell svg");
    assert.equal(await svg.locator("circle").count(),1);
    assert.equal((await svg.locator("path").getAttribute("d")).match(/M/g).length,2);
    await writeFile("portfolio-evidence/sparse-sparklines.json",JSON.stringify({unfilteredAxisMembers:53,overflowDisclosed:true,firstPageRows:25,lastPageRows:await table.locator("tbody tr").count(),rack:"R30",actual},null,2));
  });
}

