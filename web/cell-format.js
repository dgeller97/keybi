import {editScale, initialScale, scaleColor, scaleControls} from "./color-scale.js";

export const metricKey = (m) =>
  m.measure ? "measure:" + m.measure : m.op + ":" + m.field.t + "." + m.field.c;
const defaults = {
  threshold: 0,
  below: "#dceee2",
  above: "#f7dfe4",
  scope: "all",
};
const validColor = (value) =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const scaled = (format) => format === "percent" || format === "points";
const cardColors = {below:"#326a51",above:"#a63e31"};

export function thresholdColor(rule, value, card = false) {
  if (!rule || !Number.isFinite(value)) return null;
  const threshold = Number.isFinite(rule.threshold) ? rule.threshold : 0;
  if (value === threshold) return null;
  const side = value < threshold ? "below" : "above";
  return validColor(rule[side]) ? rule[side] : (card ? cardColors : defaults)[side];
}

const barColors = { negative: "#ae5035", positive: "#39765e", axis: "#465a52" };
function scopeControl(kind, label, setting, scope) {
  if (kind !== "matrix") return "";
  return `<label class="formlabel">${label}<select class="control" data-cell-setting="${setting}">${[
    ["all", "Values and totals"],
    ["detail", "Detail values only"],
    ["totals", "Totals only"],
  ]
    .map(
      ([key, name]) =>
        `<option value="${key}" ${scope === key ? "selected" : ""}>${name}</option>`,
    )
    .join("")}</select></label>`;
}
function barControls(v, bar, fmt) {
  let html = `<label class="chart-option"><input type="checkbox" data-cell-setting="bars" ${bar ? "checked" : ""}>Show data bars</label>`;
  if (!bar) return html;
  const unit = fmt === "percent" ? " (%)" : fmt === "points" ? " (pp)" : "";
  const factor = scaled(fmt) ? 100 : 1;
  html +=
    "<div class='dimensions'>" +
    ["min", "max"]
      .map(
        (k) =>
          `<label>Bar ${k === "min" ? "minimum" : "maximum"}${unit}<input class="control" type="number" step="any" data-cell-setting="bar-${k}" value="${Number((bar[k] * factor).toPrecision(14))}"></label>`,
      )
      .join("") +
    "</div>";
  html +=
    "<div class='dimensions rule-colors'>" +
    ["negative", "positive", "axis"]
      .map(
        (k) =>
          `<label>${k === "negative" ? "Negative bars" : k === "axis" ? "Zero line" : "Positive bars"}<input type="color" data-cell-setting="bar-${k}" value="${validColor(bar[k]) ? bar[k] : barColors[k]}"></label>`,
      )
      .join("") +
    "</div>";
  return (
    html +
    `<label class="formlabel">Bar direction<select class="control" data-cell-setting="bar-direction"><option value="forward">Left to right</option><option value="reverse" ${bar.direction === "reverse" ? "selected" : ""}>Right to left</option></select></label><label class="chart-option"><input type="checkbox" data-cell-setting="bar-only" ${bar.only ? "checked" : ""}>Show bar only</label>` +
    scopeControl(v.kind, "Bars apply to", "bar-scope", bar.scope) +
    "<small>Limits stay fixed across filters and pages. Values beyond a limit fill the available bar.</small>"
  );
}

function valueRange(v, index, result) {
  const cols = v.kind === "matrix" ? v.columns?.length || 0 : 0;
  const data =
    v.kind === "matrix"
      ? result?.parts?.find(
          (p) => p.depth === v.groups.length && p.columnDepth === cols,
        )?.rows
      : result?.rows;
  let min = 0,
    max = 0;
  for (const row of (index >= 0 && data) || []) {
    const value = row[v.groups.length + cols + index];
    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }
  return {min, max:max === min ? 1 : max};
}

