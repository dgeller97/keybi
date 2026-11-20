const turn = Math.PI * 2;
const percent = (n) => (n * 100).toFixed(1) + "%";

// Use two arcs for a complete circle. An arc with coincident endpoints is empty in SVG.
function sector(cx, cy, radius, hole, start, angle) {
  const point = (r, a) =>
    [cx + r * Math.cos(a), cy + r * Math.sin(a)].join(" ");
  const end = start + angle,
    mid = start + angle / 2;
  const outer = `A ${radius} ${radius} 0 0 1 `,
    inner = `A ${hole} ${hole} 0 0 0 `;
  return (
    `M ${point(radius, start)} ${outer}${point(radius, mid)} ${outer}${point(radius, end)} ` +
    (hole
      ? `L ${point(hole, end)} ${inner}${point(hole, mid)} ${inner}${point(hole, start)} Z`
      : `L ${cx} ${cy} Z`)
  );
}

export function sliceChart(
  v,
  points,
  highlight,
  { w, h, color, tag, txt, mark, svg, fmt, shown },
) {
  if (points.some((p) => p.value < 0 || p.highlighted < 0))
    return '<div class="vempty">Slices need nonnegative values. Use a bar chart for signed comparisons.</div>';
  const total = points.reduce((sum, p) => sum + (p.value || 0), 0);
  const selectedTotal = points.reduce(
    (sum, p) => sum + (p.highlighted || 0),
    0,
  );
  if (!total && !selectedTotal)
    return '<div class="vempty">Total is zero</div>';
  const separate =
    highlight && points.some((p) => p.highlighted > (p.value ?? 0));
  const baseX = separate ? w / 4 : w / 2,
    selectedX = separate ? w * 0.75 : baseX;
  const cy = (h - (separate ? 17 : 0)) / 2;
  const radius = 0.84 * Math.min(baseX, cy);
  const hole =
    v.kind === "donut"
      ? (radius * Math.min(85, Math.max(10, Number(v.holePercent) || 55))) / 100
      : 0;
  let baseAngle = ((Number(v.sliceAngle) || 0) * Math.PI) / 180 - Math.PI / 2,
    selectedAngle = baseAngle,
    body = "";
  for (const p of points) {
    const share = total ? p.value / total : 0;
    const selectedShare =
      (p.highlighted || 0) / (separate ? selectedTotal : total);
    if (!share && !selectedShare) continue;
    const fill = color(shown(p.cat));
    let shape = "";
    if (share)
      shape += tag("path", {
        d: sector(baseX, cy, radius, hole, baseAngle, turn * share),
        fill,
        stroke: "white",
        opacity: highlight ? 0.28 : 1,
        class: "slice-total",
      });
    if (highlight && selectedShare)
      shape += tag("path", {
        d: sector(
          selectedX,
          cy,
          radius,
          hole,
          separate ? selectedAngle : baseAngle,
          turn * selectedShare,
        ),
        fill,
        stroke: "white",
        class: "slice-selected",
      });
    function label(cx, start, fraction, value) {
      if (!v.labels || !fraction) return "";
      const mid = start + Math.PI * fraction;
      const r = hole ? (radius + hole) / 2 : radius * 0.68;
      const category = shown(p.cat);
      const text =
        v.sliceLabel === "value"
          ? fmt(p, value)
          : v.sliceLabel === "category"
            ? category
            : v.sliceLabel === "categoryPercent"
              ? category + " · " + percent(fraction)
              : percent(fraction);
      return txt(
        cx + r * Math.cos(mid),
        cy + r * Math.sin(mid),
        text,
        "middle",
        { "font-size": 10 },
      );
    }
    shape += label(baseX, baseAngle, share, p.value);
    if (separate)
      shape += label(selectedX, selectedAngle, selectedShare, p.highlighted);
    let detail = fmt(p) + " (" + percent(share) + ")";
    if (highlight) {
      detail =
        "Total " + detail + " · Selected " + fmt(p, p.highlighted ?? null);
      if (Number.isFinite(p.highlighted) && (separate || p.value > 0))
        detail += separate
          ? " (" + percent(selectedShare) + " of selected)"
          : " (" + percent(p.highlighted / p.value) + " of slice)";
    }
    body += mark(p, shape, detail, {
      "data-share": share,
      ...(highlight
        ? {
            "data-highlight": p.highlighted ?? "",
            "data-selected-share": selectedShare,
          }
        : {}),
    });
    baseAngle += turn * share;
    selectedAngle += turn * selectedShare;
  }
  if (separate)
    body +=
      txt(baseX, h - 2, "Total", "middle") +
      txt(selectedX, h - 2, "Selected", "middle");
  return (
    svg(body) +
    (highlight
      ? `<div class="highlight-key"><i></i>Total <i></i>Selected${separate ? " · Each chart shows its own shares" : ""}</div>`
      : "")
  );
}
