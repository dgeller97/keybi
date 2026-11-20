import { calendarScale, isoDay } from "./axes.js";

const iso = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
const date = (value) =>
  typeof value === "string" && value.length === 10 ? isoDay(value) : NaN;
export function ganttChart(
  v,
  rows,
  { w, keys, color, mark, tag, txt, rect, line, xml, shown, groupCount },
) {
  const grouped = Boolean(v.phaseFields?.length),
    hasProgress = Boolean(v.metrics?.length);
  const tasks = [];
  let omitted = 0,
    invalidProgress = 0;
  for (const [i, row] of rows.entries()) {
    const start = date(row[1]),
      milestone = row[2] == null || row[2] === "";
    const end = milestone ? start : date(row[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      omitted++;
      continue;
    }
    let progress = hasProgress ? row[groupCount] : null;
    if (
      progress != null &&
      (!Number.isFinite(progress) || progress < 0 || progress > 1)
    ) {
      invalidProgress++;
      progress = null;
    }
    tasks.push({
      i,
      row,
      start,
      end,
      milestone,
      progress,
      phase: grouped ? row[3] : null,
    });
  }
  if (!tasks.length)
    return '<div class="vempty">Bind ISO dates (YYYY-MM-DD). A blank end marks a milestone. End dates must be on or after the start.</div>';
  tasks.sort(
    (a, b) =>
      String(a.phase ?? "").localeCompare(String(b.phase ?? "")) ||
      a.start - b.start ||
      a.end - b.end ||
      shown(a.row[0]).localeCompare(shown(b.row[0])),
  );
  const min = v.scheduleRange?.from
    ? date(v.scheduleRange.from)
    : Math.min(...tasks.map((t) => t.start));
  let max = v.scheduleRange?.through
    ? date(v.scheduleRange.through)
    : Math.max(...tasks.map((t) => t.end));
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min)
    return '<div class="vempty">No tasks in this date window. Adjust the timeline range in Format.</div>';
  const visible = tasks.filter((t) => t.end >= min && t.start <= max);
  if (!visible.length)
    return '<div class="vempty">No tasks in this date window. Adjust the timeline range in Format.</div>';
  if (max === min) max++;
  const width = Math.max(390, w),
    left = Math.min(202, width * 0.3),
    right = width - 8;
  const scale = calendarScale([iso(min), iso(max)], left, right - left, false);
  const x0 = scale.positions.get(iso(min)),
    x1 = scale.positions.get(iso(max));
  const x = (day) => x0 + ((day - min) * (x1 - x0)) / (max - min);
  const phases = new Map();
  for (const t of visible) {
    if (!phases.has(t.phase)) phases.set(t.phase, []);
    phases.get(t.phase).push(t);
  }
  keys.splice(0, keys.length, ...[...phases.keys()].map(shown));
  const hidden = v.hiddenWorkstreams || [];
  const rowHeight = 27,
    header = 29;
  const height =
    header +
    8 +
    [...phases].reduce(
      (s, [phase, list]) =>
        s +
        (grouped ? rowHeight : 0) +
        (grouped && hidden.includes(phase) ? 0 : list.length * rowHeight),
      0,
    );
  let body = rect(0, 0, width, height, "white");
  if (v.shadeWeekends && (x1 - x0) / (max - min) >= 1) {
    for (let day = min; day < max; day++) {
      const dow = new Date(day * 86400000).getUTCDay();
      if (dow === 0 || dow === 6)
        body += rect(
          x(day),
          header,
          x(day + 1) - x(day),
          height - header,
          "#f3f5f1",
        );
    }
  }
  body += txt(9, 18, "Task", "start", { "font-weight": 600 });
  for (const tick of scale.ticks)
    body +=
      line(tick.x, header, tick.x, height, "#d9e2dc") +
      txt(tick.x, 18, tick.label, "middle", { "data-tick-date": tick.date });
  let y = header;
  for (const [phase, list] of phases) {
    const seriesColor = grouped ? color(shown(phase)) : v.accent;
    if (grouped) {
      const collapsed = hidden.includes(phase);
      body += tag(
        "g",
        {
          role: "button",
          tabindex: 0,
          "data-gantt-toggle": JSON.stringify(phase),
          "aria-expanded": !collapsed,
          "aria-label": (collapsed ? "Expand " : "Collapse ") + shown(phase),
        },
        rect(0, y, width, rowHeight - 1, "#edf2ee") +
          txt(
            8,
            y + 18,
            (collapsed ? "▸ " : "▾ ") + shown(phase) + " (" + list.length + ")",
            "start",
            { "font-weight": 600 },
          ),
      );
      y += rowHeight;
      if (collapsed) continue;
    }
    for (const task of list) {
      const { row, start, end, progress, milestone } = task,
        name = shown(row[0]),
        mid = y + rowHeight / 2;
      const xStart = x(Math.max(start, min)),
        xEnd = x(Math.min(end, max));
      const duration = end - start,
        fit = Math.max(4, Math.floor((left - 13) / 6.4));
      let glyph =
        rect(0, y, width, rowHeight, "transparent") +
        txt(
          10,
          mid + 4,
          name.length > fit ? name.slice(0, fit - 1) + "…" : name,
        );
      if (milestone)
        glyph += tag("polygon", {
          points: `${xStart},${mid - 6} ${xStart + 6},${mid} ${xStart},${mid + 6} ${xStart - 6},${mid}`,
          fill: seriesColor,
          class: "milestone",
        });
      else {
        const barWidth = Math.max(2, xEnd - xStart);
        glyph += tag("rect", {
          x: xStart,
          y: mid - 7,
          width: barWidth,
          height: 14,
          rx: 2,
          fill: seriesColor,
          opacity: progress == null ? 0.88 : 0.3,
          class: "duration",
        });
        if (progress != null) {
          const filled = Math.max(
            0,
            Math.min(xEnd, x(start + duration * progress)) - xStart,
          );
          glyph += tag("rect", {
            x: xStart,
            y: mid - 4,
            width: filled,
            height: 8,
            fill: seriesColor,
            class: "progress",
          });
        }
      }
      const percent =
        progress == null
          ? ""
          : new Intl.NumberFormat("en-US", {
              style: "percent",
              maximumFractionDigits: 1,
            }).format(progress);
      if (v.labels && percent && !milestone) {
        const after = xEnd + 5,
          room = right - after >= 32;
        glyph += txt(
          room ? after : xEnd - 4,
          mid + 4,
          percent,
          room ? "start" : "end",
          { "font-size": 10 },
        );
      }
      const details = milestone
        ? "Milestone"
        : duration +
          (duration === 1 ? " day" : " days") +
          (percent ? " · " + percent + " complete" : "");
      body += mark(
        { row, i: task.i, j: 0, k: "Schedule", value: progress },
        glyph,
        details,
        { "data-duration": duration, "data-milestone": milestone },
      );
      y += rowHeight;
    }
  }
  const chart = tag(
    "svg",
    {
      class: "analytic-plot gantt-plot",
      viewBox: `0 0 ${width} ${height}`,
      role: "group",
      "aria-label": v.title || "Gantt chart",
    },
    body,
  );
  const legend =
    grouped && v.showLegend !== false
      ? '<div class="chart-legend">' +
        keys
          .map(
            (k) =>
              `<span data-series-color="${xml(k)}" data-color="${xml(color(k))}"><i style="background:${xml(color(k))}"></i>${xml(k)}</span>`,
          )
          .join("") +
        "</div>"
      : "";
  const note = [
    omitted ? omitted + " row(s) with invalid dates omitted." : "",
    invalidProgress
      ? invalidProgress + " progress value(s) outside 0–1 omitted."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    '<div class="chart-frame"><div class="gantt-scroll">' +
    chart +
    "</div>" +
    legend +
    (note ? "<small>" + note + "</small>" : "") +
    "</div>"
  );
}
