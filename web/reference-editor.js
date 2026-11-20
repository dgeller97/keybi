import { defaultColor, patterns, statisticNames } from "./reference-lines.js";
import { axisBindings } from "./axes.js";
import { metricKey } from "./cell-format.js";

export function editReferenceLine(
  v,
  axis,
  existing,
  { title, format, sources, valname, dialog, esc, uid, apply },
) {
  const percent = format === "percent" || format === "points";
  const unit =
    format === "percent"
      ? " (%)"
      : format === "points"
        ? " (percentage points)"
        : "";
  const link = existing?.source,
    index = link
      ? sources.findIndex(
          ({ source }) =>
            source.page === link.page &&
            source.visual === link.visual &&
            source.rule === link.rule,
        )
      : -1;
  const initial = link ? sources[index]?.rule.value : existing?.value;
  const value = Number.isFinite(initial)
    ? Number((initial * (percent ? 100 : 1)).toPrecision(15))
    : "";
  const selected = (a, b) => (a === b ? " selected" : "");
  const stat = existing?.statistic;
  const metrics = axisBindings(v, axis);
  const measureKey = stat ? metricKey(stat.binding) : null;
  const missing = stat && !metrics.some((m) => metricKey(m) === measureKey);
  const statistics = (metrics.length || stat ? Object.entries(statisticNames) : [])
    .map(
      ([key, name]) =>
        `<option value="${key}"${selected(stat?.kind, key)}>${name}</option>`,
    )
    .join("");
  dialog(
    existing ? "Edit reference line" : "Add reference line",
    `<label class="formlabel" for="ref-source">Value source</label><select class="control" id="ref-source" name="source"><option value="constant">Constant</option><optgroup label="Chart statistics">${statistics}</optgroup>${link && index < 0 ? '<option value="missing" selected>Linked filter unavailable</option>' : ""}${sources.length ? `<optgroup label="Measure filters">${sources.map((s, i) => `<option value="${i}" ${i === index ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</optgroup>` : ""}</select>
     <div id="ref-number"><label class="formlabel" for="ref-value">${esc(title)} value${unit}</label><input class="control" id="ref-value" name="value" type="number" step="any" required value="${value}"></div>
     <div id="ref-stat"><label class="formlabel" for="ref-metric">Chart measure</label><select class="control" id="ref-metric" name="metric">${missing ? `<option value="missing" selected>Unavailable · ${esc(valname(stat.binding))}</option>` : ""}${metrics.map((m, i) => `<option value="${i}"${selected(metricKey(m), measureKey)}>${esc(valname(m))}</option>`).join("")}</select><small>Calculated across the chart’s groups after filtering. Blank values are excluded.</small></div>
     <div id="ref-quantile"><label class="formlabel" for="ref-percentile">Percentile (0–100)</label><input class="control" id="ref-percentile" name="percentile" type="number" min="0" max="100" step="any" required value="${esc(stat?.percentile ?? 90)}"></div>
     <label class="formlabel" for="ref-name">Name</label><input class="control" id="ref-name" name="name" maxlength="80" value="${esc(existing?.name || "")}">
     <div class="dimensions"><label>Line color<input name="color" type="color" value="${esc(existing?.color || defaultColor)}"></label><label>Line style<select name="pattern" aria-label="Line style">${Object.keys(
       patterns,
     )
       .map(
         (key) =>
           `<option value="${key}"${selected(existing?.pattern || "dashed", key)}>${key[0].toUpperCase() + key.slice(1)}</option>`,
       )
       .join("")}</select></label></div>
     <label class="formlabel" for="ref-label">Data label</label><select class="control" id="ref-label" name="label">${[
       ["both", "Name and value"],
       ["value", "Value"],
       ["name", "Name"],
       ["none", "Off"],
     ]
       .map(
         ([key, label]) =>
           `<option value="${key}"${selected(existing?.label || "both", key)}>${label}</option>`,
       )
       .join("")}</select>
     <label class="formlabel" for="ref-position">Label position</label><select class="control" id="ref-position" name="position"><option value="end">End</option><option value="start"${selected(existing?.position, "start")}>Start</option></select>`,
    "Apply",
    (fd) => {
      const n = Number(fd.get("value"));
      const choice = fd.get("source");
      if (
        choice === "constant" &&
        (!fd.get("value")?.trim() || !Number.isFinite(n))
      )
        throw Error("Enter a finite reference value.");
      const name = fd.get("name").trim();
      if (
        fd.get("label") === "name" &&
        !name &&
        !Object.hasOwn(statisticNames, choice)
      )
        throw Error("Enter a name to display on the line.");
      const line = {
        id: existing?.id || uid(),
        axis,
        name,
        color: fd.get("color"),
        pattern: fd.get("pattern"),
        label: fd.get("label"),
        position: fd.get("position"),
      };
      if (choice === "constant") line.value = n / (percent ? 100 : 1);
      else if (choice === "missing") line.source = link;
      else if (Object.hasOwn(statisticNames, choice)) {
        const key = fd.get("metric");
        const binding =
          key === "missing"
            ? stat?.binding
            : key !== null && metrics[Number(key)];
        if (!binding) throw Error("Bind a measure to this chart axis first.");
        line.statistic = { kind: choice, binding: structuredClone(binding) };
        if (choice === "percentile") {
          const raw = fd.get("percentile");
          const p = Number(raw);
          if (!raw?.trim() || !(p >= 0 && p <= 100))
            throw Error("Choose a percentile from 0 to 100.");
          line.statistic.percentile = p;
        }
      } else {
        const { source, rule } = sources[Number(choice)];
        rule.id ??= source.rule;
        line.source = source;
      }
      if (existing) v.referenceLines[v.referenceLines.indexOf(existing)] = line;
      else (v.referenceLines ??= []).push(line);
      apply();
    },
  );
  const source = document.querySelector("#ref-source"),
    input = document.querySelector("#ref-value");
  function setValue() {
    const isStatistic = Object.hasOwn(statisticNames, source.value);
    document.querySelector("#ref-stat").hidden = !isStatistic;
    document.querySelector("#ref-metric").disabled = !isStatistic;
    document.querySelector("#ref-quantile").hidden =
      source.value !== "percentile";
    document.querySelector("#ref-percentile").disabled =
      source.value !== "percentile";
    document.querySelector("#ref-number").hidden = isStatistic;
    input.disabled = source.value !== "constant";
    if (input.disabled) {
      const n = sources[Number(source.value)]?.rule.value;
      input.value = Number.isFinite(n)
        ? Number((n * (percent ? 100 : 1)).toPrecision(15))
        : "";
    }
  }
  source.onchange = setValue;
  setValue();
}
