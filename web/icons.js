const paths = {
  image: "M2 4h20v16H2z M3 18l6-7 4 4 3-3 5 6 M15 8a1 1 0 1 0 2 0 1 1 0 0 0-2 0",
  shape: "M3 4h12v11H3z M11 19a5 5 0 1 0 8-6",
  copy: "M8 8h12v13H8z M15 8V3H3v13h5",
  arrange: "M3 3v18 M6 5h12v3H6z M6 11h8v3H6z M6 17h15v3H6z",
  undo: "M9 4 3 10l6 6 M4 10h10a6 6 0 0 1 6 6v3",
  redo: "m15 4 6 6-6 6 M20 10H10a6 6 0 0 0-6 6v3",
  paste: "M8 5H5v16h14V5h-3 M9 3h6v4H9z M8 11h8 M8 15h8",
  focus: "M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6",
  locked: "M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3",
  parameterSlicer: "M3 4h18v5H3z M5 15h14 M5 20h14 M13 13v4 M9 18v4",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  textBox: "M3 5h18M12 5v15M8 20h8",
  narrative: "M3 4h18v16H3z M6 8h12 M6 12h5 M6 16h7 M14 13l2-3 2 2",
  actionButton: "M3 6h18v12H3z M7 12h9m-3-3 3 3-3 3",
  navigator: "M3 4h18v16H3z M3 15h18 M9 15v5 M15 15v5",
  gantt: "M3 3v18h19 M5 5h8v3H5z M9 10h9v3H9z M15 15h6v3h-6z",
  waterfall: "M3 12h4v7H3z M9 7h4v5H9z M15 7h4v3h-4z M20 10h2v9h-2z",
  ribbon: "M2 5q5 0 9 6t11 3v5q-6 1-11-5T2 9z M2 14q6 0 10-6t10-5",
  funnel: "M2 4h20l-4 5H6z M7 11h10l-3 4h-4z M10 17h4l-2 4z",
  treemap: "M3 3h18v18H3z M12 3v18 M12 12h9 M3 15h9",
  gauge: "M3 17a9 9 0 1 1 18 0 M7 17a5 5 0 1 1 10 0 M12 17l5-8",
  map: "M2 5l7-2 7 3 6-2v15l-6 2-7-3-7 2z M9 3v15 M16 6v15",
  decomposition:
    "M2 9h6v6H2z M16 3h6v5h-6z M16 16h6v5h-6z M8 12h4V5h4 M12 12v6h4",
  clusteredBar:
    "M3 3v18h18 M5 5h10v2H5z M5 9h7v2H5z M5 14h15v2H5z M5 18h10v2H5z",
  stackedBar: "M3 4h14v5H3z M10 4v5 M3 13h18v5H3z M13 13v5",
  percentBar: "M3 4h18v5H3z M9 4v5 M3 13h18v5H3z M14 13v5",
  clusteredColumn:
    "M3 21h19 M4 9h3v11H4z M8 13h3v7H8z M14 4h3v16h-3z M18 8h3v12h-3z",
  stackedColumn: "M4 7h6v13H4z M4 12h6 M14 3h6v17h-6z M14 13h6",
  percentColumn: "M4 3h6v17H4z M4 9h6 M14 3h6v17h-6z M14 13h6",
  line: "M3 3v18h18 M5 15l5-6 4 3 7-8",
  area: "M3 20V14l6-7 5 4 7-7v16z",
  stackedArea: "M3 20V12l6-6 5 3 7-6v17z M3 16l6-4 5 3 7-6",
  percentArea: "M3 4h18v16H3z M3 13l6-5 5 6 7-4",
  combo:
    "M3 21h18 M4 15h3v5H4z M11 10h3v10h-3z M18 13h3v7h-3z M3 11l7-7 6 4 5-5",
  dot: "M3 3v18h18 M8 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M14 14a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  scatter: "M3 3v18h18 M7 14h2v2H7z M13 7h2v2h-2z M17 10h2v2h-2z",
  bubble:
    "M3 3v18h18 M6 15a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M13 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  pie: "M11 3a9 9 0 1 0 10 10H11z M14 3v7h7a8 8 0 0 0-7-7z",
  donut:
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 3v5",
  indicator: "M3 19h18 M4 14l5-6 5 3 6-7 M16 4h4v4",
  list: "M3 5h3v3H3z M9 6h12 M3 11h3v3H3z M9 12h12 M3 17h3v3H3z M9 18h12",
  dropdown: "M3 6h18v12H3z M13 11l3 3 3-3",
  dateRange: "M3 6h18v14H3z M3 10h18 M7 3v5m10-5v5 M7 15h10",
  matrix: "M3 4h18v16H3z M3 9h18M3 15h18M9 4v16M15 9v11",
  report: "M3 3h18v17H3z M7 15v-4m5 4V7m5 8v-6",
  bar: "M4 3v17h17 M7 6h8v2H7z M7 11h12v2H7z M7 16h5v2H7z",
  card: "M3 5h18v14H3z M7 10l2-1v6m4-5c2-2 5 0 2 2l-2 2h4",
  table: "M3 4h18v16H3z M3 9h18M3 14h18M10 9v11",
  slicer: "M3 5h18M5 11h14M8 17h8 M8 3v4m7 2v4m-4 2v4",
  model: "M8 2h8v5H8z M2 16h7v5H2z M15 16h7v5h-7z M12 7v4H5v5m7-5h7v5",
  library: "M3 5h4v15H3z M10 5h3v15h-3z M15 6l3-1 4 14-3 1z",
  save: "M3 3h14l4 4v14H3z M7 3v6h9V3M7 21v-8h10v8",
  import: "M4 14v6h16v-6 M12 3v12m-4-4 4 4 4-4",
  measure: "M4 3h16v18H4z M7 6h10v3H7z M7 13h2m4 0h3m-9 4h2m4 0h3",
  calc: "M4 4h16v16H4z M8 8h3m-1.5-1.5v3 M14 15h3m-3 2h3",
  plusbox: "M3 3h18v18H3zM7 12h10m-5-5v10",
  filter: "M3 4h18l-7 8v7l-4 2V12z",
  panes: "M3 4h18v16H3zM14 4v16",
  plus: "M5 12h14m-7-7v14",
  close: "M6 6l12 12M6 18 18 6",
  folder: "M3 6h7l2 2h9v12H3z",
  chevron: "m8 10 4 4 4-4",
  database:
    "M4 6c0-5 16-5 16 0s-16 5-16 0v12c0 5 16 5 16 0V6M4 12c0 5 16 5 16 0",
  page: "M5 3h10l4 4v14H5z M15 3v5h4",
  hiddenPage: "M3 3l18 18 M10 5c5-1 9 3 12 7l-3 4 M5 7l-3 5c3 5 8 8 13 6 M10 10a3 3 0 0 0 4 4",
  drill: "M12 3v16m-6-6 6 6 6-6",
  nextLevel: "M7 3v16m-4-5 4 5 4-5 M17 3v16m-4-5 4 5 4-5",
  expandLevel: "M12 2v6 M5 19V10h14v9 M2 16l3 4 3-4 M16 16l3 4 3-4",
  back: "m14 5-7 7 7 7",
  next: "m10 5 7 7-7 7",
  clear: "m4 15 9-11 8 7-7 9H9z M7 12l8 7",
};
export const icon = (name) =>
  '<svg class="ico" aria-hidden="true" viewBox="0 0 24 24"><path d="' +
  paths[name] +
  '"/></svg>';
export function decorate(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon));
    delete el.dataset.icon;
  });
}
