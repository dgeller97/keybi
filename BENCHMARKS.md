# Release verification

## Final 24-hour checkpoint

The final four-visual release run on **1,000,000 sales** imported in **932 ms**, opened in **414 ms** and reached **25.7 ms p95** from filter input through the last correct visual. Eleven selections required a new query (25.7 ms p95) and 37 repeated cached queries (25.8 ms p95). Server query p95 was 8.92 ms. The initial compressed transfer was 132,185 bytes. Peak server memory was 82 MiB and peak sampled browser memory was 575 MiB. The reference machine was a Ryzen 7 5700X3D with 64 GiB RAM running Windows and Chrome 157 at 1536 × 960. The OS file cache was warm for the fresh-server, fresh-browser open. An equivalent Power BI timing remains unavailable. [Measurements](portfolio-evidence/final-release-measurements.json)

A second one-million-sale report groups 12 source categories into two named cohorts and shows 24 cohort/month margins. All 24 ratios and both cohort revenues reconciled to an independent pass over the CSV. The first two uncached selections of **pairs** took 516 and 529 ms before optimizing the time filter. The same selections took 78.7 and 75.1 ms after the change. Repeating the cached pair took 21.3 ms. The verifier checks the selected revenue, margin and chart totals before stopping its clock. These individual observations measure the paired selections separately from the sales benchmark’s 48-input p95. [Earlier run](portfolio-evidence/grouped-rows-before-ranges.json) · [Final run](portfolio-evidence/million-grouped-rows.json)

## Small multiples, purchase expressions and selection captions

Each release repeated the four-visual one-million-sale workflow. Cold open used a fresh browser and server with a warm OS file cache. Each run timed 48 selections through the last checked visual. These measurements describe the sales workload on the reference machine.

| Release | Import | Cold open | Filter p95 | Query p95 | Compressed initial bytes | Peak server / sampled browser |
|---|---:|---:|---:|---:|---:|---:|
| [Small multiples](portfolio-evidence/panel-measurements.json) | 883 ms | 436 ms | 47.7 ms | 8.83 ms | 128,425 | 82 / 585 MiB |
| [Purchase expressions](portfolio-evidence/row-expression-measurements.json) | 918 ms | 446 ms | 25.7 ms | 9.53 ms | 128,425 | 81 / 577 MiB |
| [Selection captions](portfolio-evidence/caption-measurements.json) | 899 ms | 455 ms | 31.4 ms | 9.56 ms | 129,013 | 81 / 576 MiB |

## Table and matrix sparklines

A report built on one million sales reconciled every monthly margin for all 12 product categories, 144 ratios in total. Twelve category changes took 29–81 ms from the browser input event through the checked row, trend summary and following animation frame. The separate four-visual benchmark measured 907 ms import, 421 ms cold open, 47.7 ms warm filter p95 and 8.9 ms server query p95. It transferred 126,812 compressed initial bytes and peaked at 82 MiB server and 586 MiB sampled browser memory. [Monthly reconciliation](portfolio-evidence/million-sparklines.json) · [Four-visual release benchmark](portfolio-evidence/sparkline-measurements.json)

## Custom narratives

The four-visual million-row benchmark measured 937 ms import, 444 ms cold open and 47.5 ms warm filter p95. The publication build measured 426 ms and 47.6 ms for open and filtering. The narrative build transferred 123,782 compressed bytes, measured 9.3 ms server query p95 and peaked at 83 MiB server and 590 MiB sampled browser memory. [Release measurements](portfolio-evidence/narrative-measurements.json)

## Local report publication

The four-visual report on one million sales opened in 426 ms with a fresh server and Chrome profile. Warm filter p95 was 47.6 ms across 48 selections, including 47.7 ms for selections requiring new queries. Import took 927 ms, server query p95 was 9.2 ms and initial compressed assets totaled 121,731 bytes. Peak server and sampled browser memory were 80 and 585 MiB. This benchmark used file metadata. A separate PostgreSQL 18.7 run verified publication and restart correctness. [Million-row timings](portfolio-evidence/publication-measurements.json) · [PostgreSQL evidence](portfolio-evidence/postgres-publication.json)

## Report images

The million-row report opened cold in 456 ms with uploaded images enabled and 409 ms after field matching. Warm filter p95 was 47.6 ms and 47.8 ms, respectively. The field-matching build imported in 910 ms, transferred 120,936 compressed initial bytes, measured 9.1 ms query p95, and peaked at 81 MiB server and 583 MiB sampled browser memory. Images load when their visual displays a matched value. [Uploaded images](portfolio-evidence/image-measurements.json) · [Field-matched images](portfolio-evidence/voucher-measurements.json)

## Merge tables

Joining one million sales to 120 products through Model displayed a five-row preview in 115 ms. Creating the table took 367 ms from the button click to the model card showing 1,000,000 rows. Its category revenue totals reconciled independently to $504,604,610.30. [Million-sale merge](portfolio-evidence/million-merge.json)

The independent four-visual benchmark measured 949 ms CSV import, 450 ms cold open, 47.5 ms warm filter p95, 9.3 ms server query p95 and 117,524 compressed initial bytes. The server and sampled browser peaked at 82 and 590 MiB. The preceding named-table build measured 430 ms cold and 47.6 ms warm. [Release measurements](portfolio-evidence/merge-measurements.json)

## Shapes, locked positions and named Excel tables

| One million sales | Shapes | Locked positions | Named Excel tables |
|---|---:|---:|---:|
| CSV import | 1,016 ms | 900 ms | 957 ms |
| Cold report open | 432 ms | 429 ms | 430 ms |
| Warm filter p95 | 47.6 ms | 47.7 ms | 47.6 ms |
| Server query p95 | 9.1 ms | 8.7 ms | 8.7 ms |
| Compressed initial assets | 113,298 B | 113,822 B | 113,892 B |
| Server / sampled browser peak | 83 / 589 MiB | 83 / 585 MiB | 82 / 588 MiB |

Measurements use the release, Chrome, machine and cache procedure below. Each timed selection ends when every affected visual displays the independently checked value. [Shapes](portfolio-evidence/shape-measurements.json) · [Locked positions](portfolio-evidence/locked-shape-measurements.json) · [Named tables](portfolio-evidence/named-table-measurements.json)

## Arranging and copying report visuals

The same four-visual, million-sale report measured **47.6 ms warm filter p95** and **415 ms cold open** with visual copy and paste enabled. The worksheet-refresh baseline was 47.7 ms and 420 ms. Cold opens used a fresh Chrome profile and server with a warm OS file cache. [Baseline](portfolio-evidence/workbook-final-measurements.json) · [Arrangement](portfolio-evidence/arrange-measurements.json) · [Rectangle selection](portfolio-evidence/canvas-rectangle-measurements.json) · [Copy and paste](portfolio-evidence/visual-copy-measurements.json)

| One million sales | Arrange | Rectangle selection | Copy and paste |
|---|---:|---:|---:|
| CSV import | 906 ms | 968 ms | 900 ms |
| Cold report open | 420 ms | 405 ms | 415 ms |
| Warm filter p95 | 47.7 ms | 47.7 ms | 47.6 ms |
| Server query p95 | 8.9 ms | 8.8 ms | 9.0 ms |
| Compressed initial assets | 107,334 B | 108,538 B | 110,938 B |
| Server / sampled browser peak | 82 / 584 MiB | 83 / 585 MiB | 84 / 589 MiB |

Copying the revenue card from a page filtered to 33 dates and pasting on a blank page changed the displayed sum from $45,717,246.63 to $504,604,610.30. Paste-to-correct-paint took 47.4 ms in this run. Both sums were independently accumulated from the source sales CSV. [Copy workload](portfolio-evidence/visual-copy-selections.json)

## Excel worksheet import and refresh

The four-visual report used the same million-row CSV dataset for each release. Chrome ran at 1536 × 960 on the Ryzen 7 5700X3D with 64 GiB. Cold open used a fresh server and browser profile with a warm OS file cache. Each warm measurement ends when the last affected visual displays the independently reconciled result. [Earlier release](portfolio-evidence/undo-measurements.json) · [Worksheet import](portfolio-evidence/workbook-first-measurements.json) · [Worksheet refresh](portfolio-evidence/workbook-final-measurements.json)

| One million sales | Authoring history | Worksheet import | Worksheet refresh |
|---|---:|---:|---:|
| Import | 891 ms | 933 ms | 906 ms |
| Cold report open | 442 ms | 431 ms | 420 ms |
| Warm filter p95 | 47.6 ms | 47.7 ms | 47.7 ms |
| Server query p95 | 8.6 ms | 8.8 ms | 9.0 ms |
| Compressed initial assets | 104,538 B | 104,922 B | 105,185 B |
| Server / sampled browser peak | 85 / 589 MiB | 86 / 585 MiB | 82 / 585 MiB |

## Undo and redo

The four-visual report on one million sales measured **47.6 ms warm filter p95** and **442 ms cold open** with authoring history enabled. The preceding release measured 47.6 ms and 397 ms. The new release imported in 891 ms, transferred 104,538 compressed bytes and measured 8.6 ms server query p95. New and repeated filter p95 were 47.7 and 47.6 ms. The server and sampled browser working sets peaked at 85 and 589 MiB. Both runs used the same release configuration, browser, machine and cache procedure described below. [Prior measurements](portfolio-evidence/sync-bounds-measurements.json) · [Undo measurements](portfolio-evidence/undo-measurements.json)

After clearing a filter of 33 dates on the reconciliation page, **Undo** returned the card to **$45,717,246.63** in 47.5 ms. **Redo** restored **$504,604,610.30** in 46.6 ms. Each observation starts at the button click and ends at the next paint with the CSV-reconciled card. [Selection and timing evidence](portfolio-evidence/undo-selections.json)

## Synchronized slicers and dashboard snapshots

The million-sale report retained a **47.6 ms warm filter p95** across the paste, sync and dashboard runs. Cold open measured 438 ms with paged paste review, 430 ms with cross-page sync, 407 ms with dashboard snapshots and 397 ms with editable bounds. The bounds build imported the CSVs in 905 ms, transferred 103,059 compressed bytes, and reached 9.0 ms server query p95. New and repeated filter p95 were 47.5 and 47.7 ms. Peak server and sampled browser working sets were 85 and 583 MiB. [Paste review](portfolio-evidence/pasted-final-measurements.json) · [Sync](portfolio-evidence/sync-final-measurements.json) · [Dashboard](portfolio-evidence/sync-dashboard-measurements.json) · [Bounds](portfolio-evidence/sync-bounds-measurements.json)

Navigating to a separate reconciliation page with 33 synced posting dates showed **$45,717,246.63** in 47.5 ms from page-tab click through the next paint with the correct card. Clearing the selection on that page restored **$504,604,610.30**. The same navigation measured 47.3 and 47.4 ms in the two preceding checks. The totals were independently summed from the sales CSV. [Cross-page workload](portfolio-evidence/sync-bounds-selections.json)

## Pasting and reviewing selections

On the four-visual report with one million imported sales, warm filtering reached the last correct visual in **47.6 ms at p95** and cold open took **438 ms**. The preceding build measured 47.7 ms and 412 ms. All three runs used the same release workload, Chrome 157 at 1536 × 960, a Ryzen 7 5700X3D and 64 GiB of RAM. Cold open used a fresh process and browser profile with a warm OS file cache. [Earlier build](portfolio-evidence/member-search-repeat-measurements.json) · [Paste preview](portfolio-evidence/pasted-first-measurements.json) · [Paged review](portfolio-evidence/pasted-final-measurements.json)

| One million sales | Earlier build | Paste preview | Paged review |
|---|---:|---:|---:|
| CSV import | 899 ms | 906 ms | 884 ms |
| Cold open | 412 ms | 392 ms | 438 ms |
| Warm filter p95 | 47.7 ms | 47.6 ms | 47.6 ms |
| New / repeated filter p95 | 47.7 / 47.7 ms | 47.5 / 47.7 ms | 47.4 / 47.7 ms |
| Server query p95 | 8.9 ms | 8.9 ms | 9.1 ms |
| Compressed initial transfer | 100,340 B | 100,831 B | 100,872 B |
| Peak server / sampled browser working set | 82 / 586 MiB | 84 / 586 MiB | 82 / 586 MiB |

Pasting 35 date lines produced 33 distinct matches, identified February 31 as unmatched and counted one duplicate once. Apply to the painted, CSV-reconciled revenue of **$45,717,246.63** took 46.8 ms on the first run and 47.3 ms on the final run. These are individual observations measured after matching finished. An independent rack import reduced mounted choices in the reopened chooser from 2,002 to 150. Correcting the selection retained 1,998 racks. [First paste](portfolio-evidence/pasted-first-selections.json) · [Final paste](portfolio-evidence/pasted-final-selections.json) · [Rack correction](portfolio-evidence/pasted-review.json)

