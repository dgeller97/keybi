import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {art,capture,open,settled,studio} from "./portfolio-ui.mjs";

const findings = [];
for (const [report,page,title,category,reason] of [
  ["Budget vs. Actual","Forecast review","Actual and forecast by department","Facilities","Actual less forecast is $73.00, above the $0.00 threshold."],
  ["Hospital Operations","Attainment exceptions","Attainment on recorded days","2026-03-05","Within 45 minutes is 33.33%, below the 60% threshold."],
]) {
  await studio(async p => {
    await open(p,report);
    await p.getByRole("button",{name:page,exact:true}).click();
    await settled(p);
    const chart = art(p,title);
    const mark = chart.locator(`[data-selection-key='${JSON.stringify([category])}'][data-metric="0"]`);
    const tip = p.getByRole("tooltip");
    let queries = 0;
    p.on("request",r => { if (r.url().endsWith("/api/query")) queries++; });
    const name = await mark.getAttribute("aria-label");
    assert.equal(await mark.getAttribute("aria-description"),reason);
    await mark.hover();
    await tip.getByText(reason,{exact:true}).waitFor();
    assert.equal(await tip.innerText(),name + "\n" + reason);
    await capture(p,report.startsWith("Budget") ? "budget-color-explanation" : "hospital-color-explanation");
    await p.keyboard.press("Escape");
    await tip.waitFor({state:"hidden"});
    await mark.focus();
    await tip.getByText(reason,{exact:true}).waitFor();
    assert.equal(await mark.getAttribute("aria-describedby"),"chart-tooltip");
    await p.keyboard.press("Escape");
    await tip.waitFor({state:"hidden"});
    assert.equal(queries,0);
    findings.push({report,page,name,reason,queries});
  });
}
await writeFile("portfolio-evidence/chart-color-explanations.json",JSON.stringify(findings,null,2)+"\n");
console.log(findings);
