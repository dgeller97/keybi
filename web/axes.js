import { metricKey } from "./cell-format.js";

function axisRoles(v) {
  if (["scatter", "bubble"].includes(v.kind))
    return [
      ["x", "X axis"],
      ["primary", "Y axis"],
    ];
  if (v.kind === "combo")
    return [
      ["primary", "Column axis"],
      ...(v.secondaryAxis !== false ? [["secondary", "Line axis"]] : []),
    ];
  return [
    "line",
    "area",
    "stackedArea",
    "percentArea",
    "dot",
    "clusteredBar",
    "clusteredColumn",
    "stackedBar",
    "stackedColumn",
    "percentBar",
    "percentColumn",
  ].includes(v.kind)
    ? [["primary", "Value axis"]]
    : [];
}
export function axisBindings(v, axis) {
  if (["scatter", "bubble"].includes(v.kind))
    return (axis === "x" ? v.metrics : v.other) || [];
  if (axis === "x") return [];
  if (v.kind === "combo" && v.secondaryAxis === false)
    return [...v.metrics, ...(v.other || [])];
  return (axis === "secondary" ? v.other : v.metrics) || [];
}

export function referenceAxis(v, ref) {
  if (!ref.statistic) return ref.axis;
  const key = metricKey(ref.statistic.binding);
  const axes = axisRoles(v).map(([axis]) => axis);
  const matches = axes.filter((axis) =>
    axisBindings(v, axis).some((m) => metricKey(m) === key),
  );
  return matches.includes(ref.axis)
    ? ref.axis
    : matches[0] || (axes.includes(ref.axis) ? ref.axis : axes[0] || ref.axis);
}

function axisMetricStyle(v, axis, metrics, style) {
  if (["scatter", "bubble"].includes(v.kind))
    return metrics[axis === "x" ? 0 : 1]
      ? style(metrics[axis === "x" ? 0 : 1])
      : "number";
  if (axis === "x") return "number";
  if (v.kind.startsWith("percent")) return "percent";
  if (v.kind === "combo" && v.secondaryAxis !== false) {
    if (axis === "secondary")
      return v.other?.length ? style(v.other[0]) : "number";
    metrics = v.metrics;
  }
  const styles = new Set(metrics.map(style));
  return styles.size === 1 ? [...styles][0] : "number";
}
function stepFor(span, count) {
  const rough = span / Math.max(2, count),
    factor = 10 ** Math.floor(Math.log10(rough));
  if (!Number.isFinite(factor) || factor === 0) return 1;
  const choices = [1, 2, 2.5, 5, 10];
  const pick = choices.reduce(
    (best, c) =>
      Math.abs(Math.log((c * factor) / rough)) <
      Math.abs(Math.log((best * factor) / rough))
        ? c
        : best,
    1,
  );
  return pick * factor;
}
function axisScale(domain, settings = {}, count = 4) {
  const fixedMin = Number.isFinite(settings.min),
    fixedMax = Number.isFinite(settings.max);
  let lo = fixedMin ? settings.min : domain[0],
    hi = fixedMax ? settings.max : domain[1];
  if (hi <= lo) {
    const gap = Math.max(1, Math.abs(lo || hi) * 0.15);
    if (fixedMax) lo = hi - gap;
    else hi = lo + gap;
  }
  const step = stepFor(hi - lo, count);
  const rounded = (x) => Number(x.toPrecision(13));
  if (!fixedMin) lo = rounded(Math.floor(lo / step + 1e-10) * step);
  if (!fixedMax) hi = rounded(Math.ceil(hi / step - 1e-10) * step);
  const ticks = [lo];
  for (let i = 1; i <= 16; i++) {
    const n = rounded((Math.floor(lo / step + 1e-10) + i) * step);
    if (n >= hi - step * 1e-8) break;
    if (n > lo + step * 1e-8) ticks.push(n);
  }
  ticks.push(hi);
  return { domain: [lo, hi], ticks, custom: fixedMin || fixedMax };
}
const formatters = new Map();
function axisLabel(n, style) {
  const scaled = style === "points" ? n * 100 : n;
  const compact = Math.abs(scaled) >= 10000;
  const key = [style, compact].join("/");
  if (!formatters.has(key))
    formatters.set(
      key,
      new Intl.NumberFormat("en-US", {
        style:
          style === "percent"
            ? "percent"
            : style === "currency"
              ? "currency"
              : "decimal",
        currency: "USD",
        notation: compact ? "compact" : "standard",
        minimumFractionDigits: 0,
        maximumSignificantDigits: 5,
      }),
    );
  return formatters.get(key).format(scaled) + (style === "points" ? " pp" : "");
}
const dayMs = 86400000;
function isoDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(value))
    return NaN;
  const date = value.length === 7 ? value + "-01" : value;
  const ms = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date
    ? ms / dayMs
    : NaN;
}
function epochMilliseconds(value) {
  if (typeof value !== "string") return NaN;
  const split = value.search(/[T ]/);
  if (split < 0) return isoDay(value) * dayMs;
  const date = value.slice(0,split);
  const time = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,9}))?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(value.slice(split+1));
  if (date.length !== 10 || !Number.isFinite(isoDay(date)) || !time || /[1-9]/.test((time[4] || "").slice(3))) return NaN;
  const [,hour,minute,second="00",fraction="",zone="Z"] = time;
  return Date.parse(date+"T"+hour+":"+minute+":"+second+"."+fraction.padEnd(3,"0").slice(0,3)+zone);
}
const timeSteps = [1,2,5,10,20,50,100,200,500,
  ...[1,2,5,10,15,30].map(s=>s*1000),
  ...[1,2,5,10,15,30].map(m=>m*60000),
  ...[1,2,3,6,12,24].map(h=>h*3600000)];
