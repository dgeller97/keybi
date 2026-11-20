# KeyBI

KeyBI is a business intelligence tool built in Rust. Import your data, model the relationships between tables, and build an interactive report in your browser. An Axum server runs locally and uses Apache DataFusion to query imported data stored as Parquet. The browser receives aggregates and paged rows.

## What works today

- **Prepare data.** Import CSV, Parquet and Excel worksheets or named tables. Preview and transform columns, unpivot data, merge tables on one or more keys, and refresh from a replacement file.
- **Model and calculate.** Create one-to-many relationships, calculated columns and reusable measures. The supported DAX subset includes weighted ratios, filter-context changes, row-by-row calculations and selection-dependent text.
- **Build reports.** Start on a blank canvas with bar, column, line, area and combo charts, scatterplots, maps, tables, matrices, KPI cards and slicers. Configure field wells, axes, formatting, small multiples and sparklines.
- **Explore and share.** Cross-filter visuals, drill into records, save bookmarks and design phone layouts. Export self-contained `.keybi` reports or publish a read-only snapshot in the local workspace. Older `.folio` reports can be imported and exported as `.keybi`.

The library includes six editable reports with 63 pages. In the four-visual benchmark on one million sales, the report opened in **414 ms** and filtering reached **25.7 ms p95** on the documented reference machine. [Report gallery](PORTFOLIO.md) · [Feature coverage and limitations](VISUAL-CAPABILITIES.md) · [Benchmark methodology](BENCHMARKS.md)

## Quick start

Install Rust and a native C toolchain, then run these commands from a terminal.

```sh
git clone https://github.com/dgeller97/keybi.git
cd keybi
cargo run --release --locked
```

