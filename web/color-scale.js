const stops = ["min", "center", "max"];
const labels = {min:"Minimum", center:"Center", max:"Maximum"};
const colors = {min:"#39765e", center:"#ffffff", max:"#bd563e"};
const validColor = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

export function initialScale(min, max) {
  const center = min < 0 && max > 0 ? 0 : min / 2 + max / 2;
  return {min, center, max, diverging:min < 0 && max > 0, colors:{...colors}};
}

export function scaleControls(scale, unit, factor) {
  const rows = stops.filter(stop => stop !== "center" || scale.diverging).map(stop => {
    const value = Number((scale[stop] * factor).toPrecision(14));
    const color = validColor(scale.colors?.[stop]) ? scale.colors[stop] : colors[stop];
    return `<div class="dimensions rule-colors"><label>${labels[stop]} value${unit}<input class="control" type="number" step="any" data-cell-setting="scale-${stop}" value="${value}"></label><label>${labels[stop]} color<input type="color" data-cell-setting="scale-color-${stop}" value="${color}"></label></div>`;
  }).join("");
  return `<label class="chart-option"><input type="checkbox" data-cell-setting="scale-diverging" ${scale.diverging?"checked":""}>Use a center color</label>` + rows +
    "<small>Limits stay fixed across filters and pages. Values outside the limits use the nearest endpoint color.</small>";
}

export function editScale(scale, setting, input, factor) {
  if (setting === "scale-diverging") {
    if (input.checked && !(scale.min < scale.center && scale.center < scale.max)) {
      const center = scale.min / 2 + scale.max / 2;
      if (!(scale.min < center && center < scale.max)) {
        input.checked = false;
        throw Error("Widen the scale limits to add a center value.");
      }
      scale.center = center;
    }
    scale.diverging = input.checked;
    return;
  }
  const stop = setting.split("-").at(-1);
  if (!stops.includes(stop)) return;
  if (setting.startsWith("scale-color-")) {
    if (validColor(input.value)) (scale.colors ??= {...colors})[stop] = input.value;
    return;
  }
  const value = input.valueAsNumber / factor, next = {...scale,[stop]:value};
  if (!Number.isFinite(value) || !(next.min < next.max) ||
      (next.diverging && !(next.min < next.center && next.center < next.max))) {
    input.value = String(scale[stop] * factor);
    throw Error("Enter increasing values for the color scale.");
  }
  scale[stop] = value;
}

export function scaleColor(scale, value) {
  if (!scale || !Number.isFinite(scale.min) || !Number.isFinite(scale.max) || !(scale.min < scale.max)) return null;
  const color = stop => validColor(scale.colors?.[stop]) ? scale.colors[stop] : colors[stop];
  if (value <= scale.min) return color("min");
  if (value >= scale.max) return color("max");
  const hasCenter = scale.diverging && scale.min < scale.center && scale.center < scale.max;
  const low = hasCenter && value >= scale.center ? "center" : "min";
  const high = hasCenter && value < scale.center ? "center" : "max";
  const a = scale[low], b = scale[high], span = b - a;
  const fraction = Number.isFinite(span) ? (value-a)/span : (value/2-a/2)/(b/2-a/2);
  const from = color(low), to = color(high);
  return "#" + [1,3,5].map(i => {
    const x = parseInt(from.slice(i,i+2),16), y = parseInt(to.slice(i,i+2),16);
    return Math.round(x + (y-x)*fraction).toString(16).padStart(2,"0");
  }).join("");
}
