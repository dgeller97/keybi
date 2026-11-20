import "./portfolio-data.mjs";
import {
  studio,
  open,
  rename,
  save,
  create,
  links,
  pageName,
  addPage,
  measure,
  visual,
  filter,
  capture,
  settled,
  setInput,
  art,
  cards,
} from "./portfolio-ui.mjs";
export const titles = [
  "Sales and Margin Overview",
  "Hospital Operations",
  "Budget vs. Actual",
  "Wait-Time Performance",
];
const stage = process.argv[2];
await studio(async (p) => {
  if (stage === "sales") {
    await cards(p).first().waitFor();
    const old = await cards(p).filter({ hasText: "Sales overview" }).count();
    await open(p, old ? "Sales overview" : titles[0]);
    await rename(
      p,
      titles[0],
      "Why does category A have a higher margin despite lower revenue?",
    );
    await pageName(p, "Revenue and margin");
    await save(p);
    await capture(p, "sales-overview");
    return;
  }
  if (stage === "hospital") {
    await create(
      p,
      titles[1],
      "Which sites miss the 45-minute target for closed routine encounters?",
      "hospital",
      ["Calendar", "Encounter"],
    );
    await links(p, 1);
    await pageName(p, "Site performance");
    await measure(
      p,
      "Within 45 minutes",
      "Encounter · MetTarget",
      "Encounter · Visits",
    );
    await visual(
      p,
      "card",
      "Closed routine visits",
      [],
      ["Encounter · Visits"],
      [20, 18, 300, 165],
    );
    await visual(
      p,
      "card",
      "Within 45 minutes",
      [],
      ["Within 45 minutes"],
      [335, 18, 300, 165],
    );
    await visual(
      p,
      "slicer",
      "Site",
      ["Encounter · Site"],
      [],
      [650, 18, 330, 165],
    );
    await visual(
      p,
      "bar",
      "Visits by month",
      ["Calendar · Month"],
      ["Encounter · Visits"],
      [20, 200, 465, 350],
    );
    await visual(
      p,
      "bar",
      "Target rate by site",
      ["Encounter · Site"],
      ["Within 45 minutes"],
      [503, 200, 477, 350],
    );
    await filter(p, "report", "Encounter · Cohort", "Routine");
    await filter(p, "page", "Encounter · Status", "Closed");
    await addPage(p, "Encounter detail");
    await visual(
      p,
      "table",
      "Routine encounter register",
      [
        "Encounter · Encounter",
        "Calendar · Date",
        "Encounter · Site",
        "Encounter · Status",
      ],
      ["Encounter · Minutes", "Within 45 minutes"],
      [20, 22, 960, 550],
    );
    await p.locator('[data-page="0"]').click();
    await save(p);
    return;
  }
  if (stage === "budget") {
    await create(
      p,
      titles[2],
      "Where did spending exceed budget, including unbudgeted transactions?",
      "budget",
      ["Period", "Department", "Budget", "Transaction"],
    );
    await links(p, 4);
    await pageName(p, "Variance statement");
    await measure(
      p,
      "Variance",
      "Transaction · Actual",
      "Budget · Budget",
      "difference",
      "number",
    );
    await measure(
      p,
      "Variance %",
      "Transaction · Actual",
      "Budget · Budget",
      "variance_pct",
      "percent",
    );
    await visual(
      p,
      "card",
      "Total budget",
      [],
      ["Budget · Budget"],
      [20, 15, 302, 120],
      "currency",
    );
    await visual(
      p,
      "card",
      "Total actual",
      [],
      ["Transaction · Actual"],
      [344, 15, 302, 120],
      "currency",
    );
    await visual(
      p,
      "card",
      "Spend above plan",
      [],
      ["Variance"],
      [667, 15, 312, 120],
      "currency",
    );
    await visual(
      p,
      "matrix",
      "Operating statement · USD",
      ["Department · Department", "Period · Period"],
      ["Budget · Budget", "Transaction · Actual", "Variance", "Variance %"],
      [20, 150, 960, 570],
    );
    await addPage(p, "Period comparison");
    await visual(
      p,
      "matrix",
      "Variance by department and period",
      ["Department · Department"],
      ["Variance"],
      [20, 20, 960, 380],
      "currency",
    );
    await p.locator("[data-tab=Build]").click();
    await p
      .locator("[data-pick=columns]")
      .selectOption({ label: "Period · Period" });
    await settled(p);
    await p.locator('[data-page="0"]').click();
    await save(p);
    return;
  }
  if (stage === "wait") {
    await create(
      p,
      titles[3],
      "Which services have the longest waits, and which visits explain the tail?",
      "wait",
      ["Visit"],
    );
    await pageName(p, "Wait profile");
    await visual(
      p,
      "card",
      "Median wait · minutes",
      [],
      [["Visit · Wait", "median"]],
      [20, 15, 285, 125],
    );
    await visual(
      p,
      "card",
      "90th percentile · minutes",
      [],
      [["Visit · Wait", "p90"]],
      [325, 15, 285, 125],
    );
    await visual(
      p,
      "slicer",
      "Period",
      ["Visit · Period"],
      [],
      [630, 15, 350, 125],
    );
    await visual(
      p,
      "bar",
      "90th percentile by service",
      ["Visit · Service"],
      [["Visit · Wait", "p90"]],
      [20, 155, 460, 208],
    );
    await visual(
      p,
      "bar",
      "Visits by wait band",
      ["Visit · Wait band"],
      ["Visit · Visits"],
      [498, 155, 482, 208],
    );
    await visual(
      p,
      "table",
      "Wait performance by period",
      ["Visit · Period"],
      [["Visit · Wait", "median"], ["Visit · Wait", "p90"], "Visit · Visits"],
      [20, 380, 960, 216],
    );
    await addPage(p, "Visit detail");
    await visual(
      p,
      "table",
      "Source visit records",
      [
        "Visit · Record",
        "Visit · Service",
        "Visit · Period",
        "Visit · Wait band",
      ],
      ["Visit · Wait"],
      [20, 20, 960, 565],
    );
    await p.locator('[data-page="0"]').click();
    for (const t of ["90th percentile by service", "Visits by wait band"]) {
      await art(p, t).locator(".vhead").click();
      await p.locator("[data-tab=Format]").click();
      await p.locator("#drill-target").selectOption({ label: "Visit detail" });
    }
    await save(p);
    return;
  }
  if (stage === "investigate") {
    await open(p, titles[2]);
    await addPage(p, "Ledger evidence");
    await visual(
      p,
      "table",
      "Budget lines",
      ["Department · Department", "Period · Period"],
      ["Budget · Budget"],
      [20, 20, 435, 515],
    );
    await visual(
      p,
      "table",
      "Posted transactions",
      [
        "Transaction · Transaction",
        "Department · Department",
        "Period · Period",
      ],
      ["Transaction · Actual"],
      [470, 20, 510, 515],
    );
    for (const [idx, title] of [
      [1, "Variance by department and period"],
      [0, "Operating statement · USD"],
    ]) {
      await p.locator('[data-page="' + idx + '"]').click();
      await art(p, title).locator(".vhead").click();
      await p.locator("[data-tab=Format]").click();
      await p
        .locator("#drill-target")
        .selectOption({ label: "Ledger evidence" });
    }
    await save(p);
    return;
  }
  if (stage === "source-pages") {
    await open(p, titles[0]);
    await addPage(p, "Sale detail");
    await visual(
      p,
      "table",
      "Sales behind the selection",
      [
        "Sales · SaleID",
        "Date · Date",
        "Product · Product",
        "Product · Category",
      ],
      ["Sales · Revenue", "Sales · Profit", "Margin"],
      [20, 20, 960, 380],
    );
    await p.locator('[data-page="0"]').click();
    await art(p, "Revenue by Category").locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.locator("#drill-target").selectOption({ label: "Sale detail" });
    await save(p);
    await p.locator("[data-action=home]").click();
    await open(p, titles[1]);
    for (const title of ["Target rate by site", "Visits by month"]) {
      await art(p, title).locator(".vhead").click();
      await p.locator("[data-tab=Format]").click();
      await p
        .locator("#drill-target")
        .selectOption({ label: "Encounter detail" });
    }
    await save(p);
    return;
  }
  if (stage === "ranking") {
    await create(
      p,
      "Service Tail Review",
      "Which five clinics have the longest 90th-percentile referral waits this period?",
      "tail",
      ["Referral"],
    );
    await pageName(p, "Priority clinics");
    await visual(
      p,
      "bar",
      "Five clinics with longest P90",
      ["Referral · Clinic"],
      [["Referral · Wait", "p90"]],
      [20, 16, 582, 325],
    );
    await p.locator("[data-tab=Build]").click();
    await p.locator("#rank-order").selectOption("desc");
    await setInput(p, "#rank-limit", 5);
    await visual(
      p,
      "card",
      "P90 in selection · minutes",
      [],
      [["Referral · Wait", "p90"]],
      [620, 16, 358, 138],
    );
    await visual(
      p,
      "slicer",
      "Review period",
      ["Referral · Period"],
      [],
      [620, 172, 358, 169],
    );
    await visual(
      p,
      "table",
      "Referral waits by period",
      ["Referral · Period"],
      [
        "Referral · Visits",
        ["Referral · Wait", "median"],
        ["Referral · Wait", "p90"],
      ],
      [20, 360, 958, 230],
    );
    await addPage(p, "Referral detail");
    await visual(
      p,
      "table",
      "Referrals behind the ranking",
      ["Referral · Referral", "Referral · Clinic", "Referral · Period"],
      ["Referral · Wait"],
      [20, 20, 960, 535],
    );
    await p.locator('[data-page="0"]').click();
    await art(p, "Five clinics with longest P90").locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.locator("#drill-target").selectOption({ label: "Referral detail" });
    await save(p);
    return;
  }
  throw Error("Unknown authoring task " + stage);
});
