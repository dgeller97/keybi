const percentLabel = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

// A label also identifies its band and color in the legend. Preserve a real
// "(Blank)" member and distinguish same-named values from different wells.
const component = text => text.startsWith('"') || text.includes(" · ") ? JSON.stringify(text) : text;
export function legendMemberName(raw) {
  if (raw == null) return "(Blank)";
  return raw === "(Blank)" ? JSON.stringify(raw) : component(String(raw));
}
export function seriesNames(metrics, valname, hasLegend, axisDepth) {
  const names = metrics.map(valname);
  const reserved = new Set(names);
  const seen = new Set();
  const labels = names.map((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      return name;
    }
    let n = 2,
      label;
    do {
      label = name + " (" + n++ + ")";
    } while (reserved.has(label));
    reserved.add(label);
    return label;
  });
  return (row, j) => {
    if (!hasLegend) return labels[j];
    const category = legendMemberName(row[axisDepth]);
    return labels.length === 1
      ? category
      : category + " · " + component(labels[j]);
  };
}

// Partition the filled band at the midpoint between observations so a click
// anywhere in it selects the nearest date and its series.
export function areaBands({
  cats,
  keys,
  bucket,
  accum,
  center,
  y,
  color,
  mark,
  fmt,
  norm,
  labels,
  tag,
  txt,
  left,
  right,
  top,
  bottom,
  parentOf,
}) {
  const series = new Map(keys.map((key, i) => [key, i]));
  const columns = cats.map((cat) => {
    const column = new Array(keys.length);
    for (const p of bucket.get(cat)) column[series.get(p.k)] = p;
    return column;
  });
  const paths = new Map();
  const delta = (p) =>
    p && accum.has(p) ? accum.get(p)[1] - accum.get(p)[0] : 0;

  for (let i = 1; i < columns.length; i++) {
    if (parentOf && parentOf.get(cats[i-1]) !== parentOf.get(cats[i])) continue;
    const left = columns[i - 1],
      right = columns[i];
    const x0 = center(cats[i - 1]),
      width = center(cats[i]) - x0;
    const cuts = new Set([0, 0.5, 1]);
    const layers = keys.map((_, j) => {
      const a = delta(left[j]),
        b = delta(right[j]);
      if (a * b < 0) cuts.add(Math.abs(a) / (Math.abs(a) + Math.abs(b)));
      return { a, b, first: left[j], last: right[j] };
    });
    const intervals = [...cuts].sort((a, b) => a - b);
    for (let k = 1; k < intervals.length; k++) {
      const t0 = intervals[k - 1],
        t1 = intervals[k];
      // A band crossing zero changes stack. Terminate its positive wedge and
      // start its negative wedge on the appropriate side of the other series.
      const above = [0, 0],
        below = [0, 0];
      for (const { a, b, first, last } of layers) {
        const d0 = a * (1 - t0) + b * t0,
          d1 = a * (1 - t1) + b * t1;
        const base = d0 + d1 < 0 ? below : above;
        const top0 = base[0] + d0,
          top1 = base[1] + d1;
        if (accum.has(first) && accum.has(last)) {
          const owner = t1 <= 0.5 ? first : last;
          const xa = x0 + width * t0,
            xb = x0 + width * t1;
          const face = `M${xa},${y(base[0])}L${xa},${y(top0)} ${xb},${y(top1)} ${xb},${y(base[1])}Z`;
          paths.set(owner, (paths.get(owner) || "") + face);
        }
        base[0] = top0;
        base[1] = top1;
      }
    }
  }

  const marks = [],
    captions = [];
  let nearby = [];
  for (const [index, cat] of cats.entries()) {
    const list = bucket.get(cat),
      x = center(cat);
    const distance = Math.min(
      index ? x - center(cats[index - 1]) : Infinity,
      index + 1 < cats.length ? center(cats[index + 1]) - x : Infinity,
    );
    nearby = nearby.filter((label) => label.right >= x - 100);
    const ordered = list
      .map((p) => {
        const range = accum.get(p);
        const mid = range ? (y(range[0]) + y(range[1])) / 2 : y(0);
        return { p, range, mid };
      })
      .sort((a, b) => a.mid - b.mid);
    for (const { p, range, mid } of ordered) {
      const fill = color(p.k);
      const share =
        norm && range
          ? percentLabel.format(range[1] - range[0])
          : "Share unavailable";
      let shape = "";
      if (paths.has(p))
        shape += tag("path", {
          d: paths.get(p),
          fill,
          stroke: fill,
          "stroke-width": 0.8,
          "stroke-linejoin": "round",
        });
      const dense = distance < 12 && paths.has(p);
      if (range && !dense)
        shape += tag("line", {
          x1: x,
          x2: x,
          y1: y(range[0]),
          y2: y(range[1]),
          stroke: fill,
          "stroke-width": 2,
        });
      shape += tag("circle", {
        cx: x,
        cy: mid,
        r: 3.5,
        fill: range ? fill : "white",
        stroke: range ? "white" : fill,
        "stroke-width": 1.3,
      });
      marks.push(
        mark(p, shape, norm ? fmt(p) + " · " + share : fmt(p), {
          "data-area-point": "",
          "data-axis": "primary",
          ...(dense ? { "data-area-dense": "" } : {}),
          ...(range
            ? { "data-start": range[0], "data-end": range[1] }
            : { "data-no-share": "" }),
        }),
      );
      if (labels && range) {
        const text = norm ? share : fmt(p),
          half = Math.min((right - left) / 2, text.length * 3.4 + 3);
        const lx = Math.max(left + half, Math.min(right - half, x)),
          ly = Math.max(top + 10, Math.min(bottom - 2, mid - 5));
        if (
          nearby.some(
            (l) =>
              lx - half < l.right + 3 &&
              lx + half > l.left - 3 &&
              Math.abs(ly - l.y) < 14,
          )
        )
          continue;
        captions.push(
          txt(lx, ly, text, "middle", {
            "data-area-label": "",
            fill: "#273e35",
            stroke: "white",
            "stroke-width": 3,
            "paint-order": "stroke",
            "stroke-linejoin": "round",
          }),
        );
        nearby.push({ left: lx - half, right: lx + half, y: ly });
      }
    }
  }
  return (
    marks.join("") + tag("g", { "pointer-events": "none" }, captions.join(""))
  );
}
