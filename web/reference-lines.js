import { axisLabel, axisBindings } from "./axes.js";
import { metricKey } from "./cell-format.js";

export const defaultColor = "#91452e";
export const patterns = { solid: "", dashed: "7 4", dotted: "2 3" };
export const statisticNames = {
  median: "Median",
  average: "Average",
  min: "Minimum",
  max: "Maximum",
  percentile: "Percentile",
};

function statisticValue(values, { kind, percentile }) {
  if (!values.length) return;
  if (kind === "min") return Math.min(...values);
  if (kind === "max") return Math.max(...values);
  if (kind === "average")
    return values.reduce((sum, n) => sum + n / values.length, 0);
  const q =
    kind === "median" ? 0.5 : kind === "percentile" ? percentile / 100 : NaN;
  if (!(q >= 0 && q <= 1)) return;
  const sorted = values.sort((a, b) => a - b);
  const index = q * (sorted.length - 1),
    left = Math.floor(index),
    fraction = index - left;
  if (!fraction) return sorted[left];
  return sorted[left] * (1 - fraction) + sorted[left + 1] * fraction;
}

export function statisticalLines(v, samples, format, valname) {
  return v.referenceLines?.map((ref) => {
    const stat = ref.statistic;
    if (!stat) return ref;
    const binding = axisBindings(v, ref.axis).find(
      (m) => metricKey(m) === metricKey(stat.binding),
    );
    if (!binding) return { ...ref, value: undefined };
    const value = statisticValue(
      samples(binding).filter(Number.isFinite),
      stat,
    );
    const descriptor =
      stat.kind === "percentile"
        ? "P" + stat.percentile
        : statisticNames[stat.kind];
    return {
      ...ref,
      value,
      name: ref.name || descriptor + " " + valname(binding),
      valueLabel: Number.isFinite(value) ? format(binding, value) : undefined,
    };
  });
}

export function referenceDomain(lines, axis, domain) {
  let [lo, hi] = domain;
  for (const r of lines || [])
    if (r.axis === axis && Number.isFinite(r.value)) {
      lo = Math.min(lo, r.value);
      hi = Math.max(hi, r.value);
    }
  return [lo, hi];
}

export function referenceMarks(lines, axes, box, { tag, txt, xml }) {
  if (!lines?.length) return "";
  const { left, right, top, bottom } = box,
    labels = [],
    strokes = [],
    positions = [];
  for (const ref of lines) {
    const axis = axes[ref.axis];
    if (!axis || !Number.isFinite(ref.value)) continue;
    const [lo, hi] = axis.scale.domain;
    if (ref.value < lo || ref.value > hi) continue;
    const t = hi===lo ? 0.5 : (ref.value - lo) / (hi - lo),
      vertical = axis.horizontal;
    const x = axis.position ? axis.position(ref.value) : left + t * (right - left),
      y = bottom - t * (bottom - top);
    positions.push({ ref, axis, vertical, x, y });
  }
  for (const { ref, axis, vertical, x, y } of positions) {
    const color = /^#[0-9a-f]{6}$/i.test(ref.color) ? ref.color : defaultColor;
    const value = ref.valueLabel ?? axisLabel(ref.value, axis.format),
      name = ref.name || "";
    const full = name ? name + " · " + value : value;
    const line = tag("line", {
      x1: vertical ? x : left,
      x2: vertical ? x : right,
      y1: vertical ? top : y,
      y2: vertical ? bottom : y,
      stroke: color,
      "stroke-width": 1.75,
      "stroke-dasharray": patterns[ref.pattern] || "none",
    });
    strokes.push(
      tag(
        "g",
        {
          "data-reference": ref.id,
          "data-reference-axis": ref.axis,
          "data-reference-value": ref.value,
          role: "img",
          "aria-label": full,
        },
        tag("title", {}, xml(full)) + line,
      ),
    );
    if (ref.label === "none") continue;
    const text =
      ref.label === "name" ? name : ref.label === "value" ? value : full;
    if (!text) continue;
    const start = ref.position === "start";
    const anchor = vertical
      ? x < (left + right) / 2
        ? "start"
        : "end"
      : start
        ? "start"
        : "end";
    const lx = vertical
      ? x + (anchor === "start" ? 3 : -3)
      : start
        ? left + 3
        : right - 3;
    const available = anchor === "start" ? right - lx : lx - left;
    const limit = Math.max(2, Math.floor(available / 6.2));
    const caption = text.length > limit ? text.slice(0, limit - 1) + "…" : text;
    let ly = vertical
      ? start
        ? bottom - 3
        : top + 11
      : y - 4 < top + 9
        ? y + 12
        : y - 4;
    const width = Math.min(available, caption.length * 6.2),
      a = anchor === "start" ? lx : lx - width,
      b = a + width;
    const overlaps = (n) =>
      positions.some((p) => !p.vertical && p.y > n - 11 && p.y < n + 2) ||
      labels.some(
        (l) => a < l.right + 2 && b > l.left - 2 && Math.abs(l.y - n) < 13,
      );
    if (overlaps(ly)) {
      const candidates = [
        ...(vertical ? [] : [y + 13]),
        ly + 14,
        ly - 14,
        ly + 28,
        ly - 28,
      ];
      ly =
        candidates.find((n) => n >= top + 9 && n <= bottom && !overlaps(n)) ??
        ly;
    }
    labels.push({
      left: a,
      right: b,
      y: ly,
      html: txt(lx, ly, caption, anchor, {
        "data-reference-label": ref.id,
        fill: color,
        stroke: "white",
        "stroke-width": 3,
        "stroke-linejoin": "round",
        "paint-order": "stroke",
        "font-size": 10.5,
        "font-weight": 600,
      }),
    });
  }
  return tag(
    "g",
    { "pointer-events": "none", class: "reference-lines" },
    strokes.join("") + labels.map((l) => l.html).join(""),
  );
}
