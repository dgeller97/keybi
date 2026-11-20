import assert from "node:assert/strict";
import {
  studio,
  rename,
  open,
  art,
  visual,
  save,
  addPage,
  filter,
  settled,
} from "./portfolio-ui.mjs";
const title = "Supplier tooltip context",
  chart = "Booked by shop",
  target = "Stock detail";
export async function verifyAutomaticTooltips() {
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "What share of a shop's booked stock is paid?");
    const picker = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await picker
    ).setFiles({
      name: "Orders.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Shop,Period,Stage,Class,State,Amount\nA,Jan,Booked,Stock,Paid,10\nA,Jan,Booked,Stock,Open,30\nA,Jan,Booked,Freight,Paid,100\nA,Jan,Void,Stock,Paid,999\nB,Jan,Booked,Stock,Paid,7\nA,Feb,Booked,Stock,Paid,20\nB,Feb,Booked,Stock,Open,11\n",
      ),
    });
    await p
      .getByTitle("Orders.Shop", { exact: true })
      .waitFor({ state: "attached" });
    await filter(p, "page", "Orders · Stage", "Booked");
    await visual(
      p,
      "dropdown",
      "Period",
      ["Orders · Period"],
      [],
      [18, 18, 270, 118],
    );
    await visual(
      p,
      "bar",
      chart,
      ["Orders · Shop"],
      ["Orders · Amount"],
      [18, 153, 655, 315],
    );
    await visual(
      p,
      "clusteredBar",
      "Booked by payment state",
      ["Orders · State"],
      ["Orders · Amount"],
      [18, 480, 655, 220],
    );
    await art(p, "Period").locator("select").selectOption({ label: "Jan" });
    await settled(p);
    await addPage(p, target);
    await p.locator("#pages .page.active").dblclick();
    await p.getByLabel("Use as tooltip page").check();
    await p
      .getByLabel("Automatic tooltip field")
      .selectOption({ label: "Orders · Shop" });
    const automatic = p.getByLabel("Automatic tooltip field", { exact: true });
    await automatic.selectOption({ label: "Orders · Stage" });
    await p.getByRole("button", { name: "Remove Orders · Stage" }).click();
    await automatic.selectOption({ label: "Orders · State" });
    await p.locator("dialog button[type=submit]").click();
    await filter(p, "page", "Orders · Class", "Stock");
    await visual(
      p,
      "card",
      "Stock amount",
      [],
      ["Orders · Amount"],
      [18, 18, 250, 118],
      "currency",
    );
    await visual(
      p,
      "card",
      "Paid amount",
      [],
      ["Orders · Amount"],
      [278, 18, 250, 118],
      "currency",
    );
    await filter(p, "visual", "Orders · State", "Paid");
    await p.locator('[data-page="0"]').click();
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    const a = art(p, chart),
      tip = p.locator("#chart-tooltip"),
      marks = a.locator("[data-rich-tip]"),
      period = art(p, "Period").locator("select");
    const row = (k) => marks.filter({ hasText: k });
    async function values(anchor, stock, paid) {
      await anchor.focus();
      await p.waitForFunction(
        ([stock, paid]) => {
          const el = document.querySelector("#chart-tooltip");
          return (
            el &&
            !el.hidden &&
            [...el.querySelectorAll(".kpi")]
              .map((n) => n.textContent)
              .join("|") === [stock, paid].join("|")
          );
        },
        [stock, paid],
      );
    }
    assert.equal(await marks.count(), 2);
    await values(
      art(p, "Booked by payment state").locator(
        '[data-rich-tip][aria-label*="State Paid"]',
      ),
      "$17.00",
      "$17.00",
    );
    await p.keyboard.press("Escape");
    const source = await a.locator(".vbody").innerText();
    let delayed = false,
      release,
      started;
    const waiting = new Promise((r) => {
        started = r;
      }),
      gate = new Promise((r) => {
        release = r;
      });
    await p.route("**/api/query", async (route) => {
      if (!delayed) {
        delayed = true;
        started();
        await gate;
      }
      await route.continue();
    });
    await row("A").focus();
    await waiting;
    await values(row("B"), "$7.00", "$7.00");
    release();
    await p.waitForLoadState("networkidle");
    assert.deepEqual(await tip.locator(".kpi").allTextContents(), [
      "$7.00",
      "$7.00",
    ]);
    await p.unroute("**/api/query");
    await p.keyboard.press("Escape");
    await values(row("A"), "$40.00", "$10.00");
    await p.keyboard.press("Escape");
    assert.equal(await a.locator(".vbody").innerText(), source);
    assert.equal(await period.locator("option:checked").textContent(), "Jan");
    await period.selectOption({ label: "Feb" });
    await settled(p);
    await values(row("A"), "$20.00", "$20.00");
    await p.keyboard.press("Escape");
    await values(row("B"), "$11.00", "—");
    await p.keyboard.press("Escape");
    await a.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p.getByLabel("Tooltip page", { exact: true }).selectOption("fields");
    await settled(p);
    assert.equal(await marks.count(), 0);
    await p.getByLabel("Tooltip page", { exact: true }).selectOption("");
    await settled(p);
    assert.equal(await marks.count(), 2);
  });
  console.log(
    "Automatic field matching, manual override, scoped source/target filters, BLANK, stale-response protection, clean dismissal and saved authoring passed.",
  );
}
