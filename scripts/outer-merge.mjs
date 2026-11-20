import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {art,open,rename,save,settled,studio,visual} from "./portfolio-ui.mjs";
const title="Receipt reconciliation",table="Order receipt audit",ledger="Joined orders and receipts";
const file=(name,rows)=>({name:name+".csv",mimeType:"text/csv",buffer:Buffer.from(rows)});
const orders="PO,Amount\nA,12\nB,-2\n,5\nD,0\n";
const receipts="Ref,Received\nA,8\nA,4\n,5\nC,7\n";
const model=(p,name)=>p.locator(".modelcard").filter({has:p.getByRole("heading",{name,exact:true})});
export async function verifyOuterMerge(){
  const baseline=process.env.FOLIO_OUTER_BASELINE==="1",proof={};
  await studio(async p=>{
    await p.locator("#home [data-action=new]").click();await rename(p,title,"Which orders and receipts are missing a counterpart?");
    const picker=p.waitForEvent("filechooser");await p.locator(".ribbon [data-action=import]").click();
    await(await picker).setFiles([file("Orders",orders),file("Receipts",receipts)]);await p.getByTitle("Receipts.Ref",{exact:true}).waitFor();
    await p.getByRole("button",{name:"Model view"}).click();await p.getByRole("button",{name:"Merge tables",exact:true}).click();
    const d=p.getByRole("dialog");await d.getByLabel("Left table",{exact:true}).selectOption({label:"Orders"});await d.getByLabel("Right table",{exact:true}).selectOption({label:"Receipts"});
    const kind=d.getByLabel("Join kind");
    if(baseline){const options=await kind.locator("option").allTextContents();assert.ok(!options.some(o=>o.startsWith("Full outer")));await writeFile("portfolio-evidence/outer-merge-before.json",JSON.stringify({options},null,2));return;}
    await d.getByLabel("Left match column").selectOption({label:"PO"});await d.getByLabel("Right match column").selectOption({label:"Ref"});
    await d.getByLabel("Prefix with right table name").uncheck();
    for(const [key,count] of [["right",4],["rightanti",1],["full",5]]){
      await kind.selectOption(key);await d.getByLabel("Ref",{exact:true}).check();await d.getByRole("button",{name:"Preview rows"}).click();
      await d.locator(".merge-preview tbody tr").first().waitFor();
      const rows=await d.locator(".merge-preview tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
      assert.equal(rows.length,count);
      if(key==="rightanti")assert.deepEqual(rows,[["(Blank)","(Blank)","C","7"]]);
      if(key==="right"){assert.deepEqual(rows.map(r=>r[3]).sort(),["4","5","7","8"]);assert.ok(rows.some(r=>r[0]==="(Blank)" && r[1]==="5" && r[2]==="(Blank)"));}
      if(key==="full")assert.equal(await d.locator(".merge-preview caption").innerText(),"First 5 rows");
      proof[key]=rows;
    }
    await d.getByLabel("Output table").fill(table);await d.getByRole("button",{name:"Create table",exact:true}).click();await d.waitFor({state:"hidden"});
    assert.match(await model(p,table).innerText(),/6 rows/);await p.locator(".rail [data-action=report]").click();
    await visual(p,"table",ledger,[table+" · PO",table+" · Ref"],[table+" · Amount",table+" · Received"],[14,140,963,340]);
    await visual(p,"card","Received total",[],[table+" · Received"],[14,12,460,112]);await save(p);
  });
  if(baseline)return;
  await studio(async p=>{
    await open(p,title);const grid=art(p,ledger),total=art(p,"Received total").locator(".kpi");
    const rows=await grid.locator("tbody tr").evaluateAll(rs=>rs.map(r=>Array.from(r.cells,c=>c.textContent)));
    assert.ok(rows.some(r=>r[0]==="A" && r[2]==="24" && r[3]==="12"),JSON.stringify(rows));
    assert.ok(rows.some(r=>r[1]==="C" && r[2]==="—" && r[3]==="7"));
    assert.equal(await total.innerText(),"24");proof.grouped=rows;
    await p.getByRole("button",{name:"Model view"}).click();
    const pick=p.waitForEvent("filechooser");await model(p,"Receipts").getByRole("button",{name:"Update from file"}).click();await(await pick).setFiles(file("Receipts",receipts+"B,-2\n"));
    const d=p.getByRole("dialog");await d.getByLabel("Load mode").selectOption("replace");await d.getByRole("button",{name:"Apply update",exact:true}).click();await d.waitFor({state:"hidden"});
    await model(p,table).getByRole("button",{name:"Refresh merge"}).click();await model(p,table).getByText(/Source changed/).waitFor({state:"hidden"});
    await p.locator(".rail [data-action=report]").click();await settled(p);assert.equal(await total.innerText(),"22");
    await save(p);
    const dl=p.waitForEvent("download");await p.locator("header [data-action=library]").click();await p.locator("dialog [data-action=export-package]").click();
    const download=await dl,buffer=await readFile(await download.path());await p.locator("header [data-action=home]").click();
    const chooser=p.waitForEvent("filechooser");await p.locator("#home [data-action=import-package]").click();await(await chooser).setFiles({name:download.suggestedFilename(),mimeType:"application/octet-stream",buffer});
    await total.waitFor();await settled(p);assert.equal(await total.innerText(),"22");
    proof.afterRefresh=22;proof.portable=true;await writeFile("portfolio-evidence/outer-merge.json",JSON.stringify(proof,null,2));
  });
}