## Finding and combining values in slicers

The four-visual report on one million imported sales displayed its last correct visual in **47.7 ms at p95** and opened cold in **399 ms**. The preceding release measured 47.6 ms and 408 ms. The runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM and local metadata. Each cold open used a fresh release process and browser profile with warm OS file cache. Each warm series contained 11 new selections and 37 repeats. [Previous release](portfolio-evidence/coverage-final-measurements.json) · [Filter search](portfolio-evidence/member-search-first-measurements.json) · [Final slicer release](portfolio-evidence/member-search-final-measurements.json)

| One million imported sales | Previous release | Filter search | Searchable slicers and multi-select dropdown |
|---|---:|---:|---:|
| Import | 922 ms | 920 ms | 908 ms |
| Cold open | 408 ms | 415 ms | 399 ms |
| Warm filter p95 | 47.6 ms | 47.7 ms | 47.7 ms |
| New / repeated filter p95 | 47.7 / 47.6 ms | 47.7 / 47.8 ms | 47.8 / 47.7 ms |
| Server query p95 | 9.4 ms | 9.0 ms | 9.0 ms |
| Compressed initial transfer | 98,992 B | 99,027 B | 100,330 B |
| Peak server / sampled browser working set | 85 / 588 MiB | 82 / 585 MiB | 81 / 583 MiB |

Previously, selecting January 12 and December 31 in the checklist required two **Next values** clicks. Searching **2025-12** returned all 31 December dates in 144.4 ms from input through the next paint with the correct list, including the 120 ms typing delay. Applying the two dates displayed **$2,746,525.36** in 46.9 ms. Searching the on-canvas dropdown queried one visual and left **$504,604,610.30** on the revenue card. Applying the same dates through its multi-select chooser also took 46.9 ms. These are individual authoring observations. Both totals matched independent aggregation of the source CSV. [Paging baseline](portfolio-evidence/coverage-final-selections.json) · [First search check](portfolio-evidence/member-search-first-selections.json) · [Final search and dropdown checks](portfolio-evidence/member-search-final-selections.json)

Hospital’s case lookup and two-site bookmark were checked against its encounter CSV. The imported depot workflow covers late responses, search focus, missing and literal blank values, cross-search selection and a saved two-value choice under a page filter. The Rust suite exercises search before paging and checks the generated SQL Server search predicate. Execution against a live SQL Server endpoint remains unverified. [Case records](portfolio-evidence/encounter-search.json) · [Combined coverage](portfolio-evidence/site-choice.json) · [Depot workflow](scripts/paged-dropdown.mjs)

The two-sale import retained the 13% overall, 40% category A and 10% category B margin checks. The portable test opened all 51 pages from six report packages in a separate workspace and exercised the encounter lookup and saved two-site selection. All 42 archive checksums matched. [Two-sale verification](scripts/verify.mjs) · [Portable verification](scripts/verify-portable.mjs) · [Archive manifest](portfolio/manifest.json)

A repeat after hiding unused paging buttons measured **47.7 ms warm filter p95** and **412 ms cold open**. Import took 899 ms, server query p95 was 8.9 ms, initial transfer was 100,340 B and the server/browser working sets peaked at 82/586 MiB. The 31-date search took 157.6 ms. Applying January 12 and December 31 took 46.9 ms through the page filter and 47.3 ms through the dropdown. Both showed the same $2,746,525.36. [Repeat measurements](portfolio-evidence/member-search-repeat-measurements.json) · [Repeat authoring checks](portfolio-evidence/member-search-repeat-selections.json)

## Empty calendar periods and filters with selected values

The four-visual report on one million imported sales displayed its last correct visual in **47.6 ms at p95** and opened cold in **408 ms**. The previous calendar-hierarchy release measured 47.6 ms and 417 ms. All three runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Cold opens used fresh server processes and browser profiles with warm OS file cache. The warm filter series included 11 new selections and 37 repeats. [Previous release](portfolio-evidence/calendar-quarter-final-measurements.json) · [First calendar coverage run](portfolio-evidence/coverage-first-measurements.json) · [Final measurements](portfolio-evidence/coverage-final-measurements.json)

| One million imported sales | Previous release | Full calendar intervals | Editable multi-value filters |
|---|---:|---:|---:|
| Import | 916 ms | 899 ms | 922 ms |
| Cold open | 417 ms | 413 ms | 408 ms |
| Warm filter p95 | 47.6 ms | 47.7 ms | 47.6 ms |
| New / repeated filter p95 | 47.6 / 47.8 ms | 47.7 / 47.7 ms | 47.7 / 47.6 ms |
| Server query p95 | 8.9 ms | 8.8 ms | 9.4 ms |
| Compressed initial transfer | 97,602 B | 99,369 B | 98,992 B |
| Peak server / sampled browser working set | 81 / 588 MiB | 83 / 585 MiB | 85 / 588 MiB |

On a separate January page, the date dimension supplied 31 days while a fact filter kept only January 12. The chart retained all 30 empty positions and one bar worth $1,366,618.57. Selecting days 1, 12, 31, 12, 1 and 31 took 37.2, 40.8, 40.1, 41.0, 40.0 and 38.7 ms from keyboard input through the correct painted card. A separate authoring task combined January 12 and December 31 across three checklist pages. Applying those dates displayed $2,746,525.36 in 47 ms, matching independent aggregation of the CSV. This last timing measures a single Apply action. Browsing to December took two **Next values** clicks. [First calendar checks](portfolio-evidence/coverage-first-selections.json) · [Final calendar and value-list checks](portfolio-evidence/coverage-final-selections.json)

The two-sale report retained the 13%, 40% and 10% margin results. The portability check opened all 51 pages after transfer to a separate workspace and exercised the saved Hospital axis and Budget bookmark. A separate invoice import covered true blanks, the literal “(Blank)”, numeric zero, exact entries, paging, validation and locked reader filters. [Portable check](scripts/verify-portable.mjs) · [Imported filter workflow](scripts/imported-reader-filters.mjs)

## Calendar quarters and date hierarchies

The final release opened the four-visual report on one million imported sales in **417 ms** and displayed the last correct visual after a warm filter in **47.6 ms at p95**. The previous checkpoint measured 404 ms and 47.6 ms. The two calendar builds used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server, fresh browser profile and warm OS file cache. Each filter run included 11 new selections and 37 repeats. [Previous release](portfolio-evidence/week-range-repeat-measurements.json) · [Calendar bins](portfolio-evidence/calendar-quarter-first-measurements.json) · [Final release](portfolio-evidence/calendar-quarter-final-measurements.json)

| One million imported sales | Previous release | Calendar bins | Calendar hierarchy |
|---|---:|---:|---:|
| Import | 900 ms | 900 ms | 916 ms |
| Cold open | 404 ms | 397 ms | 417 ms |
| Warm filter p95 | 47.6 ms | 47.7 ms | 47.6 ms |
| New / repeated selections p95 | 47.6 / 47.5 ms | 47.8 / 47.7 ms | 47.6 / 47.8 ms |
| Server query p95 | 8.9 ms | 8.7 ms | 8.9 ms |
| Compressed initial transfer | 95,716 B | 96,121 B | 97,602 B |
| Peak server / sampled browser working set | 86 / 582 MiB | 84 / 583 MiB | 81 / 588 MiB |

All four 2025 quarter totals matched the independent sales aggregation to the cent. On the final release, the first three quarter selections took 48.2, 40.3 and 40.6 ms from keyboard input through the correctly painted revenue card. The three repeats took 40.6, 41.2 and 40.7 ms. On a separate chart, clicking **Use date hierarchy** took 146.2 ms through display of the correct annual total, $504,604,610.30. Moving to its quarter level reproduced all four totals. This hierarchy timing is a single authoring observation. [Initial quarter checks](portfolio-evidence/calendar-quarter-first-selections.json) · [Final quarter and hierarchy checks](portfolio-evidence/calendar-quarter-final-selections.json)

The original two-sale workflow verified 13% overall margin, 40% for A and 10% for B. The portable check transferred all 51 pages of the six editable reports and exercised the Budget and Hospital calendar drill paths after import. Rust tests covered both sides of quarter boundaries, leap day, pre-1970 periods, blank groups and SQL Server plan generation. Live SQL Server execution requires a configured endpoint. [Budget reconciliation](portfolio-evidence/calendar-quarter.json) · [Hospital drill results](portfolio-evidence/calendar-hierarchy.json)

## UTC intervals and calendar weeks

The four-visual report on one million imported sales reached its last correct visual in **47.7 ms at p95**. Cold open took **416 ms**. The runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM, local metadata, a fresh server and browser profile for each cold open, and a warm OS file cache. Filtering covered 11 first selections and 37 repeats. [Previous numeric-bin build](portfolio-evidence/bins-final-measurements.json) · [Initial UTC implementation](portfolio-evidence/time-bins-first-measurements.json) · [Week build](portfolio-evidence/week-before-cache-measurements.json) · [UTC range build](portfolio-evidence/week-range-measurements.json)

| One million sales | Previous numeric-bin checkpoint | Weeks with formatted-key filtering | Weeks with UTC range filtering |
|---|---:|---:|---:|
| Import | 889 ms | 887 ms | 925 ms |
| Cold report open | 410 ms | 405 ms | 416 ms |
| Warm filter p95 | 47.7 ms | 47.7 ms | 47.7 ms |
| First / repeated filter p95 | 47.7 / 47.7 ms | 47.6 / 47.7 ms | 47.6 / 47.7 ms |
| Server query p95 | 9.5 ms | 9.1 ms | 9.2 ms |
| Compressed initial transfer | 93,972 B | 95,716 B | 95,716 B |
| Peak server / sampled browser working set | 80 / 582 MiB | 85 / 584 MiB | 81 / 582 MiB |

On a separate page, an author grouped the related date dimension into Monday-start weeks. All 53 revenue totals matched an independent aggregation in cents. Selecting December 30, January 6 and January 13 took 142, 157 and 157 ms to display the correct card. A bounded cache of parsed dates took 154, 123 and 157 ms, so the release omits it. Comparing the source timestamps directly with each selected interval’s bounds took 49, 40 and 41 ms. Repeating the same three selections took 41, 24 and 41 ms. Each timing includes keyboard input, the aggregate query or cache lookup and the correctly displayed result through a paint frame. [Original selections](portfolio-evidence/week-selections-before-cache.json) · [Parse-cache trial](portfolio-evidence/week-selections-cache-trial.json) · [UTC range selections](portfolio-evidence/week-range-selections.json)

A second release run from a fresh profile returned the same 53 totals. The three first selections took 53, 39 and 40 ms. The four-visual report opened in 404 ms and filtered in 47.6 ms at p95, with first and repeated p95s of 47.6 and 47.5 ms. Import took 900 ms, server query p95 was 8.9 ms, compressed transfer was 95,716 B, and the server and browser peaked at 86 and 582 MiB. [Second release run](portfolio-evidence/week-range-repeat-measurements.json) · [Second weekly selection run](portfolio-evidence/week-range-repeat-selections.json)

The Gallery and Hospital examples also reconcile the event timestamps and weekly site medians against their source CSVs. Rust tests check negative timestamps, equivalent offsets, the upper interval boundary, a date in 2300 and SQL Server query generation. Execution against a live SQL Server still requires an endpoint. [Hourly dispatch reconciliation](portfolio-evidence/scan-hours.json) · [Weekly caseload reconciliation](portfolio-evidence/calendar-week.json)

## Numeric bins and empty intervals

On one million imported sales, the four-visual report reached the last correct visual in **47.7 ms at p95** and opened cold in **410 ms**. Each run used Chrome 157 at 1536 × 960, a Ryzen 7 5700X3D with 64 GiB RAM, a fresh server and browser profile, and a warm OS file cache. Warm filtering covered 11 new and 37 repeated selections. [First release run](portfolio-evidence/bins-first-measurements.json) · [Final release run](portfolio-evidence/bins-final-measurements.json)

| One million sales | Previous checkpoint | First bin build | Final bin build |
|---|---:|---:|---:|
| Import | 1,020 ms | 910 ms | 889 ms |
| Cold report open | 433 ms | 415 ms | 410 ms |
| Warm filtering, p95 | 47.6 ms | 47.7 ms | 47.7 ms |
| New / repeated selections, p95 | 47.6 / 47.6 ms | 47.5 / 47.8 ms | 47.7 / 47.7 ms |
| Server query, p95 | 9.2 ms | 8.8 ms | 9.5 ms |
| Compressed initial transfer | 92,164 B | 93,972 B | 93,972 B |
| Peak server / sampled browser working set | 87 / 584 MiB | 84 / 583 MiB | 80 / 582 MiB |

