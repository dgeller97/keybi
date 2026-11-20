import { comparisons } from "./visual-types.js";
export { comparisons };
const takesValue = (op) => op !== "blank" && op !== "present";

export function measureFilterList(v, { esc, valname, ruleFormat, display, readerAccessButton }) {
  const rules = (v.measureFilters || []).map(({ binding, op, value }, i) => {
    const text = [valname(binding), comparisons[op]];
    if (takesValue(op)) text.push(display(value, ruleFormat(binding)));
    return `<div class="filteritem"><button class="measure-filter-edit" data-measure-filter="${i}" aria-label="Edit ${esc(text.join(" "))}">${esc(text.join(" "))}</button>${readerAccessButton("measure",i,v.measureFilters[i])}<button data-clear-measure-filter="${i}" aria-label="Clear measure filter">×</button></div>`;
  });
  return (
    rules.join("") +
    '<button class="outline" data-measure-filter="new">+ Add measure filter</button>'
  );
}

export function measureFilterDialog(
  v,
  index,
  preset,
  candidates,
  { dialog, esc, valname, metricKey, ruleFormat, ruleIdentity, apply },
) {
  const options = new Map(candidates.map((m) => [metricKey(m), m]));
  const previous = v.measureFilters?.[index];
  const selected = previous
    ? metricKey(previous.binding)
    : preset || options.keys().next().value;
  dialog(
    previous ? "Edit measure filter" : "Add measure filter",
    `<label class="formlabel">Measure<select name="metric" aria-label="Measure">${[...options].map(([k, m]) => `<option value="${esc(k)}" ${k === selected ? "selected" : ""}>${esc(valname(m))}</option>`).join("")}</select></label>
    <label class="formlabel">Condition<select name="op" aria-label="Condition">${Object.entries(
      comparisons,
    )
      .map(
        ([op, label]) =>
          `<option value="${op}" ${op === (previous?.op || "lt") ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label>
    <label class="formlabel" data-threshold><span></span><input type="number" step="any" name="threshold"></label>`,
    "Apply",
    (fd) => {
      const binding = options.get(fd.get("metric")),
        op = fd.get("op");
      const rule = { id: previous ? ruleIdentity(v, previous) : crypto.randomUUID(), binding: structuredClone(binding), op };
      if (takesValue(op)) {
        const raw = fd.get("threshold");
        if (raw === null || !raw.trim() || !Number.isFinite(Number(raw)))
          throw Error("Enter a numeric threshold.");
        rule.value = Number(raw) / factor(binding);
      }
      const rules = (v.measureFilters ??= []);
      if (previous) rules[index] = rule;
      else rules.push(rule);
      apply();
    },
  );
  const form = document.querySelector("#dlgform");
  const row = form.querySelector("[data-threshold]");
  const { metric, op, threshold } = form.elements;
  function factor(binding) {
    return ["points", "percent"].includes(ruleFormat(binding)) ? 100 : 1;
  }
  function update() {
    const fmt = ruleFormat(options.get(metric.value));
    row.querySelector("span").textContent =
      fmt === "percent"
        ? "Threshold (%)"
        : fmt === "points"
          ? "Threshold (percentage points)"
          : "Threshold";
    row.hidden = !takesValue(op.value);
    threshold.disabled = row.hidden;
    threshold.required = !row.hidden;
  }
  update();
  if (previous?.value != null)
    threshold.value = Number(
      (previous.value * factor(previous.binding)).toPrecision(15),
    );
  metric.onchange = update;
  op.onchange = update;
}
