import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {mkdtemp,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {art,open,settled,studio} from "./portfolio-ui.mjs";

const scratch=await mkdtemp(resolve("test-results/portfolio-package-")),port=4387,other="http://127.0.0.1:"+port+"/";
const env={...process.env,FOLIO_DATA:scratch,FOLIO_PORT:String(port)};delete env.FOLIO_POSTGRES;
const server=spawn(resolve("target/release/keybi.exe"),[],{env,windowsHide:true,stdio:["ignore","pipe","inherit"]});
const observations=[];
try{
  await Promise.race([once(server.stdout,"data"),once(server,"exit").then(()=>{throw Error("Port in use");})]);
  for(const name of ["Visual Gallery","Budget vs. Actual"]){
    await studio(async p=>{
      await open(p,name);const original=new URL(p.url()).hash;
      await p.locator("header [data-action=library]").click();const downloaded=p.waitForEvent("download");
      await p.locator("dialog [data-action=export-package]").click();const file=await downloaded,buffer=await readFile(await file.path());
      assert.equal(file.suggestedFilename(),name+".keybi");
      assert.equal(buffer.subarray(0,8).toString("hex"),"4b4559424900010a");
      await p.goto(other);await p.locator("#home h1").waitFor();
      const pick=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();
      await(await pick).setFiles({name:file.suggestedFilename(),mimeType:"application/octet-stream",buffer});
      await p.locator("#report-name").filter({hasText:name}).waitFor();await settled(p);
      const copy=new URL(p.url()).hash;assert.notEqual(copy,original);
      const go=async n=>{await p.locator("#pages").getByRole("button",{name:n,exact:true}).click();await settled(p);};
      if(name==="Visual Gallery"){
        await go("Pipeline status");await art(p,"Deals by pipeline status").locator('[data-selection-key=\'["Open"]\']').press("Enter");await settled(p);
        assert.equal(await art(p,"Deals in view").locator(".kpi").innerText(),"219");
        await go("Regional trends");await art(p,"Channel to compare").locator("select").selectOption({label:"Online"});await settled(p);
        assert.equal(await art(p,"Revenue · Online").locator(".kpi").innerText(),"$887.00");
      }else{
        await go("Purchase price check");await art(p,"Purchasing department").locator("select").selectOption({label:"Facilities"});await settled(p);
        assert.equal(await art(p,"Recalculated cost").locator(".vsubtitle").innerText(),"Department · Facilities");
        assert.equal(await art(p,"Recalculated cost").locator(".kpi").innerText(),"$112.25");
        await go("Receiving reconciliation");await art(p,"Order and receipt exceptions").locator("tbody tr").filter({hasText:"P-06"}).click();await settled(p);
        assert.equal(await art(p,"Receipt amount").locator(".kpi").innerText(),"$18.25");
        await p.getByRole("button",{name:"Model view"}).click();const model=p.locator(".modelcard").filter({has:p.getByRole("heading",{name:"Receiving review",exact:true})});
        const response=p.waitForResponse(r=>r.url().endsWith("/api/merge") && r.request().method()==="POST");
        await model.getByRole("button",{name:"Refresh merge",exact:true}).click();assert.equal((await response).status(),200);
        await p.locator(".rail [data-action=report]").click();await settled(p);assert.equal(await art(p,"Receipt amount").locator(".kpi").innerText(),"$18.25");
      }
      observations.push({report:name,packageBytes:buffer.length,copiedWithNewId:true,valuesChecked:true});
      if(name==="Visual Gallery"){
        const legacyBody=Buffer.from(buffer.subarray(0,-32));
        legacyBody.write("FOLIO",0,"ascii");
        const legacy=Buffer.concat([legacyBody,createHash("sha256").update(legacyBody).digest()]);
        await p.goto(other);
        const legacyPicker=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();
        await(await legacyPicker).setFiles({name:"Legacy Gallery.folio",mimeType:"application/octet-stream",buffer:legacy});
        await p.locator("#report-name").filter({hasText:name}).waitFor();await settled(p);
        await go("Pipeline status");assert.equal(await art(p,"Deals in view").locator(".kpi").innerText(),"258");
      }
    });
  }
  await writeFile("portfolio-evidence/final-packages.json",JSON.stringify(observations,null,2));
}finally{server.kill();}

