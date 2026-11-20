import assert from "node:assert/strict";
import {
  studio,
  rename,
  open,
  art,
  save,
  settled,
  visual,
} from "./portfolio-ui.mjs";
export async function verifyPagedBars() {
  const title = "Signed daily changes",
    chart = "Daily change";
  const rows = Array.from({ length: 61 }, (_, i) => [
    "D" + String(i + 1).padStart(3, "0"),
    i === 22 ? null : (i - 30) / 100,
  ]);
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "Which days exceeded a 20% change?");
    const chooser = p.waitForEvent("filechooser");
    await p.locator(".ribbon [data-action=import]").click();
    await (
      await chooser
    ).setFiles({
      name: "Days.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Day,Change\n" + rows.map((r) => r.join(",")).join("\n") + "\n",
      ),
    });
    await p
      .getByTitle("Days.Change", { exact: true })
      .waitFor({ state: "attached" });
    await visual(
      p,
      "table",
      chart,
      ["Days · Day"],
      ["Days · Change"],
      [20, 20, 750, 540],
      "percent",
    );
    await p.getByLabel("Show data bars").check();
    const min = p.getByLabel("Bar minimum (%)", { exact: true }),
      max = p.getByLabel("Bar maximum (%)", { exact: true });
    await max.fill("20");
    await max.press("Tab");
    await min.fill("-20");
    await min.press("Tab");
    await min.fill("1");
    await min.press("Tab");
    await p.locator("#toast").filter({ hasText: "include zero" }).waitFor();
    assert.equal(await min.inputValue(), "-20");
    await p.getByLabel("Negative bars", { exact: true }).fill("#944533");
    await p.getByLabel("Bar direction").selectOption("reverse");
    await p.getByLabel("Zero line", { exact: true }).fill("#344780");
    await p.getByLabel("Show bar only").check();
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    const a = art(p, chart);
    const source = new Map(rows),
      seen = new Set();
    let pages = 0;
    for (;;) {
      await settled(p);
      pages++;
      const pageRows = await a.locator("tbody tr").evaluateAll((trs) =>
        trs.map((tr) => {
          const td = tr.cells[1],
            s = getComputedStyle(td);
          return [
            tr.cells[0].textContent,
            td.textContent,
            td.dataset.cellBar,
            s.getPropertyValue("--bar-zero"),
            s.getPropertyValue("--bar-width"),
            getComputedStyle(td, "::after").backgroundColor,
            s.getPropertyValue("--bar-left"),
            getComputedStyle(td, "::before").backgroundColor,
            getComputedStyle(td.querySelector(".cell-value")).opacity,
            td.title,
          ];
        }),
      );
      for (const [
        key,
        display,
        side,
        axis,
        width,
        color,
        left,
        axisColor,
        opacity,
        tooltip,
      ] of pageRows) {
        assert.ok(source.has(key) && !seen.has(key), key);
        seen.add(key);
        const n = source.get(key);
        if (n === null) {
          assert.equal(side, undefined);
          assert.equal(display, "—");
          continue;
        }
        assert.equal(side, n < 0 ? "negative" : n === 0 ? "zero" : "positive");
        assert.equal(parseFloat(axis), 50);
        assert.ok(
          Math.abs(parseFloat(width) - Math.min(50, Math.abs(n) * 250)) < 1e-9,
        );
        assert.equal(tooltip, display);
        assert.equal(opacity, "0");
        assert.equal(axisColor, "rgb(52, 71, 128)");
        assert.ok(
          Math.abs(
            parseFloat(left) - (n <= 0 ? 50 : 50 - Math.min(50, n * 250)),
          ) < 1e-9,
        );
        if (n < 0) assert.equal(color, "rgb(148, 69, 51)");
      }
      const next = a.locator('[data-page-delta="1"]');
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    assert.equal(pages, 3);
    assert.equal(seen.size, 61);
  });
  console.log(
    "Blank-canvas table retained signed percentage bars across all 61 rows, zero, null and both clipping limits.",
  );
}