function continuousGeometry(values,left,width,columns,labelInset,domain,custom=false) {
  const sorted = [...values.values()].sort((a,b)=>a-b);
  if (
    !sorted.length || sorted.some((n) => !Number.isFinite(n)) ||
    new Set(sorted).size !== sorted.length
  )
    return null;
  const [first,last] = domain || [sorted[0],sorted.at(-1)];
  const span = last-first;
  const ratio = n => Number.isFinite(span) ? (n-first)/span : (n/2-first/2)/(last/2-first/2);
  const closest = sorted.slice(1).reduce((gap,n,i)=>Math.min(gap,ratio(n)-ratio(sorted[i])),1);
  const band = Math.min(span ? width*closest/(1+closest) : width,100);
  const inset = custom ? 0 : Math.min(width/4,Math.max(labelInset,columns ? band/2 : 0));
  const position = n => span ? left+inset+(width-2*inset)*ratio(n) : left+width/2;
  const positions = new Map([...values].map(([key,n])=>[key,position(n)]));
  return {sorted,first,last,span,inset,position,positions,band:span ? Math.min(band,(width-2*inset)*closest) : band};
}
export function numericTrendScale(categories,left,width,columns,settings={},referenceValues=[]) {
  const values = new Map(categories.map(n=>[n,n]));
  const fixedMin = Number.isFinite(settings.min), fixedMax = Number.isFinite(settings.max);
  let lo = fixedMin ? settings.min : Math.min(...categories,...referenceValues);
  let hi = fixedMax ? settings.max : Math.max(...categories,...referenceValues);
  if ((fixedMin || fixedMax) && hi<=lo) {
    if (fixedMax) lo = hi - Math.max(1,Math.abs(hi)*0.05);
    else hi = lo + Math.max(1,Math.abs(lo)*0.05);
  }
  const geometry = continuousGeometry(values,left,width,columns,22,[lo,hi],fixedMin||fixedMax);
  if (!geometry) return null;
  const {first,last,positions,position,band} = geometry;
  const candidates = first===last ? [first] : axisScale([first,last],{min:first,max:last},Math.max(2,Math.floor(width/76))).ticks;
  const visible = [first];
  for (const n of candidates.slice(1,-1)) {
    if (position(n)-position(visible.at(-1))>=56 && position(last)-position(n)>=56) visible.push(n);
  }
  if (last!==first && position(last)-position(first)>=50) visible.push(last);
  const labels = visible.map(n=>axisLabel(n,"number"));
  const exact = new Set(labels).size!==labels.length;
  return {positions,position,values,band,domain:[lo,hi],custom:fixedMin||fixedMax,ticks:visible.map((n,i)=>({x:position(n),label:exact ? String(n) : labels[i],number:n}))};
}
function calendarScale(categories, left, width, columns) {
  const values = new Map(categories.map(c => [c,epochMilliseconds(c)]));
  const timed = categories.some(c=>/[T ]/.test(c));
  const singleDay = new Set([...values.values()].map(ms=>Math.floor(ms/dayMs))).size===1;
  const tickGap = timed ? (singleDay ? 92 : 160) : 68;
  const geometry = continuousGeometry(values,left,width,columns,timed ? tickGap/2 : 22);
  if (!geometry) return null;
  const {sorted,first,last,span,inset,position,positions,band} = geometry;
  const aimMs = Math.max(1, span / Math.max(1,(width-2*inset)/Math.max(78,tickGap)));
  const aim = aimMs / dayMs;
  const candidates = [];
  const start = new Date(first);
  const monthStarts =
    sorted.length > 1 &&
    sorted.every(ms => ms % dayMs === 0 && new Date(ms).getUTCDate() === 1);
  if (timed && aimMs <= dayMs) {
    const step = timeSteps.find(ms=>ms>=aimMs);
    for (let n=Math.ceil(first/step)*step;n<last;n+=step) candidates.push(n);
  } else if (aim < 28 && !monthStarts) {
    const step = [1, 2, 7, 14, 28].find((n) => n >= aim);
    const anchor = step >= 7 ? 4 : 0; // Week ticks start on Monday.
    for (
      let n = anchor + Math.ceil((first/dayMs - anchor) / step) * step;
      n * dayMs < last;
      n += step
    )
      candidates.push(n*dayMs);
  } else {
    const months = Math.ceil(aim / 30.44);
    const step =
      [1, 2, 3, 6, 12, 24, 60, 120].find((n) => n >= months) ||
      Math.ceil(months / 12) * 12;
    const index = start.getUTCFullYear() * 12 + start.getUTCMonth();
    const cursor = new Date(0);
    for (let i = Math.ceil(index / step) * step; ; i += step) {
      cursor.setUTCFullYear(Math.floor(i / 12), i % 12, 1);
      const n = cursor.getTime();
      if (!Number.isFinite(n) || n >= last) break;
      if (n > first) candidates.push(n);
    }
  }
  // Keep the exact endpoints and leave room for both neighboring labels.
  const ticks = [first];
  for (const n of candidates)
    if (
      position(n) - position(ticks.at(-1)) >= tickGap &&
      position(last) - position(n) >= tickGap
    )
      ticks.push(n);
  if (last !== first && position(last) - position(first) >= (timed ? tickGap : 64))
    ticks.push(last);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    ...(span < 365*dayMs ? { day: "numeric" } : { year: "numeric" }),
  });
  return {
    positions,
    band,
    values,
    caption: timed && singleDay ? new Date(first).toISOString().slice(0,10)+" · UTC" : "",
    ticks: ticks.map(n=>{
      const iso = new Date(n).toISOString(), date = iso.slice(0,10);
      const clock = iso.slice(11, n%1000 ? 23 : n%60000 ? 19 : 16);
      const label = timed ? (singleDay ? "" : date+" ") + clock+"Z" : formatter.format(n);
      return {x:position(n),label,date:timed ? iso : date};
    }),
  };
}
export {
  axisRoles,
  axisMetricStyle,
  axisScale,
  axisLabel,
  calendarScale,
  isoDay,
};
