import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {addPage,art,capture,currentPageLink,filter,open,save,settled,studio,visual} from "./portfolio-ui.mjs";

const report="Hospital Operations",name="Encounter workload";
const tab=(p,title)=>p.locator("#pages").getByRole("button",{name:title,exact:true});
export async function setReaderAccess(p,scope,index,access) {
  await p.locator('[data-reader-access="'+scope+':'+index+'"]').click();
  await p.getByLabel("Filter in reading view").selectOption(access);
  await p.locator("dialog button[type=submit]").click();
}
if (process.argv[1]?.endsWith("hospital-reading.mjs")) {
  let url;
  await studio(async p=>{
    await open(p,report);const original=await p.locator("#pages .page.active").getAttribute("data-page");
    for (const title of ["Site performance","Site volumes","Daily coverage"]) {
      await tab(p,title).click();await settled(p);await p.locator("[data-tab=Filters]").click();
      await setReaderAccess(p,"page",0,"locked");
      if (title==="Site performance") await setReaderAccess(p,"report",0,"locked");
    }
    if (!(await tab(p,name).count())) {
      await addPage(p,name);
      await visual(p,"card","Encounter count",[],["Encounter · Visits"],[18,18,460,112]);
      await visual(p,"card","Median wait (minutes)",[],[["Encounter · Minutes","median"]],[490,18,490,112]);
      await visual(p,"clusteredBar","Encounters by site",["Encounter · Site"],["Encounter · Visits"],[18,144,460,360]);
      await visual(p,"table","Status by site",["Encounter · Site","Encounter · Status"],["Encounter · Visits",["Encounter · Minutes","median"]],[490,144,490,360]);
      await filter(p,"page","Encounter · Status","Open");
    }
    await tab(p,name).click();await settled(p);await save(p);url=(await currentPageLink(p)).replace("/page/","/read/page/");
    await p.locator('[data-page="'+original+'"]').click();await save(p);
  });
  const lines=(await readFile("web/datasets/hospital/Encounter.csv","utf8")).trim().split(/\r?\n/),header=lines.shift().split(",");
  const facts=lines.map(line=>Object.fromEntries(line.split(",").map((v,i)=>[header[i],v]))).filter(r=>r.Cohort==="Routine");
  const proof=[];
  await studio(async p=>{
    await p.goto(url);await art(p,"Encounter count").waitFor();await settled(p);
    assert.equal(await art(p,"Encounter count").locator(".kpi").innerText(),"25");
    for(const status of ["Open","Closed","All values"]) {
      await p.locator("[data-action=reader-filters]").click();const form=p.getByRole("dialog");
      assert.match(await form.locator(".locked-filter").innerText(),/Cohort · Routine.*Locked/);
      await form.getByLabel("Status",{exact:true}).selectOption({label:status});
      await form.getByRole("button",{name:"Apply"}).click();await settled(p);
      const rows=facts.filter(r=>r.Status===status||status==="All values");
      const waits=rows.map(r=>Number(r.Minutes)).sort((a,b)=>a-b);
      const median=(waits[Math.floor((waits.length-1)/2)]+waits[Math.floor(waits.length/2)])/2;
      assert.equal(await art(p,"Encounter count").locator(".kpi").innerText(),String(rows.length));
      assert.equal(await art(p,"Median wait (minutes)").locator(".kpi").innerText(),String(median));
      const sites=Object.fromEntries([...new Set(rows.map(r=>r.Site))].map(site=>[site,rows.filter(r=>r.Site===site).length]));
      const bars=await art(p,"Encounters by site").locator(".plot-mark").evaluateAll(es=>Object.fromEntries(es.map(e=>[JSON.parse(e.dataset.selectionKey)[0],Number(e.dataset.value)])));
      assert.deepEqual(bars,sites);
      const detail=await art(p,"Status by site").locator("tbody tr").evaluateAll(rs=>rs.map(r=>[...r.cells].map(c=>c.textContent)));
      assert.equal(detail.length,new Set(rows.map(r=>JSON.stringify([r.Site,r.Status]))).size);
      for(const [site,state,count,minutes] of detail) {
        const bySite=rows.filter(r=>r.Site===site&&r.Status===state).map(r=>Number(r.Minutes)).sort((a,b)=>a-b);
        assert.equal(Number(count),bySite.length);
        assert.equal(Number(minutes),(bySite[Math.floor((bySite.length-1)/2)]+bySite[Math.floor(bySite.length/2)])/2);
      }
      proof.push({status,count:rows.length,median,sites});
      if(status==="Open") await capture(p,"hospital-reader-workload");
    }
    await tab(p,"Site volumes").click();await settled(p);await p.locator("[data-action=reader-filters]").click();
    await p.getByRole("dialog",{name:"Filters",exact:true}).waitFor();
    assert.equal(await p.getByRole("dialog").locator(".locked-filter").count(),2);
    assert.equal(await p.getByRole("dialog").getByRole("combobox").count(),0);
  });
  await writeFile("portfolio-evidence/hospital-reader-workload.json",JSON.stringify({url,proof},null,2)+"\n");console.log({url,proof});
}
