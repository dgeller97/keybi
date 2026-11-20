import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  studio,
  open,
  create,
  visual,
  settled,
  save,
  art,
  addPage,
  pageName,
  capture,
  cards,
  filter,
  evidence,
} from "./portfolio-ui.mjs";

const source = "Dispatch · ";
const pages = [
  [
    "Comparisons",
    [
      [
        "clusteredBar",
        "Regional revenue by channel",
        "Region",
        "Revenue",
        { legendFields: "Channel" },
      ],
      [
        "stackedBar",
        "Channel contribution",
        "Region",
        "Revenue",
        { legendFields: "Channel" },
      ],
      [
        "percentBar",
        "Channel share by region",
        "Region",
        "Revenue",
        { legendFields: "Channel" },
      ],
      [
        "clusteredColumn",
        "Regional order counts",
        "Channel",
        "Orders",
        { legendFields: "Region" },
      ],
      [
        "stackedColumn",
        "Orders by channel",
        "Channel",
        "Orders",
        { legendFields: "Region" },
      ],
      [
        "percentColumn",
        "Regional share of orders",
        "Channel",
        "Orders",
        { legendFields: "Region" },
      ],
    ],
  ],
  [
    "Trends",
    [
      [
        "line",
        "Monthly revenue",
        "Period",
        "Revenue",
        { legendFields: "Region" },
      ],
      [
        "area",
        "Order volume by region",
        "Period",
        "Orders",
        { legendFields: "Region" },
      ],
      [
        "combo",
        "Revenue and order volume",
        "Period",
        "Revenue",
        { other: "Orders" },
      ],
      [
        "indicator",
        "Latest revenue versus target",
        "Period",
        "Revenue",
        { other: "Target" },
      ],
    ],
  ],
  [
    "Distributions",
    [
      [
        "scatter",
        "Orders and revenue",
        "Period",
        "Orders",
        { other: "Revenue", legendFields: "Region" },
      ],
      [
        "bubble",
        "Target by market and period",
        "Period",
        "Orders",
        { other: "Revenue", size: "Target", legendFields: "Region" },
      ],
      ["pie", "Share of regional revenue", "Region", "Revenue", {}],
      ["donut", "Share of orders by channel", "Channel", "Orders", {}],
      [
        "dot",
        "Channel revenue by region",
        "Region",
        "Revenue",
        { legendFields: "Channel" },
      ],
    ],
  ],
  [
    "Detail",
    [
      ["list", "Region filter", "Region", null, {}],
      ["dropdown", "Channel filter", "Channel", null, {}],
      ["dateRange", "Period filter", "Period", null, {}],
      ["table", "Period and region detail", "Period", "Revenue", {}],
      [
        "matrix",
        "Orders by region and channel",
        "Region",
        "Orders",
        { columns: "Channel" },
      ],
    ],
  ],
];
const ledger = "Revenue in selection";
const reportTitle = "Visual Gallery";
const topCard = [18, 12, 960, 93];
function position(i) {
  return [18 + (i % 2) * 488, 118 + Math.floor(i / 2) * 246, 472, 234];
}
const button = (p, name) =>
  p.locator("#pages .page").filter({ hasText: name }).first();
async function visit(p, name) {
  await button(p, name).click();
  await settled(p);
}
async function build(p) {
  if (await cards(p).filter({ hasText: reportTitle }).count())
    await open(p, reportTitle);
  else {
    await create(
      p,
      reportTitle,
      "How do regional revenue, volume and target attainment change over time?",
      "gallery",
      ["Dispatch"],
    );
    await pageName(p, pages[0][0]);
    await save(p);
  }
  for (const [name, charts] of pages) {
    if (await button(p, name).count()) await visit(p, name);
    else await addPage(p, name);
    if (!(await art(p, ledger).count()))
      await visual(
        p,
        "card",
        ledger,
        [],
        [source + "Revenue"],
        topCard,
        "currency",
      );
    for (const [i, [kind, title, g, m, extra]] of charts.entries()) {
      if (await art(p, title).count()) continue;
      await visual(
        p,
        kind,
        title,
        [source + g],
        m ? [source + m] : [],
        position(i),
      );
      await p.locator("[data-tab=Build]").click();
      for (const [key, field] of Object.entries(extra))
        await p
          .locator("[data-pick=" + key + "]")
          .selectOption({ label: source + field });
      if (m) {
        const agg = p.locator("[data-well=metrics] [data-agg]").first();
        await agg.selectOption("avg");
        await settled(p);
        await agg.selectOption("sum");
      } else {
        await p.locator("[data-pick=groups]").selectOption({
          label: source + (g === "Region" ? "Period" : "Region"),
        });
        await p
          .locator("[data-pick=groups]")
          .selectOption({ label: source + g });
      }
      await p.locator("[data-tab=Format]").click();
      await p
        .locator("#vaccent")
        .fill(["#216c62", "#aa602d", "#536ba2"][i % 3]);
      if (["clusteredBar", "donut", "line"].includes(kind))
        await p.locator("[data-opt=labels]").check();
      await save(p);
    }
  }
  await visit(p, pages[0][0]);
  await save(p);
}
const rows = (await readFile("web/datasets/gallery/Dispatch.csv", "utf8"))
  .trim()
  .split(/\r?\n/);
