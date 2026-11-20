import { sliceChart } from "./slices.js";
import {panelGrid} from "./small-multiples.js";
import { binLabel, canShowBinGaps, intervalCategories, selectedTimeIntervals, timeBinTick, valueCaption } from "./numeric-bins.js";
import { foreground } from "./cell-format.js";
import { ganttChart } from "./gantt.js";
import { axisMetricStyle, axisScale, axisLabel, calendarScale, numericTrendScale } from "./axes.js";
import { referenceDomain, referenceMarks, statisticalLines } from "./reference-lines.js";
import { specializedChart } from "./specialized.js";
import { specializedTypes, chartGroups, chartMetrics, stackedArea, dateTrend, usesCalendarAxis, axisFields, hasAxisHierarchy, samePoint, selectableChart, selectionRows, legendField } from "./visual-types.js";
import { areaBands, seriesNames, legendMemberName } from "./stacked-area.js";
export { attachRectangleSelection } from "./rectangle-select.js";

const palette = [
  "#327462",
  "#d7863a",
  "#526da8",
  "#a4526a",
  "#8a8334",
  "#499ba5",
  "#805ba0",
];
const xml = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const tag = (name, attrs, body = "") =>
  `<${name} ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${xml(v)}"`)
    .join(" ")}>${body}</${name}>`;
const rect = (x, y, width, height, fill) =>
  tag("rect", {
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
    fill,
  });
const line = (x1, y1, x2, y2, stroke = "#d5ded9") =>
  tag("line", { x1, y1, x2, y2, stroke });
const txt = (x, y, s, anchor = "start", extra = {}) =>
  tag(
    "text",
    { x, y, "text-anchor": anchor, fill: "#3b5147", "font-size": 11, ...extra },
    xml(s),
  );
const compact = (n) =>
  new Intl.NumberFormat("en-US", {
    notation: Math.abs(n) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(n);
const distinct = (a) => [...new Set(a)];
const shown = (x) => (x == null ? "(Blank)" : String(x));
function bounds(nums, zero = true) {
  let lo = Math.min(...nums, ...(zero ? [0] : [])),
    hi = Math.max(...nums, ...(zero ? [0] : []));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi === lo) {
    const gap = Math.max(1, Math.abs(hi) * 0.1);
    lo -= zero ? 0 : gap;
    hi += gap;
  }
  return [lo, hi];
}
const unit = (n, [lo, hi]) => (n - lo) / (hi - lo);
function chartBody(v,res,context) {
  if(v.smallMultiples?.length)return panelGrid(v,res,context,chartBody,xml);
  const {fieldname,valname,format,style,pointColor}=context;
  const { rows, more } = res;
  const categoryLabel = (value, index = 0) => {
    const width = v.binWidths?.[index];
    if (!width && (v.kind==="list" || v.kind==="dropdown")) {
      if (value==="All" && v.kind==="dropdown" && !v.multiSelect) return '"All"';
      return valueCaption(value);
    }
    if (!width) return shown(value);
    return binLabel(value,width);
  };
  if (v.kind === "dropdown") {
    const selected=v.selection?.value,values=Array.isArray(selected) ? selected : v.selection ? [selected] : [];
    const caption=values.length>1 ? values.length+" selected" : values.length ? categoryLabel(values[0]) : "All values";
    if (v.multiSelect) return `<span class="formlabel">${xml(fieldname(v.groups[0]))}</span><button type="button" class="control slicer-choice" data-slicer-values aria-haspopup="dialog" aria-label="Choose ${xml(fieldname(v.groups[0]))} values">${xml(caption)} <span aria-hidden="true">▾</span></button>`;
    const options = rows.map(([value], i) =>
      tag(
        "option",
        {
          value: i,
          ...(values.length===1 && values[0] === value
            ? { selected: "" }
            : {}),
        },
        xml(categoryLabel(value)),
      ),
    );
    if (values.length && !(values.length===1 && rows.some(([value]) => value === values[0])))
      options.unshift(
        tag(
          "option",
          { value: "current", selected: "", disabled: "" },
          xml(caption),
        ),
      );
    return `<label class="formlabel">${xml(fieldname(v.groups[0]))}<select class="control" data-slice-drop><option value="">All</option>${options.join("")}</select></label>`;
  }
  if (
    more &&
    !["dateRange", "list", "dropdown"].includes(v.kind) &&
    !(v.top && !v.legendFields?.length)
  )
    return '<div class="vempty">More than 500 groups. Filter this visual to show the complete distribution.</div>';
  const groups = chartGroups(v),
    metrics = chartMetrics(v),
    ng = groups.length;
  const depth = hasAxisHierarchy(v.kind) ? axisFields(v).length : 1;
  const expanded = depth > 1;
  const tuples = new Map();
  const rowCategories = rows.map(row => {
    if (!expanded) return row[0];
    const tuple = row.slice(0, depth), key = JSON.stringify(tuple);
    if (!tuples.has(key)) tuples.set(key, tuple);
    return key;
  });
  let cats = distinct(rowCategories);
  if(v.pane) {
    cats=v.pane.categories.map(tuple=>{
      if(!expanded)return tuple[0];
      const key=JSON.stringify(tuple);tuples.set(key,tuple);return key;
    });
  }
  let bounded;
  if (v.showBinGaps && !expanded && v.binWidths?.[0] && canShowBinGaps(v)) {
    if (typeof v.binWidths[0]==="object") bounded=selectedTimeIntervals(res.query,v.timeCalculations);
    if (bounded===undefined) cats=intervalCategories(cats,v.binWidths[0]);
    else if (bounded===null) cats=null;
    else {
      const observed=cats.filter(c=>c!=null);
      const dates=[...new Set([...bounded,...observed])].sort();
      cats=cats.includes(null) ? [...dates,null] : dates;
    }
    if (!cats) return '<div class="vempty">Use a wider bin size, narrow the range, or turn off empty intervals to display this distribution.</div>';
  }
  if (!cats.length) return '<div class="vempty">No matching rows</div>';
  const timeWidth = !expanded && typeof v.binWidths?.[0] === "object" && v.binWidths[0];
  const days = timeWidth ? cats.filter(c=>typeof c === "string").map(c=>c.slice(0,10)) : [];
  const sameDay = days.length && days.every(d=>d===days[0]);
  const multipleYears = days.some(d=>d.slice(0,4)!==days[0].slice(0,4));
  const tickLabel = (value,limit) => {
    if (!timeWidth) return categoryLabel(value).slice(0,limit);
    const tick = timeBinTick(value,timeWidth,sameDay);
    return multipleYears && value && timeWidth.ms % 86400000 ? value.slice(0,5) + tick : tick;
  };
  const parentOf = expanded ? new Map(cats.map(key => [key, JSON.stringify(tuples.get(key).slice(0,-1))])) : null;
  const areaStack = stackedArea(v.kind);
  const field = legendField(v), slice = v.kind === "pie" || v.kind === "donut";
  const legendIndex = slice ? 0 : depth;
  const names = (areaStack || field) && seriesNames(metrics,valname,Boolean(v.legendFields?.length),depth);
  const legendMembers = new Map();
  const keys = [],
    points = [];
  for (const [idx, row] of rows.entries())
    for (const [j, metric] of metrics.entries()) {
      const k = names ? names(row,j) :
        [
          ...(v.legendFields?.length && ng > 1 ? [shown(row[depth])] : []),
          ...(metrics.length > 1 || ng === 1 ? [valname(metric)] : []),
        ].join(" · ") || valname(metric);
      if (!keys.includes(k)) keys.push(k);
      if (field) {
        const value = row[legendIndex];
        const label = slice || v.kind === "scatter" || v.kind === "bubble" ? legendMemberName(value) : k;
        legendMembers.set(label,value);
      }
      const highlighted = res.highlight?.get(
        JSON.stringify(row.slice(0, ng)),
      )?.[j];
      if (Number.isFinite(row[ng + j]) || Number.isFinite(highlighted))
        points.push({
          i: idx,
          j,
          k,
          cat: rowCategories[idx],
          value: row[ng + j],
          highlighted,
          row,
          metric,
        });
    }
  const color = (k) => {
    const configured = v.seriesOrder?.indexOf(k) ?? -1;
    const index = configured >= 0 ? configured : keys.indexOf(k);
    if (v.colors && Object.hasOwn(v.colors,k)) return v.colors[k];
    return index > 0 ? (v.palette || palette)[index % (v.palette || palette).length] : v.accent;
  };
  const w = Math.max(210, v.w - 32),
    h = Math.max(100, v.h - 78 - (v.showLegend === false ? 0 : 22));
  const fmt = (p, n = p.value) => format(p.metric, n);
  const selectable = selectableChart(v.kind);
  const picked = new Set(selectionRows(v.selection,v.pane?.groups||groups).map(row => JSON.stringify(row)));
  const pickedLegend = new Set(field ? selectionRows(v.selection,[field]).map(row => row[0]) : []);
  const axisDepth = v.selection?.axis ? v.selection.filters.length : 0;
  const pickedAxis = new Set(axisDepth ? selectionRows(v.selection,groups.slice(0,axisDepth)).map(row => JSON.stringify(row)) : []);
  const axisAttributes = values => ({
    role:"button", tabindex:0, "data-axis-pick":JSON.stringify(values),
    "aria-label":values.map((value,i) => fieldname(groups[i])+" = "+(v.binWidths?.[i] ? categoryLabel(value,i) : legendMemberName(value))).join(" › "),
    "aria-pressed":pickedAxis.has(JSON.stringify(values)),
  });
  let continuous;
  const mark = (p, shape, label = fmt(p), extra = {}) => {
    const key = JSON.stringify(v.pane?[...p.row.slice(0,ng),v.pane.member]:p.row.slice(0,ng));
    const selected = !!v.pane?.facetSelected || picked.has(key) || Boolean(v.selection?.legend && pickedLegend.has(p.row[legendIndex])) ||
      (axisDepth > 0 && pickedAxis.has(JSON.stringify(p.row.slice(0,axisDepth))));
    const desc = (v.pane?fieldname(v.pane.field)+" "+v.pane.caption+", ":"")+`${groups.map((f, i) => fieldname(f) + " " + categoryLabel(p.row[i],i)).join(", ")} · ${p.k}: ${label}`;
    const rich = v.richTooltip || v.tooltipFields?.length || extra["aria-description"];
    const outsideRange = continuous?.custom && (p.cat<continuous.domain[0] || p.cat>continuous.domain[1]);
    return tag(
      "g",
      {
        class: "plot-mark",
        role: "button",
        tabindex: outsideRange ? -1 : 0,
        ...(outsideRange ? {"aria-hidden":"true","pointer-events":"none"} : {}),
        "aria-label": desc,
        "aria-pressed": selected,
        "data-point": v.pane?.indexes[p.i]??p.i,
        ...(selectable ? {"data-selection-key":key} : {}),
        "data-metric": p.j,
        "data-value": p.value,
        ...(v.tooltips !== false && rich
          ? { "data-rich-tip": "" }
          : {}),
        ...extra,
      },
      (v.tooltips !== false && !rich
        ? tag("title", {}, xml(desc))
        : "") + shape,
    );
  };
  const rectangle = ["scatter","bubble","dot","line","area","stackedArea","percentArea"].includes(v.kind);
  function legendItem(k) {
    const attrs = {"data-series-color":k,"data-color":color(k)};
    const contents = tag("i",{style:"background:"+color(k)}) + xml(k);
    if (!legendMembers.has(k)) return tag("span",attrs,contents);
    const value = legendMembers.get(k);
    return tag("button",{...attrs,"data-legend-pick":JSON.stringify(value),
      "aria-pressed":pickedLegend.has(value),title:"Select "+fieldname(field)+" = "+legendMemberName(value)},contents);
  }
  function legendBody(legend) {
    if(v.showLegend===false || !legend.length)return "";
    if(v.pane){for(const k of legend)if(!v.pane.legend.has(k))v.pane.legend.set(k,legendItem(k));return "";}
    return '<div class="chart-legend">'+legend.map(legendItem).join("")+'</div>';
  }
  const svg = (body, legend = keys) =>
    `<div class="chart-frame"><svg class="analytic-plot" viewBox="0 0 ${w} ${h}" role="group" aria-label="${xml(v.title || v.kind)}"${selectable ? " data-clear-space" : ""}${rectangle ? ' data-rectangle-select aria-description="Drag around points to select them. Ctrl-drag to toggle."' : ""}>${body}</svg>${legendBody(legend)}</div>`;
  if (["list", "dateRange"].includes(v.kind)) {
    if (v.kind === "dateRange") {
      const dates = rows
        .map((r) => r[0])
        .filter((x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x))
        .sort();
      if (
        !dates.length ||
        dates.length !== rows.filter((r) => r[0] != null).length
      )
        return '<div class="vempty">Bind an ISO calendar date (YYYY-MM-DD).</div>';
      return `<div class="range-fields">${["From", "Through"].map((s, i) => `<label>${s}<input type="date" data-range="${i}" min="${dates[0]}" ${more ? "" : `max="${dates.at(-1)}"`} value="${xml(v.range?.[i] || "")}"></label>`).join("")}</div>`;
    }
    const checked = (value) =>
      Array.isArray(v.selection?.value)
        ? v.selection.value.includes(value)
        : v.selection?.value === value;
    return `<div class="list-slicer">${rows.map((r, i) => `<button class="slicebtn ${checked(r[0]) ? "selected" : ""}" data-item="${i}" aria-pressed="${checked(r[0])}">${xml(categoryLabel(r[0]))}</button>`).join("")}</div>`;
  }
  if (v.kind === "decomposition") {
    const path = v.treePath || [],
      split = groups[0],
      remaining = v.groups.filter(
        (f) =>
          !path.some((step) => step.field.t === f.t && step.field.c === f.c),
      );
    const selector =
      '<label class="tree-split">Explain by <select data-tree-split>' +
      remaining
        .map(
          (f) =>
            `<option value="${xml(f.t + "." + f.c)}" ${f === split ? "selected" : ""}>${xml(fieldname(f))}</option>`,
        )
        .join("") +
      "</select></label>";
    const trail = path
      .map(
        (s, i) =>
          `<button data-tree-up="${i}" title="Return to ${xml(fieldname(s.field))}">${xml(shown(s.value))} ×</button>`,
      )
      .join("");
    return `<div class="tree-trail"><b>${xml(valname(metrics[0]))} · ${xml(format(metrics[0], res.parent))}</b> ${trail}</div>${selector}<div class="tree-branches">${rows
      .map((r, i) => {
        const filters = [...path, { field: split, value: r[0] }];
        return `<div><button data-matrix-pick="${xml(JSON.stringify(filters))}" aria-pressed="${samePoint(v.selection?.filters,filters)}">${xml(shown(r[0]))} <b>${xml(format(metrics[0], r[1]))}</b></button>${remaining.length > 1 ? `<button data-tree-step="${i}" aria-label="Break down ${xml(shown(r[0]))}">›</button>` : ""}</div>`;
      })
      .join("")}</div>`;
  }
  if (v.kind === "gantt") {
    return ganttChart(v, rows, {
      w,
      h,
      keys,
      color,
      mark,
      tag,
      txt,
      rect,
      line,
      xml,
      shown,
      groupCount: ng,
    });
  }
  if (specializedTypes[v.kind])
    return specializedChart(v, {
      rows,
      groups,
      metrics,
      points,
      keys,
      ng,
      w,
      h,
      mark,
      svg,
      format,
      color,
      tag,
      rect,
      txt,
      line,
      shown,
      xml,
      fieldname,
      valname,
    });
  if (!points.length && !v.showEmpty && !bounded?.length) return '<div class="vempty">No numeric values</div>';
  const wideCategory = v.kind === "dot" || v.kind.endsWith("Bar");
  const left = wideCategory
      ? Math.min(
          w * (expanded ? 0.44 : 0.32),
          Math.max(
            54,
            ...cats.map(c => expanded ? 18 + 7 * tuples.get(c).map(categoryLabel).join(" › ").length : 8 + 7 * tickLabel(c,10).length),
          ),
        )
      : 54,
    right = w - (v.kind === "combo" && v.secondaryAxis !== false ? 52 : 14),
    top = 18,
    bottom = h - (expanded && !wideCategory ? 46 : 32);
  const pw = Math.max(20, right - left),
    ph = Math.max(20, bottom - top);
  let referenceLines = v.referenceLines;
  const numericScale = (axis, domain, count) =>
    axisScale(referenceDomain(referenceLines, axis, domain), v.axes?.[axis], count);
  const axisFormat = (axis) => axisMetricStyle(v, axis, metrics, style);
  const references = (axes) => referenceMarks(referenceLines, axes, {left,right,top,bottom}, {tag,txt,xml});
  if (!expanded && dateTrend(v.kind) && usesCalendarAxis(v)) {
    continuous = v.numericTrend
      ? numericTrendScale(cats,left,pw,v.kind==="combo",v.axes?.x,
          (referenceLines || []).filter(r=>r.axis==="x" && Number.isFinite(r.value)).map(r=>r.value))
      : calendarScale(cats,left,pw,v.kind==="combo");
    if (!continuous) return v.numericTrend
      ? '<div class="vempty">A continuous numeric axis needs a number at each position. Filter blank values or use a categorical axis.</div>'
      : '<div class="vempty">Use distinct ISO months, dates, or timestamps up to millisecond precision. Filter blank values or use a categorical axis for overlapping instants.</div>';
    cats.sort((a,b)=>continuous.values.get(a)-continuous.values.get(b));
  }
  const label = (x, y, s, style) =>
    v.labels ? txt(x, y, s, "middle", { "font-size": 10, ...style }) : "";
  const grid = (scale, key, horizontal, formatter, opposite = false) => {
    const [lo, hi] = scale.domain;
    const lines = scale.ticks
      .map((n) => {
        const t = unit(n, scale.domain),
          x = left + t * pw,
          y = bottom - t * ph;
        return horizontal
          ? line(x, top, x, bottom) +
              txt(x, bottom + 15, formatter(n), n === hi ? "end" : "middle")
          : (opposite ? "" : line(left, y, right, y)) +
              txt(
                opposite ? right + 4 : left - 4,
                y + 3,
                formatter(n),
                opposite ? "start" : "end",
              );
      })
      .join("");
    return tag(
      "g",
      { "data-scale": key, "data-min": lo, "data-max": hi },
      lines,
    );
  };
  function clipped(marks, custom, horizontalRange=false) {
    if (!custom && !horizontalRange) return marks;
    const id = "plot-clip-" + v.id;
    const y0 = custom ? top : 0, height = custom ? ph : h;
    return (
      tag(
        "defs",
        {},
        tag("clipPath", { id }, rect(left, y0, pw, height, "white")),
      ) +
      tag(
        "g",
        {
          "clip-path": "url(#" + id + ")",
          "data-plot-clip": [left, y0, pw, height].join(","),
        },
        marks,
      )
    );
  }
  if (v.kind === "indicator") {
    const last = rows.at(-1),
      n = last[ng],
      goal = last[ng + 1];
    if (n == null || goal == null)
      return '<div class="vempty">Latest period has no indicator or target.</div>';
    const p = points.find((p) => p.i === rows.length - 1 && p.j === 0),
      higher = v.direction !== "lower";
    const trend = rows.map((r) => r[ng]).filter(Number.isFinite),
      domain = bounds(trend, false);
    const path = rows
      .flatMap((r, i) =>
        r[ng] == null
          ? []
          : [
              `${8 + ((w - 16) * i) / Math.max(1, rows.length - 1)},${h - 10 - unit(r[ng], domain) * Math.max(12, h * 0.25)}`,
            ],
      )
      .join(" ");
    const status = (higher ? n >= goal : n <= goal)
      ? "On target"
      : "Off target";
    return svg(
      mark(
        p,
        txt(8, 22, shown(last[0])) +
          txt(8, Math.max(50, h * 0.38), fmt(p), "start", {
            "font-size": 30,
            fill: v.accent,
          }) +
          txt(
            8,
            Math.max(72, h * 0.55),
            `${status} · Target ${format(metrics[1], goal)}`,
          ) +
          tag("polyline", {
            points: path,
            fill: "none",
            stroke: v.accent,
            "stroke-width": 2,
          }),
      ),
      [],
    );
  }
  if (slice) {
    keys.splice(0, keys.length, ...cats.map(legendMemberName));
    return sliceChart(v, points, Boolean(res.highlight), {
      w,
      h,
      color,
      tag,
      txt,
      mark,
      svg,
      fmt,
      shown:legendMemberName,
    });
  }
  if (["scatter", "bubble"].includes(v.kind)) {
    const valid = rows
      .map((r, i) => ({ r, i }))
      .filter(
        ({ r }) =>
          Number.isFinite(r[ng]) &&
          Number.isFinite(r[ng + 1]) &&
          (v.kind !== "bubble" || r[ng + 2] > 0),
      );
    referenceLines = statisticalLines(v, binding => {
      const column = ng + metrics.indexOf(binding);
      return valid.map(({r}) => r[column]);
    }, format, valname);
    const xs = numericScale("x",
        bounds(
          valid.map((x) => x.r[ng]),
          false,
        ),
        Math.max(2, Math.min(5, pw / 70)),
      ),
      ys = numericScale("primary",
        bounds(
          valid.map((x) => x.r[ng + 1]),
          false,
        ),
        Math.max(2, Math.min(5, ph / 36)),
      ),
      xd = xs.domain,
      yd = ys.domain,
      max = Math.max(1, ...valid.map((x) => x.r[ng + 2] || 0));
    const x = (n) => left + unit(n, xd) * pw,
      y = (n) => bottom - unit(n, yd) * ph;
    keys.splice(
      0,
      keys.length,
      ...distinct(
        valid.map(({ r }) => (ng > 1 ? legendMemberName(r[1]) : valname(metrics[1]))),
      ),
    );
    const axes =
      grid(ys, "primary", false, (n) => axisLabel(n, style(metrics[1]))) +
      grid(xs, "x", true, (n) => axisLabel(n, style(metrics[0]))) +
      txt((left + right) / 2, h - 1, valname(metrics[0]), "middle");
    let body = "";
    for (const { r, i } of valid) {
      const p = points.find((p) => p.i === i && p.j === 1),
        rad =
          v.kind === "bubble"
            ? Math.sqrt(r[ng + 2] / max) * Math.min(18, ph * 0.14)
            : 5;
      body += mark(
        p,
        tag("circle", {
          cx: x(r[ng]),
          cy: y(r[ng + 1]),
          r: rad,
          fill: color(ng > 1 ? legendMemberName(r[1]) : keys[0]),
          opacity: 0.8,
        }) + label(x(r[ng]), y(r[ng + 1]) - rad - 2, shown(r[0])),
        metrics
          .map((m, j) => valname(m) + " " + format(m, r[ng + j]))
          .join(" · "),
        { "data-x": r[ng], "data-y": r[ng + 1], "data-size": r[ng + 2] ?? "" },
      );
    }
    return svg(axes + clipped(body, xs.custom || ys.custom) + references({
      x:{scale:xs,horizontal:true,format:axisFormat("x")},
      primary:{scale:ys,horizontal:false,format:axisFormat("primary")},
    }));
  }
  const dot = v.kind === "dot";
  const horizontal = dot || v.kind.endsWith("Bar"),
    stack = v.kind.startsWith("stacked") || v.kind.startsWith("percent"),
    norm = v.kind.startsWith("percent");
  const combo = v.kind === "combo",
    dual = combo && v.secondaryAxis !== false;
  const lineOnly = ["line", "area"].includes(v.kind),
    linePoint = (p) => lineOnly || (combo && p.j >= v.metrics.length);
  const bucket = new Map(
    cats.map((cat) => [cat, points.filter((p) => p.cat === cat)]),
  );
  const accum = new Map(),
    selectedRanges = new Map();
  // A subset of a signed sum or a recalculated average can exceed the full segment.
  // Draw independent stacks when placing the selected value inside would misstate it.
  const paired =
    stack &&
    res.highlight &&
    points.some(
      (p) =>
        Number.isFinite(p.highlighted) &&
        (p.value == null ||
          p.value * p.highlighted < 0 ||
          Math.abs(p.highlighted) > Math.abs(p.value)),
    );
  let low = 0,
    high = 0;
  for (const list of bucket.values()) {
    if (areaStack) list.sort((a,b)=>keys.indexOf(a.k)-keys.indexOf(b.k));
    let pos = 0,
      neg = 0,
      selectedPos = 0,
      selectedNeg = 0;
    const absolute = list.reduce((s, p) => s + Math.abs(p.value), 0);
    if (
      norm &&
      !absolute &&
      list.some((p) => Number.isFinite(p.highlighted) && p.highlighted !== 0)
    )
      return '<div class="vempty">A selected value has a zero category total. Use a stacked chart to compare the amounts.</div>';
    for (const p of list) {
      const val = norm ? (absolute ? p.value / absolute : 0) : p.value,
        start = stack ? (val >= 0 ? pos : neg) : 0;
      if (!(areaStack && norm && !absolute)) accum.set(p, [start, start + val]);
      if (Number.isFinite(p.highlighted)) {
        const delta = norm
          ? absolute
            ? p.highlighted / absolute
            : 0
          : p.highlighted;
        const from = paired ? (delta >= 0 ? selectedPos : selectedNeg) : start;
        selectedRanges.set(p, [from, from + delta]);
        if (delta >= 0) selectedPos += delta;
        else selectedNeg += delta;
        low = Math.min(low, from + delta);
        high = Math.max(high, from + delta);
      }
      if (stack) {
        if (val >= 0) pos += val;
        else neg += val;
      }
      if (!dual || !linePoint(p)) {
        low = Math.min(low, start + val);
        high = Math.max(high, start + val);
      }
    }
  }
  referenceLines = statisticalLines(v, binding => points
    .filter(p => p.metric === binding && Number.isFinite(p.value) && accum.has(p))
    .map(p => norm ? accum.get(p)[1] - accum.get(p)[0] : p.value),
    norm ? (_, value) => axisLabel(value, "percent") : format, valname);
  const tickCount = Math.max(2, Math.min(5, horizontal ? pw / 70 : ph / 38));
  if(v.domainOnly)return referenceDomain(referenceLines,"primary",bounds([low,high]));
  const primaryScale = numericScale("primary", v.pane?.domain||bounds([low, high]), tickCount);
  const secondaryScale = dual
    ? numericScale("secondary",
        bounds(points.filter(linePoint).map((p) => p.value)),
        tickCount,
      )
    : primaryScale;
  const yd = primaryScale.domain,
    sd = secondaryScale.domain;
  const y = (n, d = yd) => bottom - unit(n, d) * ph;
  const band = continuous?.band ?? (horizontal ? ph : pw) / cats.length;
  const center = (cat) =>
    continuous?.positions.get(cat) ??
    (horizontal ? top : left) + (cats.indexOf(cat) + 0.5) * band;
  const primaryFormat = axisFormat("primary");
  const axisFmt = (n) => axisLabel(n, primaryFormat);
  const stride = Math.max(
    1,
    Math.ceil(cats.length / (horizontal ? ph / 18 : pw / (timeWidth ? Math.max(58,...cats.map(c=>7 * tickLabel(c,14).length + 7)) : 58))),
  );
  let axes = grid(primaryScale, "primary", horizontal, axisFmt);
  if (dual)
    axes += grid(
      secondaryScale,
      "secondary",
      false,
      (n) => axisLabel(n, style(metrics[v.metrics.length])),
      true,
    );
  if (continuous) {
    const byPosition = new Map(cats.map(cat => [continuous.positions.get(cat),cat]));
    axes += tag(
      "g",
      v.numericTrend ? {"data-scale":"x","data-min":continuous.domain[0],"data-max":continuous.domain[1]} : {"data-scale":"calendar"},
      continuous.ticks
        .map((t) =>
          txt(t.x, bottom + 16, t.label, v.numericTrend && t.x===right ? "end" : "middle", {
            ...(v.numericTrend ? {"data-tick-number":t.number} : {"data-tick-date":t.date}),
            ...(byPosition.has(t.x) ? axisAttributes([byPosition.get(t.x)]) : {}),
          }),
        )
        .join(""),
    );
  } else if (expanded) {
    const fit = (text, pixels) => {
      const count = Math.max(1, Math.floor(pixels / 6.5));
      return text.length <= count ? text : text.slice(0, count - 1) + "…";
    };
    for (let i = 0; i < cats.length;) {
      let end = i + 1;
      while (end < cats.length && parentOf.get(cats[end]) === parentOf.get(cats[i])) end++;
      const prefix = tuples.get(cats[i]).slice(0,-1), parent = prefix.map(categoryLabel).join(" › ");
      const parentAttrs = {"data-axis-parent":parent,"font-weight":600,...axisAttributes(prefix)};
      const middle = (center(cats[i]) + center(cats[end-1])) / 2;
      if (horizontal && (end-i)*band >= 14)
        axes += txt(4,middle+3,fit(parent,left*0.5-6),"start",parentAttrs);
      else if (!horizontal && (end-i)*band >= 14)
        axes += txt(middle, bottom+33, fit(parent,(end-i)*band-4), "middle", parentAttrs);
      if (i > 0) {
        const edge = center(cats[i])-band/2;
        axes += horizontal ? line(5,edge,left,edge) : line(edge,bottom,edge,bottom+36);
      }
      for (let j=i; j<end; j++) {
        if (j % stride !== 0) continue;
        const tuple = tuples.get(cats[j]), leaf = categoryLabel(tuple.at(-1),tuple.length-1);
        const month = tuple.at(-2);
        const caption = /^\d{4}-\d\d-\d\d$/.test(leaf) && leaf.slice(0,7) === month ? leaf.slice(8) : leaf;
        if (horizontal)
          axes += txt(left-5,center(cats[j])+3,fit(caption,left*0.5-7),"end",{"data-axis-child":leaf,...axisAttributes(tuple)});
        else
          axes += txt(center(cats[j]),bottom+15,fit(caption,band*stride-4),"middle",{"data-axis-child":leaf,...axisAttributes(tuple)});
      }
      i=end;
    }
  } else {
    // Preserve a single selected interval when the axis has room for only
    // every second or third label. Leave its neighbors enough space.
    const selected = timeWidth && stride > 1 ? selectionRows(v.selection,[groups[0]]) : [];
    const index = selected.length === 1 ? cats.indexOf(selected[0][0]) : -1;
    const extra = index >= 0 && index % stride !== 0 ? index : -1;
    const occupied=new Set(rowCategories);
    for (const [i, cat] of cats.entries()) {
      const edge=bounded?.length && i===cats.length-1;
      const nearEdge=bounded?.length && cats.length-1-i<stride && i!==0;
      const show=i===index || edge && (index<0 || Math.abs(i-index)>=stride) ||
        i%stride===0 && !nearEdge && (extra<0 || Math.abs(i-extra)>=stride);
      const empty=bounded?.length && !occupied.has(cat);
      const attrs=axisAttributes([cat]);
      const caption=show ? (horizontal
        ? txt(left - 5, center(cat) + 3, tickLabel(cat,10), "end",empty ? {} : attrs)
        : txt(center(cat), bottom + 16, tickLabel(cat,14), "middle",empty ? {} : attrs)) : "";
      if (empty) {
        const tip=tickLabel(cat,24)+" · No matching rows";
        const lane=horizontal ? rect(left,center(cat)-band/2,pw,band,"transparent") :
          rect(center(cat)-band/2,top,band,ph,"transparent");
        axes+=tag("g",{...attrs,class:"empty-interval","aria-label":attrs["aria-label"]+" · No matching rows"},
          tag("title",{},xml(tip))+lane+caption);
      } else axes+=caption;
    }
    if (bounded?.length && !rows.length)
      axes+=txt((left+right)/2,(top+bottom)/2,"No matching rows","middle",{"pointer-events":"none"});
  }
  if (timeWidth || (dateTrend(v.kind) && !expanded)) {
    const binCaption = timeWidth && !continuous && (timeWidth.months ? "Calendar period (UTC)" :
      (sameDay && timeWidth.ms % 86400000 ? days[0]+" · " : "")+"UTC interval start");
    const caption = [v.axes?.x?.title,continuous?.caption || binCaption].filter(Boolean).join(" · ");
    if (caption) axes += txt(horizontal ? left : (left+right)/2,horizontal ? top-6 : bottom+30,caption,horizontal ? "start" : "middle",
      {"data-axis-title":"x",...(binCaption ? {"data-time-bin-caption":""} : {}),...(continuous?.caption ? {"data-calendar-caption":""} : {})});
  }
  if (areaStack) {
    const bands = areaBands({cats,keys,bucket,accum,center,y,color,mark,fmt,norm,labels:v.labels,tag,txt,left,right,top,bottom,parentOf});
    return svg(axes + clipped(bands, primaryScale.custom, continuous?.custom) + references({
      ...(v.numericTrend && continuous ? {x:{scale:continuous,position:continuous.position,horizontal:true,format:"number"}} : {}),
      primary:{scale:primaryScale,horizontal:false,format:primaryFormat},
    }));
  }
  let body = "";
  const barKeys = distinct(points.filter((p) => !linePoint(p)).map((p) => p.k));
  for (const p of points.filter((p) => !linePoint(p))) {
    const pointStyle = pointColor?.(p.row,p.j);
    const fill = pointStyle?.fill || color(p.k);
    const [a, b] = accum.get(p),
      thick = (band * 0.72) / (stack ? 1 : Math.max(1, barKeys.length)),
      offset =
        center(p.cat) -
        band * 0.36 +
        (stack ? 0 : barKeys.indexOf(p.k) * thick);
    const x = (n) => left + unit(n, yd) * pw;
    const segment = (from, to, at, width) =>
      horizontal
        ? rect(
            Math.min(x(from), x(to)),
            at,
            Math.abs(x(to) - x(from)),
            width,
            fill,
          )
        : rect(
            at,
            Math.min(y(from), y(to)),
            width,
            Math.abs(y(to) - y(from)),
            fill,
          );
    const shape = dot
      ? tag("circle", {
          cx: x(b),
          cy: offset + thick / 2,
          r: Math.max(2, Math.min(7, thick * 0.36)),
          fill,
        })
      : segment(a, b, offset, paired ? thick * 0.46 : thick);
    let painted = shape;
    if (res.highlight) {
      painted = Number.isFinite(p.value)
        ? tag("g", { opacity: 0.28 }, shape)
        : "";
      if (selectedRanges.has(p)) {
        const [from, to] = selectedRanges.get(p);
        const mid = offset + thick / 2,
          thickness = thick * (paired ? 0.46 : 0.54);
        const geometry = dot
          ? tag("circle", { cx: x(to), cy: mid, r: 5, fill })
          : segment(
              from,
              to,
              paired ? offset + thick - thickness : mid - thickness / 2,
              thickness,
            );
        painted += tag(
          "g",
          { class: "highlight-value", "data-start": from, "data-end": to },
          geometry,
        );
      }
    }
    if (v.labels) {
      const text = norm ? axisFmt(b - a) : fmt(p);
      const inside = !dot && (horizontal || stack);
      const width = horizontal ? Math.abs(x(b)-x(a)) : thick;
      const height = horizontal ? thick : Math.abs(y(b)-y(a));
      let style;
      if (inside && !res.highlight && width >= text.length * 7 + 4 && height >= 14)
        style = {fill:foreground(fill)};
      else if (inside || (!horizontal && b < 0))
        style = {fill:"#111",stroke:"#fff","stroke-width":2.5,"stroke-linejoin":"round","paint-order":"stroke"};
      const lx = horizontal ? (dot ? x(b) : (x(a)+x(b))/2) : offset + thick/2;
      const ly = horizontal ? offset + thick/2 + (dot ? -8 : 3)
        : stack ? (y(a)+y(b))/2 + 3 : Math.max(11,y(b)-3);
      painted += label(lx,ly,text,style);
    }
    body += mark(
      p,
      painted,
      res.highlight
        ? `Total ${fmt(p)} · Selected ${format(p.metric, p.highlighted ?? null)}`
        : fmt(p),
      {
        "data-start": a,
        "data-end": b,
        ...(pointStyle?.description ? {"aria-description":pointStyle.description} : {}),
        ...(v.cellRules ? {"data-base-fill":color(p.k)} : {}),
        ...(res.highlight ? { "data-highlight": p.highlighted ?? "" } : {}),
      },
    );
  }
  const lineLabels = new Map();
  if (v.labels) {
    // Place labels within the plot, leaving room between series at the same date.
    for (const list of bucket.values()) {
      const series = list.filter(linePoint).sort((a, b) => a.value - b.value);
      let lower = bottom - 3;
      for (const p of series) {
        const desired = y(p.value, dual ? sd : yd) - 7;
        const at = Math.min(desired, lower);
        if (at < 10) continue;
        lineLabels.set(p, at);
        lower = at - 12;
      }
    }
  }
  for (const k of distinct(points.filter(linePoint).map((p) => p.k))) {
    const list = points.filter((p) => p.k === k && linePoint(p)),
      domain = dual ? sd : yd;
    let run = [];
    function flush() {
      if (!run.length) return;
      const coords = run.map((p) => [center(p.cat), y(p.value, domain)]);
      if (v.kind === "area")
        body += tag("polygon", {
          points: [...coords, [coords.at(-1)[0], y(0)], [coords[0][0], y(0)]]
            .map((pt) => pt.join(","))
            .join(" "),
          fill: color(k),
          opacity: 0.22,
        });
      body += tag("polyline", {
        points: coords.map((pt) => pt.join(",")).join(" "),
        fill: "none",
        stroke: color(k),
        "stroke-width": 2.5,
      });
      run = [];
    }
    for (const cat of cats) {
      const point = list.find((p) => p.cat === cat);
      if (parentOf && run.length && parentOf.get(run.at(-1).cat) !== parentOf.get(cat)) flush();
      if (point) run.push(point);
      else flush();
    }
    flush();
    for (const p of list)
      body += mark(
        p,
        tag("circle", {
          cx: center(p.cat),
          cy: y(p.value, domain),
          r: 4.5,
          fill: color(k),
          stroke: "white",
        }) +
          (lineLabels.has(p)
            ? label(center(p.cat), lineLabels.get(p), fmt(p))
            : ""),
        fmt(p),
        { "data-axis": dual ? "secondary" : "primary" },
      );
  }
  return (
    svg(axes + clipped(body, primaryScale.custom || secondaryScale.custom, continuous?.custom) + references({
      ...(v.numericTrend && continuous ? {x:{scale:continuous,position:continuous.position,horizontal:true,format:"number"}} : {}),
      primary:{scale:primaryScale,horizontal,format:primaryFormat},
      ...(dual ? {secondary:{scale:secondaryScale,horizontal:false,format:axisFormat("secondary")}} : {}),
    })) +
    (res.highlight
      ? `<div class="highlight-key"><i></i>Total <i></i>Selected${paired ? " · Separate stacks" : ""}</div>`
      : "")
  );
}

export { chartBody };
