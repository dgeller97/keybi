import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const workspace =
  process.env.FOLIO_TEST_DATA ||
  (await mkdtemp(resolve("test-results/prepared-")));
process.env.FOLIO_URL = "http://127.0.0.1:4356/";
const { studio, open, save, rename, visual, art, settled } = await import(
  "./portfolio-ui.mjs"
);
const server = spawn(resolve("target/release/keybi.exe"), [], {
  env: { ...process.env, FOLIO_DATA: workspace, FOLIO_PORT: "4356" },
  stdio: ["ignore", "pipe", "inherit"],
  windowsHide: true,
});
const data =
  "Desk,Job,Amount,Unused\r\n West ,001,20,drop\r\nWest,002,55,drop\r\n East ,003,25,drop\r\n";
const title = "Prepared bookings";
try {
  await Promise.race([
    once(server.stdout, "data"),
    once(server, "exit").then(() => {
      throw Error("Server exited");
    }),
  ]);
  await studio(async (p) => {
    await p.locator("#home [data-action=new]").click();
    await rename(p, title, "Which region booked the most?");
    const chooser = p.waitForEvent("filechooser");
    await p.locator("[data-action=prepare]").click();
    await (
      await chooser
    ).setFiles({
      name: "Bookings.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(data),
    });
    await p.getByLabel("Trim Desk").check();
    await p.getByLabel("Keep Unused").uncheck();
    await p.getByLabel("Output name for Desk").fill("Region");
    await p.getByLabel("Output name for Amount").fill("Revenue");
    await p.getByLabel("Type for Desk").selectOption("number");
    await p.getByRole("button", { name: "Load table" }).click();
    await p
      .locator("#dlgform .err")
      .filter({ hasText: "Row 2, column Region" })
      .waitFor();
    await p.getByLabel("Type for Desk").selectOption("text");
    await p.getByLabel("Type for Job").selectOption("text");
    await p.getByLabel("Type for Amount").selectOption("number");
    assert.deepEqual(
      await p
        .locator("#csv-preview tbody tr")
        .first()
        .locator("td")
        .allTextContents(),
      ["West", "001", "20"],
    );
    await p.getByRole("button", { name: "Load table" }).click();
    await p.locator("dialog").waitFor({ state: "hidden" });
    await visual(
      p,
      "clusteredColumn",
      "Booked revenue",
      ["Bookings · Region"],
      ["Bookings · Revenue"],
      [20, 20, 600, 280],
    );
    await visual(
      p,
      "card",
      "All regions",
      [],
      ["Bookings · Revenue"],
      [640, 20, 330, 140],
    );
    await visual(
      p,
      "table",
      "Bookings",
      ["Bookings · Job"],
      ["Bookings · Revenue"],
      [20, 320, 600, 220],
    );
    await p.getByRole("button",{name:"Page settings for Page 1"}).click();
    await p.getByLabel("Use a phone layout").check();
    await p.getByLabel("Move All regions up").click();
    for(const name of ["All regions","Booked revenue"])
      await p.getByLabel(name+" phone width").selectOption("half");
    await p.getByLabel("Bookings height in pixels").fill("250");
    await p.getByRole("dialog").getByRole("button",{name:"Save",exact:true}).click();
    await p.locator("[data-action=theme]").click();
    const palette = {
      name: "Bookings blue",
      dataColors: ["#244f84", "#ba663a"],
    };
    await p.locator("#theme-import").setInputFiles({
      name: "palette.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(palette)),
    });
    await p.waitForFunction(
      () => document.querySelector("#theme-name").value === "Bookings blue",
    );
    await p.getByRole("button", { name: "Apply theme" }).click();
    const a = art(p, "Booked revenue");
    await a.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    await p
      .getByRole("checkbox", { name: "All regions", exact: true })
      .uncheck();
    await settled(p);
    const west = a.getByRole("button", { name: /Region West/ });
    await west.press("Enter");
    await settled(p);
    assert.equal(await west.getAttribute("aria-pressed"), "true");
    await save(p);
  });
  await studio(async (p) => {
    await open(p, title);
    await p.locator("[data-action=toggle-reading]").click();await settled(p);
    await p.getByLabel("Page layout",{exact:true}).selectOption("phone");
    assert.deepEqual(await p.locator("#paper .vhead strong").allTextContents(),["All regions","Booked revenue","Bookings"]);
    assert.equal((await art(p,"Bookings").boundingBox()).height,250);
    const revenueBox=await art(p,"Booked revenue").boundingBox(),totalBox=await art(p,"All regions").boundingBox();
    assert.equal(revenueBox.y,totalBox.y);assert.equal(revenueBox.x-totalBox.x-totalBox.width,8);
    assert.deepEqual(await art(p,"Bookings").locator("tbody td").allTextContents(),["001","20","002","55"]);
    await p.locator("[data-action=toggle-reading]").click();await settled(p);
    const a = art(p, "Booked revenue");
    assert.equal(
      await a.locator("[aria-pressed=true] rect").getAttribute("fill"),
      "#244f84",
    );
    assert.equal(
      await art(p, "All regions").locator(".kpi").innerText(),
      "100",
    );
    const detail = art(p, "Bookings");
    assert.deepEqual(await detail.locator("tbody td").allTextContents(), [
      "001",
      "20",
      "002",
      "55",
    ]);
    await detail.locator(".vhead").click();
    await p.locator("[data-tab=Format]").click();
    const download = p.waitForEvent("download");
    await p.locator("[data-action=export-csv]").click();
    const file = await download;
    assert.equal(file.suggestedFilename(), "Bookings.csv");
    assert.equal(
      (await readFile(await file.path(), "utf8")).trim(),
      '"Job","Revenue"\r\n"001","20"\r\n"002","55"',
    );
    await a.locator("[data-clear]").click();
    await settled(p);
    assert.equal(await detail.locator("tbody tr").count(), 3);
    await p.locator(".rail [data-action=model]").click();
    await p.getByText("Applied steps", { exact: true }).click();
    assert.match(
      await p.locator(".modelcard details").innerText(),
      /Region · text · trim/,
    );
  });
  const { authorFormulas, reopenFormulas } = await import(
    "./formula-check.mjs"
  );
  await studio(authorFormulas);
  await studio(reopenFormulas);
  const { verifyRefresh } = await import("./refresh-check.mjs");
  await verifyRefresh();
  const { verifyPagedDropdown } = await import("./paged-dropdown.mjs");
  await verifyPagedDropdown();
  const {verifyPastedValues}=await import("./imported-pasted-values.mjs");
  await verifyPastedValues();
  const {verifySyncedSlicers}=await import("./imported-synced-slicers.mjs");
  await verifySyncedSlicers();
  const {verifyAuthorHistory}=await import("./author-history.mjs");
  await verifyAuthorHistory();
  const {verifyWorkbook}=await import("./imported-workbook.mjs");
  await verifyWorkbook();
  const {verifyNamedTables}=await import("./workbook-named-tables.mjs");
  await verifyNamedTables();
  const {verifyMergedPurchases}=await import("./merged-purchases.mjs");
  await verifyMergedPurchases();
  const {verifyMergeKeys}=await import("./merge-keys.mjs");
  await verifyMergeKeys();
  const {verifyOuterMerge}=await import("./outer-merge.mjs");await verifyOuterMerge();
  const {verifyVoucherImages}=await import("./voucher-images.mjs");
  await verifyVoucherImages();
  const {verifyPublishing}=await import("./publish-report.mjs");
  await verifyPublishing();
  const {verifyNarrative}=await import("./narrative-values.mjs");
  await verifyNarrative();
  const {verifySparklines}=await import("./row-sparklines.mjs");
  await verifySparklines();
  const {verifySparkBoundaries}=await import("./sparkline-boundaries.mjs");
  await verifySparkBoundaries();
  const {verifyPanels}=await import("./small-multiples.mjs");await verifyPanels();
  const {verifyPagedPanels}=await import("./paged-panels.mjs");await verifyPagedPanels();
  const {verifyRowExpression}=await import("./row-expression.mjs");await verifyRowExpression();
  const {verifySelectedValues}=await import("./selected-value.mjs");await verifySelectedValues();
  const {verifyNamedGroups}=await import("./named-groups.mjs");await verifyNamedGroups();
  const {verifyVisualSubtitles}=await import("./visual-subtitles.mjs");await verifyVisualSubtitles();
  const {verifyDetailRowSelection}=await import("./detail-row-selection.mjs");await verifyDetailRowSelection();
  const {verifyArrange}=await import("./arrange-visuals.mjs");
  await verifyArrange();
  const {verifyCanvasRectangle}=await import("./canvas-rectangle.mjs");
  await verifyCanvasRectangle();
  const {verifyDuplicates}=await import("./duplicate-visuals.mjs");
  await verifyDuplicates();
  const {verifyVisualCopy}=await import("./copy-visuals.mjs");
  await verifyVisualCopy();
  const {verifyShapes}=await import("./report-shapes.mjs");
  await verifyShapes();
  const { verifyCalendar } = await import("./calendar-axis.mjs");
  await verifyCalendar();
  const {verifyImportedIntraday}=await import("./imported-intraday.mjs");
  await verifyImportedIntraday();
  const {verifyNumericTrend}=await import("./imported-numeric-trend.mjs");
  await verifyNumericTrend();
  const {verifyImportedBins}=await import("./imported-bins.mjs");
  await verifyImportedBins();
  const {verifyTimeBins,verifyTimestampSort}=await import("./imported-time-bins.mjs");
  await verifyTimeBins();
  const {verifyCalendarPeriods}=await import("./imported-calendar-periods.mjs");
  await verifyCalendarPeriods();
  await verifyTimestampSort();
  const { verifyUnpivot } = await import("./unpivot-refresh.mjs");
  await verifyUnpivot();
  const { verifyParquetImport } = await import("./parquet-check.mjs");
  await verifyParquetImport(workspace);
  const { verifyPagedBars } = await import("./paged-bars.mjs");
  await verifyPagedBars();
  const { verifyAutomaticTooltips } = await import("./auto-tooltip.mjs");
  await verifyAutomaticTooltips();
  const { verifyEmptyItems } = await import("./empty-items.mjs");
  await verifyEmptyItems();
  const {verifyMeasureFilters} = await import("./measure-filter-workflow.mjs");
  await verifyMeasureFilters();
  const { verifyReferenceLines } = await import("./imported-reference-lines.mjs");
  await verifyReferenceLines();
  const {verifyImportedAreas} = await import("./imported-areas.mjs");
  await verifyImportedAreas();
  const { verifyTrendDrill } = await import("./imported-trend-drill.mjs");
  await verifyTrendDrill();
  const { verifyFieldOrder } = await import("./field-order.mjs");
  await verifyFieldOrder();
  const {verifyImportedReplacement} = await import("./imported-field-replacement.mjs");
  await verifyImportedReplacement();
  const {verifyFieldParameter} = await import("./imported-field-parameter.mjs");
  await verifyFieldParameter();
  const {verifyDimensionParameter} = await import("./imported-dimension-parameter.mjs");
  await verifyDimensionParameter();
  const {verifyMultiMeasure} = await import("./multi-measure.mjs");
  await verifyMultiMeasure();
  const {verifyMatrixParameter} = await import("./matrix-parameter.mjs");
  await verifyMatrixParameter();
  const {verifyMatrixLayout} = await import("./matrix-layout.mjs");
  await verifyMatrixLayout();
  const {verifyFilterContext}=await import("./filter-context.mjs");
  await verifyFilterContext();
  const {verifyFormatSources}=await import("./format-sources.mjs");
  await verifyFormatSources();
  const {verifyConditionalMeasures}=await import("./conditional-measures.mjs");
  await verifyConditionalMeasures();
  const {verifyImportedCategoryCards}=await import("./imported-category-cards.mjs");
  await verifyImportedCategoryCards();
  const {verifyImportedChartSelection}=await import("./imported-chart-selection.mjs");
  await verifyImportedChartSelection();
  const {verifyImportedLegends}=await import("./imported-legends.mjs");
  await verifyImportedLegends();
  const {verifyImportedRanking}=await import("./imported-ranking.mjs");
  await verifyImportedRanking();
  const {verifyImportedPointColors}=await import("./imported-point-colors.mjs");
  await verifyImportedPointColors();
  const {verifyImportedReaderFilters}=await import("./imported-reader-filters.mjs");
  await verifyImportedReaderFilters();
  const {verifyImportedSeriesColors}=await import("./imported-series-colors.mjs");
  await verifyImportedSeriesColors();
  console.log(
    "Prepared CSV, palette, interactions, exported rows, formula editing, BLANK semantics, non-additive totals and multi-select persistence passed.",
  );
} finally {
  if (server.exitCode === null) {
    const done = once(server, "exit");
    server.kill();
    await done;
  }
}