On a separate page of the same report, the author grouped the date dimension into 30-day intervals and summed sales through the relationship. All 13 interval totals matched a separate CSV aggregation to the cent. In the final run, selecting the first three intervals took 47.1–57.9 ms from keyboard input through the correctly displayed revenue card and a paint frame. Repeating those selections took 22.7–40.9 ms. The interval starting at day key 30 contained $41,516,145.08. [First interval checks](portfolio-evidence/bins-first-selections.json) · [Final interval checks](portfolio-evidence/bins-final-selections.json)

## Continuous trend axes and paired phone cards

The four-visual report on one million sales took **47.6 ms at p95** from filter input until the last affected visual displayed the correct result. Cold open took **433 ms**, compared with 401 ms at the previous checkpoint. Both runs below used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with a warm OS file cache. Each filter run included 11 new selections and 37 repeats. [First measurements](portfolio-evidence/trend-axis-first-measurements.json) · [Final measurements](portfolio-evidence/trend-axis-final-measurements.json)

| One million imported sales | Previous checkpoint | First trend build | Final trend build |
|---|---:|---:|---:|
| Import | 970 ms | 967 ms | 1,020 ms |
| Cold open | 401 ms | 402 ms | 433 ms |
| Warm filtering, p95 | 47.7 ms | 47.6 ms | 47.6 ms |
| New / repeated selections, p95 | 47.7 / 47.6 ms | 47.6 / 47.6 ms | 47.6 / 47.6 ms |
| Server query, p95 | 9.1 ms | 8.8 ms | 9.2 ms |
| Compressed initial transfer | 90,496 B | 92,058 B | 92,164 B |
| Peak server / sampled browser working set | 85 / 587 MiB | 86 / 583 MiB | 87 / 584 MiB |

Changing the numeric X-axis maximum six times on the same imported report took 34.1–49.0 ms in the first run and 41.5–53.8 ms in the final run. These timings run from input through two animation frames using cached aggregates. Each range change issued zero analytical queries. The browser checked revenue for every visible day against the source CSV, covering 41, 71 or 91 days per change. The two-sale browser test also reproduced 13% weighted margin overall, 40% for A and 10% for B. [First range changes](portfolio-evidence/trend-axis-first-window.json) · [Final range changes](portfolio-evidence/trend-axis-final-window.json)

## Focus, phone layouts and pinned series colors

Chrome opened the four-visual report from one million sales and timed each filter from input until the last correct visual had painted. The final release returned **47.7 ms p95 for warm filtering** and **401 ms for a cold open**. The previous checkpoint returned 47.6 ms and 412 ms. Both used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM, a fresh server and browser profile, and a warm OS file cache. The editor viewport was 1536 × 960. [First run](portfolio-evidence/phone-first-measurements.json) · [Final run](portfolio-evidence/phone-final-measurements.json)

| Million-row release measurement | Phone layout build | Final build with series color controls |
|---|---:|---:|
| Import | 966 ms | 970 ms |
| Cold open | 399 ms | 401 ms |
| Warm filtering, p95 | 47.6 ms | 47.7 ms |
| New / repeated selections, p95 | 47.6 / 47.7 ms | 47.7 / 47.6 ms |
| Server query, p95 | 9.3 ms | 9.1 ms |
| Compressed initial transfer | 90,128 B | 90,496 B |
| Peak server / sampled browser working set | 88 / 585 MiB | 85 / 587 MiB |

The same imported report also ran in its authored 390 × 700 phone layout. Five successive Category changes reconciled revenue, weighted margin, detail rows and the first 100 matching dates to a separate CSV aggregation. These took **46.0–47.2 ms** across the two runs. The two-sale import retained its 13% overall margin, 40% for A and 10% for B. [First phone interactions](portfolio-evidence/phone-first-interactions.json) · [Final phone interactions](portfolio-evidence/phone-final-interactions.json)

In the Gallery, entering focus mode, resizing and returning to the page issued zero analytical queries in the browser test. The regional chart’s axis label grew from 5.6 to 15 px on the phone. On the Hospital page, switching layouts and changing viewport size also issued zero queries. Both saved phone layouts and the Gallery’s pinned West color survived exporting and importing the reports into an independent workspace. [Gallery focus checks](portfolio-evidence/focus-mode.json) · [Hospital layout](portfolio-evidence/phone-layout.json) · [Gallery colors and selections](portfolio-evidence/phone-visibility.json)

## Reading view and temporary filters

