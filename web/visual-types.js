export const comparisons = {
  lt: "is less than", lte: "is at most", gt: "is greater than", gte: "is at least",
  eq: "equals", ne: "does not equal", blank: "is blank", present: "is not blank",
};
const g = (key, label, required = true, multiple = false) => ({
  key,
  label,
  required,
  multiple,
  field: true,
});
const m = (key, label, required = true, multiple = false) => ({
  key,
  label,
  required,
  multiple,
  field: false,
});
const category = g("groups", "Category", true, true),
  trend = g("groups", "Trend axis", true, true),
  series = g("legendFields", "Legend", false),
  value = m("metrics", "Value");
const comparison = [category, m("metrics", "Values", true, true), series];
const distribution = [
  g("groups", "Details"),
  m("metrics", "X axis"),
  m("other", "Y axis"),
  series,
];
const slices = [g("groups", "Category"), value];
const trendWells = [trend, m("metrics", "Values", true, true), series];
export const stackedArea = kind => kind === "stackedArea" || kind === "percentArea";
export const dateTrend = kind => ["line","area","combo"].includes(kind) || stackedArea(kind);
export function usesCalendarAxis(v) {
  const field = v.groups[v.level || 0];
  return v.calendarAxes
    ? v.calendarAxes.some(f => f.t === field?.t && f.c === field?.c)
    : Boolean(v.continuousDate && !v.level);
}
export function setCalendarAxis(v, enabled) {
  const field = v.groups[v.level || 0];
  if (!field) {
    delete v.calendarAxes;
    v.continuousDate = enabled;
    return;
  }
  const previous = v.calendarAxes || (v.continuousDate ? [v.groups[0]] : []);
  v.calendarAxes = previous.filter(f => f.t !== field.t || f.c !== field.c);
  if (enabled) v.calendarAxes.push(field);
  delete v.continuousDate;
}
const specializedTypes = {
  gantt: [
    "Gantt chart",
    [
      g("groups", "Task"),
      g("startFields", "Start date"),
      g("endFields", "End date"),
      g("phaseFields", "Workstream", false),
      m("metrics", "Progress", false),
    ],
  ],
  waterfall: ["Waterfall", [g("groups", "Category"), m("metrics", "Change")]],
  ribbon: [
    "Ribbon",
    [
      g("groups", "Axis"),
      m("metrics", "Value"),
      g("legendFields", "Ribbon series"),
    ],
  ],
  funnel: ["Funnel", [g("groups", "Stage"), value]],
  treemap: [
    "Treemap",
    [
      g("groups", "Group"),
      m("metrics", "Size"),
      g("legendFields", "Details", false),
    ],
  ],
  gauge: [
    "Gauge",
    [
      m("metrics", "Value"),
      m("other", "Target"),
      g("groups", "Category", false),
    ],
  ],
  map: [
    "Coordinate map",
    [
      g("groups", "Location"),
      m("metrics", "Latitude"),
      m("other", "Longitude"),
      m("size", "Bubble size", false),
    ],
  ],
  decomposition: [
    "Decomposition tree",
    [m("metrics", "Analyze"), g("groups", "Explain by", true, true)],
  ],
};
const types = {
  clusteredBar: ["Clustered bar", comparison],
  stackedBar: ["Stacked bar", comparison],
  percentBar: ["100% stacked bar", comparison],
  clusteredColumn: ["Clustered column", comparison],
  stackedColumn: ["Stacked column", comparison],
  percentColumn: ["100% stacked column", comparison],
  line: ["Line chart", trendWells],
  area: ["Area chart", trendWells],
  stackedArea: ["Stacked area", trendWells],
  percentArea: ["100% stacked area", trendWells],
  combo: [
    "Line and column",
    [
      trend,
      m("metrics", "Column values", true, true),
      m("other", "Line values", true, true),
    ],
  ],
  dot: ["Dot plot", comparison],
  scatter: ["Scatter chart", distribution],
  bubble: ["Bubble chart", [...distribution, m("size", "Size")]],
  pie: ["Pie chart", slices],
  donut: ["Donut chart", slices],
  indicator: ["KPI", [g("groups", "Trend axis"), value, m("other", "Target")]],
  list: ["List slicer", [g("groups", "Field")]],
  dropdown: ["Dropdown slicer", [g("groups", "Field")]],
  dateRange: ["Date range slicer", [g("groups", "Date field")]],
  ...specializedTypes,
};
const facetWell=g("smallMultiples","Small multiples",false);
export function supportsMultiples(kind) {
  return /^(clustered|stacked|percent)(Bar|Column)$/.test(kind) || ["line","area","stackedArea","percentArea"].includes(kind);
}
function roles(v) {
  const base=types[v.kind]?.[1] || [];
  return supportsMultiples(v.kind)?[...base,facetWell]:base;
}
export function samePoint(left, right) {
  return left?.length === right.length && right.every(({field,value},i) =>
    left[i].field.t === field.t && left[i].field.c === field.c && left[i].value === value);
}
export function selectableChart(kind) {
  return hasAxisHierarchy(kind) || ["pie","donut","scatter","bubble"].includes(kind);
}
export function legendField(v) {
  if (v.kind === "pie" || v.kind === "donut") return v.groups[0];
  if (selectableChart(v.kind)) return v.legendFields?.[0];
}
export function selectionRows(selection, groups) {
  if (!selection) return [];
  const filters = selection.filters || [selection];
  if (filters.length !== groups.length || !filters.every((f,i) => f.field?.t === groups[i].t && f.field?.c === groups[i].c)) return [];
  if (!["in","tuple"].includes(filters[0]?.op)) return [filters.map(f => f.value)];
  return filters[0].value.map((_,i) => filters.map(f => f.value[i]));
}
function buildRoles(v) {
  if (!types[v.kind]) {
    const tabular = ["table","matrix"].includes(v.kind);
    const wells = [];
    if (v.kind !== "card") wells.push(g("groups", tabular ? "Rows" : v.kind === "slicer" ? "Field" : "Category / hierarchy", true, v.kind !== "slicer"));
    if (v.kind === "matrix") wells.push(g("columns","Columns",false,true));
    if (v.kind !== "slicer") wells.push(m("metrics",tabular ? "Values" : "Value",true,tabular));
    if (v.kind === "card") wells.push(g("groups","Categories",false,true),m("references","Reference labels",false,true));
    return wells;
  }
  const wells = roles(v);
  return !["dateRange", "dropdown", "list", "decomposition", "gauge"].includes(
      v.kind,
    )
    ? [...wells, m("tooltipFields", "Tooltips", false, true)]
    : wells;
}
function treeSplit(v) {
  const available = v.groups.filter(
    (f) =>
      !v.treePath?.some((step) => step.field.t === f.t && step.field.c === f.c),
  );
  return (
    available.find((f) => v.splitField === f.t + "." + f.c) || available[0]
  );
}
export function hasAxisHierarchy(kind) {
  return kind === "bar" || dateTrend(kind) || types[kind]?.[1] === comparison;
}
export function axisFields(v) {
  const last = v.level || 0;
  let first = last;
  while (first > 0 && v.expandedLevels?.includes(first)) first--;
  return v.groups.slice(first, last + 1);
}
function chartGroups(v) {
  if (v.kind === "decomposition") return [treeSplit(v)].filter(Boolean);
  if (hasAxisHierarchy(v.kind))
    return [...axisFields(v), ...(v.legendFields || []), ...(supportsMultiples(v.kind)?v.smallMultiples||[]:[])];
  return roles(v)
    .filter((r) => r.field)
    .flatMap((r) => v[r.key] || []);
}
function chartMetrics(v) {
  return roles(v)
    .filter((r) => !r.field)
    .flatMap((r) => v[r.key] || []);
}
function compatible(v, kind) {
  const before = types[v.kind] ? chartMetrics(v) : [...(v.metrics || [])],
    oldGroups = v.groups || [];
  const allowed = new Set(roles({kind}).map((r) => r.key));
  for (const key of [
    "other",
    "size",
    "legendFields",
    "startFields",
    "endFields",
    "phaseFields",
    "smallMultiples",
  ])
    if (!allowed.has(key)) delete v[key];
  v.kind = kind;
  for (const role of roles(v)) {
    v[role.key] ??= [];
    if (!role.multiple) v[role.key] = v[role.key].slice(0, 1);
  }
  if (kind === "combo" && !(v.other || []).length && v.metrics.length > 1) {
    v.other = v.metrics.splice(1);
  }
  if (
    [
      "line",
      "area",
      "stackedArea",
      "percentArea",
      "dot",
      "clusteredColumn",
      "clusteredBar",
      "stackedBar",
      "percentBar",
      "stackedColumn",
      "percentColumn",
    ].includes(kind) &&
    before.length
  ) {
    v.metrics = before.filter(
      (b, i) =>
        before.findIndex((a) => JSON.stringify(a) === JSON.stringify(b)) === i,
    );
  }
  const metricRoles = roles(v).filter((r) => !r.field);
  const used = metricRoles
    .flatMap((r) => v[r.key] || [])
    .map((m) => JSON.stringify(m));
  const remaining = before.filter((m) => !used.includes(JSON.stringify(m)));
  for (const r of metricRoles) {
    if (!v[r.key].length && remaining.length) v[r.key] = [remaining.shift()];
  }
  if (oldGroups.length && !v.groups.length) v.groups = oldGroups.slice(0, 1);
}

export {
  treeSplit,
  specializedTypes,
  types,
  roles,
  buildRoles,
  chartGroups,
  chartMetrics,
  compatible,
};
export function monthMetric(base, comparison) {
  if (base.comparison)
    return { op: "formula", field: base.field, tree: { kind: "value", value: base }, comparison };
  return { ...base, comparison };
}