Open [KeyBI on localhost](http://127.0.0.1:4317/). Choose **Visual Gallery** to explore the sample reports, or **New report → Get data** to start with your own files.

## Example workflows

KeyBI opens to a local library of editable reports. Choose **New report → Get data** to import CSVs, Parquet files or selected worksheets and named tables from an Excel workbook. Model view shows the tables, one-to-many relationships, and reusable measure expressions. [Explore the Visual Gallery, five example reports, and their browser evidence](PORTFOLIO.md).

To recreate **Purchase authorizations**, choose the purchasing workbook, preview **Purchase lines** and **Cost centers**, and select both. Relate Cost centers → Center to Purchase lines → Center. Sum **Line amount** by **Department**. Facilities accounts for $112.25 of $225.75, including a $12.25 credit and a zero-quantity line. Excel formulas use their saved results. [Download the workbook](http://127.0.0.1:4317/datasets/budget/PurchaseReview.xlsx) · [Open the Budget page](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/a7b59dd3-d734-43e6-90fd-12ee3abacd41)

To recreate **Approval limits**, import **AuthorizationLimits** from the same workbook and relate its **Center** key to **Purchase lines → Center**. The table preview excludes the notes, totals row and adjacent review codes. P-01 is $24.50 above its limit and P-02 is $5.00 above. [Open Approval limits](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/25f7a0ac-697c-4a27-90c5-d276796649aa)

To build **Approval exceptions**, open Model and choose **Merge tables**. Join Purchase lines to AuthorizationLimits on Center, expand the limit and owner, and create a calculated column subtracting the limit from Line amount. Set the page filter to **Greater than 0**. The two exceptions total $29.50. **Refresh merge** reapplies the saved join after either source changes. [Open Approval exceptions](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/0ae73d0d-14d7-42c2-9557-bb45073ddc68)

To inspect a voucher in Budget, open **Purchase vouchers** and select P-02. The $80 Surgery voucher shows four units at $20 and the approval card shows $5 above its limit. Click the image to enlarge it. To recreate it, choose **Add visual → Report objects → Image**, then **Match image to field → Order** and add an image for each order. [Open Purchase vouchers](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/b30fb962-4933-4b32-9462-ada24fe2f3a2) · [P-01 voucher](web/datasets/budget/P-01-voucher.png) · [P-02 voucher](web/datasets/budget/P-02-voucher.png)

To apply the next purchasing file, open **Model → Purchase lines → Update from file**. Preview the worksheet and choose **Append rows** or **Replace all rows**. The update matches columns by header even when their order changes. With Facilities selected, appending the two adjustments raises its total to $126.75. [Download the adjustments](http://127.0.0.1:4317/datasets/budget/PurchaseChanges.xlsx)

In the Gallery, choose **Focus visual → Regional revenue by channel** in reading view, or **Focus mode** in the chart header while editing. Select East/Retail to inspect its three dispatch records. **Back to report** restores the page at its previous scroll position with $454 selected. [Open the Gallery in reading view](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/8700a17d-11db-48b2-9e48-94c2c231a3d4)

Open **Page settings → Use a phone layout** to choose visuals, order them, and set their widths and heights. Two consecutive visible visuals set to **Half width** share a row. Hospital’s Encounter workload pairs the visit count with median wait above the full-width site chart. In reading view, **Automatic layout** uses the phone layout at browser widths up to 600 px. Choose **Phone layout** to preview it on a desktop. When a selection comes from a visual outside the current layout, its label above the canvas lets you clear it. [Hospital phone layout](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/e3f296c3-d9b8-42e1-a226-8ba801e345a3) · [Gallery phone layout](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/84d5da57-87f5-42ac-8b36-7d591a703a58)

Use **Format → Series colors → Pin displayed colors** to keep the same colors as filters change. Each pinned series has its own **Use automatic color** button. On the Gallery’s Channel performance page, West stays orange when a selection leaves it as the only region in the stacked bar. [Filtered chart](portfolio-evidence/gallery-phone-selection.png)

To reuse a visual, click its title and press **Ctrl+C**, open the destination page, then press **Ctrl+V**. **Ctrl+D** makes an independent copy on the current page. For several visuals, drag from empty canvas around the group or Ctrl-click the titles. **Arrange** aligns or distributes the selected visuals. The Hospital comparison page was built by copying the monthly combo and adding a separate site filter to each copy. [Open Harbor and Ridge](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/d3ac1591-54ba-4f58-b8ff-5bf561b6425e)

## Launch

From the project directory on this Windows machine, run the existing release build.

```powershell
.\target\release\keybi.exe
```

Open [KeyBI](http://127.0.0.1:4317). The server locates the project assets from its working directory or executable path. Set `FOLIO_PORT` to choose another port. To restart the local release on Windows, run `.\scripts\restart-local.ps1`.

Rebuild with the workspace-local Rust toolchain.

```powershell
.\cargo-local.ps1 build --release --locked
```

On a machine with Rust and a native C compiler, use `cargo build --release --locked`. Node is needed for dataset generation and browser verification. The release application runs without Node.

To group a numeric column, right-click it in Data or choose **Calculated column → Create numeric bins**. Set the bin size and use the resulting field on a chart, table, matrix or slicer. To replace a chart axis directly, open its bound field and choose **Create numeric bins**. Each interval includes its starting value. On an unranked bar or column chart sorted by category, enable **Format → Show empty intervals** to see gaps. In Wait intervals, 50–<60 has no visits and 60–<70 has five. [Open the example](http://127.0.0.1:4317/#r18e9013cd2b05b3c2/read/page/5976b74b-19ae-48ab-9930-cd745ee50cf3)

## Read and explore a report

In edit mode, use **Undo** and **Redo** in the header to recover a removed visual, its field assignments, formatting and selection. The canvas shortcuts are **Ctrl+Z**, **Ctrl+Y** and **Ctrl+Shift+Z**. Reading view has its own temporary selections. Reopening a report starts a new edit history.

To carry a slicer selection across pages, choose the slicer and open **Format → Slicer settings → Sync slicers**. Choose a matching slicer on the destination page, or **Filter page only** to filter its visuals. In Hospital, select Harbor on Site performance. Site volumes shows 50 closed visits, and Encounter workload shows 8 open visits. The **Harbor open workload** bookmark opens that view directly. [Open Hospital Operations](http://127.0.0.1:4317/#r18e900ae81e95b242/read)

To filter by a list of IDs, choose **Paste values** in the list or dropdown slicer header. Paste one value per line. The preview shows which values matched and lists any missing IDs. **Review matches** lets you remove a value before choosing **Apply**. To change a saved selection, use **Show selected**. In **Hospital Operations → Encounter detail**, the **Pasted case review** bookmark shows E002, E191 and E192. [Open Encounter detail](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/026c108b-8117-4665-a7fd-37cbf818f60d)

To group a date or timestamp, right-click the field in **Data** and choose the duration in **Create time bins**. An hour groups all records by UTC after applying their offsets. On a bar or column chart, **Show empty intervals** keeps hours without records visible between the first and last observed hours. On a detail table, use **Build → Timestamp sorting** to order ISO timestamps chronologically while displaying their original text. Shift-click a second column heading to break ties. [Open Hourly dispatch](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/31f13edc-0bf1-422a-bf87-bd1abe96d5b1)

For calendar periods, choose **Months**, **Quarters** or **Years** in **Create time bins**. To build a drillable chart, bind an ISO date or timestamp to its category or trend axis, open the bound field’s menu and choose **Use date hierarchy**. Select a bar and drill into its year, quarter, month and day. Choose **Use date column** from a level’s menu to restore the original field. [Try Quarterly spending](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/20e1f0f0-50c5-4b11-baf2-d7c497d6ed57) · [Try Calendar review](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/bcee8a49-e257-4daa-97e3-a3b708b7d705)

On **Hospital Operations → Calendar review**, drill through 2026, Q1 and February. **Format → Show empty intervals** includes every day of the selected month. Selecting February 28 gives zero visits and an empty ledger. Drilling into Q3 also works when all three months have zero visits.

On **Budget vs. Actual → Quarterly spending**, open **Bookmarks → January and March spending**. Open **Filters** to change the selected months. In edit mode, use **Filters → Add page filter → Condition → Is one of** to create your own selection. Choose **Is blank** for missing values. For a single quarter, choose **Equals** and enter the label shown on the chart, such as **2026 Q1**. The **First-quarter spending** bookmark saves that filter.

On **Hospital Operations → Encounter detail**, type **e19** in **Find an encounter**. The dropdown offers E190, E191 and E192. Choose E192 to see a 58-minute visit at Ridge. To build this on a blank page, bind a text field to a list or dropdown slicer and enable **Format → Slicer settings → Show search box**. A text field in an **Is one of** filter also has a search box. Choices survive subsequent searches. [Open Encounter detail](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/026c108b-8117-4665-a7fd-37cbf818f60d)

To combine values in a dropdown, enable **Format → Selection → Select multiple values**. Open the dropdown, check values and choose **Apply**. On **Daily coverage**, **Bookmarks → Cedar and Harbor in March** restores both sites and 26 closed routine visits. [Open Daily coverage](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/289e1ce3-73d5-4f7b-8dae-be40781bbcd7)

For reporting weeks, choose **Weeks**, enter the number of weeks per interval, and set **Week starts on**. For example, Hospital Operations groups encounters by the related calendar date into Monday-start weeks. [Open Weekly caseload](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/02336fc2-cf22-4239-aa2a-3a054a9c3308)

Choose **Read** on a library card, or **Reading view** in the editor. Chart selections, slicers, drillthrough, bookmarks and filter changes apply to that reading session. **Reset view** restores its starting state. **Edit report** returns to the author’s canvas, including unsaved edits. **Get reading link** opens a saved page in reading view on the same Folio server. [Read Visual Gallery](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read)

In **Hospital Operations → Encounter workload**, open **Filters** and change Status from Open to Closed. The count rises from 25 to 149, and the median wait changes from 41 to 42 minutes. **All values** shows 174 routine encounters. The Routine cohort stays locked. In the editor’s Filters pane, each filter’s reader settings let an author allow changes, show a locked value or hide the filter control. [Read Encounter workload](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/e3f296c3-d9b8-42e1-a226-8ba801e345a3)

## Write a narrative

To write a briefing that responds to filters, choose **Add visual → Narrative → Edit narrative**. Type your sentence and use **Insert value** to place a named column aggregate or measure at the cursor. Each value can have its own number format. On the Gallery’s Monthly briefing page, select March and West to read the same $383 revenue in the card and sentence. [Open Monthly briefing](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/45f16e5b-9563-4021-9395-8f3b10641131)

## Split a chart into panels

For a chart panel per region or site, add a column, bar, line or area chart. Assign the period to the category axis, bind a measure, and put the site or region in **Small multiples**. Format controls the panel count per row, visible rows and ordering. Select a panel title to filter to that member, or a point for its period, member and series. [Hospital Site trends](http://127.0.0.1:4317/#r18e900ae81e95b242/read/page/e71f003f-1c36-4dc8-8f7e-9afac2aaebe2)

## Compare trends inside a table or matrix

Choose **Build → Sparklines → Add sparkline** or open a numeric value’s field menu. Choose the measure, trend axis, heading and format. Select a sparkline to see the values for that row and pivot column. The Gallery’s Regional trends page shows a rising monthly revenue series for East while its revenue and attainment totals remain visible. [Open Regional trends](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/9893a036-9cff-4c42-83d7-7e77093d51a8)

## Show the current selection in a title

Create a formula measure such as `"Revenue · " & SELECTEDVALUE(Dispatch[Channel], "All channels")`. Select the card or chart, open **Format → Title source** and choose the measure. The entered title supplies a fallback when the result is blank. On Regional trends, switching the channel to Online changes both the caption and its value to $887. [Open the Gallery example](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/9893a036-9cff-4c42-83d7-7e77093d51a8)

## Calculate a purchase amount from individual rows

In **New measure → Write a DAX formula**, enter `SUMX('Purchase lines', 'Purchase lines'[Quantity] * 'Purchase lines'[Unit cost])`. The Budget report compares each extended price with the original workbook and recalculates the weighted price per unit for the current selection. Select Facilities to see the $112.25 total and its three source lines. [Open Purchase price check](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/f1a9e929-537d-469e-946e-b27f1ca8614c)

## Format visual headings

For a second line under a visual title, open **Format → Subtitle and heading style**. Enter a fixed subtitle or select a second measure, and choose the heading size, alignment and color. On Budget’s Purchase price check, the “Recalculated cost” card identifies the selected department underneath the title. [Budget card](portfolio-evidence/budget-price-subtitle.png)

## Reuse a group of categories

On a chart, Ctrl-select two or more values of a single text category and choose **Build → Group selected values**. Name the output field and the group. Alternatively, open the bound category’s field menu and choose **Create named groups** to assign members across pages. Unassigned members keep their source values unless you choose **Combine unassigned values**. Open a grouped field to edit its assignments. [Gallery Pipeline status](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/4b8ad494-b3e9-48c9-b7cb-8702c8714cad)

## Find missing orders and receipts

Use **Model → Merge tables**, choose the two tables and their match columns, select **Full outer**, and expand the receipt key and amount. Budget’s Receiving reconciliation uses this workflow. Select P-06 in the ledger to isolate the receipt without a purchase order. Ctrl-click to add or remove individual row combinations. With the first cell focused, use the arrow keys to move, Page Up or Page Down to cross pages, and Space or Enter to select. [Open receiving reconciliation](http://127.0.0.1:4317/#r18e901048e56e6504/read/page/77d57903-855d-4a6b-b0b5-a3632bdb9343)

## Color a chart point or flag a value

Hover a colored column or focus it with the keyboard to read the measure and the threshold that determined its fill. On the April Facilities column, the tooltip gives the $1,273 actual and the $73 variance above the zero threshold. Escape closes the tooltip.

Open **Visual Gallery → Bookmarks → East dispatch revenue**. East’s $863 bar is blue and West’s $868 bar is green. Select the chart and open **Format → Data point colors** to change East or reset its color. In a chart with multiple measures or a legend, the picker identifies the specific segment. [Open Compare groupings](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/a9303106-c458-4584-9437-b641d040daea)

In **Budget vs. Actual → Forecast review**, the April Facilities column shows $1,273 of actual spending. Its $73 excess over forecast makes it red. Select **Format → Conditional fill color** to inspect the rule. **Base colors on** can use the displayed value, a separate measure, or an aggregated column. Choose **Color scale** for a gradient. [Open Forecast review](http://127.0.0.1:4317/#r18e901048e56e6504/page/c4183d44-44b3-4b54-9283-ae56b8722c22)

In **Hospital Operations → Attainment exceptions**, the chart colors and review line use the threshold from the adjacent table’s measure filter. Change that filter from 60% to 70% to include both 66.67% Harbor days in the review. [Open Attainment exceptions](http://127.0.0.1:4317/#r18e900ae81e95b242/page/16891afd-10ba-4f69-8d86-63d1088c0c1c)

## Rank categories by a measure

Select a chart and open **Build → Sort and limit**. Choose **Value · highest first** or **Value · lowest first**, set the number of categories and choose **Rank by measure**. A displayed value can rank the categories, or you can choose another named report measure. For a chart with a legend, Folio evaluates the measure for the whole category before drawing its segments.

In **Visual Gallery → Bookmarks → Revenue for the busiest region**, East leads with 74 orders. The chart displays revenue of $409 online and $454 retail. Select **View records** to inspect the six dispatch rows. In **Budget vs. Actual → Bookmarks → Largest February forecast**, Surgery ranks first at $3,200 and its posted variance is blank. [Open Visual Gallery](http://127.0.0.1:4317/#r18e90469b9ea6dd81) · [Open Budget vs. Actual](http://127.0.0.1:4317/#r18e901048e56e6504)

Enable **Include ties at the cutoff** to show every category with the boundary value. In **Hospital Operations → Bookmarks → Busiest months including ties**, a top-two chart includes March (39 visits), January (37) and February (37). Turn the option off to see the two-category view. [Open Site volumes](http://127.0.0.1:4317/#r18e900ae81e95b242/page/fa862032-5bb5-41f2-856e-28237b7201f1)

## Compare selected chart points

Select **West** on the category axis of **Regional revenue by channel** to see $868 across Online and Retail. The **West across channels** bookmark restores the selection. Ctrl-click or Command-click another axis label to include it. On an expanded hierarchy, select the parent label for the whole branch or a child label for that parent and child. In Hospital Operations, **March across sites** selects 39 closed routine visits across three sites. [Try West](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/8700a17d-11db-48b2-9e48-94c2c231a3d4) · [Try March](http://127.0.0.1:4317/#r18e900ae81e95b242/page/fa862032-5bb5-41f2-856e-28237b7201f1)

Select **Online** in the legend of **Regional revenue by channel** to see $887 across East and West. The **Online across regions** bookmark restores the selection. Ctrl-click or Command-click another legend entry to add it. Selecting a series includes every matching region, even when the chart shows only the highest-ranked region. Clicking a bar starts a selection of individual points. Click empty space inside the source plot to clear its selection and retain the page’s slicers. [Try the Gallery comparison](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/8700a17d-11db-48b2-9e48-94c2c231a3d4)

In **Hospital Operations → Bookmarks → Cedar and Harbor across months**, the two legend entries account for 99 closed routine encounters. Ctrl-click Harbor to see Cedar’s 49. [Open Site volumes](http://127.0.0.1:4317/#r18e900ae81e95b242/page/fa862032-5bb5-41f2-856e-28237b7201f1)

In **Visual Gallery → Bookmarks → Paired channel bars**, the outlined East/Online and West/Retail bars contribute $799. Ctrl-click or Command-click either bar to remove it. Tab to a mark and use Ctrl+Enter or Ctrl+Space to toggle it with the keyboard. For touch, enable **Format → Selection → Select multiple categories**. **View records** opens the six dispatch rows behind the pair. In Hospital Operations, the **April Cedar and Harbor** bookmark uses the same interaction to compare attainment across two sites. [Open Visual Gallery](http://127.0.0.1:4317/#r18e90469b9ea6dd81) · [Open Hospital Operations](http://127.0.0.1:4317/#r18e900ae81e95b242)

On **Distributions → Orders and revenue**, drag a rectangle around the two upper-right points. The card shows $732 for March. A new rectangle replaces the selection. Hold Ctrl or Command while dragging to toggle the enclosed points, or press Escape during the drag to cancel. The **March dispatch points** bookmark restores the pair. [See the selected points](portfolio-evidence/gallery-scatter-rectangle.png)

## Inspect chart values in a table

On **West across channels**, hover over **Channel contribution** and choose **Show as a table** in its header. With focus on a chart mark, **Alt+Shift+F11** opens the same view. The table includes each region and channel, total revenue and highlighted revenue. Click **Selected · Revenue** to put West/Online ($478) first. A second click reverses the order and a third restores chart order. **Download chart data** uses the displayed order. Escape returns to the canvas with the selection intact. In **Hospital Operations → Volume and attainment**, the combo chart shows monthly visits and the percentage within 45 minutes in adjacent columns. [Gallery table](portfolio-evidence/gallery-highlight-table.png) · [Hospital table](portfolio-evidence/hospital-combo-table.png)

## Compare categories on a card

To break down a card, drag a text field from Data onto the existing card. **Build → Categories** accepts additional fields, including numeric keys. The value and reference labels recalculate for each combination. Select a category to filter the rest of the page, or select it again to clear. In **Build → Sort and limit**, rank categories by the main value. **Format → Category layout → Cards per row** sets the maximum columns and wraps the cards as the visual narrows. [Try the February department overruns](http://127.0.0.1:4317/#r18e901048e56e6504/page/958be814-45af-4d14-a8ec-81761cf84a4b) · [Try the March channel comparison](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/6959b193-fdf9-4108-808c-7d82a143a867)

## Investigate a card selection

In **Visual Gallery → Bookmarks → March paired channels**, East › Online and West › Retail contribute $312 from 24 orders. Ctrl-click a category to add or remove it. With a keyboard, Tab to the next category and use Ctrl+Enter or Ctrl+Space. Command is also supported. For ordinary clicks or touch, enable **Format → Selection → Select multiple categories**.

Hover or focus a single card to preview its revenue and target. **View records** opens the two matching dispatch rows. **Back** restores both selected cards. To set this up in your own report, select a grouped card and choose its **Detail page** and **Tooltip page** in Format. In Budget, **Bookmarks → February clinical departments** opens the same workflow for Medicine and Surgery. [Open Channel cards](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/6959b193-fdf9-4108-808c-7d82a143a867) · [Open Department cards](http://127.0.0.1:4317/#r18e901048e56e6504/page/958be814-45af-4d14-a8ec-81761cf84a4b)

## Drill into a month

To explore a hierarchy, open **Hospital Operations → Volume and attainment**, select March on the combo chart, and choose **Drill into selection by Date**. March 2 has three visits, two within 45 minutes. Drill up to see all months again. On a blank report, add a line, area or combo chart and bind fields in order in **Trend axis**. **Format → Continuous date axis** controls spacing for the current level. [Open the hospital chart](http://127.0.0.1:4317/#r18e900ae81e95b242/page/1e5c5aed-ca44-4f85-8ca7-020e7726ac37)

To compare daily results across all four months, choose **Go to next level (Date)** in the chart header, or open **Bookmarks → Daily volume across months**. Bar, column and dot charts also support ordered category fields. In **Revenue by region**, the same action compares channels across all regions. [Open the Gallery comparison](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/ec4c6d09-3925-4171-8218-45fe1d2e479d)

To compare children within each parent, choose **Expand all down one level** in the chart header. The Gallery bookmark **Revenue by region and channel** shows Online and Retail under each region. Selecting East/Online filters the other visuals to both fields. Hospital Operations has a **Daily visits grouped by month** bookmark for the same interaction on a combo chart. [Open the Gallery](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/ec4c6d09-3925-4171-8218-45fe1d2e479d)

To change the order of a hierarchy, select the chart and open **Build**. Drag a field above its neighbor in the Category well, or focus its **Move up** button and press Enter. On **Channel performance**, select West/Online in **Revenue by channel and region**, then move Region above Channel. The revenue card stays at $478. [Open Channel performance](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/84d5da57-87f5-42ac-8b36-7d591a703a58)

To use a hierarchy field as a legend, drag its row from **Category** to **Legend**. The ⇄ button offers the same move from the keyboard. An occupied single-field well shows **Swap fields** and exchanges the two assignments. On Channel performance, Regional contribution by channel shows the saved layout. [Open Channel performance](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/84d5da57-87f5-42ac-8b36-7d591a703a58)

To replace a binding as an author, drag a column or measure from Data onto an existing row in Build, or select the field name to open its chooser. **+ Add field** adds another binding.

## Switch measures on the canvas

On Channel performance, choose **Dispatch orders** or **Dispatch revenue** in **Operating measure**. Both the stacked chart and detail table switch. Select West/Online to compare 33 orders with $478 revenue. [Open Channel performance](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/84d5da57-87f5-42ac-8b36-7d591a703a58)

To build this on your own data, create two named measures, then choose **Field parameter** on the ribbon. Select the measures, choose a default, and keep **Add a slicer to this page** checked. Drag the new parameter from Data into the Values well of each visual it should control. **From measure** applies the selected measure’s number format. Reuse the same parameter on another page to synchronize its selection. Edit its members or default in the slicer’s Build pane or in Model view.

## Switch grouping columns on the canvas

On **Compare groupings**, switch **Group dispatch by** between Region and Channel. **Measures to compare** controls the columns in the table and the series in the chart. Leave revenue and orders checked to see both together. Select West before switching to Channel to see the old selection clear and both channels appear. [Open Compare groupings](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/a9303106-c458-4584-9437-b641d040daea)

To enable the measure checkboxes, choose **Field parameter → Measures** and select **Allow readers to select multiple measures**. Each checked measure appears in the order it was selected, with its own number format. Clearing the last checkbox restores all configured measures. A well that accepts a single value uses the first selected measure.

To build this, choose **Field parameter → Columns**, select the model columns and a default, and add a slicer. Put the parameter in the chart’s Category well and the table’s Rows well. The table heading follows the reader’s choice. You can use an ordinary aggregated column or a saved measure in Values.

For an expandable hierarchy, select **Allow readers to select multiple columns** when defining the column parameter. Put it in the matrix Rows or Columns well. Readers check the levels to include and use the arrows to change their order. Under **Format → Row subtotal position**, choose **Top** to put the parent above its children. [Try the Dispatch hierarchy](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/9d9674d7-4c28-4131-9410-841582884306)

To give each row level its own column, select the matrix and choose **Format → Row headers → Matrix layout → Tabular**. **Repeat parent labels** controls whether a value such as West repeats beside every channel. **Outline** suppresses repeated ancestors by default and places parents first unless you have set a subtotal position. **Compact** displays the indented hierarchy in one column. [Open the editable example](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/9d9674d7-4c28-4131-9410-841582884306)

In **Visual Gallery → Dispatch by period**, scroll the matrix to the Total columns and select West → Online. The cards show $478 on 33 orders. In **Format → Row headers**, use **Freeze row headers** to keep the region and channel in view and **Wrap row headers** to set whether long labels can occupy two lines. Both settings save with the report. [Open Dispatch by period](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/0b460c17-b020-4e5e-9b02-df49e7c1de6f)

Drag the right edge of a matrix row or value heading to resize that column. For an exact width, choose **Format → Column widths → Edit column width** and select a pivot and measure. Double-click the divider or clear the width to return to automatic sizing. [Try the February revenue column](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/0b460c17-b020-4e5e-9b02-df49e7c1de6f)

On a visual with multiple measures, **Format → Number format by measure** sets the units for each binding. **Use visual format** follows Appearance, and **From measure** uses the saved measure’s format. The Gallery combo chart uses a currency column axis and an order-count line axis. [Open Trends](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/5a88ad18-9eb8-45fe-88af-a4e8142852b1)

To calculate a share, choose **New measure → Write a DAX formula**. In the Gallery, **Revenue across channels** uses the following expression to keep the selected region and period.

```dax
CALCULATE([Dispatch revenue], REMOVEFILTERS('Dispatch'[Channel]))
```

The percentage measure uses `DIVIDE([Dispatch revenue], [Revenue across channels])`. Open **Model** to edit a definition. Renaming a measure updates formulas that reference it. Changing the revenue calculation updates the cards, matrix rows and subtotals. [Open the editable Channel share page](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/a384bb8a-ead2-4209-9084-08f91dfb007b)

To compare against a fixed channel, define Online revenue as `CALCULATE([Dispatch revenue], 'Dispatch'[Channel] = "Online")`. Selecting Retail replaces the channel filter for this measure and keeps the current region and period. In **Format → Cell formatting**, select **Dispatch revenue**, enable **Show status icons** and set **Base icons on** to **Variance from Online**. Both thresholds default to zero. East/Retail’s $180 then shows an up arrow because it earned $11 more than Online in March. [Open Channel comparison](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/144f813f-f585-4fdf-a273-a593db507dcb)

Tables and matrices can use a saved measure or an aggregated column for **Base icons on** and **Base colors on**. Choose each source separately and enter thresholds in its units. Removing a source from Values keeps the rule active and leaves the source out of the CSV export. For costs, select **Lower values are favorable** to show a green arrow when spending falls below forecast. [Open Forecast review](http://127.0.0.1:4317/#r18e901048e56e6504/page/c4183d44-44b3-4b54-9283-ae56b8722c22)

To show the size of a variance, select **Set background by value → Background style → Color scale**. Set minimum and maximum values and colors. Enable **Use a center color** to give zero a neutral fill between underspending and overspending. Limits stay fixed when you change the period or page through a table. Forecast review uses −$150, $0 and $150 so the same dollar difference has the same color in every month. [January example](portfolio-evidence/budget-variance-scale.png)

To leave an unposted amount unmarked, choose **New measure → Formula** and enter `IF(ISBLANK(SUM('Transaction'[Actual])), BLANK(), [Actual less forecast])`. Forecast review calls this measure **Posted variance** and uses it for the Actual icons and variance background. In February, Surgery has a $3,200 forecast and a blank Actual. The arithmetic difference remains visible and the status is blank. A posted zero still participates in the comparison. Numeric IF branches can use a comparison, nested IF or a saved measure. Omitting the false result returns a blank. [February example](portfolio-evidence/budget-posted-variance.png)

The **Posted departments variance** card uses `SUMX(VALUES('Department'[Department]), [Posted variance])` to evaluate each department and add the results. In February, posted departments exceeded forecast by $28 while the full ledger was $3,172 below forecast. Select any card and open **Format → Callout → Maximum text size (px)** to adjust its value. Narrow cards automatically reduce the text size to keep the full number visible. [February cards](portfolio-evidence/budget-posted-total.png)

Select the card and open **Build → Reference labels** to add a measure or an aggregated column beneath the main value. Edit a caption in its field well, or use the arrows to change the reading order. February’s $28 overrun has the supporting label **Departments posted 2**. The Gallery’s March West/Retail revenue of $143 has two supporting figures, 11 orders and $13 per order. [Budget example](portfolio-evidence/budget-posted-card.png) · [Gallery example](portfolio-evidence/gallery-channel-card.png)

In **Format → Conditional text color**, select the main measure or a reference label, then enable **Set text color by value**. Set the threshold and the colors on either side. **Base colors on** can use the displayed value, another measure or an aggregated column. The Gallery colors revenue using variance from Online. A blank source or a value at the threshold keeps the usual text color.

## Import a Parquet extract

Choose **Get data** and select local CSV and Parquet files together. Open **Model → Parquet field types** to see how each source field was loaded. Nested struct fields appear as dotted names such as `Vendor.Ref`. Dates become ISO text, and wide integer or decimal columns that exceed the numeric model’s precision retain their source values as text. Repeated lists, maps and binary columns need to be reshaped before import. **Model → Update from file** previews a local CSV or Parquet extract before you append or replace rows. For Parquet, supply the existing field names in any order. The importer checks source types and precision against the model.

[Download the purchase orders](http://127.0.0.1:4317/datasets/budget/Commitments.parquet) and [compare the source ledger](web/datasets/budget/Commitments.csv). The editable purchasing page filters the orders and posted transactions through the same department and period dimensions. April has five order lines totaling $349.96. Select the detail table and edit a field heading in **Build**. The caption applies to that visual and its CSV download. Clear it to restore the model name. [Open Purchasing commitments](http://127.0.0.1:4317/#r18e901048e56e6504/page/490dfecb-fb9e-4631-a6e5-8efa091b18f0).

To try a revision, make a library copy of Budget vs. Actual and update its Commitments table with [the three-line April extract](http://127.0.0.1:4317/datasets/budget/CommitmentChanges.parquet). Append shows eight April lines totaling $607.31. Replace shows the three incoming lines totaling $257.35. The original report retains its own version.

To compare amounts visually, select a table or matrix, open **Format → Cell formatting**, choose a measure, and enable **Show data bars**. The initial limits come from the detail values loaded for the visual. Set limits and colors for credits and positive amounts, change the zero-line color, or reverse the direction. **Show bar only** keeps the exact amount available on hover. The limits stay fixed when changing filters or moving between table pages. Matrix authors can apply bars to details, totals or both. [Gallery detail](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/3388559d-9130-4c15-8d28-55d37c1f1d8c).

To regenerate the fixtures, run `node scripts/portfolio-data.mjs`, then `.\cargo-local.ps1 run --example commitments_parquet --release --locked`.

## Sample report

Choose **Sample data** on the blank canvas to download [Sales.csv](web/samples/Sales.csv), [Product.csv](web/samples/Product.csv), and [Date.csv](web/samples/Date.csv). Import the three files together. In **Relationship**, review the two suggested one-to-many relationships and click **Create selected**. The manual key selectors also support independently named tables and columns. The server checks the uniqueness and completeness of each one-side key.

1. Add a bar chart with Product.Category in Category and Sales.Revenue in Value, aggregated by sum.
2. Create a measure named Margin. Choose Sales.Profit as its numerator, Sales.Revenue as its denominator, and Percentage as its format.
3. Add a card with Margin. Add a table with Product.Category in Rows and Revenue, Profit, and Margin in Values. Add Sales.SaleID to Rows for individual sales.
4. Add a slicer with Date.Date. Click category A, then its date. Clear the bar selection using its eraser. The card stays at 40%. Clear the date to restore 13%. Category B alone gives 10%.
5. Drag a visual by its heading and resize it with its lower-right handle. The Format pane also accepts exact coordinates. Save the report and reopen it from Library or its saved URL.

The bar chart supports a hierarchy of category fields. Select a bar and use its down arrow to drill into the next level. Use Calculated column for arithmetic on two numeric columns. The Filters tab supports independent equality filters at visual, page, and report scope. The plus beside the page tabs creates another report page. Double-click a tab to rename it. Library can save the current page as a separate, editable dashboard snapshot.

To compare attainment across months, choose **New measure → Compare months**, select a base measure and a related ISO date or month column, and select one month on the page. The comparison evaluates the base measure over the preceding calendar month with the other dimension filters intact. Differences between percentages display in percentage points. [Open Hospital Operations at Monthly change](http://127.0.0.1:4317/#r18e900ae81e95b242/page/3836c584-aad5-4bf0-a2e3-a64b0390ab97).

Select a slicer and open **Format** to set how it affects each chart. Choose **Highlight** for a clustered, stacked, or 100% stacked bar or column chart, a dot plot, or a pie or donut chart. A normalized stack retains the whole category as its denominator. When a selected value exceeds its segment or has the opposite sign, the chart displays separate stacks on the same scale. **Library → Get page link** gives you a link to a saved page on the same Folio server. [Try the Gallery’s Channel contribution page](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/ec4c6d09-3925-4171-8218-45fe1d2e479d).

To append or replace imported rows, open **Model → Update from file** on the table. Review the incoming columns and the saved preparation steps, then apply the update. Saving the report retains its field bindings and relationships against the new table version.

To turn monthly forecast columns into rows, choose **Transform CSV**, select **Unpivot** for each month, and name the attribute and value columns. The preview shows the resulting rows before import. Model view records the steps and reuses them on the next CSV update. [Try the wide forecast CSV](web/datasets/budget/Forecast.csv) · [Open Forecast review](http://127.0.0.1:4317/#r18e901048e56e6504/page/c4183d44-44b3-4b54-9283-ae56b8722c22).

**Add visual → Gantt** accepts a task and start and end dates. An empty end date marks a milestone. Add a workstream to group tasks and a completion fraction to show progress. [Open Delivery schedule](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/5a280b4e-461a-4587-bb01-77e82eb831bb).

**Format → Tooltip page → Create tooltip page** links an editable report page to a visual. Add cards, charts or tables there. Return to the source and hover a point, focus a table row or focus a matrix value. The preview applies the source’s filters and the hovered fields alongside the target page’s own filters. Escape closes it. To reuse a page automatically, open the page-name menu above the canvas, enable **Use as tooltip page**, and add its matching fields under **Automatic tooltip fields**. A manual selection on a visual takes priority. Choose **Tooltip canvas size → Fixed size** to set the width, height and surrounding space that readers see. [Try Harbor in March](http://127.0.0.1:4317/#r18e900ae81e95b242/page/fa862032-5bb5-41f2-856e-28237b7201f1)

In Page settings, **Hide page from navigators** keeps a detail page available through drillthrough and the authoring tabs. Select a navigator and open **Format → Pages** to include hidden or tooltip pages in that navigator. The March briefing omits **Dispatch records**. Selecting East/Retail in Comparisons and choosing **View records** still opens the three contributing dispatches. [Open March briefing](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/cb367003-e21f-42f8-8528-7341e95d3282)

On a chart, **Build → Tooltips** accepts supplemental values with a chosen aggregation and display label. Hover or focus a point to see its values under the current filters. The Hospital combo includes the P90 wait alongside attainment. [Open Volume and attainment](http://127.0.0.1:4317/#r18e900ae81e95b242/page/1e5c5aed-ca44-4f85-8ca7-020e7726ac37).

On **Depot coverage**, choose **World** then **Fit**. Drag the map or focus it and use the arrow keys. Select a depot and choose **Focus** to center it. The **Pacific depots** bookmark restores three locations around the date line and their 62 scheduled loads. [Open Depot coverage](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/58d463f6-0de3-4073-adbf-aadffd80ade4).

Click a detail table column header to sort the full result. Click it again to reverse direction. Shift-click another column to order tied values. The **Longest waits** bookmark in Wait-Time Performance sorts all 108 visits by wait, then by service. [Open Visit detail](http://127.0.0.1:4317/#r18e9013cd2b05b3c2/page/a86676f2-cde2-4129-b6c2-d98c7c65955f).

For a table or matrix, open **Format → Cell formatting**, choose a measure and enable **Set background by value**. Pick the colors above and below its threshold. A matrix can apply them to details, totals or both. Forecast review applies a zero threshold to Actual less forecast. [Open Forecast review](http://127.0.0.1:4317/#r18e901048e56e6504/page/c4183d44-44b3-4b54-9283-ae56b8722c22).

In **Build**, enable **Show items with no data** under the category or row field well to keep members of a lookup table visible after filtering the transactions. Matrix rows and columns have separate controls. On the hospital **Daily coverage** page, choose Harbor and March. All twelve calendar dates appear in the ledger. Four have closed routine visits, and the other eight show a dash for visits, encounter count and attainment. [Open Daily coverage](http://127.0.0.1:4317/#r18e900ae81e95b242/page/289e1ce3-73d5-4f7b-8dae-be40781bbcd7)

To filter dates, categories or matrix rows by their aggregate, select the visual and open **Filters → This visual → Add measure filter**. Choose a report measure or a value already on the visual. Enter percentages in percentage units, such as **60** for 60%. Use **is blank** to inspect empty results. Click the displayed condition to edit it. Multiple conditions must all hold. Matrix filters evaluate each full row path across its columns, then recalculate subtotals from the qualifying rows. [Try the hospital exceptions](http://127.0.0.1:4317/#r18e900ae81e95b242/page/16891afd-10ba-4f69-8d86-63d1088c0c1c)

To mark a target on a chart, select it and open **Format → Value axis → Add reference line**. For a combo chart, choose the column or line axis. For a scatter or bubble chart, choose X or Y. Enter `60` for 60% on a percentage axis. **Value source** can also follow a numeric measure filter from any report page. Changing that filter moves every linked line. Removing it or changing it to a blank test hides those lines. An explicit axis bound also hides lines outside the displayed range. [Try the linked hospital cutoff](http://127.0.0.1:4317/#r18e900ae81e95b242/page/16891afd-10ba-4f69-8d86-63d1088c0c1c).

For a moving benchmark, choose **Median**, **Average**, **Minimum**, **Maximum**, or **Percentile** in the reference line’s **Value source**, then select a **Chart measure**. The calculation uses that measure’s numeric group values after filters and ranking. Zeros count. Blanks are skipped. On 100% stacked charts it uses each segment’s share. Percentiles interpolate between adjacent ranked values. [Open the Gallery example](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/b48ac9ee-6c4d-477a-aef5-1b707484cc6f).

Choose **Add visual → Trends → Stacked area** or **100% stacked area**. Bind the date or category to **Trend axis**, add one or more **Values**, and optionally split them by **Legend**. Select inside a band to filter other visuals by the nearest observation. **Continuous date axis** spaces ISO months or dates by elapsed time. Missing observations break the band. For signed series, shares use the sum of absolute amounts at each date, and a zero total has no defined share. [Try the Gallery charts](http://127.0.0.1:4317/#r18e90469b9ea6dd81/page/892f5307-9dea-4706-94d7-4924749ea6a9).

## Move a report to another Folio workspace

Open the report and choose **Library → Export .keybi**. If the report has unsaved edits, choose **Save and export .keybi**. The file includes all pages, bookmarks, relationships, measures, formatting, and the current imported rows of every table. On the destination home screen, choose **Import report** and select the file. Each import creates a separate editable copy, including when another report has the same title. Packages support imported tables and have a 256 MiB size limit. Live SQL Server reports require their configured source. [Download the editable Visual Gallery](portfolio-evidence/Visual%20Gallery.keybi).

On a line, area, or combo chart, **Format → Continuous date axis** spaces ISO months, dates and timestamps by elapsed time. UTC labels account for each timestamp’s offset. Timestamp text without an offset is interpreted as UTC. The axis supports millisecond precision and requires each distinct grouped timestamp to identify a distinct instant. In Gallery → Overnight dispatch, the four observations are 15, 40 and 80 minutes apart. [Open Overnight dispatch](http://127.0.0.1:4317/#r18e90469b9ea6dd81/read/page/3a851c98-fdf9-4dd4-acf9-84b558ef5104)

Bind a numeric field to **Trend axis** and enable **Continuous numeric axis** to space marks by their values. Use **X axis title** for units. In **X axis**, set bounds or add a vertical reference. On Wait frequency the 60-minute threshold is three quarters of the way across the 0–80 minute scale. Selecting 32 minutes returns six visits. [Open Wait frequency](http://127.0.0.1:4317/#r18e9013cd2b05b3c2/read/page/7e358b8f-cc52-4ff6-b504-3e46424c4836)

## Datasets and verification

Run `node scripts/portfolio-data.mjs` to reproduce the hospital, budget, wait-time, and clinic-referral CSVs under `web/datasets`. The [portfolio guide](PORTFOLIO.md) lists the launch, editing, restart, and clean-workspace tests.

The generator uses a fixed seed and the same schema at each scale. Pass a row count and an optional output directory. Each invocation creates all three files.

```powershell
node scripts/generate.mjs 2
node scripts/generate.mjs 10000
node scripts/generate.mjs 100000
node scripts/generate.mjs 1000000
```

The two-row fixture uses January 1 and 2, 2025. Larger fixtures use 120 products, 12 categories, and 365 dates.

```powershell
.\cargo-local.ps1 test --release --locked
npm ci
node scripts/verify.mjs 2
node scripts/prepare-workflow.mjs
node scripts/verify.mjs 1000000
```

The browser test launches a separate server on port 4348, opens installed Chrome, uses the file picker, authors the report through the UI, and restarts both the server and the browser before measuring the saved report. It writes screenshots and measurements under `test-results`. Generate the matching dataset first for any benchmark above two rows. Set `MANUAL_LINKS=1` to exercise manual relationship setup. Set `BROWSER_CHANNEL=msedge` to test Edge.

## Storage and execution

Axum serves the interface and a typed visual-query API. CSV import infers column types across the entire file, batches records into Arrow arrays, and stores Snappy-compressed Parquet. Text identifiers with leading zeros retain their spelling. DataFusion loads imported tables on demand, joins fact rows to dimensions, and executes the aggregates, filter predicates, ordering, and pagination required by each visual. Imported results use a bounded query cache. Detail tables request 25 groups per page. The original bar and button slicer default to 100 groups, and Gallery charts and slicers request up to 500 groups at a time. Numeric calculations use double precision.

The browser uses native DOM, CSS, and JavaScript. Report metadata includes the model, calculations, measures, filters, formatting, and visual layout. By default, metadata uses atomically replaced files under `.studio/reports`. Imported tables and their schemas are under `.studio/tables`. Set `FOLIO_DATA` to change the storage root. Retain the entire directory when backing up an installation.

To publish a reviewed report, save the draft and choose **Library → Publish report**. Choose its opening page and publish. Readers can change filters, follow links and reset their session. After revising the draft or updating imported rows, choose **Update published version** to update the same address. **Withdraw** removes that publication. Local publications are for the trusted desktop user. [Open the published Budget report](http://127.0.0.1:4317/#p18e901048e56e6504/read)

To use PostgreSQL, set `FOLIO_POSTGRES` to a PostgreSQL connection string before launch. The server creates `folio_reports` and `folio_publications` and saves both kinds of document as JSONB. Saves and publication updates check revisions. Back up PostgreSQL together with the data directory, including imported tables and report images. To reproduce the local database restart check on Windows, set `PG_BIN` to the PostgreSQL bin directory and run `node scripts/verify-postgres.mjs`.

## Live SQL Server

Set `FOLIO_SQLSERVER` on the server to an ADO connection string for the source database. A Windows integrated-authentication example is `Server=tcp:sql.example.test,1433;Database=Reporting;IntegratedSecurity=true;Encrypt=true`. The account needs read access to the selected tables or views. Choose **SQL Server** on a blank report and select the tables. Credentials stay in the server environment. Each report uses one source mode.

The Rust TDS adapter sends grouped aggregates, ratios, joins, equality filters, and page bounds to SQL Server and fetches the result rows. Live queries bypass the imported-data cache. The generated T-SQL has a regression test for Unicode filter values, quoted identifiers, ratio aggregation, and paging. A live SQL Server endpoint is needed for end-to-end validation.

See [the benchmark and session record](BENCHMARKS.md) for measurements, verification limits, and the next authoring problem.