On one million imported sales, a reader changed the page’s Category filter through B, C, D, A and B. On every Apply, Chrome waited for the revenue bar, margin card, detail row and first 100 matching dates to reconcile to an independent CSV aggregation, then waited one animation frame. The ten changes across two runs took **46.5–47.6 ms**. Category B returned $42,050,815.71 revenue and $9,479,283.63 profit at a weighted margin of 22.54%. Reset restored A. Reading view issued no report saves. [First reader run](portfolio-evidence/reading-first-interactions.json) · [Repeat](portfolio-evidence/reading-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| Import | 937 ms | 959 ms | 933 ms |
| Cold report open | 392 ms | 398 ms | 395 ms |
| Warm filter to last correct visual, p95 | 47.6 ms | 47.7 ms | 47.7 ms |
| Server query p95 | 8.8 ms | 9.1 ms | 8.7 ms |
| Compressed initial transfer | 87,183 B | 87,332 B | 85,100 B |
| Peak server working set | 85 MiB | 86 MiB | 85 MiB |
| Sampled peak browser working set | 587 MiB | 583 MiB | 585 MiB |

Both runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Each used a fresh server and browser profile with a warm OS file cache. The editor workload included eleven new selections and 37 repeats. The reader check opened the saved report in an independent browser context. The repeat included the change that lets in-flight imports and saves finish before entering reading view. [First release run](portfolio-evidence/reading-first-measurements.json) · [Repeat](portfolio-evidence/reading-repeat-measurements.json)

A third run on the final assets imported in 934 ms, opened in 412 ms and filtered in **47.6 ms at p95**. The five reader Apply actions took **45.7–47.4 ms**. Compressed initial transfer was 87,332 B. [Final release measurements](portfolio-evidence/reading-final-measurements.json) · [Final reader checks](portfolio-evidence/reading-final-interactions.json)

## Chart explanations and fixed-size report tooltips

On one million imported sales, keyboard focus showed why the revenue bars for A and F had different colors. Weighted margin was 22.43% for A and 22.59% for F against the same 22.53% threshold. Showing those explanations took **24.1–39.5 ms** across six focus events and issued zero analytical queries.

A second check used a 320 × 240 px tooltip layout with a revenue card inset 20 px from the left and 30 px from the top. Chrome focused A, B and A again. The card showed $42,150,419.86, $42,050,815.71 and $42,150,419.86, matching a separate CSV aggregation. First visits took **24.5–28.0 ms** from focus to verified paint, with one query batch per new category. Returning to A took **24.9–25.8 ms** from cache. [First interaction run](portfolio-evidence/tooltip-pages-first-interactions.json) · [Repeat](portfolio-evidence/tooltip-pages-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 901 ms | 933 ms | 888–917 ms |
| Cold report open | 402 ms | 392 ms | 387–422 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 47.8 ms |
| Server query p95 | 8.7 ms | 8.7 ms | 8.7–8.9 ms |
| Compressed initial transfer | 85,058 B | 85,058 B | 83,758 B |
| Peak server working set | 85 MiB | 85 MiB | 85 MiB |
| Sampled peak browser working set | 585 MiB | 583 MiB | 582–585 MiB |

Both runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Each started a fresh server and browser profile with a warm OS file cache. The filter workload included eleven new selections and 37 repeats. [First release run](portfolio-evidence/tooltip-pages-first-measurements.json) · [Repeat](portfolio-evidence/tooltip-pages-repeat-measurements.json)

After adding feedback for a navigator with no visible pages, the final build imported in 933 ms, opened in 395 ms, and filtered in 47.7 ms at p95. Compressed initial transfer was 85,100 B. Focus showed the color explanation in 24.7–40.3 ms and the correctly filtered revenue card in 24.3–27.5 ms. [Final release run](portfolio-evidence/tooltip-pages-final-measurements.json) · [Final interaction checks](portfolio-evidence/tooltip-pages-final-interactions.json)

## Individual and conditional chart colors

Two Chrome runs applied individual colors to categories A, B and A again on a chart of revenue from one million imported sales. Each change took **24.9–38.5 ms** from input to verified paint and issued zero analytical queries. Displayed revenue reconciled to the CSV in cents, including $42,150,419.86 for A and $42,050,815.71 for B.

Choosing weighted margin as the color source fetched it once in each run, in 61.6–61.9 ms. Changing the threshold from 22.49% to 22.51% and back flagged six, eight and six categories in 38.4–39.5 ms. Linking the threshold to a measure filter on another page flagged the expected nine categories in 37.5–39.8 ms. All four threshold edits used the loaded values. [First interaction run](portfolio-evidence/point-colors-first-interactions.json) · [Repeat](portfolio-evidence/point-colors-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 888 ms | 917 ms | 892–957 ms |
| Cold report open | 422 ms | 387 ms | 389–439 ms |
| Warm filter to last correct visual, p95 | 47.8 ms | 47.8 ms | 47.6–47.7 ms |
| Server query p95 | 8.7 ms | 8.9 ms | 8.5–8.8 ms |
| Compressed initial transfer | 83,758 B | 83,758 B | 81,833–81,836 B |
| Peak server working set | 85 MiB | 85 MiB | 83–85 MiB |
| Sampled peak browser working set | 585 MiB | 582 MiB | 583–588 MiB |

Both runs used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. Each used a fresh server and browser profile, a warm OS file cache, eleven new filter selections and 37 repeated selections. [First release run](portfolio-evidence/point-colors-first-measurements.json) · [Repeat](portfolio-evidence/point-colors-repeat-measurements.json)

## Ranking categories by a measure and including ties

On one million imported sales, a chart of daily profit ranked all 365 dates. Ranking by profit or billed revenue returned December 2, June 3 and November 10. Ranking by the weighted daily profit margin returned April 28, April 3 and December 21. Splitting profit by the twelve product categories retained those three dates. Chrome checked each date against an independent CSV aggregation and reconciled its plotted profit in cents.

Across both runs, changing a ranking measure took **54.5–73.9 ms** from the input event to the verified chart paint. A separate chart ranked days by their number of sales. The fifth date had **2,843 sales**, tied with the sixth. Changing the cutoff option switched between five and six dates in **46.5–64.4 ms**. Chrome checked each date’s sales count and profit after every change. [First interaction run](portfolio-evidence/rank-measure-first-interactions.json) · [Repeat](portfolio-evidence/rank-measure-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 915 ms | 957 ms | 885–899 ms |
| Cold report open | 389 ms | 439 ms | 397–412 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 47.7 ms |
| Server query p95 | 8.5 ms | 8.8 ms | 8.7–8.8 ms |
| Compressed initial transfer | 81,833 B | 81,833 B | 80,569 B |
| Peak server working set | 83 MiB | 84 MiB | 86 MiB |
| Sampled peak browser working set | 588 MiB | 583 MiB | 585–587 MiB |

The release checks used Chrome 157 at 1536 × 960 on a Ryzen 7 5700X3D with 64 GiB RAM. A fresh server and browser profile opened each report with the OS file cache warm. Each run included eleven new and 37 repeated filter selections. [First release run](portfolio-evidence/rank-measure-first-measurements.json) · [Repeat](portfolio-evidence/rank-measure-repeat-measurements.json)

After checking removal of a ranked card’s last category, a final million-row four-visual run measured 892 ms for import, 425 ms for cold open and 47.6 ms for warm filtering at p95. Initial transfer was 81,836 bytes. [Final core run](portfolio-evidence/rank-measure-final-core.json)

## Category-axis selection and chart tables

On one million imported sales, clicking two date labels selected all twelve categories on January 1 and January 2. The receiving card showed **$2,795,728.41**, the sum of $1,371,374.96 and $1,424,353.45. Toggling each label and clearing the selection took **62.0–63.4 ms** from input to the last correct paint in the first run and **45.0–63.0 ms** in the repeat. The browser checked the selected bars and the card against the CSV.

Opening **Show as a table** displayed the 36 date/category amounts for the chart’s three visible dates. Across six opens it took **64.0–64.8 ms** from click to the painted table, with **zero additional analytical queries**. Each displayed amount was checked against the CSV. [First interaction run](portfolio-evidence/axis-table-first-interactions.json) · [Repeat](portfolio-evidence/axis-table-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 899 ms | 885 ms | 900–903 ms |
| Cold report open | 412 ms | 397 ms | 388–421 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 47.6–47.8 ms |
| Server query p95 | 8.7 ms | 8.8 ms | 8.5–8.6 ms |
| Compressed initial transfer | 80,569 B | 80,569 B | 79,818 B |
| Peak server working set | 86 MiB | 86 MiB | 86 MiB |
| Sampled peak browser working set | 585 MiB | 587 MiB | 583–586 MiB |

Both release runs used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh browser profile and server process with the OS file cache warm. Each warm-filter run included 11 new and 37 repeated selections. [First release run](portfolio-evidence/axis-table-first-measurements.json) · [Repeat](portfolio-evidence/axis-table-repeat-measurements.json)

## Selecting a legend across ranked categories

The source chart displayed three dates and twelve product categories on one million sales. Choosing category A in the legend selected its revenue across the full year, **$42,150,419.86**. Adding B raised the card to **$84,201,235.57**. Removing A left **$42,050,815.71**, and clearing B restored **$504,604,610.30**. Each step verified the pressed legend buttons, the number of selected bars on the three visible dates, and the receiving total against the CSV in integer cents.

The four legend selections took **63.2–63.7 ms** from click to the last correct paint in the first run and **61.6–64.0 ms** in the repeat. [First interaction run](portfolio-evidence/legend-first-interactions.json) · [Repeat](portfolio-evidence/legend-repeat-interactions.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 903 ms | 900 ms | 901–907 ms |
| Cold report open | 421 ms | 388 ms | 402–487 ms |
| Warm filter to last correct visual, p95 | 47.6 ms | 47.8 ms | 47.6 ms |
| Server query p95 | 8.6 ms | 8.5 ms | 8.6–8.8 ms |
| Compressed initial transfer | 79,818 B | 79,818 B | 79,392 B |
| Peak server working set | 86 MiB | 86 MiB | 85–86 MiB |
| Sampled peak browser working set | 583 MiB | 586 MiB | 584–586 MiB |

Both release runs used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server process and browser profile with a warm OS file cache. Each warm-filter run covered 11 new and 37 repeated selections. [First release run](portfolio-evidence/legend-first-measurements.json) · [Repeat](portfolio-evidence/legend-repeat-measurements.json)

## Selecting chart marks and scatter points

Across one million imported sales, selecting the January 1 category A bar and January 2 category B bar showed **$223,831.26**. Clearing them restored **$504,604,610.30**. Chrome checked the selected date/category pairs and revenue against an independent sum of the CSV in cents. The six clicks took 61.2–64.3 ms from click to the last correct paint in the first run and 44.3–63.3 ms in the repeat. [First interaction run](portfolio-evidence/chart-selection-first-interactions.json) · [Repeat](portfolio-evidence/chart-selection-repeat-interactions.json)

Drawing a rectangle on the category profit and revenue scatter plot selected categories I, J, K and L, worth **$167,518,439.68**. Ctrl-dragging the same region cleared all four, then restored them on the next drag. From pointer release to the last correct paint, the three changes took 63.9–64.4 ms in the first run and 63.5–64.0 ms in the repeat. This timing excludes the author’s drag duration.

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 907 ms | 901 ms | 933–1,067 ms |
| Cold report open | 487 ms | 402 ms | 402–412 ms |
| Warm filter to last correct visual, p95 | 47.6 ms | 47.6 ms | 47.7 ms |
| Server query p95 | 8.6 ms | 8.8 ms | 8.9–9.0 ms |
| Compressed initial transfer | 79,392 B | 79,392 B | 78,697 B |
| Peak server working set | 85 MiB | 86 MiB | 85 MiB |
| Sampled peak browser working set | 586 MiB | 584 MiB | 582–585 MiB |

Both release runs used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Cold opens used fresh browser profiles and server processes with the OS file cache warm. Warm filtering covered 11 new and 37 repeated selections per run. Both runs met the 250 ms p95 filtering and 2 s cold-open targets. [First four-visual run](portfolio-evidence/chart-selection-first-measurements.json) · [Repeat](portfolio-evidence/chart-selection-repeat-measurements.json)

## Selecting multiple category cards

On one million sales, the author selected category A on January 1 and category B on January 2. The two combinations contributed $114,822.66 and $109,008.60. After each selection or removal, Chrome checked the pressed headers and the receiving revenue card against sums from the CSV. Selecting both showed $223,831.26 and clearing both restored $504,604,610.30. Six inputs took 62.1–62.8 ms in the first run and 60.9–62.5 ms in the repeat, including the last correct paint. The earlier twelve-category date-change workload took 58.1–75.3 ms across the two runs, compared with 58.2–75.2 ms previously. [First selection run](portfolio-evidence/paired-card-first-filter-context.json) · [Repeat](portfolio-evidence/paired-card-repeat-filter-context.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 1,067 ms | 933 ms | 901–933 ms |
| Cold report open | 402 ms | 412 ms | 397–433 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 47.8 ms |
| Server query p95 | 9.0 ms | 8.9 ms | 8.5–9.0 ms |
| Compressed initial transfer | 78,697 B | 78,697 B | 78,012 B |
| Peak server working set | 85 MiB | 85 MiB | 84–85 MiB |
| Sampled peak browser working set | 585 MiB | 582 MiB | 582–584 MiB |

Both runs used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Cold opens used fresh browser profiles and server processes with the OS file cache warm. Each run included 11 new and 37 repeated filter selections. [First release run](portfolio-evidence/paired-card-first-measurements.json) · [Repeat](portfolio-evidence/paired-card-repeat-measurements.json)

## Ranked category cards

A release report imported one million Sales rows through Chrome’s file picker. A date slicer changed twelve category cards showing revenue and share of the selected day. On each of seven date changes per run, the browser check compared all twelve callouts and all twelve percentages with an independent sum of the CSV values in integer cents. From the input event through the painted result, those changes took 58.2–75.0 ms in the first run and 58.2–75.2 ms in the repeat. A separate Gallery check changed the card column count without sending an analytical query. [First category run](portfolio-evidence/category-card-first-filter-context.json) · [Repeat](portfolio-evidence/category-card-repeat-filter-context.json) · [Layout evidence](portfolio-evidence/gallery-category-cards.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 933 ms | 901 ms | 916–1,051 ms |
| Cold report open | 433 ms | 397 ms | 395–399 ms |
| Warm filter to last correct visual, p95 | 47.8 ms | 47.8 ms | 47.7 ms |
| Server query p95 | 9.0 ms | 8.5 ms | 8.6–8.9 ms |
| Compressed initial transfer | 78,012 B | 78,012 B | 77,173 B |
| Peak server working set | 84 MiB | 85 MiB | 84–85 MiB |
| Sampled peak browser working set | 582 MiB | 584 MiB | 583–587 MiB |

Chrome 157 ran on the Ryzen 7 5700X3D with 64 GiB RAM. The cold-open measurements used fresh server processes and browser profiles with a warm OS file cache. The warm-filter measurements cover 11 new and 37 repeated selections per run. Both runs met the 250 ms warm-filter and 2 s cold-open targets. [First release run](portfolio-evidence/category-card-first-measurements.json) · [Repeat](portfolio-evidence/category-card-repeat-measurements.json)

## Card reference labels and conditional text color

On a million imported sales, one card showed revenue from categories over 8.33% share and the number of qualifying categories. Six categories qualified on January 1 ($730,883.32), three on July 2 ($398,147.27), and five on December 31 ($613,021.12). With a threshold of five, those dates exercised the above, below and equality colors. Each selection checked the card, its label and color, and all matrix rows against integer-cent CSV sums. Input to the painted page took 50.9–115.2 ms in the first run and 50.1–102.3 ms in the repeat. The previous card and matrix workload took 56.4–99.8 ms. [First card and matrix run](portfolio-evidence/card-reference-first-filter-context.json) · [Repeat](portfolio-evidence/card-reference-repeat-filter-context.json)

| Four-visual release benchmark | First run | Repeat | Previous release |
|---|---:|---:|---:|
| Import | 1,051 ms | 916 ms | 906–907 ms |
| Cold report open | 395 ms | 399 ms | 393–404 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 47.6–47.7 ms |
| Server query p95 | 8.9 ms | 8.6 ms | 8.6–8.9 ms |
| Compressed initial transfer | 77,173 B | 77,173 B | 76,051 B |
| Peak server working set | 85 MiB | 84 MiB | 85 MiB |
| Sampled peak browser working set | 583 MiB | 587 MiB | 585–588 MiB |

Chrome 157 ran on a Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with a warm OS file cache. Each filter p95 covered 11 new and 37 repeated selections, with a 16.7 ms frame interval. Both runs met the 250 ms filter and 2 s open targets. [First release run](portfolio-evidence/card-reference-first-measurements.json) · [Repeat](portfolio-evidence/card-reference-repeat-measurements.json)

## Conditional measures, iterated totals and fitted cards

On one million imported sales, an editable card evaluated each category’s revenue share and summed the revenue of categories above 8.33%. Eight categories qualified across all dates, totaling $337,086,170.62. On July 2, three qualified, totaling $398,147.27. The expected values came from independent integer-cent sums over Sales.csv. Across two runs, each of seven date changes checked the card and the four-measure matrix. Input to the painted page took 57.2–90.7 ms in the first run and 56.4–99.8 ms in the repeat. [First iterator workload](portfolio-evidence/iterator-card-first-filter-context.json) · [Repeat](portfolio-evidence/iterator-card-repeat-filter-context.json)

| Four-visual release benchmark | First run | Repeat | Previous color-scale release |
|---|---:|---:|---:|
| Import | 906 ms | 907 ms | 917–933 ms |
| Cold report open | 393 ms | 404 ms | 402–414 ms |
| Warm filter to last correct visual, p95 | 47.6 ms | 47.7 ms | 47.6–47.7 ms |
| Server query p95 | 8.6 ms | 8.9 ms | 8.7–9.0 ms |
| Compressed initial transfer | 76,051 B | 76,051 B | 75,516 B |
| Peak server working set | 85 MiB | 85 MiB | 85–86 MiB |
| Sampled peak browser working set | 585 MiB | 588 MiB | 583–584 MiB |

Chrome 157 used a Ryzen 7 5700X3D with 64 GiB RAM, a fresh server and browser profile for each cold open, and a warm OS file cache. The measured frame interval was 16.7 ms. Both runs included 11 new and 37 repeated selections and met the 250 ms filtering and 2 s cold-open targets. The intermediate release with conditional measures alone recorded 405–435 ms opens and 47.7–47.8 ms filtering p95. [Final first run](portfolio-evidence/iterator-card-first-measurements.json) · [Final repeat](portfolio-evidence/iterator-card-repeat-measurements.json) · [Intermediate first run](portfolio-evidence/posted-if-first-measurements.json) · [Intermediate repeat](portfolio-evidence/posted-if-repeat-measurements.json)

## Color scales on a hidden percentage

The million-row category matrix displayed revenue in dollars. Its background interpolated between white at 8% share and black at 9% share. Four previously visited date selections in each run took 53.0–60.4 ms from input to painted colors. All 104 category and grand-total cells matched independent CSV sums and channel-by-channel color calculations. Setting the gradient, editing its bounds and changing its colors issued zero analytical requests. [First matrix workload](portfolio-evidence/color-scale-first-filter-context.json) · [Repeat](portfolio-evidence/color-scale-repeat-filter-context.json)

| Four-visual release benchmark | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| Import | 917 ms | 933 ms | 893–916 ms |
| Cold report open | 414 ms | 402 ms | 403–425 ms |
| Warm filter to last correct visual, p95 | 47.6 ms | 47.7 ms | 47.7 ms |
| Server query p95 | 9.0 ms | 8.7 ms | 8.4–8.7 ms |
| Compressed initial transfer | 75,516 B | 75,516 B | 73,826 B |
| Peak server working set | 86 MiB | 85 MiB | 85 MiB |
| Sampled peak browser working set | 584 MiB | 583 MiB | 579–582 MiB |

Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM used a fresh server and browser profile for each cold open, with a warm OS file cache. The frame interval was 16.7 ms. Each filter p95 includes 11 new and 37 repeated selections. The 250 ms filter and 2 s open targets passed in both runs. [First release run](portfolio-evidence/color-scale-first-measurements.json) · [Repeat](portfolio-evidence/color-scale-repeat-measurements.json)

## Conditional formatting from a separate measure

On one million imported sales, the category matrix displayed revenue in dollars and used category share for both icons and backgrounds. Removing share from Values kept the three displayed measures and their headings. Across seven date changes per run, every category and grand total matched shares calculated from the CSV. Input to painted matrix took 58.1–108.3 ms in the first run and 58.3–108.2 ms in the repeat. With share visible, eight changes to icon scope took 29.8–38.9 ms with zero analytical requests. [First matrix workload](portfolio-evidence/format-source-first-filter-context.json) · [Repeat](portfolio-evidence/format-source-repeat-filter-context.json)

| Four-visual release benchmark | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| Import | 893 ms | 916 ms | 890–919 ms |
| Cold report open | 403 ms | 425 ms | 386–447 ms |
| Warm filter to last correct visual, p95 | 47.7 ms | 47.7 ms | 25.6–25.7 ms |
| Server query p95 | 8.7 ms | 8.4 ms | 9.4–9.5 ms |
| Compressed initial transfer | 73,826 B | 73,826 B | 72,321 B |
| Peak server working set | 85 MiB | 85 MiB | 84–85 MiB |
| Sampled peak browser working set | 582 MiB | 579 MiB | 569–570 MiB |

Chrome 157 ran on a Ryzen 7 5700X3D with 64 GiB RAM, using a new server and profile with a warm OS file cache. Each run covered 11 new and 37 repeated filters. The browser frame interval measured 16.7 ms in both runs, compared with roughly 7 ms at the previous checkpoint. The timing includes frame waits through painted values. Both targets passed, with a higher end-to-end filter time and a lower server query p95. [First run](portfolio-evidence/format-source-first-measurements.json) · [Repeat](portfolio-evidence/format-source-repeat-measurements.json)

## Fixed-category revenue and status icons

On one million imported sales, a category matrix showed each category’s revenue, revenue across categories, share and revenue for category A. The fixed-category measure returned $42,150,419.86 for all periods on every row, including the grand total. Each of seven date changes per run checked all 13 rows against integer-cent sums of Sales.csv. Changing the common base measure to profit also recalculated the fixed-category values.

| Four-visual release benchmark | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| Import | 919 ms | 890 ms | 920–945 ms |
| Cold report open | 447 ms | 386 ms | 397–401 ms |
| Warm filter to last correct visual, p95 | 25.7 ms | 25.6 ms | 25.7–25.8 ms |
| Server query p95 | 9.4 ms | 9.5 ms | 9.1–9.2 ms |
| Compressed initial transfer | 72,321 B | 72,321 B | 71,237 B |
| Peak server working set | 84 MiB | 85 MiB | 84–85 MiB |
| Sampled peak browser working set | 570 MiB | 569 MiB | 570–576 MiB |

Chrome 157 ran on a Ryzen 7 5700X3D with 64 GiB RAM. Cold opens used a fresh browser profile and server process with warm OS file cache. Each filter p95 covers 11 new and 37 repeated selections. [First run](portfolio-evidence/fixed-icons-first-measurements.json) · [Repeat](portfolio-evidence/fixed-icons-repeat-measurements.json)

In the four-measure matrix, date input through the painted result took 46.6–81.9 ms in the first run and 57.9–116.4 ms in the repeat. On the same report, changing the icon scope among details, totals and both took 17.1–22.2 ms through the second animation frame. All eight scope changes checked every category and the grand total and issued zero analytical queries. [First matrix workload](portfolio-evidence/fixed-icons-first-filter-context.json) · [Repeat](portfolio-evidence/fixed-icons-repeat-filter-context.json)

## Edit a measure used by a share calculation

On one million imported sales, the category matrix used `DIVIDE([Billed revenue], [Revenue across categories])`. Each of three release runs checked all 12 categories and their grand total after seven date changes. Editing Billed revenue to sum profit then recalculated all 13 rows. The all-period denominator changed from $504,604,610.30 revenue to $113,480,392.39 profit, matching an independent integer-cent sum of the source CSV.

| Four-visual report | First | Second | Third | Previous release |
|---|---:|---:|---:|---:|
| Import | 940 ms | 920 ms | 945 ms | 1,011–1,063 ms |
| Cold report open | 401 ms | 397 ms | 398 ms | 427–429 ms |
| Warm filter to last correct visual, p95 | 25.8 ms | 25.7 ms | 25.7 ms | 25.6–31.5 ms |
| Server query p95 | 9.1 ms | 9.2 ms | 9.2 ms | 9.8–10.5 ms |
| Compressed initial transfer | 71,237 B | 71,237 B | 71,237 B | 71,156 B |
| Peak server working set | 84 MiB | 85 MiB | 84 MiB | 84 MiB |
| Sampled peak browser working set | 576 MiB | 570 MiB | 575 MiB | 571–576 MiB |

Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with warm OS file cache. Each filtering run covered 11 new and 37 repeated selections. [First run](portfolio-evidence/named-first-measurements.json) · [Second](portfolio-evidence/named-repeat-measurements.json) · [Third](portfolio-evidence/named-third-measurements.json)

The separate date-to-painted-share-matrix measurement varied across runs. The ranges were 86.8–102.6 ms, 46.3–68.2 ms and 26.8–49.8 ms, compared with 40.0–68.1 ms at the previous checkpoint. The verified improvement is the ability to change one definition and reconcile every dependent value. [First matrix run](portfolio-evidence/named-first-filter-context.json) · [Second](portfolio-evidence/named-repeat-filter-context.json) · [Third](portfolio-evidence/named-third-filter-context.json)

## Calculate shares with a filtered denominator

A matrix on one million imported sales grouped revenue by the related Product category. Its denominator cleared Product[Category] and retained the related Date selection. Selecting January 1, July 2, December 31 or All recalculated the category amounts, denominators, shares and grand total. All 13 rows matched a separate integer-cent sum of Sales.csv after each of 14 changes across two release runs. January 1’s denominator was $1,371,374.96 and the all-period denominator was $504,604,610.30. Slicer input through the painted matrix took 40.0–68.1 ms. [First share workload](portfolio-evidence/context-first-filter-context.json) · [Repeat](portfolio-evidence/context-repeat-filter-context.json)

| Four-visual baseline | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 1,011 ms | 1,063 ms | 921–945 ms |
| Cold report open | 429 ms | 427 ms | 285–429 ms |
| Filter to last correct visual, p95 | 31.5 ms | 25.6 ms | 25.6–25.7 ms |
| Server query p95 | 10.5 ms | 9.8 ms | 9.8–10.2 ms |
| Compressed initial transfer | 71,156 B | 71,156 B | 71,156 B |
| Peak server working set | 84 MiB | 84 MiB | 84 MiB |
| Sampled peak browser working set | 571 MiB | 576 MiB | 572–573 MiB |

Chrome 157 ran on the Ryzen 7 5700X3D with 64 GiB RAM. Cold opens used a fresh server and browser profile with a warm OS file cache. Each baseline filtering run included 11 new and 37 repeated combinations. [First baseline](portfolio-evidence/context-first-measurements.json) · [Repeat](portfolio-evidence/context-repeat-measurements.json)

## Edit a pivot column and format each combo measure

The million-sale pivot contains 241 product rows and 13 value columns. In two Chrome runs, widening category B from 122 to 187 px took 153.2 and 158.5 ms from Apply to the second animation frame. The first implementation took 317.9 and 331.1 ms on the same task. Reusing the measured automatic widths reduced subsequent manual edits to 56.0–63.5 ms. Returning to automatic sizing took 139.4–156.1 ms. All other column widths and all 3,133 reconciled displayed values survived each edit. The browser issued zero analytical queries. [Initial sizing](portfolio-evidence/column-width-before-first.json) · [Initial repeat](portfolio-evidence/column-width-before-repeat.json) · [Final sizing](portfolio-evidence/column-format-first-matrix-widths.json) · [Final repeat](portfolio-evidence/column-format-repeat-matrix-widths.json)

Changing the number format on a 12-category combo took 12.4–18.2 ms across eight changes, also with zero analytical queries. Every change checked all 12 revenue columns and all 12 weighted profit-margin points against the independently summed revenue and profit. [First combo run](portfolio-evidence/column-format-first-combo-formats.json) · [Repeat](portfolio-evidence/column-format-repeat-combo-formats.json)

| Four-visual baseline | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 921 ms | 945 ms | 977–984 ms |
| Cold report open | 429 ms | 285 ms | 432–450 ms |
| Filter to last correct visual, p95 | 25.6 ms | 25.7 ms | 30.8–32.2 ms |
| Server query p95 | 9.8 ms | 10.2 ms | 10.2–10.6 ms |
| Compressed initial transfer | 71,156 B | 71,156 B | 68,646 B |
| Peak server working set | 84 MiB | 84 MiB | 84 MiB |
| Sampled peak browser working set | 573 MiB | 572 MiB | 570 MiB |

Chrome 157 ran on the Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with a warm OS file cache. Both runs exercised 11 new and 37 repeated filter selections. [First baseline](portfolio-evidence/column-format-first-measurements.json) · [Repeat](portfolio-evidence/column-format-repeat-measurements.json)

## Freeze matrix row headers and change wrapping

The release pivot grouped one million imported sales by product and product key across 12 categories plus a Total column. All 3,133 displayed values across 241 rows matched the independent sales ledger, including blank intersections. The browser hit-tested both frozen labels after horizontal and vertical scrolling. Each run also changed row-label wrapping four times. Those changes took 59.6–81.4 ms from input to the second animation frame. Neither formatting control issued analytical queries. [First pivot run](portfolio-evidence/matrix-freeze-pivot.json) · [Repeat](portfolio-evidence/matrix-freeze-repeat-pivot.json)

| Four-visual baseline | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 984 ms | 977 ms | 933–935 ms |
| Cold report open | 450 ms | 432 ms | 398–399 ms |
| Filter to last correct visual, p95 | 32.2 ms | 30.8 ms | 27.6–28.2 ms |
| Server query p95 | 10.6 ms | 10.2 ms | 9.8–9.9 ms |
| Compressed initial transfer | 68,646 B | 68,646 B | 67,715 B |
| Peak server working set | 84 MiB | 84 MiB | 84 MiB |
| Sampled peak browser working set | 570 MiB | 570 MiB | 575–576 MiB |

Chrome 157 ran on the Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with a warm OS file cache. Each filtering run exercised 11 new and 37 repeated selections. Both cold open and filtering took longer than in the previous checkpoint and remained inside the 2 s and 250 ms targets. [First baseline](portfolio-evidence/matrix-freeze-million-row.json) · [Repeat](portfolio-evidence/matrix-freeze-repeat-million-row.json)

## Switch matrix row layouts

A 241-row matrix grouped one million imported sales by Product and Category. Switching from Compact to Tabular first took 37.9 and 34.2 ms in two release runs. Across all twelve switches between Compact, Outline and Tabular, the range was 34.1–48.1 ms from the select control’s change event through the rendered update. The browser reused the displayed aggregates and issued zero analytical queries. Each switch checked the headings, every displayed parent and child label, all product amounts, all subtotals and the grand total against independently summed sales in cents. [First layout workload](portfolio-evidence/matrix-layout-switches.json) · [Repeat](portfolio-evidence/matrix-layout-repeat-switches.json)

The four-visual baseline used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Each cold open used a fresh server and browser profile with a warm OS file cache. The filter workloads included 11 new and 37 repeated combinations per run. Both runs met the 250 ms warm-filter and 2 s cold-open targets. The compressed initial transfer grew by 697 bytes. [First baseline](portfolio-evidence/matrix-layout-million-row.json) · [Repeat](portfolio-evidence/matrix-layout-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 935 ms | 933 ms | 929–954 ms |
| Cold open | 399 ms | 398 ms | 407–447 ms |
| Filter-to-display p95 | 27.6 ms | 28.2 ms | 31.0–31.2 ms |
| Server query p95 | 9.9 ms | 9.8 ms | 9.7–10.5 ms |
| Compressed initial transfer | 67,715 bytes | 67,715 bytes | 67,018 bytes |
| Sampled browser peak | 575 MiB | 576 MiB | 572–573 MiB |
| Server peak | 84 MiB | 84 MiB | 84 MiB |

## Change matrix hierarchy levels from the canvas

On one million sales, adding Product below Category grew the revenue matrix from 13 to 133 rows. The first addition took 31.9 and 32.1 ms in two release runs. Moving Product above Category produced 241 rows because each of the 120 products then had a subtotal. The first reversal took 59.7 and 52.7 ms. Returning to Category alone took 25.2 and 24.8 ms. Each action ran from the click event through a rendered frame and checked every leaf, subtotal and grand total against an independent sum of sales in cents. [First hierarchy run](portfolio-evidence/matrix-levels-switches.json) · [Repeat](portfolio-evidence/matrix-levels-repeat-switches.json)

The four-visual baseline used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. A fresh server and browser profile opened the report with a warm OS file cache. The 48 filter selections included 11 new and 37 repeated combinations. Filter-to-display p95 rose to 31.0–31.2 ms and the compressed initial transfer grew by 1,101 bytes. Both runs met the 250 ms filter and 2 s cold-open targets. [First baseline](portfolio-evidence/matrix-levels-million-row.json) · [Repeat](portfolio-evidence/matrix-levels-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 929 ms | 954 ms | 934–946 ms |
| Cold open | 407 ms | 447 ms | 426–431 ms |
| Filter-to-display p95 | 31.0 ms | 31.2 ms | 25.6–28.4 ms |
| Server query p95 | 10.5 ms | 9.7 ms | 10.1 ms |
| Compressed initial transfer | 67,018 bytes | 67,018 bytes | 65,917 bytes |
| Sampled browser peak | 573 MiB | 572 MiB | 571–576 MiB |
| Server peak | 84 MiB | 84 MiB | 84 MiB |

## Compare two reader-selected measures

On one million imported sales, a reader added margin alongside billed revenue for twelve categories. The clustered chart grew from 12 to 24 marks and the table added a percentage column next to the currency column. Timing ran from the checkbox change through the rendered update. The first addition took 35.3 and 38.2 ms across two release runs. All six actions in each run took 16.5–38.8 ms, including adding the two measures in reverse order. Every chart value, table heading and formatted cell matched independent sums of input cents and the ratio of total profit to total revenue. [First workload](portfolio-evidence/multi-measure-switches.json) · [Repeat](portfolio-evidence/multi-measure-repeat-switches.json)

The four-visual baseline used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with a warm OS file cache. Each run timed 11 new and 37 repeated filter combinations. The compressed initial transfer increased by 979 bytes. Both runs met the 250 ms warm-filter and 2 s cold-open targets. [First run](portfolio-evidence/multi-measure-million-row.json) · [Repeat](portfolio-evidence/multi-measure-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 946 ms | 934 ms | 936–967 ms |
| Cold open | 426 ms | 431 ms | 429 ms |
| Filter-to-display p95 | 25.6 ms | 28.4 ms | 25.6–31.9 ms |
| Server query p95 | 10.1 ms | 10.1 ms | 10.3–10.6 ms |
| Compressed initial transfer | 65,917 bytes | 65,917 bytes | 64,938 bytes |
| Sampled browser peak | 571 MiB | 576 MiB | 570–572 MiB |
| Server peak | 84 MiB | 84 MiB | 84 MiB |

## Switch a chart and table between related dimensions

On one million imported sales, a reader switched from the 12 Product categories to 365 calendar dates and back. Both related tables filtered Sales. The release browser check compared the ranked chart’s five groups and amounts, the detail heading and every visible table cell with independently summed transactions. Category D led by product category and December 2, 2025 led by date. The first date choice took 37.5 and 37.7 ms in two runs. Repeated switches took 19.9–26.8 ms from the change event through the rendered update. [First run](portfolio-evidence/dimension-switches.json) · [Repeat](portfolio-evidence/dimension-repeat-switches.json)

The four-visual regression used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with the OS file cache warm. Each run exercised 11 new and 37 repeated filter combinations. The compressed initial download grew by 967 bytes. Both runs met the 250 ms filter and 2 s cold-open targets. [First run](portfolio-evidence/dimension-million-row.json) · [Repeat](portfolio-evidence/dimension-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 936 ms | 967 ms | 955–967 ms |
| Cold open | 429 ms | 429 ms | 411–437 ms |
| Filter-to-display p95 | 31.9 ms | 25.6 ms | 25.6–31.9 ms |
| Server query p95 | 10.3 ms | 10.6 ms | 9.7 ms |
| Compressed initial transfer | 64,938 bytes | 64,938 bytes | 63,971 bytes |
| Sampled browser peak | 572 MiB | 570 MiB | 569–578 MiB |
| Server peak | 84 MiB | 84 MiB | 84–86 MiB |

## Switch a measure from the report canvas

On one million imported sales, a field-parameter slicer switched a ranked chart, detail table and card between revenue and margin. The first switch to margin took 35.5 ms and 39.0 ms in the two release runs. Subsequent switches took 19.6–27.0 ms. Timing starts at the selector’s change event and includes the final visual update. Each run checked all twelve chart values and their rank order, the table’s current heading and every visible cell, and the card against sums of the input transactions. Before category selection, the card alternated between $504,604,610.30 and 22.49%. With category A selected, it showed $42,150,419.86 and 22.43%. [First switch workload](portfolio-evidence/parameter-switches.json) · [Repeat](portfolio-evidence/parameter-repeat-switches.json)

The four-visual regression used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with a warm OS file cache. Each run timed 11 new and 37 repeated filter combinations through the last correct visual, at a measured frame interval of 6.9–7.0 ms. Both release runs met the 250 ms filter and 2 s cold-open targets. [First release run](portfolio-evidence/parameter-million-row.json) · [Repeat](portfolio-evidence/parameter-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 955 ms | 967 ms | 948–972 ms |
| Cold open | 437 ms | 411 ms | 432–455 ms |
| Filter-to-display p95 | 31.9 ms | 25.6 ms | 25.5–31.5 ms |
| Server query p95 | 9.7 ms | 9.7 ms | 9.8–10.0 ms |
| Compressed initial transfer | 63,971 bytes | 63,971 bytes | 61,496 bytes |
| Sampled browser peak | 578 MiB | 569 MiB | 571–573 MiB |
| Server peak | 86 MiB | 84 MiB | 83–84 MiB |

## Replace the measure on a ranked chart

On one million imported sales, replacing Revenue with Profit reranked 365 dates. August 25 dropped out of the top 20 and its cross-filter cleared. December 2 ranked in both lists and stayed selected on both subsequent replacements. Every displayed amount and its position matched integer-cent sums from the transactions. The benchmark also checked the linked revenue card after each drop. The first replacement, including removal of the old date filter, took 45.4–51.6 ms. The next three replacements in each run took 24.5–25.5 ms. Timing runs from releasing the field on its target through rendering the results. [Ranked amounts and timings](portfolio-evidence/field-replace-ranked.json) · [Repeat](portfolio-evidence/field-replace-repeat-ranked.json)

The four-visual regression used release builds on a Ryzen 7 5700X3D with 64 GiB RAM and Chrome 157. Cold open used a fresh server and browser profile with a warm OS file cache. Filtering covered 11 new and 37 repeated selections per run, timed through the last correct visual. The measured frame interval was 7.0 ms. Both runs met the 250 ms filter and 2 s cold-open targets. [First run](portfolio-evidence/field-replace-million-row.json) · [Repeat](portfolio-evidence/field-replace-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 948 ms | 972 ms | 923–945 ms |
| Cold open | 432 ms | 455 ms | 412–438 ms |
| Filter-to-display p95 | 31.5 ms | 25.5 ms | 25.6 ms |
| Server query p95 | 10.0 ms | 9.8 ms | 9.7 ms |
| Compressed initial transfer | 61,496 bytes | 61,496 bytes | 60,017 bytes |
| Sampled browser peak | 571 MiB | 573 MiB | 572–573 MiB |
| Server peak | 83 MiB | 84 MiB | 84 MiB |

## Move a field from the axis to the legend

On one million imported sales, dragging Category from the expanded Date/Category axis into Legend changed what the top-20 limit ranked. The axis view showed the 20 highest-revenue date/category pairs out of 4,380. The legend view showed the 20 highest-revenue dates, each split into 12 categories. The browser checked all 240 segment amounts and the 20 date totals in display order against integer-cent sums of the source records. Moving Category back restored the same 20 pairs. [First chart run](portfolio-evidence/field-transfer-ranked.json) · [Repeat](portfolio-evidence/field-transfer-repeat-ranked.json)

From releasing the field to displaying the chart, the first move into Legend took 45.0–45.1 ms and the first return took 38.7–38.9 ms. Repeated moves took 31.6–32.4 ms. These timings exclude the time spent dragging the pointer.

The four-visual regression used Chrome 157 on a Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with a warm OS file cache. Each run measured 11 new and 37 repeated filter selections through the last correct visual. Frame intervals were 6.9–7.0 ms here and 7.0 ms at the previous checkpoint. Both runs met the 250 ms filter and 2 s cold-open targets. The transfer controls added 2,806 bytes to the measured initial download. [First release run](portfolio-evidence/field-transfer-million-row.json) · [Repeat](portfolio-evidence/field-transfer-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 923 ms | 945 ms | 939–1,091 ms |
| Cold open | 438 ms | 412 ms | 407–433 ms |
| Filter-to-display p95 | 25.6 ms | 25.6 ms | 25.9–31.8 ms |
| Server query p95 | 9.7 ms | 9.7 ms | 9.6–10.4 ms |
| Compressed initial transfer | 60,017 bytes | 60,017 bytes | 57,211 bytes |
| Sampled browser peak | 572 MiB | 573 MiB | 572–574 MiB |
| Server peak | 84 MiB | 84 MiB | 84 MiB |

## Reorder fields on an expanded chart

With one million imported sales, moving Date above Category in the Build pane took 122.4 ms and 122.3 ms on the first move in two runs. Subsequent moves in either direction took 31.7–39.1 ms. Each timing starts at the button click and ends after the chart renders. For each move, the browser summed 200 plotted segments and checked the top 20 category/date pairs, in rank order, against an independent integer-cent ledger of all 4,380 pairs. [Ranked chart checks](portfolio-evidence/field-order-ranked.json) · [Repeat](portfolio-evidence/field-order-repeat-ranked.json)

The four-visual regression ran in release mode on the Ryzen 7 5700X3D with 64 GiB RAM and Chrome 157. Each cold open used a fresh server and browser profile with a warm OS file cache. Filter timing ended when the last affected visual displayed the correct value, across 11 new and 37 repeated combinations per run. Both runs met the 250 ms filter and 2 s open targets. The browser frame interval changed from 16.7 ms at the previous checkpoint to 7.0 ms here, which limits direct comparison of display latency. Initial transfer grew by 2,955 bytes. [First release run](portfolio-evidence/field-order-million-row.json) · [Repeat](portfolio-evidence/field-order-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 939 ms | 1,091 ms | 919 ms |
| Cold open | 433 ms | 407 ms | 441–455 ms |
| Filter-to-display p95 | 31.8 ms | 25.9 ms | 47.7 ms |
| Server query p95 | 10.4 ms | 9.6 ms | 8.7–9.1 ms |
| Compressed initial transfer | 57,211 bytes | 57,211 bytes | 54,256 bytes |
| Sampled browser peak | 572 MiB | 574 MiB | 565–578 MiB |
| Server peak | 84 MiB | 84 MiB | 84–85 MiB |

## Expand a hierarchy on the chart axis

With one million imported sales, a stacked column chart expanded from category to category and date. The query ranked 4,380 combinations by revenue and returned the top 20 with ten product segments each. The browser checked the 20 totals and their order against an independent integer-cent sum of the transactions. The first expansion took 147.3 ms in each run. Repeating it took 63.1–63.8 ms. Timing starts at the click and includes the rendered chart. [Ranked results](portfolio-evidence/expand-ranked.json) · [Repeat](portfolio-evidence/expand-repeat-ranked.json)

The four-visual regression used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with a warm OS file cache. Each run measured 11 new and 37 repeated filter combinations through the last correct visual. [First release run](portfolio-evidence/expand-million-row.json) · [Repeat](portfolio-evidence/expand-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 919 ms | 919 ms | 949–999 ms |
| Cold open | 441 ms | 455 ms | 424–438 ms |
| Filter-to-display p95 | 47.7 ms | 47.7 ms | 47.4–47.6 ms |
| Server query p95 | 8.7 ms | 9.1 ms | 9.4–10.3 ms |
| Compressed initial transfer | 54,256 bytes | 54,256 bytes | 53,718 bytes |
| Sampled browser peak | 565 MiB | 578 MiB | 575–577 MiB |
| Server peak | 84 MiB | 85 MiB | 84–85 MiB |

## Go to the next hierarchy level

On one million imported sales, moving from product category to date combined all categories and displayed 365 daily revenue values. Every amount matched integer-cent sums from the source files. The four whole-chart transitions across two runs took 64.1–64.4 ms from the click through the rendered chart. Each run also reconciled the same 365 dates for each of three selected categories and repeated those selections. [Daily checks](portfolio-evidence/next-level-daily.json) · [Repeat](portfolio-evidence/next-level-repeat-daily.json)

The original four-visual report ran in Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM. Cold open used a fresh server and browser profile with a warm OS file cache. Each run measured 11 new and 37 repeated filter selections through the last correct visual. [First release run](portfolio-evidence/next-level-million-row.json) · [Repeat](portfolio-evidence/next-level-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 999 ms | 949 ms | 922–934 ms |
| Cold open | 438 ms | 424 ms | 397–406 ms |
| Filter-to-display p95 | 47.4 ms | 47.6 ms | 47.6 ms |
| Server query p95 | 10.3 ms | 9.4 ms | 9.1–9.5 ms |
| Compressed initial transfer | 53,718 bytes | 53,718 bytes | 53,528 bytes |
| Sampled browser peak | 575 MiB | 577 MiB | 571–575 MiB |
| Server peak | 84 MiB | 85 MiB | 84–85 MiB |

## Trend hierarchy drill-down

Two sequential release runs in Chrome 157 used one million imported sales on a Ryzen 7 5700X3D with 64 GiB RAM. Cold open started with a fresh server and browser profile and a warm OS file cache. Each four-visual report exercised 11 new selections and 37 repeated selections. Filtering ended when the last affected visual showed the correct result. [First run](portfolio-evidence/trend-million-row.json) · [Repeat](portfolio-evidence/trend-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 934 ms | 922 ms | 916–936 ms |
| Cold open | 397 ms | 406 ms | 391–426 ms |
| Filter-to-display p95 | 47.6 ms | 47.6 ms | 47.6 ms |
| Server query p95 | 9.5 ms | 9.1 ms | 9.1–9.4 ms |
| Compressed initial transfer | 53,528 bytes | 53,528 bytes | 52,975 bytes |
| Sampled browser peak | 571 MiB | 575 MiB | 574–578 MiB |
| Server peak | 84 MiB | 85 MiB | 80–82 MiB |

A separate stacked area chart drilled from product category to date. Each run opened three different categories, then repeated them. Each drill displayed 365 dates. Every plotted daily revenue amount matched the source sales summed in integer cents for that category and date. The 12 drill clicks took 63.6–64.4 ms through the rendered daily chart. [Drill timings](portfolio-evidence/trend-drill.json) · [Repeat](portfolio-evidence/trend-repeat-drill.json)

## Stacked area charts

Two release runs used Chrome 157 on the Ryzen 7 5700X3D with 64 GiB RAM and one million imported sales. Each run started a fresh server and browser profile with a warm OS file cache. The original four-visual report exercised 11 new and 37 repeated selections, timed from input through the last correct visual. [First run](portfolio-evidence/area-million-row.json) · [Repeat](portfolio-evidence/area-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 916 ms | 936 ms | 927–949 ms |
| Cold open | 426 ms | 391 ms | 402–410 ms |
| Filter-to-display p95 | 47.6 ms | 47.6 ms | 47.5–47.6 ms |
| Server query p95 | 9.1 ms | 9.4 ms | 8.9–9.3 ms |
| Compressed initial transfer | 52,975 bytes | 52,975 bytes | 52,776 bytes |
| Sampled browser peak | 574 MiB | 578 MiB | 574–577 MiB |
| Server peak | 80 MiB | 82 MiB | 84–85 MiB |

A separate stacked area chart split each day’s revenue into cost and profit. All 730 band values across 365 dates matched integer-cent sums from the source CSV. With labels enabled, Chrome displayed 22 labels and their measured bounding boxes did not overlap. Across the two runs, 12 keyboard selections took 84.9–109.5 ms from keydown through the correct day selection and updated revenue card. [Daily chart measurements](portfolio-evidence/area-daily.json) · [Repeat](portfolio-evidence/area-repeat-daily.json)

## Statistical reference lines

Two release runs used one million imported sales, a Ryzen 7 5700X3D with 64 GiB RAM, and Chrome 157. Each started a fresh server and browser profile with a warm OS file cache. The four-visual report exercised 11 new selections and 37 repeats. Timings end when the last affected visual shows the correct value. [First run](portfolio-evidence/statistics-million-row.json) · [Repeat](portfolio-evidence/statistics-repeat-million-row.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 949 ms | 927 ms | 933–936 ms |
| Cold open | 402 ms | 410 ms | 188–435 ms |
| Filter-to-display p95 | 47.6 ms | 47.5 ms | 47.5–47.6 ms |
| Server query p95 | 9.3 ms | 8.9 ms | 9.4 ms |
| Compressed initial transfer | 52,776 bytes | 52,776 bytes | 52,323 bytes |
| Sampled browser peak | 574 MiB | 577 MiB | 575–578 MiB |
| Server peak | 84 MiB | 85 MiB | 84 MiB |

In a separate chart on the same million-row model, Chrome timed applying the 50th, 90th and 99th percentiles of the 12 category margins. All six edits displayed the independently calculated value in 28.5–31.3 ms and sent zero analytical requests. Category margins were calculated from the CSV’s revenue and profit in integer cents. [First chart run](portfolio-evidence/statistics-display.json) · [Repeat](portfolio-evidence/statistics-repeat-display.json)

## Numeric reference lines

Two release runs exercised the original four-visual report with one million imported sales on a Ryzen 7 5700X3D with 64 GiB RAM and Chrome 157. Each used a fresh server and browser profile with a warm OS file cache. The filter timings cover 11 new selections and 37 repeats, from user input to the last correct visual. [First run](portfolio-evidence/reference-million-row.json) · [Repeat](portfolio-evidence/reference-million-row-repeat.json)

| Measurement | First run | Repeat | Previous checkpoint |
|---|---:|---:|---:|
| CSV import | 936 ms | 933 ms | 923–1,021 ms |
| Cold open | 188 ms | 435 ms | 455–464 ms |
| Filter-to-display p95 | 47.6 ms | 47.5 ms | 47.6 ms |
| Server query p95 | 9.4 ms | 9.4 ms | 9.1–9.4 ms |
| Compressed initial transfer | 52,323 bytes | 52,323 bytes | 51,332 bytes |
| Sampled browser peak | 578 MiB | 575 MiB | 576–579 MiB |
| Server peak | 84 MiB | 84 MiB | 84–85 MiB |

Both runs met the 250 ms filtering and two-second cold-open targets. Initial transfer increased by 991 bytes. In a separate hospital chart test, adding or editing a reference line and changing axis bounds sent zero analytical queries. The threshold retained its position relative to the bars across all 12 site/month selections. [Chart geometry and request count](portfolio-evidence/reference-lines.json)

## Visual-level measure filters

Two Chrome 157 runs on the Ryzen 7 5700X3D with 64 GiB RAM used one million imported sales, a fresh release server and browser profile, and a warm OS file cache. Each run timed 11 new and 37 repeated selections from input through the last correct visual on the original four-visual report. [First run](portfolio-evidence/measure-filter-million-row.json) · [Repeat](portfolio-evidence/measure-filter-repeat-million-row.json)

| Measurement | First run | Repeat | Prior two runs |
|---|---:|---:|---:|
| CSV import | 1,021 ms | 923 ms | 961–963 ms |
| Cold open | 455 ms | 464 ms | 272–437 ms |
| Filter-to-display p95 | 47.6 ms | 47.6 ms | 25.7–32.0 ms |
| Server query p95 | 9.1 ms | 9.4 ms | 9.7–10.1 ms |
| Compressed initial transfer | 51,332 bytes | 51,332 bytes | 50,558 bytes |
| Sampled browser peak | 579 MiB | 576 MiB | 564–566 MiB |
| Server peak | 84 MiB | 85 MiB | 84–85 MiB |

Both runs met the 250 ms filter and 2 s open targets. In a subsequent matched comparison using the same current release engine, the archived Daily coverage frontend measured 47.6 ms p95 and the current frontend measured 47.7 ms. Both sampled a median animation frame interval of 16.7 ms. The cause of the difference from the historical runs remains undetermined. [Archived frontend](portfolio-evidence/measure-filter-archived-ui-million-row.json) · [Current frontend](portfolio-evidence/measure-filter-current-ui-million-row.json)

A separate table displayed only category and revenue. Two thresholds on its hidden margin measure qualified six and three categories respectively. Each amount matched an independent sum of the source CSV in integer cents. Across both runs, the first threshold displayed in 104–106 ms, the second in 28–29 ms, and cached repeats in 12–15 ms. [Threshold timings](portfolio-evidence/measure-filter-thresholds.json) · [Repeat](portfolio-evidence/measure-filter-repeat-thresholds.json)

## Show items with no data

Two Chrome 157 runs on a Ryzen 7 5700X3D with 64 GiB RAM used the same four-visual report and one million imported sales. Each run opened a fresh release server and browser profile with a warm OS file cache, then measured 11 new and 37 repeated filter selections through the last correct visual. [First run](portfolio-evidence/daily-million-row.json) · [Repeat](portfolio-evidence/daily-million-row-repeat.json)

| Measurement | First run | Repeat | Previous two runs |
|---|---:|---:|---:|
| CSV import | 961 ms | 963 ms | 938–965 ms |
| Cold open | 437 ms | 272 ms | 403–408 ms |
| Filter-to-display p95 | 25.7 ms | 32.0 ms | 25.6–25.7 ms |
| Server query p95 | 10.1 ms | 9.7 ms | 9.6–10.5 ms |
| Compressed initial transfer | 50,558 bytes | 50,558 bytes | 50,205 bytes |
| Sampled browser peak | 564 MiB | 566 MiB | 564–565 MiB |
| Server peak | 85 MiB | 84 MiB | 83–84 MiB |

Both runs met the 250 ms filter and 2 s open targets. In a separate chart on the same imported sales, filtering to sale 1 left one observation worth $979.61. Enabling the option extended the axis to all 365 supplied dates. The first uncached expansion displayed in 17.5 and 15.4 ms, including 8.1 and 7.9 ms on the server. Repeating the expansion took 11.5 and 10.6 ms. Each run checked every returned date and amount, the rendered axis endpoints and the single plotted observation. [First sparse chart](portfolio-evidence/daily-sparse.json) · [Repeat](portfolio-evidence/daily-sparse-repeat.json)

## Report-page tooltips

Two Chrome 157 runs used a Ryzen 7 5700X3D with 64 GiB RAM and one million imported sales. Each opened the four-visual report with a fresh release server, fresh browser profile and warm OS file cache. Each timed 11 new and 37 repeated selections through the last affected visual. [First run](portfolio-evidence/tooltip-million-row.json) · [Repeat](portfolio-evidence/tooltip-million-row-repeat.json)

| Measurement | First run | Repeat | Previous two runs |
|---|---:|---:|---:|
| CSV import | 965 ms | 938 ms | 956 ms both |
| Cold open | 403 ms | 408 ms | 394–398 ms |
| Filter-to-display p95 | 25.7 ms | 25.6 ms | 25.7–31.5 ms |
| Server query p95 | 10.5 ms | 9.6 ms | 9.7–10.2 ms |
| Compressed initial transfer | 50,205 bytes | 50,205 bytes | 48,762 bytes |
| Sampled browser peak | 565 MiB | 564 MiB | 565–574 MiB |
| Server peak | 84 MiB | 83 MiB | 84 MiB both |

Both runs met the 250 ms filtering and 2 s cold-open targets. Initial transfer grew by 1,443 compressed bytes. In a separate hospital report, focusing two marks six times issued two tooltip query batches with caching, down from six under the same sequence. The ledger checks cover 12 hospital site/month combinations and 47 budget table and matrix contexts. [Request counts](portfolio-evidence/tooltip-requests.json) · [Hospital reconciliation](portfolio-evidence/report-tooltips.json) · [Budget reconciliation](portfolio-evidence/ledger-tooltips.json)

## Signed data bars and Parquet table updates

Two Chrome 157 runs used the same four visuals and one million imported sales on the Ryzen 7 5700X3D with 64 GiB RAM. Cold opens started a new release server and browser profile with a warm OS file cache. Each run timed 11 new and 37 repeated filter selections through the last affected visual. [First run](portfolio-evidence/data-bars-million-row.json) · [Repeat](portfolio-evidence/data-bars-million-row-repeat.json)

| Measurement | First run | Repeat | Prior two runs |
|---|---:|---:|---:|
| CSV import | 956 ms | 956 ms | 964–1,044 ms |
| Cold open | 398 ms | 394 ms | 414–489 ms |
| Filter-to-display p95 | 31.5 ms | 25.7 ms | 25.5–25.7 ms |
| Server query p95 | 10.2 ms | 9.7 ms | 9.5–10.2 ms |
| Compressed initial transfer | 48,762 bytes | 48,762 bytes | 47,048 bytes |
| Sampled browser peak | 574 MiB | 565 MiB | 567–568 MiB |
| Server peak | 84 MiB | 84 MiB | 80 MiB |

Both runs met the 250 ms filtering and 2 s cold-open targets. Changing bar limits, colors and scope on the purchasing page uses the values already loaded. Its table and matrix issued zero analytical queries during the formatting check. A separate three-page table verified 61 percentages, including zero, blank and out-of-range values. The Parquet update check reconciled repeated file operations against the purchasing source ledger. [Data-bar geometry](portfolio-evidence/data-bars.json) · [Parquet update results](portfolio-evidence/purchasing-refresh.json)

## Typed Parquet import and editable visual headings

On Windows, Chrome 157 ran the same four-visual sales report over one million imported rows on a Ryzen 7 5700X3D with 64 GiB RAM. Each run used a fresh browser profile and release server, local report metadata and a warm OS file cache. The filter timer covered all four visuals, with 11 new selections and 37 repeated selections per run. [First run](portfolio-evidence/parquet-million-row.json) · [Repeat](portfolio-evidence/parquet-million-row-repeat.json)

| Measurement | Current first run | Current repeat | Previous two runs |
|---|---:|---:|---:|
| CSV import | 1,044 ms | 964 ms | 944–948 ms |
| Cold open | 414 ms | 489 ms | 403–416 ms |
| Filter-to-display p95 | 25.5 ms | 25.7 ms | 29.5–31.7 ms |
| Server query p95 | 9.5 ms | 10.2 ms | 10.1 ms |
| Compressed initial transfer | 47,048 bytes | 47,048 bytes | 46,220 bytes |
| Sampled browser peak | 568 MiB | 567 MiB | 566–575 MiB |
| Server peak | 80 MiB | 80 MiB | 84–85 MiB |

Both runs met the 250 ms warm filtering and 2 s cold-open targets. CSV import took 16–100 ms longer than the previous pair. These two runs measure the whole application and do not isolate a cause. The million-row timing used CSV for comparability. A separate Chrome workflow checked typed Parquet import, mixed-file rollback, values from both source formats and report transfer. Renaming table and matrix headings issued zero data queries. [Purchasing reconciliations](portfolio-evidence/budget-purchasing.json) · [Previous measurements](portfolio-evidence/map-million-row.json)

## Map navigation, table sorting and measure-specific formatting

Two isolated Chrome 157 release runs on the Ryzen 7 5700X3D with 64 GiB of RAM met both million-row targets. Each run timed 11 new selections and 37 repeated selections until all four visuals displayed the expected values. Cold opens used a new server and browser profile with a warm OS file cache. [First run](portfolio-evidence/map-million-row.json) · [Repeat](portfolio-evidence/map-million-row-repeat.json) · [Previous release](portfolio-evidence/schedule-million-row.json)

| Measurement | First run | Repeat | Previous release |
|---|---:|---:|---:|
| CSV import | 948 ms | 944 ms | 1,015 ms |
| Cold open | 416 ms | 403 ms | 319 ms |
| Filter-to-display p95 | 31.7 ms | 29.5 ms | 25.7 ms |
| Server query p95 | 10.1 ms | 10.1 ms | 11.3 ms |
| Compressed initial transfer | 46,220 bytes | 46,220 bytes | 42,448 bytes |
| Sampled browser peak | 566 MiB | 575 MiB | 560 MiB |
| Server peak | 85 MiB | 84 MiB | 85 MiB |

The map workload issued zero data queries while fitting, panning and zooming. Formatting the variance measure and changing its scope also issued zero data queries. Chrome checked the table order against 108 visits across five pages. All five original ledgers passed, and the transferred reports retained their cell colors, sort priorities and Pacific map bookmark. [Map geometry](portfolio-evidence/map-navigation.json) · [Sort verification](portfolio-evidence/table-sorting.json) · [Formatting checks](portfolio-evidence/cell-formatting.json)

## Delivery schedules, chart tooltips and forecast preparation

Chrome 157 on the Ryzen 7 5700X3D with 64 GiB of RAM reopened the four-visual report over one million imported sales in **319 ms**. Across 48 selections, the p95 time from input until every affected visual displayed the expected value was **25.7 ms**. The run used a restarted release server, a fresh browser profile, local metadata and a warm OS file cache. [Raw measurements](portfolio-evidence/schedule-million-row.json)

| Measurement | Current | Previous |
|---|---:|---:|
| CSV import | 1,015 ms | 973 ms |
| Cold report open | 319 ms | 442 ms |
| Filter-to-display p95 | 25.7 ms | 25.7 ms |
| Server query p95 | 11.3 ms | 9.6 ms |
| Compressed initial transfer | 42,448 bytes | 40,355 bytes |
| Sampled browser peak | 560 MiB | 568 MiB |
| Server peak | 85 MiB | 84 MiB |

The 11 new selections reached 32.1 ms p95 and the 37 repeated selections reached 25.6 ms p95. All five original report ledgers passed, including the two-sale margin workflow. Each page of all six exported reports reproduced its visual contents in an independent workspace. The new forecast check also matched twelve department-months to the two original CSVs. [Forecast reconciliation](portfolio-evidence/budget-forecast.json)

## Report transfer, calendar axes and stacked highlighting — November 18, 2026

The four-visual million-row report reached **25.7 ms p95** from input to the last correct visual, matching the previous release to the displayed precision. Cold open was **442 ms** with a fresh server and Chrome profile and a warm OS file cache. Both measurements met the respective 250 ms and 2 s targets. [Raw run](portfolio-evidence/transfer-million-row.json)

| Measurement | This release | Previous release |
|---|---:|---:|
| CSV import | 973 ms | 1,003 ms |
| Cold open | 442 ms | 452 ms |
| Filter-to-display p95, 48 selections | 25.7 ms | 25.7 ms |
| Server query p95 | 9.6 ms | 10.2 ms |
| Compressed initial transfer | 40,355 bytes | 38,709 bytes |
| Sampled browser peak | 568 MiB | 568 MiB |
| Server peak | 84 MiB | 85 MiB |

All five original report ledgers passed. Every page of all six examples displayed the same visual contents after package transfer into an independent workspace. The two-sale fixture retained 13%, 40% and 10% margins. The Gallery demonstrates elapsed-day spacing, retained percentage denominators and separate stacks for selected values outside the original segment. [Browser evidence and reproduction steps](VISUAL-CAPABILITIES.md)

## Monthly comparison and cross-highlighting release

Chrome verified the four-visual report over one million imported sales. Across 48 selections, p95 from input until the last correct visual displayed was **25.7 ms**. Cold open took **452 ms** against a restarted server with a fresh browser profile and a warm OS file cache. Both met the 250 ms filtering and 2 s cold-open targets. [Raw measurements](portfolio-evidence/monthly-million-row.json)

| Measurement | This release | Previous Gallery release |
|---|---:|---:|
| CSV import | 1,003 ms | 927 ms |
| Cold open | 452 ms | 410 ms |
| Filter to last correct visual, p95 | 25.7 ms | 25.6 ms |
| Server query, p95 | 10.2 ms | 9.4 ms |
| Compressed initial transfer | 38,709 bytes | 34,220 bytes |
| Sampled browser peak | 568 MiB | 562 MiB |
| Server peak | 85 MiB | 85 MiB |

The two-sale report retained 13%, 40%, and 10% margin across overall, A, and B selections. All six archived reports opened in a fresh workspace, and a saved edit survived restart. Hospital Operations’ four monthly comparisons were checked against encounter-level CSVs. A separate 506-depot report verified that a saved dropdown selection beyond the first 500 options stays visible and clears correctly. [Monthly comparison evidence](portfolio-evidence/monthly-change.json) · [Authoring coverage](VISUAL-CAPABILITIES.md)

## Visual Gallery release

The first Visual Gallery release passed the four-visual million-row check with **25.6 ms p95** from input to the last verified visual, compared with 25.5 ms in the five-report build. Cold open took **410 ms**, compared with 430 ms. Both runs used a fresh server and browser profile with a warm OS file cache on the reference machine below. The 48 selections included 11 new queries and 37 repeats.

| Measurement | Visual Gallery release | Previous portfolio release |
|---|---:|---:|
| CSV import | 927 ms | 928 ms |
| Server query p95 | 9.4 ms | 9.1 ms |
| Compressed initial transfer | 34,220 bytes | 23,914 bytes |
| Sampled browser peak | 562 MiB | 563 MiB |
| Sampled server peak | 85 MiB | 84 MiB |

The two-sale test also passed its relationship, margin, independent selection, layout, save and reopen checks. All six archived reports opened in a fresh workspace, and an edit survived restart. [Raw million-row measurements](portfolio-evidence/gallery-million-row.json) · [Browser authoring coverage](VISUAL-CAPABILITIES.md)

## Portfolio release

The five-report release passed the million-row regression on the same reference machine. Import took 928 ms, cold report open took 430 ms, and input-to-display filtering took 25.5 ms p95 across 48 selections. Server query latency was 9.1 ms p95 and compressed initial assets totaled 23,914 bytes. Sampled browser working set peaked at 563 MiB and server working set peaked at 84 MiB. The test now fails if filtering exceeds 250 ms p95 or cold open exceeds 2 seconds. [Raw timings and cache conditions](portfolio-evidence/million-row.json) · [Reports and workflow checks](PORTFOLIO.md)

## Original four-visual baseline

The four-visual report on one million imported sales rows reached **25.6 ms p95** from pointer input to the verified rendered result. Opening the saved, category-filtered report in a new browser profile against a restarted server took **425 ms**. The reference targets were 250 ms and 2 seconds, respectively.

## Reference machine and method

AMD Ryzen 7 5700X3D, 8 cores / 16 logical processors, 64 GiB RAM, Windows build 26300. The measurements used the Rust release executable, Chrome 157.0.8103.79 in headless mode at 1536 × 960, and HTTP over loopback. The table below uses local-file metadata. Each run imported the three generated CSVs through the browser file picker.

| Sales rows | Import | Cold report open | Server query p95 | Filter-to-display p95 | Browser peak¹ | Server peak |
|---:|---:|---:|---:|---:|---:|---:|
| 2 | 34 ms | 377 ms | 4.9 ms | 31.2 ms | 485 MiB | 29 MiB |
| 10,000 | 49 ms | 136 ms | 3.9 ms | 25.2 ms | 559 MiB | 31 MiB |
| 100,000 | 127 ms | 430 ms | 5.4 ms | 25.5 ms | 563 MiB | 39 MiB |
| 1,000,000 | 884 ms | 425 ms | 8.8 ms | 25.6 ms | 559 MiB | 80 MiB |

¹ The Windows sampler sums working sets for the browser process IDs reported by Chrome, approximately every 100 ms. This includes Chrome itself and may count shared pages more than once. The server figure uses the OS process working-set high-water mark. Neither figure includes the compiler. The standalone server executable is 86,984,704 bytes.

- **Import** spans file selection through all three tables appearing in the Data pane. CSV conversion and persisted Parquet writes occur inside the interval.
- **Cold open** starts at navigation and ends after the visual response renders and two animation frames elapse. Both the server process and browser profile are fresh. The OS file cache is warm. Each table entry is a single cold-open observation, so small differences between dataset sizes should be interpreted accordingly.
- **Filter timing** starts on a trusted pointer-down. The verifier checks the selected bar, all bar totals, the KPI, all visible detail cells, and the visible page of slicer dates against an independent integer-cents pass over the CSV. It waits one further animation frame before stopping the clock. The one-million-row run included 48 selections. Eleven required at least one uncached query (25.6 ms p95). All queries hit the cache for the other 37 selections (25.5 ms p95).
- **Server query latency** covers DataFusion planning, execution, and conversion of the result rows, or lookup of a cached result. It includes queries issued during authoring. The benchmark-scale runs each recorded 239 visual queries.
- **Initial download** was 18,379 compressed response-body bytes for the HTML, CSS, and JavaScript in a fresh profile. Model metadata and visual-query responses are additional. The working report sends aggregates and a bounded page of rows to the browser.

## Correctness and authoring

Chrome imported Sales, Product, and Date from a blank canvas and created both dimension relationships. One reusable ratio of sums produced 13% overall, 40% for category A, and 10% for category B. Selecting A and January 1, then clearing A, retained 40%. Clearing January 1 restored 13%. The test changed an aggregation, moved and resized the card with pointer input, set percentage formatting, saved a category selection, restarted the server and browser, and reopened the editable report.

A second task created Cost as Revenue minus Profit. Its card showed 870 overall and 60 for A. The test drilled from category into product, added a second page, combined visual/page/report filters, removed a page filter, saved a dashboard, and reopened the report. It also imported a separate CSV with custom headers and a quoted comma in a category label. An isolated PostgreSQL 18 fixture passed the same authoring and reopen workflow, including rejection of a stale save revision.

## Iteration record

The first working report required two relationship dialogs, four field choices, and two confirmations for the supplied model. The revised dialog suggests both matching-key relationships. Opening it and confirming the reviewed selection completes the same task in two actions. One-side uniqueness checks still run on the server, and authors can choose keys manually for other schemas.

| One-million-row workflow | First build | Current release |
|---|---:|---:|
| Import | 863 ms | 884 ms |
| Cold open | 397 ms | 425 ms |
| Server query p95 | 9.5 ms | 8.8 ms |
| Filter-to-display p95 | 25.6 ms | 25.6 ms |
| Compressed initial assets | 15,711 B | 18,379 B |

The current verifier checks every visible slicer date and bar value during timed selections and samples memory throughout the workflow. The measurements establish performance on this machine. An equivalent Power BI Desktop workload has yet to be measured.

The next verification target is a saved report against an authorized live SQL Server database. After a source row changes, the next filter interaction should reflect it. The native TDS adapter compiles and its T-SQL generation test passes. Source-side plans, network latency, and live database behavior remain unmeasured.

Launch the current build with `.\target\release\keybi.exe` from the project root. The reproduction commands are in [README.md](README.md). Raw timings and screenshots are under `test-results/<row count>/<run timestamp>/`.