const header = rows.shift().split(",");
const facts = rows.map((l) =>
  Object.fromEntries(
    l.split(",").map((x, i) => [header[i], i < 3 ? x : Number(x)]),
  ),
);
const sum = (data, key) => data.reduce((n, r) => n + r[key], 0);
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );
const revenue = async (p, data) => {
  await settled(p);
  assert.equal(
    await art(p, ledger).locator(".kpi").innerText(),
    money(sum(data, "Revenue")),
  );
};
async function verify(p) {
  await open(p, reportTitle);
  for (const [name, charts] of pages) {
    await visit(p, name);
    await revenue(p, facts);
    for (const [kind, title, g, m, extra] of charts) {
      const a = art(p, title);
      if (["table", "matrix"].includes(kind)) {
        assert.ok(await a.locator("tbody tr").count());
        continue;
      }
      const dimensions = [
        g,
        ...(extra.legendFields ? [extra.legendFields] : []),
      ];
      const tuples = [
        ...new Map(
          facts.map((r) => [JSON.stringify(dimensions.map((k) => r[k])), r]),
        ).values(),
      ].sort((a, b) => {
        for (const k of dimensions) {
          const c = a[k].localeCompare(b[k]);
          if (c) return c;
        }
        return 0;
      });
      const subset = (row) =>
        facts.filter((r) => dimensions.every((k) => r[k] === row[k]));
      if (kind === "dateRange") {
        await a.locator("[data-range='0']").fill("2026-02-01");
        await revenue(
          p,
          facts.filter((r) => r.Period >= "2026-02-01"),
        );
        await a.locator("[data-range='1']").fill("2026-02-01");
        await revenue(
          p,
          facts.filter((r) => r.Period === "2026-02-01"),
        );
      } else if (kind === "list" || kind === "dropdown") {
        if (kind === "list") await a.locator("[data-item='0']").click();
        else await a.locator("select").selectOption("0");
        await revenue(p, subset(tuples[0]));
      } else {
        const marks = await a.locator("[data-point]").evaluateAll((items) =>
          items.map((el) => ({
            ...el.dataset,
            title: el.getAttribute("aria-label"),
          })),
        );
        assert.equal(
          marks.length,
          kind === "indicator" ? 1 : tuples.length * (kind === "combo" ? 2 : 1),
          title,
        );
        for (const mark of marks) {
          const data = subset(tuples[Number(mark.point)]);
          const field = Number(mark.metric) === 1 ? extra.other : m;
          assert.equal(Number(mark.value), sum(data, field), title);
          if (kind === "indicator") assert.match(mark.title, /732/);
          if (["scatter", "bubble"].includes(kind)) {
            assert.equal(Number(mark.x), sum(data, m));
            assert.equal(Number(mark.y), sum(data, extra.other));
            if (extra.size)
              assert.equal(Number(mark.size), sum(data, extra.size));
          }
          if (["pie", "donut"].includes(kind))
            assert.ok(
              Math.abs(Number(mark.share) - sum(data, m) / sum(facts, m)) <
                1e-10,
            );
          if (kind.startsWith("percent"))
            assert.ok(
              Math.abs(
                Number(mark.end) -
                  Number(mark.start) -
                  sum(data, m) /
                    sum(
                      facts.filter((r) => r[g] === data[0][g]),
                      m,
                    ),
              ) < 1e-10,
            );
          if (kind === "combo" && Number(mark.metric) === 1)
            assert.equal(mark.axis, "secondary");
        }
        await a.locator("[data-point]").first().focus();
        await p.keyboard.press("Enter");
        await revenue(p, subset(tuples[Number(marks[0].point)]));
      }
      await a.locator("[data-clear]").click();
      await revenue(p, facts);
    }
    await capture(p, "gallery-" + name.toLowerCase());
  }
  await visit(p, "Trends");
  const combo = art(p, "Revenue and order volume");
  await combo.locator(".vhead").click();
  await p.locator("[data-tab=Build]").click();
  await p.locator("[data-kind=line]").click();
  await settled(p);
  assert.equal(await p.locator("[data-well=metrics] .wellrow").count(), 2);
  await p.locator("[data-kind=combo]").click();
  await settled(p);
  assert.equal(await p.locator("[data-well=other] .wellrow").count(), 1);
  assert.equal(await p.locator("[data-well=metrics] .wellrow").count(), 1);
  await visit(p, "Comparisons");
  await save(p);
  await writeFile(
    evidence + "/gallery.json",
    JSON.stringify(
      {
        title: reportTitle,
        url: p.url(),
        verified: pages.map(([name, charts]) => ({
          name,
          types: charts.map((c) => c[0]),
        })),
        checked: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
if (process.argv[2] !== "verify") await studio(build);
await studio(verify);
console.log(
  "Visual Gallery passed independent grouped-value and selection checks in fresh Chrome.",
);