function sourceControls(source, type, {esc, fields, measures}) {
  function choice(binding, label, selected) {
    return `<option value="${esc(JSON.stringify(binding))}" ${selected ? "selected" : ""}>${esc(label)}</option>`;
  }
  const sourceOptions = measures.map(m => choice({measure:m.id}, m.name, m.id === source?.measure)).join("");
  const fieldOptions = fields.map(f => {
    const selected = source?.field?.t === f.t && source.field.c === f.c;
    return choice({field:{t:f.t,c:f.c},op:f.numeric ? "sum" : "count"}, f.table + " · " + f.name, selected);
  }).join("");
  const basis = `<label class="formlabel">Base ${type==="icon" ? "icons" : "colors"} on<select class="control" data-cell-setting="${type}-source"><option value="">Displayed value</option>
    <optgroup label="Measures">${sourceOptions}</optgroup><optgroup label="Columns">${fieldOptions}</optgroup></select></label>`;
  let aggregation = "";
  if (source?.field) {
    const numeric = fields.find(f=>f.t===source.field.t && f.c===source.field.c)?.numeric;
    const ops = numeric ? {sum:"Sum",avg:"Average",min:"Minimum",max:"Maximum",median:"Median",p90:"90th percentile"} : {};
    Object.assign(ops,{count:"Count",distinctcount:"Distinct count"});
    aggregation = `<label class="formlabel">${type==="icon" ? "Icon" : "Color"} source aggregation<select class="control" data-cell-setting="${type}-op">${Object.entries(ops).map(([op,label])=>
      `<option value="${op}" ${op===source.op ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
  }
  return basis + aggregation;
}
function iconControls(v, rule, fmt, options) {
  const toggle = `<label class="chart-option"><input type="checkbox" data-cell-setting="icons" ${rule ? "checked" : ""}>Show status icons</label>`;
  if (!rule) return toggle;
  const unit = fmt === "percent" ? " (%)" : fmt === "points" ? " (pp)" : "";
  const factor = scaled(fmt) ? 100 : 1;
  const bounds = ["lower","upper"].map((bound,i) => {
    const value = Number.isFinite(rule[bound]) ? Number((rule[bound] * factor).toPrecision(14)) : 0;
    return `<label>${i ? "Upper" : "Lower"} threshold${unit}<input class="control" type="number" step="any" data-cell-setting="icon-${bound}" value="${value}"></label>`;
  }).join("");
  return toggle + sourceControls(rule.source,"icon",options) + `<div class="dimensions">${bounds}</div><small>Values between the thresholds, including both endpoints, show a horizontal arrow.</small>
    <label class="formlabel">Icon layout<select class="control" data-cell-setting="icon-layout">
      <option value="before">Before value</option><option value="after" ${rule.layout === "after" ? "selected" : ""}>After value</option>
      <option value="only" ${rule.layout === "only" ? "selected" : ""}>Icon only</option></select></label>
    <label class="chart-option"><input type="checkbox" data-cell-setting="icon-reverse" ${rule.reverse ? "checked" : ""}>Lower values are favorable</label>` +
    scopeControl(v.kind, "Icons apply to", "icon-scope", rule.scope);
}

export function cellRuleControls(v, chosen, options) {
  const {esc, valname, format, sourceFormat} = options;
  const card = v.kind === "card", chart = options.chart;
  const metrics = options.metrics || v.metrics,
    keys = metrics.map(options.keyOf || metricKey),
    rules = (card ? v.calloutRules : v.cellRules) || {};
  const key = keys.includes(chosen)
    ? chosen
    : keys.find((k) => rules[k] || v.cellBars?.[k] || v.cellIcons?.[k]) || keys[0];
  const index = keys.indexOf(key),
    rule = rules[key];
  const select =
    '<label class="formlabel">Apply to measure<select class="control" id="cell-rule-field">' +
    metrics
      .map(
        (m, i) =>
          `<option value="${esc(keys[i])}" ${i === index ? "selected" : ""}>${esc(valname(m))}</option>`,
      )
      .join("") +
    "</select></label>";
  const enabled = `<label class="chart-option"><input type="checkbox" data-cell-setting="enabled" ${rule ? "checked" : ""}>${chart ? "Set fill color by value" : card ? "Set text color by value" : "Set background by value"}</label>`;
  const fmt = format(v, metrics[index]);
  const icons = v.cellIcons?.[key];
  const indicators = card || chart ? "" : iconControls(v, icons, icons?.source ? sourceFormat(icons.source) : fmt, options) + barControls(v, v.cellBars?.[key], fmt);
  if (!rule) return select + enabled + indicators;
  const colorFormat = rule.source ? sourceFormat(rule.source) : fmt;
  const unit = colorFormat === "percent" ? " (%)" : colorFormat === "points" ? " (pp)" : "";
  const threshold = Number.isFinite(rule.threshold) ? rule.threshold : 0;
  const limit = scaled(colorFormat)
    ? Number((threshold * 100).toPrecision(14))
    : threshold;
  const colors = ["below", "above"]
    .map(
      (side) =>
        `<label>${side === "below" ? "Below threshold" : "Above threshold"}<input type="color" data-cell-setting="${side}" value="${validColor(rule[side]) ? rule[side] : defaults[side]}"></label>`,
    )
    .join("");
  const scope = scopeControl(v.kind, "Color applies to", "scope", rule.scope);
  const fixed = `<label class="formlabel">Rule threshold${unit}<input class="control" type="number" step="any" data-cell-setting="threshold" value="${limit}"></label>`;
  const gradient = rule.style === "gradient" && rule.scale;
  const style = `<label class="formlabel">${chart ? "Fill" : "Background"} style<select class="control" data-cell-setting="style"><option value="rule">Threshold</option><option value="gradient" ${gradient?"selected":""}>Color scale</option></select></label>`;
  return (
    select + enabled + (card ? "" : style) + sourceControls(rule.source,"color",options) +
    (gradient ? scaleControls(rule.scale, unit, scaled(colorFormat) ? 100 : 1) :
      (options.thresholdInput ? options.thresholdInput(rule,fixed) : fixed) + `<div class="dimensions rule-colors">${colors}</div><small>Blank values and values equal to the threshold use the usual ${chart ? "point color" : card ? "text color" : "background"}.</small>`) +
    scope + indicators
  );
}

export function editCellRule(v, key, setting, input, format, result, sourceFormat, resolvedVisual, bindingKey, metrics = v.metrics, chart = false) {
  const metric = metrics.find((m) => (chart ? bindingKey(m) : metricKey(m)) === key);
  const colorRules = v.kind === "card" ? "calloutRules" : "cellRules";
  if (!metric) return;
  if (["icon-source","color-source","icon-op","color-op"].includes(setting)) {
    const rule = (setting.startsWith("icon-") ? v.cellIcons : v[colorRules])?.[key];
    if (!rule) return;
    if (setting.endsWith("-op")) {
      if (rule.source?.field) rule.source = {...rule.source,op:input.value};
    } else if (input.value) rule.source = JSON.parse(input.value);
    else delete rule.source;
    return;
  }
  if (setting === "icons") {
    v.cellIcons ??= {};
    if (input.checked) v.cellIcons[key] ??= {lower:0, upper:0, layout:"before", scope:"all"};
    else delete v.cellIcons[key];
    return;
  }
  if (setting.startsWith("icon-")) {
    const rule = v.cellIcons?.[key], field = setting.slice(5);
    if (!rule) return;
    if (field === "lower" || field === "upper") {
      const factor = scaled(rule.source ? sourceFormat(rule.source) : format(v,metric)) ? 100 : 1;
      const value = input.valueAsNumber / factor;
      if (!Number.isFinite(value) || (field === "lower" ? value > rule.upper : value < rule.lower)) {
        input.value = String(rule[field] * factor);
        throw Error("Enter a lower threshold less than or equal to the upper threshold.");
      }
      rule[field] = value;
    } else if (field === "layout" && ["before","after","only"].includes(input.value)) rule.layout = input.value;
    else if (field === "scope" && ["all","detail","totals"].includes(input.value)) rule.scope = input.value;
    else if (field === "reverse") rule.reverse = input.checked;
    return;
  }
  if (setting === "bars") {
    v.cellBars ??= {};
    if (input.checked)
      v.cellBars[key] ??= { ...barColors, ...valueRange(v,v.metrics.indexOf(metric),result), scope:"detail" };
    else delete v.cellBars[key];
    return;
  }
  if (setting.startsWith("bar-")) {
    const field = setting.slice(4),
      bar = v.cellBars?.[key];
    if (!bar) return;
    if (field === "min" || field === "max") {
      const factor = scaled(format(v, metric)) ? 100 : 1,
        value = input.valueAsNumber / factor;
      if (
        !input.validity.valid ||
        !Number.isFinite(value) ||
        (field === "min"
          ? value > 0 || value >= bar.max
          : value < 0 || value <= bar.min)
      ) {
        input.value = String(bar[field] * factor);
        throw Error(
          "Bar limits must include zero, with a maximum greater than the minimum.",
        );
      }
      bar[field] = value;
    } else if (
      field === "scope" &&
      ["all", "detail", "totals"].includes(input.value)
    )
      bar.scope = input.value;
    else if (
      field === "direction" &&
      ["forward", "reverse"].includes(input.value)
    )
      bar.direction = input.value;
    else if (field === "only") bar.only = input.checked;
    else if (
      ["negative", "positive", "axis"].includes(field) &&
      validColor(input.value)
    )
      bar[field] = input.value;
    return;
  }
  v[colorRules] ??= {};
  if (setting === "enabled") {
    if (input.checked) v[colorRules][key] ??= { ...defaults, ...(chart ? {below:"#a63e31",above:"#43856b"} : v.kind === "card" ? cardColors : {}) };
    else delete v[colorRules][key];
    return;
  }
  const rule = v[colorRules][key];
  if (!rule) return;
  if (setting === "threshold-filter") {
    if (input.value) rule.thresholdFilter = JSON.parse(input.value);
    else delete rule.thresholdFilter;
  } else if (setting === "style") {
    if (input.value === "gradient" && !rule.scale) {
      const visual = resolvedVisual(v);
      const keys = [...visual.metrics.map(bindingKey), ...(result?.hiddenKeys || [])];
      const index = keys.indexOf(rule.source ? metricKey(rule.source) : bindingKey(metric));
      const {min,max} = valueRange(visual,index,result);
      rule.scale = initialScale(min,max);
    }
    rule.style = input.value === "gradient" ? "gradient" : "rule";
  } else if (setting.startsWith("scale-") && rule.scale) {
    const fmt = rule.source ? sourceFormat(rule.source) : format(v,metric);
    editScale(rule.scale,setting,input,scaled(fmt) ? 100 : 1);
  } else if (setting === "threshold") {
    if (!input.validity.valid || !Number.isFinite(input.valueAsNumber))
      throw Error("Enter a numeric rule threshold.");
    rule.threshold =
      input.valueAsNumber / (scaled(rule.source ? sourceFormat(rule.source) : format(v, metric)) ? 100 : 1);
  } else if (
    setting === "scope" &&
    ["all", "detail", "totals"].includes(input.value)
  ) {
    rule.scope = input.value;
  } else if (["below", "above"].includes(setting) && validColor(input.value))
    rule[setting] = input.value;
}

export function foreground(color) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const channel = parseInt(color.slice(i, i + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? "#000" : "#fff";
}

function inScope(v, rule, total) {
  return (
    rule &&
    (v.kind !== "matrix" ||
      !(
        (total && rule.scope === "detail") ||
        (!total && rule.scope === "totals")
      ))
  );
}
export function cellValue(v, metric, value, total, formatted, basisLabel = "") {
  const rule = v.cellIcons?.[metricKey(metric)];
  if (!Number.isFinite(value) || !inScope(v,rule,total) ||
      !Number.isFinite(rule.lower) || !Number.isFinite(rule.upper) || rule.lower > rule.upper)
    return `<span class="cell-value">${formatted}</span>`;
  const band = value < rule.lower ? "low" : value > rule.upper ? "high" : "middle";
  let label = {low:"Below lower threshold", middle:"Within thresholds", high:"Above upper threshold"}[band];
  if (band !== "middle") {
    const favorable = rule.reverse ? band === "low" : band === "high";
    label += favorable ? ", favorable" : ", unfavorable";
  }
  if (basisLabel) label = basisLabel + " · " + label;
  const layout = ["after","only"].includes(rule.layout) ? rule.layout : "before";
  return `<span class="cell-value with-icon" data-icon-layout="${layout}" title="${formatted} · ${label}"><span class="cell-icon" role="img" aria-label="${label}" data-icon-band="${band}"${rule.reverse ? " data-reverse" : ""}></span><span class="cell-number">${formatted}</span></span>`;
}

export function cellAttributes(v, metric, value, total, escapedValue, basis) {
  const key = metricKey(metric),
    rule = v.cellRules?.[key],
    bar = v.cellBars?.[key];
  let attrs = "",
    styles = "";
  if (inScope(v, rule, total) && Number.isFinite(basis)) {
    const threshold = Number.isFinite(rule.threshold) ? rule.threshold : 0;
    const gradient = rule.style === "gradient";
    const side = basis < threshold ? "below" : "above";
    const color = gradient ? scaleColor(rule.scale,basis) : thresholdColor(rule,basis);
    if (color) {
      attrs += ` data-cell-tone="${gradient ? "scale" : side}"`;
      styles += `background-color:${color};color:${foreground(color)};`;
    }
  } else if (!rule && Number.isFinite(value) && v.kind === "matrix" && v.cellColors)
    attrs += ` class="cell-${value < (v.cellThreshold ?? 0) ? "low" : "high"}"`;
  if (
    Number.isFinite(value) && inScope(v, bar, total) &&
    Number.isFinite(bar.min) &&
    Number.isFinite(bar.max) &&
    bar.min <= 0 &&
    bar.max >= 0 &&
    bar.max > bar.min
  ) {
    const width = bar.max - bar.min;
    const position = (n) =>
      100 *
      (Number.isFinite(width)
        ? (n - bar.min) / width
        : (n / 2 - bar.min / 2) / (bar.max / 2 - bar.min / 2));
    const coordinate = (n) =>
      bar.direction === "reverse" ? 100 - position(n) : position(n);
    const zero = coordinate(0),
      end = coordinate(Math.min(bar.max, Math.max(bar.min, value)));
    const side = value < 0 ? "negative" : "positive",
      color = validColor(bar[side]) ? bar[side] : barColors[side];
    attrs += ` data-cell-bar="${value === 0 ? "zero" : side}"`;
    if (bar.only) attrs += ` data-bar-only title="${escapedValue}"`;
    styles += `--bar-axis:${validColor(bar.axis) ? bar.axis : barColors.axis};`;
    styles += `--bar-zero:${zero}%;--bar-left:${Math.min(end, zero)}%;--bar-width:${Math.abs(end - zero)}%;--bar-color:${color};`;
  }
  return attrs + (styles ? ` style="${styles}"` : "");
}
