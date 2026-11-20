import { mapChart } from "./map-view.js";

function specializedChart(v, c) {
  const {
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
  } = c;
  const measure = v.metrics[0],
    fmt = (n) => format(measure, n),
    primary = points.filter((p) => p.j === 0);
  const positive = primary.filter((p) => p.value > 0);
  const distinct = (a) => [...new Set(a)];
  const replaceKeys = (list) => keys.splice(0, keys.length, ...distinct(list));
  const colorCategories = () => replaceKeys(primary.map((p) => shown(p.cat)));
  const needPositive = () =>
    '<div class="vempty">This visual needs nonnegative values and a positive total.</div>';
  const cx = w / 2;
  if (v.kind === "waterfall") {
    let running = 0;
    const steps = primary.map((p) => {
      const start = running;
      running += p.value;
      return { p, start, end: running };
    });
    const high = Math.max(0, ...steps.map((s) => s.end)),
      low = Math.min(0, ...steps.map((s) => s.end));
    const y = (n) => h - 28 - ((h - 52) * (n - low)) / (high - low || 1),
      width = (w - 62) / (steps.length + 1);
    replaceKeys(["Increase", "Decrease", "Total"]);
    let content = line(44, y(0), w - 6, y(0));
    for (const [i, s] of steps.entries()) {
      const x = 48 + width * i,
        bar = rect(
          x,
          Math.min(y(s.start), y(s.end)),
          width * 0.68,
          Math.max(1, Math.abs(y(s.end) - y(s.start))),
          color(s.p.value >= 0 ? "Increase" : "Decrease"),
        );
      content +=
        mark(
          s.p,
          bar +
            (v.labels
              ? txt(
                  x + width * 0.34,
                  Math.min(y(s.start), y(s.end)) - 3,
                  fmt(s.p.value),
                  "middle",
                )
              : ""),
          fmt(s.p.value),
          { "data-start": s.start, "data-end": s.end },
        ) +
        line(x + width * 0.68, y(s.end), x + width, y(s.end)) +
        txt(x + width * 0.34, h - 9, shown(s.p.cat), "middle");
    }
    const x = 48 + width * steps.length;
    content +=
      rect(
        x,
        Math.min(y(running), y(0)),
        width * 0.68,
        Math.max(1, Math.abs(y(running) - y(0))),
        color("Total"),
      ) +
      txt(x + width * 0.34, h - 9, "Total", "middle") +
      txt(
        x + width * 0.34,
        Math.min(y(running), y(0)) - 4,
        fmt(running),
        "middle",
      ) +
      txt(4, y(high) + 3, fmt(high)) +
      txt(4, y(low) + 3, fmt(low));
    return svg(content);
  }
  if (v.kind === "ribbon") {
    if (
      positive.length !== primary.filter((p) => p.value !== 0).length ||
      !positive.length
    )
      return needPositive();
    const periods = distinct(rows.map((r) => r[0]));
    replaceKeys(primary.map((p) => shown(p.row[1])));
    const buckets = periods.map((cat) =>
      primary
        .filter((p) => p.cat === cat)
        .sort(
          (a, b) =>
            b.value - a.value || shown(a.row[1]).localeCompare(shown(b.row[1])),
        ),
    );
    const max = Math.max(
        ...buckets.map((ps) => ps.reduce((s, p) => s + p.value, 0)),
      ),
      band = (w - 20) / periods.length,
      bw = band * 0.32;
    let bands = "",
      bars = "";
    let previous = new Map();
    for (const [i, ps] of buckets.entries()) {
      let y = 10;
      const current = new Map(),
        x = 10 + band * (i + 0.5) - bw / 2;
      for (const [j, p] of ps.entries()) {
        const k = shown(p.row[1]),
          dy = ((h - 43) * p.value) / max,
          old = previous.get(k);
        current.set(k, { x: x + bw, y, dy });
        if (old) {
          const mid = (old.x + x) / 2;
          bands += tag("path", {
            d: `M ${old.x} ${old.y} C ${mid} ${old.y} ${mid} ${y} ${x} ${y} V ${y + dy} C ${mid} ${y + dy} ${mid} ${old.y + old.dy} ${old.x} ${old.y + old.dy} Z`,
            fill: color(k),
            opacity: 0.47,
          });
        }
        bars += mark(
          p,
          rect(x, y, bw, dy, color(k)) +
            (v.labels && dy > 16
              ? txt(x + bw / 2, y + dy / 2 + 4, fmt(p.value), "middle", {
                  fill: "#fff",
                })
              : ""),
          fmt(p.value),
          { "data-rank": j + 1 },
        );
        y += dy;
      }
      bars += txt(x + bw / 2, h - 8, shown(periods[i]), "middle");
      previous = current;
    }
    return svg(bands + bars);
  }
  if (v.kind === "funnel") {
    if (primary.some((p) => p.value < 0) || !positive.length)
      return needPositive();
    const max = Math.max(...positive.map((p) => p.value)),
      bh = (h - 12) / primary.length;
    const ranked =
      v.order === "category"
        ? primary
        : [...primary].sort((a, b) =>
            v.order === "asc" ? a.value - b.value : b.value - a.value,
          );
    return svg(
      ranked
        .map((p, i) => {
          const width = (w * 0.69 * p.value) / max,
            mid = w * 0.61,
            y = 6 + i * bh;
          return mark(
            p,
            rect(mid - width / 2, y, width, bh * 0.79, v.accent) +
              txt(4, y + bh * 0.48, shown(p.cat)) +
              (v.labels
                ? txt(mid, y + bh * 0.48, fmt(p.value), "middle", {
                    fill: "white",
                  })
                : ""),
            fmt(p.value),
            { "data-fraction": p.value / max },
          );
        })
        .join(""),
      [],
    );
  }
  if (v.kind === "treemap") {
    if (primary.some((p) => p.value < 0) || !positive.length)
      return needPositive();
    colorCategories();
    function layout(items, x, y, width, height, draw) {
      if (items.length === 1) return draw(items[0], x, y, width, height);
      const total = items.reduce((n, it) => n + it.value, 0);
      let part = items[0].value,
        split = 1;
      while (
        split < items.length - 1 &&
        Math.abs(part + items[split].value - total / 2) <
          Math.abs(part - total / 2)
      )
        part += items[split++].value;
      const f = part / total,
        wide = width >= height;
      return (
        layout(
          items.slice(0, split),
          x,
          y,
          wide ? width * f : width,
          wide ? height : height * f,
          draw,
        ) +
        layout(
          items.slice(split),
          wide ? x + width * f : x,
          wide ? y : y + height * f,
          wide ? width * (1 - f) : width,
          wide ? height : height * (1 - f),
          draw,
        )
      );
    }
    const parents = distinct(positive.map((p) => p.cat))
      .map((cat) => {
        const children = positive.filter((p) => p.cat === cat);
        return {
          cat,
          children,
          value: children.reduce((n, p) => n + p.value, 0),
        };
      })
      .sort((a, b) => b.value - a.value);
    return svg(
      layout(parents, 1, 1, w - 2, h - 2, (parent, x, y, width, height) =>
        layout(
          parent.children,
          x,
          y,
          width,
          height,
          (p, x, y, width, height) => {
            const name =
              ng > 1 ? shown(p.cat) + " / " + shown(p.row[1]) : shown(p.cat);
            const shape = tag("rect", {
              x,
              y,
              width,
              height,
              stroke: "white",
              "stroke-width": 2,
              fill: color(shown(p.cat)),
            });
            const text =
              width > 25 && height > 16
                ? txt(
                    x + 5,
                    y + 14,
                    name.slice(0, Math.floor((width - 8) / 6)),
                    "start",
                    { fill: "white" },
                  ) +
                  (v.labels && height > 34
                    ? txt(x + 5, y + 30, fmt(p.value), "start", {
                        fill: "white",
                      })
                    : "")
                : "";
            return mark(p, shape + text, fmt(p.value), {
              "data-area": width * height,
            });
          },
        ),
      ),
    );
  }
  if (v.kind === "gauge") {
    if (rows.length > 1)
      return '<div class="vempty">Filter the Category well to one value or remove it to show the total.</div>';
    const value = rows[0][ng],
      goal = rows[0][ng + 1],
      max = Math.max(0, value, goal) * 1.2 || 1;
    if (
      !Number.isFinite(value) ||
      !Number.isFinite(goal) ||
      Math.min(value, goal) < 0
    )
      return needPositive();
    const radius = Math.min(w * 0.4, (h - 38) * 0.76),
      cy = radius + 12;
    const xy = (n) => [
      cx + radius * Math.cos(Math.PI * (1 - n / max)),
      cy - radius * Math.sin(Math.PI * (1 - n / max)),
    ];
    const arc = (end, stroke) =>
      tag("path", {
        d: `M ${xy(0).join(" ")} A ${radius} ${radius} 0 0 1 ${xy(end).join(" ")}`,
        stroke,
        fill: "none",
        "stroke-width": Math.max(6, radius * 0.17),
      });
    const [gx, gy] = xy(goal),
      goalMark = line(
        cx + (gx - cx) * 0.83,
        cy + (gy - cy) * 0.83,
        cx + (gx - cx) * 1.16,
        cy + (gy - cy) * 1.16,
        "#263f37",
      );
    const body =
      arc(max, "#dde6e1") +
      arc(value, v.accent) +
      goalMark +
      txt(cx, cy, fmt(value), "middle", { "font-size": 22 }) +
      txt(cx, cy + 20, "Target " + format(metrics[1], goal), "middle");
    return svg(
      ng
        ? mark(primary[0], body)
        : tag("g", { "data-value": value, "data-target-value": goal }, body),
      [],
    );
  }
  if (v.kind === "map") return mapChart(v, c);
}
export { specializedChart };
