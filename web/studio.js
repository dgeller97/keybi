import {imageBody,imageControls,imageFormat,uploadImage,viewImage} from "./report-images.js";
import {addNarrativeValue,narrativeBody,narrativeFormat} from "./narrative.js";
import {hasSparks,sparkControls,sparkCell,inspectSpark} from "./sparklines.js";
import {applyMerge,mergeDialog,mergeSummary} from "./merge-tables.js";
import {columnBounds} from "./filter-operators.js";
import { axisRoles, axisBindings, referenceAxis, axisMetricStyle, axisLabel } from "./axes.js";
import { icon, decorate } from "./icons.js";
import {authorHistory} from "./author-history.js";
import {arrangePane,arrangeVisuals,beginCanvasSelection,moveLayers} from "./arrange.js";
import {bindingSignature,copyVisuals,pasteVisuals} from "./visual-copy.js";
import {shapeFormat} from "./report-shapes.js";
import { scaleColor } from "./color-scale.js";
import { binLabel, canShowBinGaps, valueCaption } from "./numeric-bins.js";
import {slicerMode,syncable,syncPageSelections,syncSlicerDialog,hiddenSlicers,copySyncedSelection,snapshotSlicerFilters} from "./sync-slicers.js";
import { phoneEntries, phoneGeometry, tooltipCanvasSize, visualBounds } from "./page-layout.js";
import { findParameter, memberOf, membersOf, expandParameterWells, parameterBody, parameterControls, parameterDialog } from "./field-parameters.js";
import { transferPlan, applyTransfer, replaceDimension, restoreSelection, updateMatrix } from "./well-transfer.js";
import { reorderBindings, alignBookmark } from "./well-order.js";
import { boundDateHierarchy, planDateHierarchy } from "./date-hierarchy.js";
import {
  monthMetric,
  specializedTypes,
  types,
  roles,
  buildRoles,
  chartGroups,
  samePoint,
  selectableChart,
  supportsMultiples,
  legendField,
  selectionRows,
  chartMetrics,
  dateTrend,
  hasAxisHierarchy,
  axisFields,
  usesCalendarAxis,
  setCalendarAxis,
  compatible,
  comparisons,
} from "./visual-types.js";
import {
  objects,
  bookmarkState,
  restoreLegacyRankings,
  applyBookmark,
  objectControls,
  objectBody,
} from "./navigation.js";
import { thumbnail } from "./library.js";
import { matrixQueries, matrixBody, matrixLayoutControls } from "./matrix.js";
import {
  metricKey,
  cellRuleControls,
  editCellRule,
  cellAttributes,
  cellValue,
  thresholdColor,
} from "./cell-format.js";

let pendingImage, publishedLibrary=false;
const publishedReport=()=>report.id?.startsWith("p")===true;
let chartBody, tooltipSetup, dismissTooltip, measureFilterUI;
let bindingDrag;
let chosenRuleField;
let chosenColorPoint;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () => crypto.randomUUID(),
  eq = (a, b) => a?.t === b?.t && a?.c === b?.c;
const fresh = () => ({
  version: 1,
  title: "Untitled report",
  kind: "report",
  tables: [],
  links: [],
  measures: [],
  calculations: [],
  filters: [],
  pages: [{ id: uid(), name: "Page 1", visuals: [], filters: [] }],
  active: 0,
});
let report = fresh(),
  selected = null,
  mode = "report",
  tab = "Build",
  dirty = false,
  serial = 0,
  generation = 0,
  scale = 1,
  search = "",
  busy = false,
  toastTimer;
let results = new Map(),
  offsets = new Map(),
  closed = new Set();
let authorView;
let arranging;
let visualClipboard,commandClipboard;
const visualMime="application/x-folio-visual-selection";
const edits=authorHistory();
edits.reset(report,null);
let focusView;
let phonePage;
let lastTabPage;
const slicerSearches = new WeakMap();
// Keep an older query from painting choices for a newer string while the reader types.
const searchedQueries = new WeakMap();
function searchableSlicer(v) {
  if (!["dropdown","list"].includes(v.kind)) return false;
  const field=readerVisual(v).groups[0],column=field && lookup(field);
  return column && !column.numeric && !column.binSize;
}
function slicerSearchText(v) {
  const search=slicerSearches.get(v);
  return v.showSearch && search && eq(readerVisual(v).groups[0],search.field) ? search.text : "";
}
function slicerSearchBox(v) {
  return v.showSearch && !(v.kind==="dropdown" && v.multiSelect) && searchableSlicer(v)
    ? `<input class="control slicer-search" type="search" data-slicer-search aria-label="Search values" placeholder="Search values" value="${esc(slicerSearchText(v))}">` : "";
}
const pendingAuthorChanges = new Set();
async function trackAuthorChange(work) {
  pendingAuthorChanges.add(work);
  try { return await work; }
  finally { pendingAuthorChanges.delete(work); }
}
const names = {
  ...Object.fromEntries(
    Object.entries(types).map(([key, [name]]) => [key, name]),
  ),
  matrix: "Matrix",
  bar: "Bar chart",
  card: "Card",
  table: "Detail table",
  slicer: "Slicer",
  ...objects,
};
const accentOf = (v) => v.accent || report.theme?.dataColors?.[0] || "#43856b";
const page = () => report.pages[report.active],
  visual = () => page().visuals.find((v) => v.id === selected);
const fields = () =>
  report.tables.flatMap((t) => [
    ...t.columns.map((c, i) => ({ ...c, t: t.id, c: i, table: t.name })),
    ...report.calculations
      .filter((c) => c.field.t === t.id)
      .map((c) => ({ ...c.field, name: c.name, table: t.name, numeric: !["timeBin","memberGroups"].includes(c.op),grouped:c.op==="memberGroups",
        binSize:c.calendarMonths ? {months:c.calendarMonths} : c.timeBinMs ? {ms:c.timeBinMs,weekStart:c.weekStart} : c.binSize })),
  ]);
const lookup = (f) => fields().find((x) => eq(x, f)),
  ref = (f) => ({ t: f.t, c: f.c }),
  fkey = (f) => f.t + "." + f.c;
const decode = (k) => {
  const [t, c] = k.split(".");
  return { t, c: Number(c) };
};
const fieldname = (f) => lookup(f)?.name ?? "Missing field";
function valueSources() {
  return [...fields().map(f=>({key:fkey(f),name:f.name,label:f.table+" · "+f.name,numeric:f.numeric,binding:{field:ref(f)}})),
    ...report.measures.map(m=>({key:"@"+m.id,name:m.name,label:m.name,binding:{measure:m.id}}))];
}
function binWidths(groupFields) {
  return report.calculations.some(c => c.binSize || c.op === "timeBin") ? groupFields.map(f => lookup(f)?.binSize) : [];
}
function groupLabels(groupFields) {
  const widths = binWidths(groupFields);
  return (value,index=0) => widths[index]
    ? binLabel(value,widths[index]) : String(value ?? "(Blank)");
}
function memberLabel({field,value}) {
  const width = lookup(field)?.binSize;
  return width ? binLabel(value,width) : String(value ?? "(Blank)");
}
function filterCaption(filter) {
  return fieldname(filter.field) + " = " + memberLabel(filter);
}
const dimensionParameters = () => (report.parameters || []).filter(p => p.kind === "dimension");
const measuresAndParameters = () => [...report.measures,...(report.parameters || []).filter(p => p.kind !== "dimension")];
const dimensionField = p => ({...decode(memberOf(p)), parameter:p.id});
const readerVisual = (v, model = report) => expandParameterWells(v, model, buildRoles, decode);
const groupKey = f => f.parameter ? "@" + f.parameter : fkey(f);
const measure = (id) => {
  const p = findParameter(report,id);
  return report.measures.find(m => m.id === (p ? memberOf(p) : id));
};
const valname = (m) =>
  m.measure
    ? measure(m.member || m.measure)?.name
    : m.op === "sum"
      ? fieldname(m.field)
      : {
          median: "Median",
          p90: "P90",
          avg: "Average",
          count: "Count",
          distinctcount: "Distinct count",
          min: "Minimum",
          max: "Maximum",
        }[m.op] +
        " of " +
        fieldname(m.field);
function notify(text) {
  $("#toast").textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("#toast").textContent = ""), 4200);
}
function storageReplacer(tables) {
  const versions = new Map(
    tables.filter((t) => t.storageId).map((t) => [t.id, t.storageId]),
  );
  if (!versions.size) return;
  return function (key, value) {
    if (key === "tables" && Array.isArray(value))
      return value.map((id) => versions.get(id) || id);
    if (key === "t" && Number.isInteger(this.c))
      return versions.get(value) || value;
    return value;
  };
}
async function api(url, body, tables = report.tables) {
  const r = await fetch(
    url,
    body === undefined
      ? {}
      : body instanceof FormData || body instanceof Blob
        ? { method: "POST", body }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              body,
              ["/api/query", "/api/relationship"].includes(url)
                ? storageReplacer(tables)
                : undefined,
            ),
          },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error ?? r.statusText);
  return data;
}
function touch() {
  if (authorView) return;
  edits.record(report,selected);
  updateHistoryControls();
  dirty = true;
  serial++;
  $("#save-state").textContent = "Unsaved changes";
}
function updateHistoryControls() {
  $('[data-action="undo"]').disabled=!edits.canUndo;
  $('[data-action="redo"]').disabled=!edits.canRedo;
}
async function travelHistory(step) {
  if (authorView || mode==="home" || $("#dialog").open) return;
  const owner=report;
  while (pendingAuthorChanges.size) await Promise.all([...pendingAuthorChanges]);
  if (owner!==report || authorView || mode==="home" || $("#dialog").open) return;
  const restored=edits.restore(report,step);
  if (!restored) return;
  report=restored.report;dirty=restored.dirty;serial++;
  selected=page().visuals.some(v=>v.id===restored.selected) ? restored.selected : null;
  dismissTooltip?.();focusView=null;offsets.clear();results.clear();
  if (report.id) history.replaceState(null,"","#"+report.id+"/page/"+page().id);
  draw();await refresh();
}
function change() {
  syncPageSelections(report);
  touch();
  draw();
  refresh();
}
function selectedVisual(id) {
  arranging = null;
  selected = id;
  if (authorView) return;
  edits.select(id);
  clipboardControls();
  $$(".visual").forEach((el) =>
    el.classList.toggle("selected", el.dataset.id === id),
  );
  inspector();
}
function chooseLayoutVisuals(ids) {
  arranging = {page:page(),ids:new Set(ids)};
  selected = [...arranging.ids].at(-1) ?? null;
  edits.select(selected);
  clipboardControls();
  for (const el of $$("#paper .visual"))
    el.classList.toggle("selected",arranging.ids.has(el.dataset.id));
  document.body.classList.remove("hide-panes");
  inspector();
}
function toggleLayoutVisual(id) {
  const ids = new Set(arranging?.ids || (selected ? [selected] : []));
  if (!ids.delete(id)) ids.add(id);
  chooseLayoutVisuals(ids);
}
function layoutSelection() {
  return arranging?.ids || new Set(selected ? [selected] : []);
}
function clipboardControls() {
  const enabled=!authorView && mode==="report" && !focusView;
  $('[data-action="copy-visuals"]').disabled=!enabled || !layoutSelection().size;
  $('[data-action="paste-visuals"]').disabled=!enabled || !visualClipboard;
}
function rememberVisuals() {
  if (authorView || mode!=="report" || focusView || !layoutSelection().size) return;
  const snapshot=copyVisuals(page(),layoutSelection());
  if (!snapshot.visuals.length) return;
  visualClipboard={snapshot,token:uid(),signature:bindingSignature(snapshot,fields(),report.measures,report.parameters || [])};
  clipboardControls();
  notify(snapshot.visuals.length===1 ? "Visual copied" : snapshot.visuals.length+" visuals copied");
  return visualClipboard;
}
function pasteRememberedVisuals() {
  if (!visualClipboard) return;
  const {snapshot,signature}=visualClipboard;
  if (bindingSignature(snapshot,fields(),report.measures,report.parameters || [])!==signature)
    throw Error("The fields used by these visuals changed. Copy the visuals again to use the current model.");
  insertVisuals(snapshot);
}
function insertVisuals(snapshot) {
  if (!snapshot?.visuals.length || authorView || mode!=="report" || focusView) return;
  const copies=pasteVisuals(page(),snapshot,uid);
  if (copies.length>1) chooseLayoutVisuals(copies.map(v=>v.id));
  else { arranging=null;selected=copies[0].id; }
  change();
}
function paintPosition(v) {
  const element = document.querySelector('#paper [data-id="'+CSS.escape(v.id)+'"]');
  if (element) Object.assign(element.style,{left:v.x+"px",top:v.y+"px"});
}
function option(key, label, selected = false) {
  return `<option value="${esc(key)}"${selected ? " selected" : ""}>${esc(label)}</option>`;
}
function fieldOptions(list = fields()) {
  return list.map((f) => option(fkey(f), `${f.table} · ${f.name}`)).join("");
}
function btn(text, action, cls = "") {
  return `<button class="${cls}" data-action="${action}">${text}</button>`;
}
function head(text) {
  return `<div class="panehead">${text}</div>`;
}
function section(text, html) {
  return `<section class="section"><h3>${esc(text)}</h3>${html}</section>`;
}
function dialog(title, body, ok, callback) {
  const d = $("#dialog");
  if (d.open) d.close();
  $("#dialog-body").innerHTML =
    `<div class="dhead"><h2 id="dialog-title">${esc(title)}</h2><button data-action="dismiss" aria-label="Close">${icon("close")}</button></div><form id="dlgform">${body}<div class="err" role="alert"></div>${ok ? `<div class="dfoot">${btn("Cancel", "dismiss", "outline")}<button type="submit" class="primary">${esc(ok)}</button></div>` : ""}</form>`;
  $$("#dlgform button[data-action]").forEach((b) => (b.type = "button"));
  $("#dlgform").addEventListener("input",e=>{e.currentTarget.querySelector(".err[role=alert]").textContent="";});
  $("#dlgform").onsubmit = async (e) => {
    e.preventDefault();
    const button = e.submitter;
    if (button) button.disabled = true;
    try {
      await callback(new FormData(e.target));
      if (d.open && e.target === $("#dlgform")) d.close();
    } catch (err) {
      if (d.open && e.target === $("#dlgform")) $("#dlgform .err").textContent = err.message;
    } finally {
      if (button) button.disabled = false;
    }
  };
  d.showModal();
}
function selectInput(label, name, options) {
  return `<label class="formlabel" for="inp-${name}">${esc(label)}</label><select id="inp-${name}" name="${name}" required>${options}</select>`;
}
function textInput(label, name, value) {
  return `<label class="formlabel" for="inp-${name}">${esc(label)}</label><input id="inp-${name}" type="text" name="${name}" value="${esc(value)}" required maxlength="160">`;
}
function titleOf(v) {
  if (v.title) return v.title;
  if (v.kind==="narrative") return names.narrative;
  if (v.kind === "parameterSlicer") return findParameter(report,v.parameter)?.name || names.parameterSlicer;
  const value = v.metrics.length ? valname(v.metrics[0]) : "";
  const group = readerVisual(v).groups[v.level ?? 0];
  if (v.kind === "table") return "Detail table";
  if (v.kind === "slicer") return group ? fieldname(group) : "Slicer";
  if (value && group && v.kind === "bar")
    return `${value} by ${fieldname(group)}`;
  return value || names[v.kind];
}
function wantsPhoneLayout() {
  return mode === "report" && authorView && Array.isArray(page().phoneLayout) &&
    (authorView.layout === "phone" || (authorView.layout !== "desktop" && matchMedia("(max-width: 600px)").matches));
}
function supportsTitleMeasure(v) {
  return !objects[v.kind] && !["image","narrative","parameterSlicer"].includes(v.kind);
}
function headingText(v,part,data) {
  const binding=v[part+"Binding"], fallback=part==="title" ? titleOf(v) : v.subtitle || "";
  if (!binding || !supportsTitleMeasure(v)) return fallback;
  const heading=data.get(v.id)?.headings?.[part];
  if (heading?.measure!==binding.measure || heading.value==null || heading.value==="") return fallback;
  return display(heading.value,measure(binding.measure)?.format);
}
const displayTitle=(v,data=results)=>headingText(v,"title",data);
const displaySubtitle=(v,data=results)=>headingText(v,"subtitle",data);
function subtitleMarkup(v) {
  if ((!v.subtitle && !v.subtitleBinding) || !supportsTitleMeasure(v)) return "";
  const text=displaySubtitle(v);
  return '<div id="subtitle-'+esc(v.id)+'" class="vsubtitle" title="'+esc(text)+'" '+(text?"":"hidden")+'>'+esc(text)+'</div>';
}
function titleSourceControl(v) {
  if (!supportsTitleMeasure(v)) return "";
  const source=(part,label)=>{
    if (!report.measures.length) return "";
    const binding=v[part+"Binding"];
    const choices=report.measures.map(m=>option(m.id,m.name,m.id===binding?.measure));
    return '<label class="formlabel" for="'+part+'-source">'+label+' source</label><select id="'+part+'-source" class="control">'+
      option("","Entered "+part,!binding)+choices.join("")+'</select>';
  };
  const style=v.headingStyle||{};
  return source("title","Title")+'<details class="heading-format" '+(v.subtitle || v.subtitleBinding || v.headingStyle?'open':'')+'><summary>Subtitle and heading style</summary>'+
    '<label class="formlabel" for="vsubtitle">Visual subtitle</label><input class="control" maxlength="300" id="vsubtitle" value="'+esc(v.subtitle)+'">'+source("subtitle","Subtitle")+
    '<label class="formlabel" for="heading-size">Title size (px)</label><input class="control" type="number" min="10" max="36" id="heading-size" value="'+esc(style.size||15)+'">'+
    '<label class="formlabel" for="heading-align">Heading alignment</label><select class="control" id="heading-align">'+["left","center","right"].map(x=>option(x,x[0].toUpperCase()+x.slice(1),style.align===x)).join("")+'</select>'+
    '<label class="formlabel" for="heading-color">Heading color</label><input type="color" id="heading-color" value="'+esc(style.color||"#24372d")+'">'+
    (v.headingStyle?btn("Reset heading style","reset-heading-style","outline"):"")+'</details>';
}
function headingCss(v) {
  const s=v.headingStyle;
  if (!s) return "";
  return (Number.isFinite(s.size)?";--heading-size:"+Math.max(10,Math.min(36,s.size))+"px":"")+
    (/^#[0-9a-f]{6}$/i.test(s.color)?";--heading-color:"+s.color:"")+
    (["center","right","left"].includes(s.align)?";--heading-align:"+s.align:"");
}
function availableWidth(viewport,style) {
  return Math.max(1,viewport.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
}
function phoneWidth(width) { return Math.min(420,width); }
function layout() {
  if (mode !== "report") return;
  const viewport = $("#viewport"), style = getComputedStyle(viewport);
  const width = availableWidth(viewport,style);
  if (Boolean(!focusView && wantsPhoneLayout()) !== !!phonePage || (phonePage && phonePage.width !== phoneWidth(width))) {
    canvas();
    return;
  }
  const fixed = focusView ? {
    width: Math.max(1, width),
    height: Math.max(1, viewport.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)),
  } : phonePage || tooltipCanvasSize(page());
  const w = fixed?.width ?? 1000;
  scale = Math.min(fixed ? 1 : 1.6, Math.max(fixed ? 0.05 : 0.18, width / w));
  const h = fixed?.height ?? Math.max(610, ...page().visuals.map((v) => v.y + v.h + 15));
  Object.assign($("#paper").style, {
    width: w + "px",
    minHeight: fixed ? "0" : "",
    height: h + "px",
    transform: `scale(${scale})`,
  });
  Object.assign($("#paper-wrap").style, {
    width: w * scale + "px",
    height: h * scale + "px",
  });
  $("#zoom").textContent = focusView ? "Focus · 100%" : phonePage ? "Phone · 100%" : `Fit · ${Math.round(scale * 100)}%`;
  if (focusView && (focusView.w !== w || focusView.h !== h)) {
    Object.assign(focusView, {w,h});
    const body = $("#paper .in-focus .vbody");
    if (body) {
      const focused = focusedCategory();
      body.innerHTML = visualBody(focusView.visual);
      restoreCategoryFocus(focused);
    }
  }
}
function makeVisual(kind) {
  const spots = [
    [22, 22, 564, 267],
    [602, 22, 371, 184],
    [22, 306, 564, 268],
    [602, 224, 371, 230],
  ];
  const n = page().visuals.length;
  const [x, y, w, h] = spots[n % 4];
  const v = {
    id: uid(),
    kind,
    groups: [],
    metrics: [],
    filters: [],
    x,
    y: y + Math.floor(n / 4) * 590,
    w,
    h,
    format: "auto",
    accent: null,
    title: "",
    level: 0,
  };
  const fixed = tooltipCanvasSize(page());
  if (fixed) {
    v.w = Math.min(w,fixed.width-12);
    v.h = Math.min(h,fixed.height-12);
    v.x = Math.min(v.x,fixed.width-v.w);
    v.y = Math.min(v.y,fixed.height-v.h);
  }
  if (kind === "parameterSlicer" && report.parameters?.length) v.parameter = report.parameters[0].id;
  page().visuals.push(v);
  selected = v.id;
  mode = "report";
  tab = "Build";
  return v;
}
function defaultMetric(v, well, field, numeric = lookup(field)?.numeric) {
  const average = (v.kind === "map" && ["metrics","other"].includes(well)) ||
    (v.kind === "gantt" && well === "metrics");
  return {field, op:numeric ? (average ? "avg" : "sum") : "count"};
}
function addField(key, well) {
  let v = visual();
  if (!v) v = makeVisual("bar");
  if (v.kind === "parameterSlicer" && key.startsWith("@") && findParameter(report,key.slice(1))) {
    v.parameter = key.slice(1);
    change();
    return;
  }
  if (v.kind==="image" && !key.startsWith("@")) {
    v.groups=[decode(key)];change();return;
  }
  if (v.kind==="narrative") {
    if (v.metrics.length>=32) return notify("Use at most 32 values in a narrative.");
    const isMeasure=key.startsWith("@"), id=key.slice(1);
    if (isMeasure && !report.measures.some(m=>m.id===id)) return notify("Choose a column or measure.");
    const binding=isMeasure ? {measure:id} : defaultMetric(v,"metrics",decode(key));
    addNarrativeValue(v,binding,valname(binding));change();return;
  }
  if (objects[v.kind]) return notify("Configure this object in Build.");
  const parameter = key.startsWith("@") && findParameter(report,key.slice(1));
  const dimension = parameter?.kind === "dimension";
  const isMeasure = key.startsWith("@") && !dimension;
  const f = dimension ? dimensionField(parameter) : isMeasure ? null : decode(key);
  if (v.kind === "card" && !well)
    well = dimension || (!isMeasure && !lookup(f)?.numeric) ? "groups" : "metrics";
  if (types[v.kind] || (v.kind === "card" && well)) {
    const options = well ? buildRoles(v) : roles(v);
    const binding = well
      ? options.find((r) => r.key === well)
      : options
          .filter((r) => r.field === (dimension || (!isMeasure && !lookup(f)?.numeric)))
          .find((r) => !v[r.key]?.length) ||
        options.find((r) => r.field === (dimension || (!isMeasure && !lookup(f)?.numeric))) ||
        options[0];
    if (!binding || (binding.field && isMeasure))
      return notify("Choose a data column for this well.");
    if (dimension && !binding.field) return notify("Choose a grouping well for a column parameter.");
    const item = binding.field
      ? f
      : isMeasure
        ? { measure: key.slice(1) }
        : defaultMetric(v,binding.key,f);
    const previous = binding.multiple ? v[binding.key] || [] : [];
    if (previous.some(
      (x) => binding.field ? eq(x, item) : metricKey(x) === metricKey(item),
    )) {
      inspector();
      return;
    }
    v[binding.key] = [...previous, item];
    if (binding.key === "groups" && dateTrend(v.kind) && v.continuousDate && !v.level)
      setCalendarAxis(v, true);
    if (binding.key === "tooltipFields") {
      change();
      return;
    }
    v.selection = null;
    delete v.range;
    delete v.treePath;
    offsets.clear();
    change();
    return;
  }
  if (well === "columns") {
    if (isMeasure) return notify("Choose a column field.");
    v.columns ??= [];
    if (!v.columns.some((column) => eq(column, f))) v.columns.push(f);
    v.collapsed = {};
    v.selection = null;
    change();
    return;
  }
  const isGroup =
    well === "groups" ||
    (!well &&
      !isMeasure &&
      (v.kind === "slicer" ||
        (v.kind !== "card" &&
          (dimension || !lookup(f)?.numeric || (!v.groups.length && v.kind === "table")))));
  if (isGroup) {
    if (isMeasure || v.kind === "card")
      return notify("Choose a data column for this field well.");
    if (v.kind === "slicer") v.groups = [];
    if (!v.groups.some((g) => eq(g, f))) v.groups.push(f);
  } else {
    if (dimension) return notify("Choose a grouping well for a column parameter.");
    if (v.kind === "slicer")
      return notify("Choose a data column for the slicer.");
    const m = isMeasure
      ? { measure: key.slice(1) }
      : { field: f, op: lookup(f)?.numeric ? "sum" : "count" };
    if (!["matrix", "table"].includes(v.kind)) v.metrics = [];
    v.metrics.push(m);
  }
  v.selection = null;
  v.level = 0;
  v.trail = [];
  delete v.expandedLevels;
  offsets.delete(v.id);
  change();
}
function activeGroups(v) {
  if (types[v.kind]) return chartGroups(v);
  return v.kind === "bar" && v.groups.length
    ? axisFields(v)
    : v.groups;
}
function predicate(v) {
  return v.selection
    ? { field: v.selection.field, value: v.selection.value }
    : null;
}
function focusedCategory() {
  const button = document.activeElement;
  const attribute = button?.hasAttribute("data-axis-pick") ? "data-axis-pick" :
    button?.hasAttribute("data-legend-pick") ? "data-series-color" :
    button?.hasAttribute("data-card-pick") ? "data-card-pick" : "data-selection-key";
  const value = button?.getAttribute(attribute);
  if (!value) return null;
  const metric = button.dataset.metric;
  return `[data-id="${CSS.escape(button.closest(".visual").dataset.id)}"] [${attribute}="${CSS.escape(value)}"]${metric === undefined ? "" : `[data-metric="${CSS.escape(metric)}"]`}`;
}
function restoreCategoryFocus(selector) {
  if (selector && document.activeElement === document.body)
    $(selector)?.focus({preventScroll:true});
}
function selectPoint(v, point, additive) {
  const fields = point.map(f => f.field), values = point.map(f => f.value), key = JSON.stringify(values);
  const previous = selectionRows(v.selection,fields);
  const index = previous.findIndex(row => JSON.stringify(row) === key);
  let rows = [values];
  if (additive) rows = index < 0 ? [...previous,values] : previous.filter((_,i) => i !== index);
  else if (previous.length === 1 && index === 0) rows = [];
  setPointSelection(v,fields,rows);
}
function selectRectangle(id, rows, additive) {
  const v = page().visuals.find(item => item.id === id);
  if (!v) return;
  const fields = activeGroups(readerVisual(v));
  if (additive || v.multiSelect) {
    if (!rows.length) return;
    const members = new Map(selectionRows(v.selection,fields).map(row => [JSON.stringify(row),row]));
    for (const row of rows) {
      const key = JSON.stringify(row);
      if (!members.delete(key)) members.set(key,row);
    }
    rows = [...members.values()];
  }
  selected = id;
  setPointSelection(v,fields,rows);
  offsets.clear();
  change();
}
function setPointSelection(v, fields, rows) {
  if (!rows.length) { v.selection = null; return; }
  const tuple = rows.length > 1 && fields.length > 1 ? uid() : null;
  const filters = fields.map((field,i) => rows.length === 1 ? {field,value:rows[0][i]} :
    {field,value:rows.map(row => row[i]),...(tuple ? {op:"tuple",tuple} : {op:"in"})});
  const label = rows.length > 1 ? rows.length + (v.kind==="table" ? " rows selected" : " categories selected") :
    filters.map(filterCaption).join(" · ");
  v.selection = {...filters[0],filters,label};
}
function queryMetric(binding) {
  if (!binding.measure) return binding;
  const m = measure(binding.member || binding.measure);
  return m?.baseMeasure
    ? monthMetric(measure(m.baseMeasure), m.comparison)
    : m;
}
function metricsForVisual(v) {
  if (v.kind === "card") return [...v.metrics, ...(v.references || [])];
  return types[v.kind] ? chartMetrics(v) : v.metrics;
}
function rankIndex(v) {
  if (!v.rankMetric) return 0;
  const index = metricsForVisual(v).findIndex(m => formatBindingKey(m) === v.rankMetric);
  return Math.max(0, index);
}
function rankable(v) {
  return hasAxisHierarchy(v.kind) || ["pie","donut","funnel","waterfall"].includes(v.kind) ||
    (v.kind === "card" && v.groups?.length);
}
function rankingMeasureControl(v) {
  const bindings = metricsForVisual(readerVisual(v));
  const choices = new Map(bindings.map(m => [formatBindingKey(m), valname(m)]));
  const other = report.measures.filter(m => m.id === v.rankSource || !choices.has(metricKey({measure:m.id})));
  if (!bindings.length || (choices.size < 2 && !other.length)) return "";
  const displayed = [...choices].map(([key,name]) => option(key,name,key === v.rankMetric)).join("");
  const model = other.map(m => option("model:" + m.id,m.name,m.id === v.rankSource)).join("");
  const first = !choices.has(v.rankMetric) && !other.some(m => m.id === v.rankSource);
  return `<label class="formlabel" for="rank-measure">Rank by measure</label><select id="rank-measure" class="control">${option("","First displayed value",first)}<optgroup label="Displayed values">${displayed}</optgroup>${model ? `<optgroup label="Other report measures">${model}</optgroup>` : ""}</select>`;
}
function referenceCaption(binding) {
  const name = valname(binding);
  return binding.label ? binding.label + (binding.member ? " · " + name : "") : name;
}
const canHighlight = (v) =>
  [
    "clusteredBar",
    "clusteredColumn",
    "stackedBar",
    "stackedColumn",
    "percentBar",
    "percentColumn",
    "dot",
    "pie",
    "donut",
  ].includes(v.kind);
function highlights(source, target) {
  return (
    canHighlight(target) &&
    source.highlightTargets?.includes(target.id) &&
    !source.ignoreTargets?.includes(target.id)
  );
}
function columnCaption(v, well, index) {
  const item = v[well][index];
  const source = well === "metrics" ? valname(item) : fieldname(item);
  const key = item.measure || groupKey(item.field || item);
  const saved = v.headings?.[well]?.[item.sourceIndex ?? index];
  const custom = saved?.key === key ? saved.text : "";
  return { source, key, custom, text: custom && item.member ? custom + " · " + source : custom || source };
}
function tableColumnKeys(v) {
  const view = readerVisual(v);
  return [
    ...view.groups.map(f => "group:" + groupKey(f) + (f.member ? "/" + f.member : "")),
    ...view.metrics.map(m => m.member ? metricKey(m) + "/" + m.member : metricKey(m)),
  ];
}
function tableSorts(v, keys) {
  const saved = Array.isArray(v.tableSort)
    ? v.tableSort
    : v.tableSort
      ? [v.tableSort]
      : [];
  const seen = new Set();
  return saved.filter((s) => {
    if (
      !s ||
      !keys.includes(s.key) ||
      seen.has(s.key) ||
      !["asc", "desc"].includes(s.order)
    )
      return false;
    seen.add(s.key);
    return true;
  });
}
function emptyItemsAvailable(v, well) {
  if (!["groups", "columns"].includes(well)) return false;
  const fields = v.kind === "matrix" ? v[well] || [] : activeGroups(v);
  if (["matrix", "table", "card"].includes(v.kind)) return fields.length > 0;
  return well === "groups" &&
    (dateTrend(v.kind) || ["bar", "dot", "clusteredBar", "stackedBar",
      "percentBar", "clusteredColumn", "stackedColumn", "percentColumn"].includes(v.kind)) &&
    fields.length > 0 && fields.every((f) => f.t === fields[0].t);
}
function spec(v, includeHighlights = false, owner = page(), inherited = null) {
  const scoped = [
    ...(inherited ?? [
      ...report.filters,
      ...(report.drill?.target === owner.id ? report.drill.filters : []),
    ]),
    ...owner.filters,
    ...hiddenSlicers(report,owner).flatMap(source=>source.selection?.filters || (source.selection ? [predicate(source)] : [])),
    ...v.filters,
    ...(v.kind === "decomposition" ? v.treePath || [] : []),
    ...(v.trail ?? []),
  ];
  const filters = authorView ? scoped.filter(f=>!authorView.disabledFilters.has(f)) : scoped;
  const baseFilters = v.measureFilters?.length ? [...filters] : null;
  for (const other of owner.visuals) {
    if (
      other.id !== v.id &&
      other.selection &&
      !other.ignoreTargets?.includes(v.id) &&
      (includeHighlights || !highlights(other, v))
    ) {
      const picked = [...(other.trail || []), ...(other.selection.filters || [predicate(other)])];
      filters.push(...picked);
      if (baseFilters && !highlights(other, v)) baseFilters.push(...picked);
    }
  }
  const keys = v.kind === "table" && v.tableSort ? tableColumnKeys(v) : [];
  const [sorted, ...rest] = keys.length ? tableSorts(v, keys) : [];
  const metrics = metricsForVisual(v).map(queryMetric);
  const groups = activeGroups(v);
  const utcSortColumns = v.kind === "table" && sorted && v.utcSortFields?.length
    ? [sorted,...rest].map(s=>keys.indexOf(s.key)).filter(i=>groups[i] && v.utcSortFields.some(f=>eq(f,groups[i])))
    : [];
  const splitSeries=types[v.kind] && (v.legendFields?.length || v.smallMultiples?.length);
  const rankCutoff = groups.length && v.includeTies && v.top && ["asc","desc"].includes(v.order) && !splitSeries ? v.top : undefined;
  const showEmpty = (v.showEmpty && emptyItemsAvailable(v, "groups")) || undefined;
  return {
    groups, showEmpty, metrics, rankCutoff,
    utcSortColumns:utcSortColumns.length ? utcSortColumns : undefined,
    measureScope: v.measureFilters?.length ? {
      groups: v.kind === "matrix" && !groups.length ? v.columns || [] : groups,
      metrics, showEmpty: v.kind === "matrix" && !groups.length ? !!v.showEmptyColumns : showEmpty, filters: baseFilters,
      rules: v.measureFilters.map(({ binding, op, value }) => ({ metric: queryMetric(binding), op, value })),
    } : undefined,
    filters,
    order: sorted
      ? sorted.order
      : splitSeries
        ? undefined
        : v.order,
    sortColumn: sorted ? keys.indexOf(sorted.key) :
      v.rankMetric && !splitSeries && ["asc","desc"].includes(v.order) ? groups.length+rankIndex(v) : undefined,
    rankBy: v.rankSource && groups.length && !splitSeries && ["asc","desc"].includes(v.order) ? queryMetric({measure:v.rankSource}) : undefined,
    thenBy: rest.length
      ? rest.map((s) => ({
          column: keys.indexOf(s.key),
          descending: s.order === "desc",
        }))
      : undefined,
    limit:
      v.kind === "table"
        ? 25
        : (rankCutoff || splitSeries ? 500 : v.top) ||
          (types[v.kind] ? 500 : 100),
    offset: inherited ? 0 : offsets.get(v.id) || 0,
  };
}
function supportsPageTip(v) {
  return (
    ["bar", "table", "matrix"].includes(v.kind) || (v.kind === "card" && v.groups.length > 0) ||
    buildRoles(v).some((r) => r.key === "tooltipFields")
  );
}
function tooltipPage(v) {
  if (v.tooltips === false || v.tooltipPage === "fields") return;
  const pages = report.pages.filter((p) => p.tooltip && p !== page());
  if (!pages.length || !supportsPageTip(v)) return;
  v = readerVisual(v);
  const manual = pages.find((p) => p.id === v.tooltipPage);
  if (manual) return manual;
  const bound = new Set([
    ...activeGroups(v).map(fkey),
    ...(v.kind === "matrix" ? v.columns || [] : []).map(fkey),
    ...[
      ...metricsForVisual(v),
      ...(v.tooltipFields || []),
    ].map(m => m.measure ? "@" + (measure(m.member || m.measure)?.id || m.measure) : fkey(m.field)),
  ]);
  return pages.find((p) =>
    (p.tooltipMatches || [p.tooltipMatch]).some((k) => bound.has(k)),
  );
}
async function loadTooltip(mark, current) {
  const v = page().visuals.find(
    (item) => item.id === mark.closest(".visual")?.dataset.id,
  );
  const result = v && results.get(v.id);
  if (!result) return null;
  const row =
    result.rows?.[
      Number(mark.dataset.tipRow ?? mark.dataset.point ?? mark.dataset.item)
    ];
  const paths = mark.dataset.tipFilters ?? mark.dataset.matrixPick ?? mark.dataset.cardPick;
  if (!row && paths === undefined) return null;
  const point =
    paths !== undefined
      ? JSON.parse(paths)
      : activeGroups(readerVisual(v)).map((field, i) => ({ field, value: row[i] }));
  const target = tooltipPage(v);
  if (target) {
    const data = await queryPage(
      target,
      [...spec(v, true).filters, ...point],
      current,
    );
    if (!current() || !data) return null;
    return {
      page: target.name,
      size: tooltipCanvasSize(target),
      cacheable: ![...data.values()].some((r) => r.error),
      visuals: target.visuals.map((item) => ({
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        title: displayTitle(item,data),
        subtitle: displaySubtitle(item,data),
        headingCss: headingCss(item),
        kind: item.kind,
        accent: accentOf(item),
        html: visualBody(item, data, true),
      })),
    };
  }
  if (!v.tooltipFields?.length) return mark.hasAttribute("aria-description") ? {rows:[]} : null;
  const fields = readerVisual(v).tooltipFields;
  const formats = fields.map((m) => metricFormat({ format: "auto" }, m));
  const names = fields.map((m) => m.label || valname(m));
  const contexts = result.highlight ? [false, true] : [false];
  const queries = contexts.flatMap((selected) => {
    const filters = [...spec(v, selected).filters, ...point];
    // Each field is evaluated at its own grain. Adding a tooltip never changes the chart query.
    return fields.map((m) => ({
      groups: [],
      metrics: [queryMetric(m)],
      filters,
      limit: 1,
    }));
  });
  const data = await api("/api/query", { ...modelRequest(), visuals: queries });
  return {
    highlighted: contexts.length > 1,
    rows: fields.map((_, i) => ({
      name: names[i],
      values: contexts.map((_, j) => {
        const cell = data[j * fields.length + i];
        return cell.error ? cell.error : display(cell.rows[0]?.[0], formats[i]);
      }),
    })),
  };
}
const modelRequest = () => ({
  tables: report.tables.map((t) => t.id),
  links: report.links,
  calculations: report.calculations,
});
function ready(v) {
  if (v.kind==="narrative") return v.metrics.length>0;
  if (v.kind==="image") return v.groups.length===1;
  if (objects[v.kind]) return false;
  if (types[v.kind])
    return roles(v).every((r) => !r.required || v[r.key]?.length);
  if (v.kind === "matrix") return v.metrics.length > 0;
  return v.kind === "bar"
    ? v.groups.length && v.metrics.length
    : v.kind === "card"
      ? v.metrics.length
      : v.groups.length || v.metrics.length;
}
function categoryWidth(v) {
  return hasAxisHierarchy(v.kind) ? axisFields(v).length : 1;
}
function restrictCategories(query, rows, width) {
  if (width === 1) {
    query.filters.push({ field:query.groups[0], op:"in", value:[...new Set(rows.map(row => row[0]))] });
  } else {
    const members = new Map();
    for (const row of rows) {
      const tuple = row.slice(0,width);
      members.set(JSON.stringify(tuple),tuple);
    }
    query.visibleMembers = [...members.values()];
  }
}
async function queryPage(owner, inherited, current, onlyId) {
  const visuals = owner.visuals.filter(v=>(!onlyId || v.id===onlyId) && ready(v)).map(v => readerVisual(v));
  const hiddenSources = new Map();
  for (const v of visuals) {
    const card = v.kind === "card";
    const chart = supportsPointColors(v);
    const rulesets = card ? [v.calloutRules] : chart ? [v.cellRules] : ["table","matrix"].includes(v.kind) ? [v.cellIcons,v.cellRules] : [];
    if (!rulesets.some(Boolean)) continue;
    const metrics = metricsForVisual(v);
    const visible = new Set(metrics.map(formatBindingKey)), hidden = new Map();
    for (const binding of chart ? v.metrics : metrics) {
      for (const rules of rulesets) {
        const source = rules?.[chart ? formatBindingKey(binding) : metricKey(binding)]?.source;
        if (source && !visible.has(metricKey(source))) hidden.set(metricKey(source), source);
      }
    }
    if (hidden.size) hiddenSources.set(v.id,hidden);
  }
  const pageSpec = (v, highlight = false) => {
    const query = spec(v, highlight, owner, inherited), hidden = hiddenSources.get(v.id);
    if (v.kind==="image" || (v.kind==="dropdown" && v.multiSelect)) {query.limit=1;query.offset=0;}
    if (!inherited && v.showSearch && searchableSlicer(v)) {
      const text=slicerSearchText(owner.visuals.find(source=>source.id===v.id));
      if (text) {
        query.filters.push({field:v.groups[0],op:"contains",value:text});
        searchedQueries.set(query,text);
      }
    }
    if (hidden) query.formatMetrics = [...hidden.values()].map(queryMetric);
    return query;
  };
  const ranked = visuals.filter(
    (v) =>
      (v.legendFields?.length || v.smallMultiples?.length) &&
      (v.top || ["asc", "desc"].includes(v.order)) &&
      types[v.kind],
  );
  const ranking = new Map();
  if (ranked.length) {
    const queries = ranked.map((v) => {
      const base = pageSpec(v);
      const sortByValue = ["asc", "desc"].includes(v.order);
      const displayedRank = sortByValue && v.rankMetric && !v.rankSource;
      return {
        ...base,
        groups: base.groups.slice(0, categoryWidth(v)),
        formatMetrics: undefined,
        metrics: v.rankSource || displayedRank ? base.metrics : base.metrics.slice(0, 1),
        sortColumn: displayedRank ? categoryWidth(v) + rankIndex(v) : undefined,
        rankBy: v.rankSource && sortByValue ? queryMetric({measure:v.rankSource}) : undefined,
        order: v.order,
        rankCutoff: v.includeTies && sortByValue && v.top ? v.top : undefined,
        limit: v.includeTies && sortByValue ? 500 : v.top || 500,
      };
    });
    const sorted = await api("/api/query", {
      ...modelRequest(),
      visuals: queries,
    });
    if (!current()) return;
    ranked.forEach((v, i) => ranking.set(v.id, sorted[i]));
  }
  function chartQuery(v) {
    const base = pageSpec(v),
      rank = ranking.get(v.id);
    if (rank?.rows) restrictCategories(base, rank.rows, categoryWidth(v));
    return base;
  }
  function narrativeQueries(v) {
    const {filters}=pageSpec(v);
    return v.metrics.map(m=>({query:{groups:[],metrics:[queryMetric(m)],filters,limit:1}}));
  }
  const parts = visuals.flatMap((v) =>
    (v.kind === "narrative"
      ? narrativeQueries(v)
      : v.kind === "matrix"
      ? matrixQueries(v, pageSpec(v))
      : v.kind === "decomposition"
        ? [{ query: pageSpec(v) }, { query: { ...pageSpec(v), groups: [] } }]
        : [{ query: chartQuery(v) }]
    ).map((part) => ({ ...part, id: v.id })),
  );
  const loadCharts =
    visuals.some((v) => types[v.kind]) && !chartBody
      ? import("./charts.js").then((module) => {
          if (!chartBody) module.attachRectangleSelection(selectRectangle,() => dismissTooltip?.(),id => {
            if (page().visuals.find(v => v.id === id)?.selection) clearSelection(id);
          });
          chartBody = module.chartBody;
        })
      : undefined;
  const headingQueries=[];
  for (const v of visuals) {
    if ((!v.titleBinding && !v.subtitleBinding) || !supportsTitleMeasure(v)) continue;
    const {filters,measureScope}=spec(v,false,owner,inherited);
    for (const part of ["title","subtitle"]) {
      const binding=v[part+"Binding"],metric=binding && queryMetric(binding);
      if (metric) headingQueries.push({id:v.id,part,measure:binding.measure,query:{groups:[],metrics:[metric],filters,measureScope,limit:1}});
    }
  }
  const dataRequest = visuals.length
    ? api("/api/query", {
        ...modelRequest(),
        visuals: [...parts,...headingQueries].map(part=>part.query),
      })
    : [];
  const [data] = await Promise.all([dataRequest, loadCharts]);
  if (!current()) return;
  const headings=new Map();
  headingQueries.forEach(({id,part,measure},i)=>{
    const result=data[parts.length+i];
    if (!headings.has(id)) headings.set(id,{});
    headings.get(id)[part]={measure,value:result.rows?.[0]?.[0],error:result.error};
  });
  const pagedPanels=visuals.filter(v=>v.smallMultiples?.length && data[parts.findIndex(part=>part.id===v.id)]?.more);
  const queryOne=async request=>(await api("/api/query",{...modelRequest(),visuals:[request]}))[0];
  let panelPages;
  if(pagedPanels.length) {
    panelPages=await import("./panel-pages.js");
    await Promise.all(pagedPanels.map(async v=>{
      const i=parts.findIndex(part=>part.id===v.id),key="panels:"+v.id;
      data[i]=await panelPages.loadPanelPage(v,parts[i].query,inherited?0:offsets.get(key)||0,queryOne,current);
      if(current() && !inherited && data[i].pager)offsets.set(key,data[i].pager.offset);
    }));
    if(!current())return;
  }
  const overlays = new Map();
  const highlighted = visuals.filter((v) =>
    owner.visuals.some(
      (source) =>
        source.selection && source.id !== v.id && highlights(source, v),
    ),
  );
  if (highlighted.length) {
    const queries = highlighted.map((v) => {
      const base = data[parts.findIndex((part) => part.id === v.id)],
        query = pageSpec(v, true);
      if(base.pager) {
        query.filters.push(base.pager.filter);
        const rank=ranking.get(v.id);if(rank?.rows)restrictCategories(query,rank.rows,categoryWidth(v));
      }else restrictCategories(query, base.rows || [], categoryWidth(v));
      return { ...query, order: "category", sortColumn:undefined, rankBy:undefined, rankCutoff:undefined, formatMetrics:undefined, limit: 500, offset: 0 };
    });
    const selected = await api("/api/query", {
      ...modelRequest(),
      visuals: queries,
    });
    if (!current()) return;
    if(panelPages) {
      await Promise.all(highlighted.map(async(v,i)=>{
        if(v.smallMultiples?.length && selected[i].more)
          selected[i]=await panelPages.collectPanelRows(queries[i],queryOne,current,selected[i]);
      }));
      if(!current())return;
    }
    highlighted.forEach((v, i) => overlays.set(v.id, selected[i]));
  }
  const resolved = new Map(
    visuals.map((v) => {
      const segments = parts.flatMap((part, i) =>
        part.id === v.id ? [{ ...part, ...data[i] }] : [],
      );
      const result =
        v.kind === "narrative"
          ? {rows:[segments.map(s=>s.rows?.[0]?.[0]??null)],error:segments.find(s=>s.error)?.error}
          : v.kind === "matrix"
          ? {
              parts: segments,
              rows: segments.at(-1).rows,
              error: segments.find((s) => s.error)?.error,
            }
          : v.kind === "decomposition"
            ? {
                ...segments[0],
                parent: segments[1]?.rows?.[0]?.[0],
                error: segments.find((s) => s.error)?.error,
              }
            : segments[0];
      const overlay = overlays.get(v.id);
      if (overlay) {
        const n = activeGroups(v).length;
        if (overlay.error) result.error = overlay.error;
        else if (overlay.more)
          result.error = "Filter this chart to at most 500 highlighted groups.";
        else
          result.highlight = new Map(
            overlay.rows.map((row) => [
              JSON.stringify(row.slice(0, n)),
              row.slice(n),
            ]),
          );
      }
      const rank = ranking.get(v.id);
      if (headings.has(v.id)) {
        result.headings=headings.get(v.id);
        for (const [part,heading] of Object.entries(result.headings))
          if (heading.error) result.error="Visual "+part+": "+heading.error;
      }
      if (rank?.error) result.error = rank.error;
      if (v.includeTies && v.top && ["asc","desc"].includes(v.order) && (result.more || rank?.more))
        result.error = "More than 500 groups qualify. Filter this visual to display the complete ranking.";
      if (rank?.rows && result.rows) {
        const width = categoryWidth(v);
        const key = row => width === 1 ? row[0] : JSON.stringify(row.slice(0,width));
        const order = new Map(rank.rows.map((row, i) => [key(row), i]));
        result.rows.sort((a, b) => order.get(key(a)) - order.get(key(b)));
        result.more ||= Boolean(!v.top && rank.more);
      }
      return [v.id, { ...result, hiddenKeys: [...(hiddenSources.get(v.id)?.keys() || [])], shape: visualShape(v) }];
    }),
  );
  if (visuals.some(hasSparks)) {
    const {loadSparkSeries}=await import("./sparkline-data.js");
    await loadSparkSeries(visuals,resolved,{queryMetric,spec:pageSpec,current,
      fetchBatch:requests=>api("/api/query",{...modelRequest(),visuals:requests})});
  }
  return resolved;
}
async function refresh(onlyId) {
  dismissTooltip?.();
  const ticket = ++generation;
  if (mode !== "report") return;
  // A pending page refresh can also carry changed totals and interactions.
  if ($("#paper").dataset.pending==="true") onlyId=undefined;
  const visuals = page().visuals.filter(ready);
  $("#paper").dataset.pending = "true";
  try {
    if (visuals.some((v) => v.tooltipFields?.length || tooltipPage(v) || (supportsPointColors(v) && v.cellRules)))
      ensureTooltips();
    const [next] = await Promise.all([
      queryPage(page(), null, () => ticket === generation,onlyId),
      tooltipSetup,
    ]);
    if (ticket !== generation) return;
    if (onlyId) {for (const [id,result] of next) results.set(id,result);}
    else results = next;
    const focused = focusedCategory();
    let selectionCleared = false;
    for (const v of page().visuals) {
      if (onlyId && v.id!==onlyId) continue;
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (!body || v.kind === "parameterSlicer") continue;
      body.innerHTML = visualBody(v);
      if (v.subtitleBinding && supportsTitleMeasure(v)) {
        const subtitle=body.parentElement.querySelector(".vsubtitle");
        if (subtitle) {
          const text=displaySubtitle(v);
          subtitle.textContent=text; subtitle.title=text; subtitle.hidden=!text;
        }
      }
      if (v.titleBinding && supportsTitleMeasure(v)) {
        const article=body.closest(".visual"), title=displayTitle(v);
        article.querySelector(".vhead strong").textContent=title;
        article.setAttribute("aria-label",title);
        const choice=$("#focus-picker")?.querySelector('option[value="'+CSS.escape(v.id)+'"]');
        if (choice) choice.textContent=title;
      }
      if (v.selection?.checkPoint && !results.get(v.id)?.error) {
        delete v.selection.checkPoint;
        if (v.selection.facet) {
          const field=readerVisual(v).smallMultiples?.[0],members=field?selectionRows(v.selection,[field]):[];
          const available=new Set((results.get(v.id)?.rows||[]).map(r=>r[activeGroups(readerVisual(v)).length-1]));
          if (!members.length || !members.every(([value])=>available.has(value))) {v.selection=null;selectionCleared=true;}
        } else if (v.selection.legend) {
          const field = legendField(readerVisual(v));
          if (!field || !eq(field,v.selection.field)) {
            v.selection = null;
            selectionCleared = true;
          }
        } else if (selectableChart(v.kind)) {
          const axis = v.selection.axis;
          const fields = axis ? axisFields(readerVisual(v)).slice(0,v.selection.filters.length) : activeGroups(readerVisual(v));
          const members = selectionRows(v.selection,fields);
          const visible = axis ? new Set((results.get(v.id)?.rows || []).map(r => JSON.stringify(r.slice(0,fields.length)))) :
            new Set([...body.querySelectorAll('[data-selection-key][aria-pressed="true"]')].map(el => el.dataset.selectionKey));
          if (axis) for (const el of body.querySelectorAll(".empty-interval[data-axis-pick]")) visible.add(el.dataset.axisPick);
          const retained = members.filter(row => visible.has(JSON.stringify(row)));
          if (!retained.length || retained.length < members.length) {
            setPointSelection(v,fields,retained);
            if (v.selection && axis) v.selection.axis = true;
            selectionCleared = true;
          }
        } else if (!body.querySelector('[aria-pressed="true"]:is([data-point],[data-item],[data-card-pick])')) {
          v.selection = null;
          selectionCleared = true;
        }
      }
    }
    restoreCategoryFocus(focused);
    const colorPane = !authorView && $("#point-colors-pane");
    if (colorPane && visual()) colorPane.innerHTML = pointColorControls(visual());
    const seriesPane = !authorView && $("#series-colors-pane");
    if (seriesPane && visual()) seriesPane.innerHTML = seriesColorControls(visual());
    if (selectionCleared) {
      offsets.clear();
      touch();
      draw();
      await refresh();
    }
  } catch (e) {
    if (ticket === generation) {
      notify(e.message);
      for (const body of $$(onlyId ? `[data-id="${CSS.escape(onlyId)}"] .vbody` : ".vbody")) body.textContent = e.message;
    }
  } finally {
    if (ticket === generation) {
      $("#paper").dataset.pending = "false";
      $("#paper").dataset.generation = ticket;
    }
  }
}
function visualShape(v) {
  return JSON.stringify([
    v.kind,
    activeGroups(v),
    v.columns,
    v.metrics,
    v.other,
    v.size,
    ...(hasSparks(v)?[v.sparklines]:[]),
    ...(v.kind === "card" ? [(v.references || []).map(formatBindingKey)] : []),
    ...(report.parameters?.length ? [metricsForVisual(v).map(m => {
      const p = m.measure && findParameter(report,m.measure);
      return p ? memberOf(p) : null;
    })] : []),
  ]);
}
const formatters = new Map();
function display(value, format = "number") {
  if (value == null) return "—";
  if (typeof value !== "number") return String(value);
  if (format === "points") return display(value * 100, "decimal2") + " pp";
  const opts =
    format === "percent"
      ? { style: "percent", maximumFractionDigits: 2 }
      : format === "currency"
        ? { style: "currency", currency: "USD", maximumFractionDigits: 2 }
        : { maximumFractionDigits: format === "decimal2" ? 2 : 3 };
  if (!formatters.has(format))
    formatters.set(format, new Intl.NumberFormat("en-US", opts));
  return formatters.get(format).format(value);
}
function formatBindingKey(m) {
  const parameter = m.measure && findParameter(report,m.measure);
  return parameter ? "measure:" + (m.member || memberOf(parameter)) : metricKey(m);
}
function pointColorKey(v, groups, row, metric) {
  const members = (v.trail || []).map(({field,value}) => [field.t,field.c,value]);
  groups.forEach((f,i) => members.push([f.t,f.c,row[i]]));
  return JSON.stringify([formatBindingKey(metric),members]);
}
function supportsPointColors(v) {
  return v.kind === "combo" || (hasAxisHierarchy(v.kind) && !dateTrend(v.kind));
}
function ensureTooltips() {
  tooltipSetup ??= import("./tooltips.js").then(({attachTooltips}) => {
    dismissTooltip = attachTooltips(loadTooltip, () => !report.tables.some(t => t.source));
  });
}
function pointColorRenderer(v, res) {
  if (!(v.pointColors || v.cellRules) || !supportsPointColors(v)) return null;
  const groups = activeGroups(v), metrics = metricsForVisual(v);
  const keys = [...metrics.map(formatBindingKey), ...(res.hiddenKeys || [])];
  const rules = v.metrics.map((metric,i) => {
    const rule = v.cellRules?.[keys[i]];
    const source = rule?.source ? keys.indexOf(metricKey(rule.source)) : i;
    if (!rule) return {};
    const format = rule.source ? ruleFormat(rule.source) : metricFormat(v,metric);
    const label = valname(rule.source || metric);
    return {rule,source,format,label};
  });
  return (row,i) => {
    const {rule,source,format,label} = rules[i];
    const manual = v.pointColors?.[pointColorKey(v,groups,row,v.metrics[i])];
    const fallback = /^#[0-9a-f]{6}$/i.test(manual) ? manual : null;
    if (!rule) return {fill:fallback};
    const basis = source >= 0 ? row[groups.length+source] : null;
    const fallbackLabel = fallback ? "Individual point color" : "Series color";
    if (!Number.isFinite(basis))
      return {fill:fallback,description:label + " is blank. " + fallbackLabel + " applies."};
    const value = display(basis,format);
    if (rule.style === "gradient") {
      const fill = scaleColor(rule.scale,basis);
      if (!fill) return {fill:fallback};
      const {min,max,diverging,center} = rule.scale;
      const midpoint = diverging ? ", centered at " + display(center,format) : "";
      return {fill,description:label + " is " + value + " on a color scale from " + display(min,format) + " to " + display(max,format) + midpoint + "."};
    }
    const threshold = Number.isFinite(rule.threshold) ? rule.threshold : 0;
    const relation = basis < threshold ? "below" : basis > threshold ? "above" : "equal to";
    const cutoff = display(threshold,format);
    const detail = basis !== threshold && value === cutoff ? " before rounding" : "";
    const description = label + " is " + value + ", " + relation + " the " + cutoff + " threshold" + detail + ".";
    return {fill:thresholdColor(rule,basis) || fallback,description:description + (basis === threshold ? " " + fallbackLabel + " applies." : "")};
  };
}
function pointColorControls(v) {
  const view = readerVisual(v), groups = activeGroups(view), metrics = view.metrics;
  const rows = results.get(v.id)?.rows || [], choices = [];
  for (const mark of $$('[data-id="' + v.id + '"] .vbody [data-selection-key]')) {
    const metric = metrics[Number(mark.dataset.metric || 0)];
    const row = rows[Number(mark.dataset.point ?? mark.dataset.item)];
    if (!row || !metric) continue;
    const key = pointColorKey(view,groups,row,metric);
    const path = row.slice(0,groups.length).map(value => value === null ? "(Blank)" : value === "(Blank)" ? '"(Blank)"' : String(value));
    if (metrics.length > 1) path.push(valname(metric));
    const color = v.pointColors?.[key] || mark.dataset.baseFill || mark.querySelector("rect,circle")?.getAttribute("fill") || accentOf(v);
    choices.push({key,caption:path.join(" › "),color,rule:v.cellRules?.[formatBindingKey(metric)]});
  }
  if (!choices.length) return "";
  const current = choices.find(p => p.key === chosenColorPoint) || choices[0];
  const options = choices.map(p => option(p.key,p.caption,p === current)).join("");
  return section("Data point colors",
    `<label class="formlabel" for="color-point">Data point</label><select class="control" id="color-point">${options}</select>
    <label class="chart-option"><input type="color" id="point-fill" value="${esc(current.color)}">Point color</label>
    <button class="outline" data-reset-point-color ${v.pointColors?.[current.key] ? "" : "disabled"}>Reset point color</button>${current.rule ? "<small>A matching fill rule takes priority over this color.</small>" : ""}`);
}
function setPointColor(color) {
  const v = visual(), key = $("#color-point")?.value;
  if (!key || !v) return;
  chosenColorPoint = key;
  if (color) (v.pointColors ??= {})[key] = color;
  else if (v.pointColors) {
    delete v.pointColors[key];
    if (!Object.keys(v.pointColors).length) delete v.pointColors;
  }
  refreshFormatting();
  $(color ? "#point-fill" : "#color-point")?.focus({preventScroll:true});
}
function metricFormat(v, m) {
  const format = (v.bindingFormats && v.bindingFormats[formatBindingKey(m)]) || v.format || "auto";
  const calc = m.measure && measure(m.member || m.measure);
  if (format === "auto" && calc?.baseMeasure) {
    const fmt = measure(calc.baseMeasure)?.format;
    return calc.comparison.mode === "change" && fmt === "percent"
      ? "points"
      : fmt;
  }
  return format !== "auto"
    ? format
    : m.measure
      ? calc?.format
      : "number";
}
function sparkFormat(s,value) {
  return display(value,metricFormat({format:s.format||"auto"},s.binding));
}
function sparkRenderer(v,res,preview) {
  return (s,path,pivot,name)=>sparkCell(s,res.sparks?.get(s.id),path,pivot,name,
    {esc,accent:accentOf(v),format:sparkFormat,preview});
}
function cellRenderer(v, res) {
  const keys = [...v.metrics.map(formatBindingKey), ...(res.hiddenKeys || [])];
  const columns = v.metrics.map((binding, index) => {
    const key = metricKey(binding), icon = v.cellIcons?.[key]?.source, color = v.cellRules?.[key]?.source;
    return {
      colorIndex:color ? keys.indexOf(metricKey(color)) : index,
      iconIndex:icon ? keys.indexOf(metricKey(icon)) : index,
      iconLabel:icon && esc(valname(icon)), iconFormat:icon && ruleFormat(icon),
    };
  });
  return (values, offset, index, total, formatted) => {
    const column = columns[index], metric = v.metrics[index];
    const icon = column.iconIndex < 0 ? null : values?.[offset + column.iconIndex];
    const color = column.colorIndex < 0 ? null : values?.[offset + column.colorIndex];
    const label = column.iconLabel ? column.iconLabel + " " + esc(display(icon,column.iconFormat)) : "";
    return {
      attributes:cellAttributes(v,metric,values?.[offset+index],total,formatted,color),
      content:cellValue(v,metric,icon,total,formatted,label)
    };
  };
}

let cardTextContext;
const cardTextSize = v => Number.isFinite(v.calloutSize) ? Math.max(8,Math.min(160,v.calloutSize)) : 54;
const cardColumns = v => Number.isInteger(v.cardColumns) && v.cardColumns >= 1 && v.cardColumns <= 12 ? v.cardColumns : 0;
function cardMetricFormat(v, binding) {
  return metricFormat(v.metrics.includes(binding) ? v : {...v,format:"auto"},binding);
}
function cardBody(v, row, hiddenKeys) {
  const value = display(row?.[0],metricFormat(v,v.metrics[0]));
  cardTextContext ??= document.createElement("canvas").getContext("2d");
  cardTextContext.font = "500 100px Georgia, serif";
  // Use the same relative letter spacing as the visible callout.
  const em = Math.max(0.1, cardTextContext.measureText(value).width / 100 - [...value].length / 27 + 0.06);
  const keys = v.calloutRules ? [...metricsForVisual(v).map(formatBindingKey), ...(hiddenKeys || [])] : [];
  function colorStyle(binding, index) {
    const rule = v.calloutRules?.[metricKey(binding)];
    if (!rule) return "";
    const basis = rule.source ? keys.indexOf(metricKey(rule.source)) : index;
    const color = thresholdColor(rule,row?.[basis],true);
    return color ? "color:" + color + ";" : "";
  }
  const callout = `<div class="kpi" style="${colorStyle(v.metrics[0],0)}--card-em:${em};--card-max:${cardTextSize(v)}px">${esc(value)}</div>`;
  if (!v.references?.length) return callout;
  const labels = v.references.map((binding,i) => {
    const format = cardMetricFormat(v,binding), index = v.metrics.length+i;
    return `<div><dt>${esc(referenceCaption(binding))}</dt><dd style="${colorStyle(binding,index)}">${esc(display(row?.[index],format))}</dd></div>`;
  }).join("");
  return `<div class="card-callout">${callout}</div><dl class="card-references" aria-label="Reference labels">${labels}</dl>`;
}

function visualBody(v, data = results, preview = false) {
  const searchText=!preview && v.showSearch && searchableSlicer(v) ? slicerSearchText(v) : "";
  if (!preview) {
    if (focusView?.visual === v && focusView.w) v = {...v,w:focusView.w,h:focusView.h};
    else if (phonePage?.boxes.has(v)) v = {...v,...phonePage.boxes.get(v)};
  }
  if (v.kind === "parameterSlicer") return parameterBody(v,report,esc,dimensionChoices);
  if (v.kind === "narrative") {
    const result=data.get(v.id);
    return narrativeBody(v,result?.shape===visualShape(v)?result:undefined,{esc,
      format:(m,value)=>display(value,metricFormat({format:m.narrativeFormat||"auto"},m))});
  }
  if (v.kind === "image") {
    const field=v.groups[0], result=data.get(v.id);
    return imageBody(v,esc,{result:result?.shape===visualShape(v) ? result : undefined,fieldName:field && fieldname(field),
      caption:value=>valueCaption(value,lookup(field)),interactive:!!authorView && !preview,reading:!!authorView || preview});
  }
  if (objects[v.kind]) return objectBody(v, report, esc);
  v = readerVisual(v);
  const rulesKey = v.kind === "card" ? "calloutRules" : "cellRules";
  const rules = v[rulesKey];
  if (rules && Object.values(rules).some(r => r.thresholdFilter && r.style !== "gradient")) {
    const resolved = {...rules};
    for (const [key,rule] of Object.entries(rules)) {
      if (!rule.thresholdFilter || rule.style === "gradient") continue;
      const threshold = linkedFilterValue(rule.thresholdFilter);
      if (Number.isFinite(threshold)) resolved[key] = {...rule,threshold};
      else delete resolved[key];
    }
    v = {...v,[rulesKey]:resolved};
  }
  if (!ready(v))
    return `<div class="vempty">${v.kind === "bar" ? "Add a category and a value" : v.kind === "card" ? "Add a value or measure" : "Add a field"}<br>in the Build pane</div>`;
  const res = data.get(v.id);
  if (!res || res.shape !== visualShape(v))
    return '<div class="vempty">Loading…</div>';
  if (res.error) return `<div class="vempty err">${esc(res.error)}</div>`;
  if (!preview && searchText!==(searchedQueries.get(res.query) || ""))
    return '<div class="vempty">Searching…</div>';
  if (types[v.kind] && !chartBody)
    return '<div class="vempty">Loading chart…</div>';
  if (types[v.kind]) {
    const metrics = chartMetrics(v);
    const seriesParameter = !v.legendFields?.length && metrics[0]?.member &&
      metrics.every(m => m.measure === metrics[0].measure) && findParameter(report,metrics[0].measure);
    let body = chartBody(
      {
        ...v,
        referenceLines: v.referenceLines?.map(r => r.statistic ? {...r,axis:referenceAxis(v,r)} : r.source ? {...r,value:referenceValue(r)} : r),
        richTooltip: !preview && !!tooltipPage(v),
        showEmpty: v.showEmpty && emptyItemsAvailable(v, "groups"),
        accent: accentOf(v),
        palette: report.theme?.dataColors,
        binWidths: binWidths(chartGroups(v)),
        timeCalculations: v.showBinGaps ? report.calculations : undefined,
        numericTrend: dateTrend(v.kind) && usesCalendarAxis(v) && lookup(axisFields(v)[0])?.numeric,
        seriesOrder: seriesParameter ? seriesParameter.members.map(id => measure(id)?.name) : undefined,
      },
      res,
      {
        fieldname,
        valname,
        pointColor: pointColorRenderer(v,res),
        style: (m) => metricFormat(v, m),
        format: (m, n) => display(n, metricFormat(v, m)),
      },
    );
    const offset = preview ? 0 : offsets.get(v.id) || 0;
    if (searchText && !res.rows.length)
      body=(v.kind==="dropdown" ? body : "")+'<small role="status">No matching values</small>';
    if (["list", "dropdown"].includes(v.kind) && !(v.kind==="dropdown" && v.multiSelect) && (res.more || offset))
      body += `<div class="paging"><button data-page-delta="-1" ${offset ? "" : "disabled"}>Previous</button>${offset + 1}–${offset + res.rows.length}<button data-page-delta="1" ${res.more ? "" : "disabled"}>Next</button></div>`;
    return body;
  }
  if (v.kind === "matrix")
    return matrixBody(v, res, {
      esc,
      editable: !preview && !authorView,
      rowLabel: groupLabels(v.groups),
      colLabel: groupLabels(v.columns || []),
      renderCell: cellRenderer(v,res),
      renderSpark:sparkRenderer(v,res,preview),
      pageTip: !preview && !!tooltipPage(v),
      caption: (well, index) => columnCaption(v, well, index),
      format: (m, n) => display(n, metricFormat(v, m)),
    });
  const rows = res.rows,
    g = activeGroups(v);
  if (v.kind === "card" && !g.length)
    return cardBody(v,rows[0],res.hiddenKeys);
  const selectedRow = (row) =>
    v.selection && (g.length > 1
      ? g.every((field,i) => eq(field,v.selection.filters?.[i]?.field) && row[i] === v.selection.filters[i].value)
      : eq(v.selection.field, g[0]) && (Array.isArray(v.selection.value) ? v.selection.value.includes(row[0]) : v.selection.value === row[0]))
      ? " selected"
      : "";
  const label = groupLabels(g);
  let output = "";
  if (v.kind === "card" && rows.length) {
    const columns = cardColumns(v);
    const rich = !preview && !!tooltipPage(v);
    const picked = new Set(selectionRows(v.selection,g).map(row => JSON.stringify(row)));
    output = `<div class="category-cards"${columns ? ` style="--card-columns:${columns}"` : ""}>` + rows.map(row => {
      const filters = g.map((field,i) => ({field,value:row[i]}));
      const caption = esc(row.slice(0,g.length).map(label).join(" › "));
      const heading = preview ? `<span>${caption}</span>` :
        `<button class="category-pick" data-card-pick="${esc(JSON.stringify(filters))}" ${rich ? `data-rich-tip data-tip-label="${caption}"` : ""} aria-pressed="${picked.has(JSON.stringify(row.slice(0,g.length)))}">${caption}</button>`;
      return `<section class="category-card">${heading}<div class="category-values">${cardBody(v,row.slice(g.length),res.hiddenKeys)}</div></section>`;
    }).join("") + "</div>";
  }
  if (v.kind === "slicer")
    output = rows
      .map(
        (r, i) =>
          `<button class="slicebtn${selectedRow(r)}" data-item="${i}" aria-pressed="${!!selectedRow(r)}">${esc(label(r[0]))}</button>`,
      )
      .join("");
  if (v.kind === "bar") {
    const rich = !preview && !!tooltipPage(v);
    const pointColor = pointColorRenderer(v,res);
    const picked = new Set(selectionRows(v.selection,g).map(row => JSON.stringify(row)));
    const lo = Math.min(0, ...rows.map((r) => r[g.length] ?? 0)),
      hi = Math.max(0, ...rows.map((r) => r[g.length] ?? 0)),
      span = hi - lo || 1;
    output = rows
      .map((r, i) => {
        const value = r[g.length], caption = r.slice(0,g.length).map(label).join(" › ");
        const description = g.map((f,j) => fieldname(f) + " " + label(r[j],j)).join(", ");
        const key = JSON.stringify(r.slice(0,g.length)), selected = picked.has(key);
        const {fill,description:reason} = pointColor?.(r,0) || {};
        const tooltip = v.tooltips !== false && (rich || reason);
        const tipLabel = description + " · " + valname(v.metrics[0]) + ": " + display(value,metricFormat(v,v.metrics[0]));
        return `<button class="barrow${selected ? " selected" : ""}" ${g.length > 1 ? "data-point" : "data-item"}="${i}" data-selection-key="${esc(key)}" ${tooltip ? `data-rich-tip aria-label="${esc(tipLabel)}"` : ""} ${reason ? `aria-description="${esc(reason)}"` : ""} aria-pressed="${selected}"><span>${esc(caption)}</span><span class="bartrack"><i style="${fill ? `background:${fill};` : ""}left:${((Math.min(0, value ?? 0) - lo) / span) * 100}%;width:${(Math.abs(value ?? 0) / span) * 100}%"></i></span><b>${esc(display(value, metricFormat(v, v.metrics[0])))}</b></button>`;
      })
      .join("");
    output = '<div class="bars">' + output + "</div>";
  }
  if (v.kind === "table") {
    const cols = [
      ...g.map((_, i) => columnCaption(v, "groups", i).text),
      ...v.metrics.map((_, i) => columnCaption(v, "metrics", i).text),
    ];
    const keys = tableColumnKeys(v);
    const sorts = tableSorts(v, keys);
    const headers = cols
      .map((name, i) => {
        if (!g.length) return `<th>${esc(name)}</th>`;
        const priority = sorts.findIndex((s) => s.key === keys[i]);
        const state =
          sorts[priority]?.order === "asc" ? "ascending" : "descending";
        const rank =
          priority >= 0 && sorts.length > 1
            ? `<small aria-hidden="true">${priority + 1}</small>`
            : "";
        const description =
          priority >= 0 ? `Sort priority ${priority + 1}, ${state}. ` : "";
        return `<th scope="col"${priority === 0 ? ` aria-sort="${state}"` : ""}${priority >= 0 ? ` data-sort-direction="${state}"` : ""}><button class="sort-header" data-table-sort="${i}" aria-description="${description}Shift-click to add a sort column." title="Sort by ${esc(name)}. Shift-click to add to the current order.">${esc(name)}${rank}</button></th>`;
      })
      .join("");
    const renderCell = cellRenderer(v,res);
    const selectable=!preview && g.length>0;
    const picked=new Set(selectionRows(v.selection,g).map(tuple=>JSON.stringify(tuple)));
    const cell = (x, i, row, key) => {
      if (i < g.length) {
        const text=esc(label(x,i));
        if (i!==0 || !selectable) return `<td>${text}</td>`;
        const description=g.map((f,j)=>fieldname(f)+" "+label(row[j],j)).join(", ");
        return `<td><button class="detail-row-pick" data-detail-pick data-selection-key="${esc(key)}" aria-description="${esc(description)}" aria-pressed="${picked.has(key)}" title="Select row">${text}</button></td>`;
      }
      const m = v.metrics[i - g.length];
      const value = esc(display(x, metricFormat(v, m)));
      const {attributes,content} = renderCell(row, g.length, i-g.length, false, value);
      return `<td${attributes}>${content}</td>`;
    };
    const rich = !preview && !!tooltipPage(v);
    const trends=v.sparklines||[],trend=sparkRenderer(v,res,preview);
    const trendHeadings=trends.map(s=>'<th scope="col">'+esc(s.name)+'</th>').join("");
    output = `<table class="grid"><thead><tr>${headers}${trendHeadings}</tr></thead><tbody>${rows
      .map((r, i) => {
        const tip = rich
          ? ` tabindex="0" data-rich-tip data-tip-row="${i}" data-tip-label="${esc(g.map((f, j) => columnCaption(v, "groups", j).text + " " + label(r[j])).join(", ") || titleOf(v))}"`
          : "";
        const key=JSON.stringify(r.slice(0,g.length));
        const select=selectable?` data-detail-row="${esc(key)}"${picked.has(key)?' aria-current="true"':""}`:"";
        return `<tr${tip}${select}>${cols.map((_,j)=>cell(r[j],j,r,key)).join("")}${trends.map(s=>trend(s,r.slice(0,g.length),[],s.name)).join("")}</tr>`;
      })
      .join("")}</tbody></table>`;
  }
  if (!rows.length) output += '<div class="vempty">No matching rows</div>';
  const offset = preview ? 0 : offsets.get(v.id) || 0;
  if ((res.more || offset) && !(["bar","card"].includes(v.kind) && v.top))
    output += `<div class="paging"><button data-page-delta="-1" ${!offset ? "disabled" : ""}>Previous</button>${offset + 1}–${offset + rows.length}<button data-page-delta="1" ${!res.more ? "disabled" : ""}>Next</button></div>`;
  return output;
}
function visualFilterButton(v) {
  const count = [...(v.filters || []),...(v.measureFilters || [])].filter(rule => !authorView || readerAccess(v,rule)!=="hidden").length;
  if (!count) return "";
  const label = `View ${count} visual filter${count === 1 ? "" : "s"}`;
  return `<button data-view-filters title="${label}" aria-label="${label}">${icon("filter")}</button>`;
}
function visualDataButton(v) {
  if (!ready(v) || !(v.kind === "bar" || (types[v.kind] && !["list","dropdown","dateRange"].includes(v.kind)))) return "";
  return `<button data-action="show-chart-table" title="Show as a table (Alt+Shift+F11)" aria-label="Show as a table">${icon("table")}</button>`;
}
function drillControls(v) {
  v = readerVisual(v);
  if (!hasAxisHierarchy(v.kind) || v.groups.length < 2) return "";
  const level = v.level || 0;
  const path = [...(v.trail || []).map(memberLabel), ...axisFields(v).map(fieldname)].join(" › ");
  const next = v.groups[level + 1];
  const down = next ? "Drill into selection by " + fieldname(next) : "At deepest level";
  const across = next ? "Go to next level (" + fieldname(next) + ")" : "At deepest level";
  return `<span class="drill-path" title="${esc(path)}">${esc(path)}</span>
    <button data-drill="up" title="Drill up" aria-label="Drill up" ${level ? "" : "disabled"}>↑</button>
    <button data-drill="down" title="${esc(down)}" aria-label="${esc(down)}" ${v.selection && !v.selection.legend && !v.selection.facet && next ? "" : "disabled"}>${icon("drill")}</button>
    <button data-drill="next" title="${esc(across)}" aria-label="${esc(across)}" ${next ? "" : "disabled"}>${icon("nextLevel")}</button>
    <button data-drill="expand" title="Expand all down one level" aria-label="Expand all down one level" ${next ? "" : "disabled"}>${icon("expandLevel")}</button>`;
}
const canFocus = v => !objects[v.kind] || v.kind === "parameterSlicer";
function focusButton(v) {
  if (!canFocus(v)) return "";
  return focusView?.visual === v
    ? '<button data-action="leave-focus">← Back to report</button>'
    : `<button data-action="focus-visual" title="Focus mode" aria-label="Focus mode">${icon("focus")}</button>`;
}
function focusVisual(v, picker = false) {
  if (!v || !canFocus(v)) return;
  dismissTooltip?.();
  const viewport = $("#viewport");
  const {left = viewport.scrollLeft, top = viewport.scrollTop} = focusView || {};
  focusView = {visual:v,left,top,picker};
  selectedVisual(v.id);
  canvas();
  viewport.scrollTo(0,0);
  $('[data-action="leave-focus"]').focus({preventScroll:true});
}
function leaveFocus() {
  if (!focusView) return;
  const {visual,left,top,picker} = focusView;
  dismissTooltip?.();
  focusView = null;
  canvas();
  $("#viewport").scrollTo(left,top);
  const header = $(`[data-id="${visual.id}"]:not([hidden]) [data-action="focus-visual"]`);
  (picker || !header ? $("#focus-picker") : header).focus({preventScroll:true});
}
function selectionCaption(v) {
  const filters = v.selection.filters || [v.selection];
  if (filters.every(f => f.field && !f.op) && filters.some(f => lookup(f.field)?.binSize))
    return filters.map(filterCaption).join(" · ");
  return v.selection.label || filterCaption(v.selection);
}
function showOtherSelections(visuals) {
  const strip = $("#other-selections");
  strip.hidden = !visuals.length;
  strip.innerHTML = visuals.map(v=>{
    const selection = esc(selectionCaption(v)), title = esc(titleOf(v));
    return `<button data-clear="${esc(v.id)}" aria-label="Clear ${selection} from ${title}"><span>${title} · <b>${selection}</b></span> ×</button>`;
  }).join("");
}
function canvas() {
  if (focusView && (mode !== "report" || !page().visuals.includes(focusView.visual) || selected !== focusView.visual.id)) focusView = null;
  if (arranging && (authorView || mode !== "report" || arranging.page !== page() ||
      (selected && !arranging.ids.has(selected)))) arranging = null;
  $('[data-action="arrange"]').disabled = mode !== "report" || !page().visuals.length || !!focusView;
  clipboardControls();
  $("#viewport").classList.toggle("focus-mode",!!focusView);
  const viewport = $("#viewport");
  const phone = wantsPhoneLayout() ? phoneEntries(page()) : null;
  const otherSelections = focusView ? page().visuals.filter(v=>v !== focusView.visual && v.selection)
    : phone ? phone.filter(e=>e.hidden && e.visual.selection).map(e=>e.visual) : [];
  showOtherSelections([...otherSelections,...hiddenSlicers(report,page()).filter(v=>v.selection)]);
  viewport.classList.toggle("phone-page",!!phone && !focusView);
  phonePage = null;
  if (phone && !focusView) {
    const width = phoneWidth(availableWidth(viewport,getComputedStyle(viewport)));
    phonePage = phoneGeometry(phone,width);
  }
  if (authorView) {
    const choices = (phone ? phone.filter(e=>!e.hidden).map(e=>e.visual) : page().visuals).filter(canFocus);
    const picker = $("#focus-picker");
    picker.innerHTML = option("",focusView ? "Back to report" : "Focus visual…") + choices.map(v=>option(v.id,displayTitle(v),v===focusView?.visual)).join("");
    picker.disabled = !choices.length;
    $("#reader-layout").hidden = !!focusView || !Array.isArray(page().phoneLayout);
    $("#reader-layout").value = authorView.layout || "auto";
  }
  $("#paper-wrap").hidden = mode !== "report";
  $("#model").hidden = mode !== "model";
  if (mode === "model") {
    model();
    return;
  }
  const focused = focusedCategory(), scroll = [];
  for (const body of $$("#paper .vbody:has(> folio-matrix, > .category-cards)")) {
    if (body.scrollLeft || body.scrollTop)
      scroll.push([body.closest(".visual").dataset.id, body.scrollLeft, body.scrollTop]);
  }
  $("#paper").innerHTML = page().visuals.length
    ? (phonePage ? [...phonePage.boxes.keys(),...page().visuals.filter(v=>!phonePage.boxes.has(v))] : page().visuals).map(v=>{
            const {x,y,w,h} = phonePage?.boxes.get(v) || v;
            return `<article class="visual${(arranging ? arranging.ids.has(v.id) : v.id === selected) ? " selected" : ""}${v === focusView?.visual ? " in-focus" : ""}" ${phonePage && !phonePage.boxes.has(v) ? "hidden" : ""} ${["shape","image"].includes(v.kind) ? "data-shape-object" : ""} ${v.layoutLocked ? "data-position-locked" : ""} data-id="${v.id}" aria-label="${esc(displayTitle(v))}" ${v.subtitle || v.subtitleBinding ? `aria-describedby="subtitle-${esc(v.id)}"` : ""} ${v.headingStyle?.align ? "data-heading-align" : ""} style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--accent:${esc(accentOf(v))}${headingCss(v)}"><div class="vhead"><strong>${esc(displayTitle(v))}</strong><div class="spacer"></div>${canPasteSlicer(v) ? `<button data-slicer-paste title="Paste values" aria-label="Paste values">${icon("paste")}</button>` : ""}${focusButton(v)}${visualDataButton(v)}${visualFilterButton(v)}${v.selection && v.target ? `<button data-through="true" title="Drill through to records">View records</button>` : ""}${v.selection ? `<button data-clear="${v.id}" aria-label="Clear selection">${icon("clear")}</button>` : ""}${drillControls(v)}</div>${subtitleMarkup(v)}${slicerSearchBox(v)}<div class="vbody">${visualBody(v)}</div><div class="resize" title="Resize visual"></div></article>`;
          })
        .join("")
    : authorView ? '<div class="vempty">This page has no visuals.</div>' :
      `<div class="blank"><div class="empty-figure" aria-hidden="true"><i></i><i></i><i></i></div><h1>${report.tables.length ? "Build your first visual" : "Start with your data"}</h1><p>${report.tables.length ? "Choose a visual, then add fields from the Data pane." : "Import CSV, Parquet or Excel files to build a report on this canvas."}</p><div class="actions">${report.tables.length ? btn(icon("plusbox") + " Add visual", "add", "primary") : btn(icon("import") + " Import files", "import", "primary")}${report.tables.length ? "" : btn("Sample data", "samples", "outline")}</div></div>`;
  if (phonePage && !phonePage.boxes.size && page().visuals.length)
    $("#paper").insertAdjacentHTML("afterbegin",'<div class="vempty">Choose Desktop layout to see this page’s visuals.</div>');
  layout();
  for (const [id,left,top] of scroll)
    $(`[data-id="${id}"] .vbody`)?.scrollTo(left,top);
  restoreCategoryFocus(focused);
}
function openMerge(old) {
  const owner=report;
  let activeForm;
  const options={api,current:()=>report===owner && !authorView && (!activeForm || activeForm.closest("dialog[open]")),change,notify,offsets};
  const commit=(spec,name)=>trackAuthorChange(applyMerge(owner,spec,name,old,options));
  if (old) return commit(old.merge,old.name);
  mergeDialog(owner,{dialog,selectInput,textInput,option,esc,api,commit});
  activeForm=$("#dlgform");
}
function model() {
  $("#model").innerHTML =
    `${report.tables.some(t=>!t.source) ? btn("Merge tables","merge","outline model-merge") : ""}<div class="modelcards">${report.tables.map((t) => `<div class="modelcard"><h3>${icon("table")} ${esc(t.name)}</h3>${t.merge ? mergeSummary(report,t,esc) : !t.source ? `<button class="outline" data-revise="${esc(t.id)}">Update from file</button>${t.lastLoad ? `<small class="last-load">${esc(t.lastLoad.mode === "append" ? "Appended" : "Replaced")} · ${esc(t.lastLoad.file)} · ${t.rows.toLocaleString()} rows</small>` : ""}` : ""}${t.workbook ? `<small class="last-load">${esc(t.workbook.file)} · ${esc(t.workbook.sheet)}${t.workbook.table ? " · "+esc(t.workbook.table) : ""}</small>` : ""}${t.parquetTypes?.length ? `<details><summary>Parquet field types</summary>${t.columns.map((c, i) => `<p>${esc(c.name)} · ${esc(t.parquetTypes[i])} → ${c.numeric ? "Number" : "Text"}</p>`).join("")}</details>` : ""}${t.preparation ? `<details><summary>Applied steps</summary><small>${esc(t.preparation.source)}</small>${t.preparation.columns.map((c) => `<p>${esc(c.name)} · ${esc(c.kind)}${c.trim ? " · trim" : ""}${c.unpivot ? " · unpivot" : ""}</p>`).join("")}${t.preparation.unpivot ? `<p>Unpivot into ${esc(t.preparation.unpivot.attribute)} and ${esc(t.preparation.unpivot.value)}</p>` : ""}</details>` : ""}${t.columns.map((c) => `<p><span class="type">${c.numeric ? "Σ" : "Aa"}</span> ${esc(c.name)}</p>`).join("")}</div>`).join("") || btn("Import files", "import", "primary")}</div><div class="modelpanel"><h3>Relationships</h3>${report.links.map((l, i) => `<div class="relationrow">${esc(lookup(l.one).table + "." + fieldname(l.one))} <b>1 → *</b> ${esc(lookup(l.many).table + "." + fieldname(l.many))}<button data-unlink="${i}" title="Remove relationship">${icon("close")}</button></div>`).join("")}${btn(icon("plus") + " Relationship", "relationship", "outline")}</div>`;
}
function measureText(m) {
  if (m.baseMeasure)
    return (
      (m.comparison.mode === "change"
        ? "Change from previous month"
        : "Previous month") +
      " of [" +
      measure(m.baseMeasure).name +
      "] by " +
      lookup(m.comparison.month).table +
      "[" +
      fieldname(m.comparison.month) +
      "]"
    );
  if (m.expression) return m.expression;
  const name = (f) => lookup(f).table + "[" + fieldname(f) + "]";
  const a = "SUM(" + name(m.field) + ")",
    b = m.denominator ? "SUM(" + name(m.denominator) + ")" : "";
  return m.op === "difference"
    ? a + " − " + b
    : m.op === "variance_pct"
      ? "(" + a + " − " + b + ") / " + b
      : a + " / " + b;
}
function showCurrentPageTab() {
  const tabs = $("#pages"), active = tabs.querySelector('[aria-current="page"]');
  if (!active) return;
  const frame = tabs.getBoundingClientRect(), item = active.getBoundingClientRect();
  if (item.left < frame.left) tabs.scrollLeft += item.left-frame.left;
  else if (item.right > frame.right) tabs.scrollLeft += item.right-frame.right;
}
function draw() {
  updateHistoryControls();
  document.body.classList.remove("at-home");
  document.body.classList.toggle("reading",!!authorView);
  $(".reader-tools").hidden = !authorView;
  $('[data-action="toggle-reading"]').textContent = authorView ? "Edit report" : "Reading view";
  $('[data-action="toggle-reading"]').hidden = publishedReport();
  $("#report-name").disabled = !!authorView;
  if (authorView) {
    $('[data-action="reader-bookmarks"]').disabled = !report.bookmarks?.length;
    $('.reader-tools [data-action="reader-link"]').disabled = !report.id;
  }
  $("#home").hidden = true;
  document.title = report.title + " · KeyBI";
  $("#report-name").textContent = report.title;
  $("#save-state").textContent = publishedReport() ? "Published · revision "+report.revision : authorView ? "Reading view" : dirty
    ? "Unsaved changes"
    : report.id
      ? "Saved"
      : "New report";
  $("#view-name").textContent =
    mode === "model" ? "Model view" : report.question || "Report canvas";
  $("#view-info").innerHTML = mode === "model" ? `${report.links.length} relationships` :
    `<button data-action="page-settings" aria-label="Page settings for ${esc(page().name)}" title="Page settings">${esc(page().name)} <span aria-hidden="true">▾</span></button>`;
  if (authorView) $("#view-info").textContent = page().name;
  if (report.drill?.target === page().id)
    $("#view-info").innerHTML =
      `<button data-action="drill-back">← Back · ${esc(report.drill.label)}</button>`;
  $("#stats").textContent =
    `${report.tables.length} tables · ${page().visuals.length} visuals`;
  $$(".rail button").forEach((b) =>
    b.classList.toggle("active", b.dataset.action === mode),
  );
  $("#pages").innerHTML =
    report.pages
      .map(
        (p, i) => authorView && (p.hidden || p.tooltip) ? "" :
          `<button class="page ${i === report.active ? "active" : ""}" data-page="${i}"${i===report.active ? ' aria-current="page"' : ""}${p.hidden ? ' title="Hidden from navigators by default" aria-description="Hidden from navigators by default"' : ""}>${icon(p.hidden ? "hiddenPage" : "page")}${esc(p.name)}</button>`,
      )
      .join("") + (authorView ? "" : btn(icon("plus"), "page-add"));
  if (lastTabPage !== page()) {
    lastTabPage = page();
    showCurrentPageTab();
  }
  canvas();
  if (mode === "model" && report.measures.length)
    $("#model").insertAdjacentHTML(
      "beforeend",
      '<div class="modelpanel"><h3>Measures</h3>' +
        report.measures
          .map(
            (m) =>
              '<p class="formula"><button title="Edit measure" data-edit-measure="' +
              esc(m.id) +
              '">' +
              esc(m.name + " = " + measureText(m)) +
              "</button></p>",
          )
          .join("") +
        "</div>",
    );
  if (mode === "model" && report.parameters?.length)
    $("#model").insertAdjacentHTML("beforeend",'<div class="modelpanel"><h3>Field parameters</h3>' +
      report.parameters.map(p => `<p><button data-edit-parameter="${esc(p.id)}">${esc(p.name)}</button></p>`).join("") + "</div>");
  if (!authorView) {
    inspector();
    dataPane();
  }
}

function dataPane() {
  const value = search.toLowerCase();
  const tree = report.tables
    .map((t) => {
      const matches = fields().filter(
        (f) =>
          f.t === t.id &&
          (!value ||
            f.name.toLowerCase().includes(value) ||
            t.name.toLowerCase().includes(value)),
      );
      if (!matches.length) return "";
      return `<details class="tree" data-tree="${t.id}" ${closed.has(t.id) && !value ? "" : "open"}><summary>${icon("table")}${esc(t.name)}<small>${t.source ? "Live" : t.rows.toLocaleString()}</small></summary>${matches.map((f) => `<button class="field" draggable="true" data-field="${fkey(f)}" title="${esc(t.name + "." + f.name)}"><span class="type">${f.numeric ? "Σ" : "Aa"}</span>${esc(f.name)}</button>`).join("")}</details>`;
    })
    .join("");
  const measures = report.measures.filter((m) =>
    m.name.toLowerCase().includes(value),
  );
  const parameters = (report.parameters || []).filter(p => p.name.toLowerCase().includes(value));
  $("#data").innerHTML =
    head("Data") +
    (report.tables.length
      ? `<input class="search" aria-label="Find a field" placeholder="Find a field" value="${esc(search)}">${tree}${measures.length ? `<details class="tree" open><summary>${icon("measure")}Measures</summary>${measures.map((m) => `<button class="field" draggable="true" data-field="@${m.id}"><span class="type">ƒ</span>${esc(m.name)}</button>`).join("")}</details>` : ""}`
      : `<div class="data-empty">${icon("database")}<p class="hint">Imported tables and measures appear here.</p>${btn("Get data", "import", "outline")}</div>`);
  if (parameters.length) $("#data").insertAdjacentHTML("beforeend",
    `<details class="tree" open><summary>${icon("parameterSlicer")}Field parameters</summary>${parameters.map(p =>
      `<button class="field" draggable="true" data-field="@${esc(p.id)}" title="${esc(p.name)}">${icon("parameterSlicer")}${esc(p.name)}</button>`).join("")}</details>`);
}
function kinds() {
  return `<div class="kinds">${Object.entries(names)
    .map(
      ([k, n]) =>
        `<button class="kind ${visual()?.kind === k ? "active" : ""}" data-kind="${k}" title="${n}" aria-label="${n}">${icon(k)}</button>`,
    )
    .join("")}</div>`;
}
function well(label, which, v) {
  const list = v[which] || [];
  const group =
    buildRoles(v).find((r) => r.key === which)?.field ?? which !== "metrics";
  function transferButton(item, i) {
    if (!buildRoles(v).some(r => transferPlan(v,which,i,r.key,defaultMetric))) return "";
    const label = "Move " + esc(group ? fieldname(item) : valname(item)) + " to another well";
    return '<button class="field-move" data-transfer-field="' + i + '" aria-label="' + label + '" title="' + label + '">⇄</button>';
  }
  const movable = list.length > 1;
  function moveButtons(item, i) {
    if (!movable) return "";
    const name = esc(group ? fieldname(item) : valname(item));
    return [-1,1].map(step => {
      const label = "Move " + name + (step < 0 ? " up" : " down");
      return `<button class="field-move" data-move-field="${step}" aria-label="${label}" title="${label}" ${i + step < 0 || i + step >= list.length ? "disabled" : ""}>${step < 0 ? "↑" : "↓"}</button>`;
    }).join("");
  }
  function boundLabel(item, i) {
    const name = esc(group ? findParameter(report,item.parameter)?.name || fieldname(item) : findParameter(report,item.measure)?.name || valname(item));
    const action = `data-replace-field="${i}" aria-label="Replace ${name}" title="Replace ${name}"`;
    const replaceButton = `<button class="field-move" ${action}>▾</button>`;
    if (which === "tooltipFields")
      return `<input class="tooltip-field-label" aria-label="Tooltip label for ${name}" data-tip-label="${i}" value="${esc(item.label || "")}" placeholder="${name}">${replaceButton}`;
    if (which === "references")
      return `<input class="tooltip-field-label" aria-label="Reference caption for ${name}" data-reference-caption="${i}" value="${esc(item.label || "")}" placeholder="${name}">${replaceButton}`;
    if (
      ["table", "matrix"].includes(v.kind) &&
      ["groups", "metrics", "columns"].includes(which)
    ) {
      const { source, custom } = columnCaption(v, which, i);
      return `<input class="tooltip-field-label" aria-label="Heading for ${esc(source)}" title="Rename ${esc(source)} for this visual" data-heading="${which}:${i}" value="${esc(custom)}" placeholder="${esc(source)}">${replaceButton}`;
    }
    return `<button class="bound-name" ${action}><span>${name}</span>▾</button>`;
  }
  const emptyOption = which === "columns" ? "showEmptyColumns" : "showEmpty";
  const axis = v.kind === "matrix" ? (which === "groups" ? " (rows)" : " (columns)") : "";
  const empty = emptyItemsAvailable(v, which)
    ? `<label class="chart-option"><input type="checkbox" data-opt="${emptyOption}" ${v[emptyOption] ? "checked" : ""}>Show items with no data${axis}</label>`
    : "";
return `<label class="formlabel">${label}</label><div class="fieldwell" data-well="${which}">${list.map((item, i) => `<div class="wellrow" draggable="true" data-bound-index="${i}">${boundLabel(item, i)}${!group && !item.measure ? `<select aria-label="Aggregation" data-agg="${i}" data-agg-well="${which}">${(lookup(item.field)?.numeric ? ["sum", "avg", "count", "min", "max", "median", "p90"] : ["count"]).map((a) => `<option ${a === item.op ? "selected" : ""}>${a}</option>`).join("")}</select>` : ""}${moveButtons(item, i)}${transferButton(item,i)}<button aria-label="Remove field" data-remove-field="${which}:${i}">×</button></div>`).join("")}<select aria-label="${label}" data-pick="${which}"><option value="">+ Add field</option>${fieldOptions()}${(group ? dimensionParameters() : measuresAndParameters()).map((m) => option("@" + m.id, m.name)).join("")}</select>${empty}</div>`;
}
function moveField(v, well, from, to) {
  if (!reorderBindings(v,well,from,to,fieldname)) return;
  if (v.kind === "card" && well === "groups") restoreSelection(v,readerVisual(v).groups,fieldname);
  if (well === "tooltipFields") {
    dismissTooltip?.();
    touch();
    inspector();
  } else {
    offsets.clear();
    change();
  }
  const row = $(`[data-well="${well}"] [data-bound-index="${to}"]`);
  if (row) {
    const step = to > from ? 1 : -1;
    (row.querySelector(`[data-move-field="${step}"]:enabled`) || row.querySelector("[data-move-field]:enabled"))?.focus();
  }
}
function bindingsChanged(v) {
  if (!ready(v)) v.selection = null;
  if (["table","matrix"].includes(v.kind)) {
    const keys = new Set(v.metrics.map(metricKey));
    for (const rules of [v.cellRules,v.cellBars,v.cellIcons])
      for (const key of Object.keys(rules || {})) if (!keys.has(key)) delete rules[key];
    if (v.tableSort) v.tableSort = tableSorts(v,tableColumnKeys(v));
  }
  offsets.clear();
  change();
}
function transferField(v, plan, position) {
  applyTransfer(v,plan,position,fieldname);
  bindingsChanged(v);
}
function nextBinding(v, role, prior, column, measureId) {
  if (measureId) return role.field ? null : {measure:measureId};
  if (!column) return null;
  const field = ref(column);
  if (role.field) return field;
  if (column.numeric && prior.op) return {field,op:prior.op};
  return defaultMetric(v,role.key,field,column.numeric);
}
function bindingKey(role, item) {
  return role.field ? "group:" + groupKey(item) : metricKey(item);
}
function replaceField(v, well, index, key, selectedGroup) {
  const role = buildRoles(v).find(r => r.key === well), prior = v[well]?.[index];
  if (!role || !prior) return;
  const named = key.startsWith("@");
  const param = named && findParameter(report,key.slice(1));
  const next = param?.kind === "dimension" ? role.field && dimensionField(param)
    : nextBinding(v,role,prior,named ? null : lookup(decode(key)),named && measure(key.slice(1)) && key.slice(1));
  if (!next) return notify("Choose a compatible field for this well.");
  const previousKey = bindingKey(role,prior), nextKey = bindingKey(role,next);
  if (previousKey === nextKey) return;
  if (v[well].some(item => bindingKey(role,item) === nextKey))
    return notify("That field is already in this well.");
  if (v.kind === "table" && v.tableSort)
    v.tableSort = tableSorts(v,tableColumnKeys(v)).map(s => s.key === previousKey ? {...s,key:nextKey} : s);
  if (["metrics","other","references"].includes(well) && v.rankMetric === formatBindingKey(prior)) v.rankMetric = formatBindingKey(next);
  if (role.field) replaceDimension(v,well,index,prior,next);
  else v[well][index] = next;
  if (selectedGroup) setPointSelection(v,[next],[[selectedGroup]]);
  // A new aggregate can rank a selected member out of the chart, or turn
  // every value for its point blank. Check the rendered marks before saving.
  if (well !== "tooltipFields" && v.selection && hasAxisHierarchy(v.kind)) v.selection.checkPoint = true;
  if (v.headings?.[well]) v.headings[well][index] = null;
  if (well === "tooltipFields") {
    dismissTooltip?.();
    touch();
    inspector();
  } else bindingsChanged(v);
}
function changeDateAxis(v,index,count,replacements) {
  const old=v.groups, current=old[v.level || 0];
  const keep=f=>f.parameter || !replacements.some(r=>eq(f,r));
  const before=old.slice(0,index).filter(keep), after=old.slice(index+count).filter(keep);
  v.groups=[...before,...replacements,...after];
  if (v.headings?.groups) v.headings.groups=v.groups.map(f=>v.headings.groups[old.indexOf(f)] ?? null);
  const position=v.groups.indexOf(current);
  v.level=position<0 ? before.length : position;
  // Retain drill filters whose ancestors are still above the visible level.
  const ancestors=v.groups.slice(0,v.level);
  v.trail=(v.trail || []).filter(p=>ancestors.some(f=>eq(f,p.field)));
  delete v.expandedLevels;
  if (v.continuousDate && !v.calendarAxes) {
    v.calendarAxes=[old[0]];
    delete v.continuousDate;
  }
  restoreSelection(v,activeGroups(readerVisual(v)),fieldname);
  bindingsChanged(v);
}
async function validateTimeSource(calculations,field) {
  const model=modelRequest();
  const [check]=await api("/api/query",{...model,calculations:[...model.calculations,...calculations],
    visuals:[{groups:[],metrics:[{field,op:"distinctcount"}],filters:[],limit:1}]});
  if (check.error) throw Error("Check the source for invalid ISO dates or timestamps. "+check.error);
}
function chooseReplacement(v, well, index) {
  const role = buildRoles(v).find(r => r.key === well), prior = v[well][index];
  const used = new Set(v[well].map(item => bindingKey(role,item)));
  const columns = fields().filter(column => !used.has(bindingKey(role,nextBinding(v,role,prior,column))));
  const measures = role.field ? dimensionParameters().filter(p => !used.has(bindingKey(role,dimensionField(p))))
    : measuresAndParameters().filter(m => !used.has(metricKey({measure:m.id})));
  const options = fieldOptions(columns) + measures.map(m => option("@"+m.id,m.name)).join("");
  const column = role.field && lookup(prior);
  const canBin = column && !prior.parameter && !column.binSize && !column.grouped;
  const canGroup = column && !prior.parameter && !column.numeric && !column.binSize;
  const hierarchyAxis=well==="groups" && hasAxisHierarchy(v.kind) && column && !prior.parameter;
  const span=hierarchyAxis && boundDateHierarchy(v.groups,index,report.calculations);
  const offerHierarchy=hierarchyAxis && canBin && !column.numeric;
  const canSpark=well==="metrics" && ["table","matrix"].includes(v.kind) && (v.sparklines?.length||0)<5;
  if (!options && !canBin && !canGroup && !span && !canSpark) return notify("This well already contains all compatible fields.");
  const name = role.field ? fieldname(prior) : valname(prior);
  dialog("Replace " + name, (canBin ? btn(column.numeric ? "Create numeric bins" : "Create time bins","bin-bound-field","outline") : "") +
    (canGroup ? btn(column.grouped ? "Edit named groups" : "Create named groups","group-bound-field","outline") : "")+
    (canSpark?'<button type="button" class="outline" data-spark-edit="" data-spark-source="'+index+'">Add sparkline</button>':"")+
    (offerHierarchy || span ? btn(span ? "Use date column" : "Use date hierarchy","toggle-date-hierarchy","outline") : "") +
    selectInput("Replacement field","replacement", '<option value="">Choose a field</option>'+options), "Replace", fd => {
    replaceField(v,well,index,fd.get("replacement"));
    requestAnimationFrame(() => $(`[data-well="${well}"] [data-replace-field="${index}"]`)?.focus());
  });
  if (canBin) $('#dlgform [data-action="bin-bound-field"]').onclick = () =>
    binDialog(prior, field => replaceField(v,well,index,fkey(field)),!column.numeric);
  if (canGroup) $('#dlgform [data-action="group-bound-field"]').onclick = () =>
    openMemberGroups(prior,field=>replaceField(v,well,index,fkey(field)));
  const toggle=$('#dlgform [data-action="toggle-date-hierarchy"]');
  if (toggle) toggle.onclick=async()=>{
    const form=$("#dlgform");
    toggle.disabled=true;
    try {
      if (span) changeDateAxis(v,span.start,4,[span.source]);
      else {
        const plan=planDateHierarchy(column,fields().filter(f=>f.t===column.t),report.calculations);
        await validateTimeSource(plan.additions,plan.fields[0]);
        if (!$("#dialog").open || form!==$("#dlgform")) return;
        report.calculations.push(...plan.additions);
        changeDateAxis(v,index,1,plan.fields);
      }
      $("#dialog").close();
    } catch (err) {
      if (form===$("#dlgform")) form.querySelector(".err").textContent=err.message;
    } finally { toggle.disabled=false; }
  };
}
function chooseFieldDestination(v, from, index) {
  const source = buildRoles(v).find(r => r.key === from);
  const name = source.field ? fieldname(v[from][index]) : valname(v[from][index]);
  const options = buildRoles(v).flatMap(role => {
    const plan = transferPlan(v,from,index,role.key,defaultMetric);
    if (!plan) return [];
    const other = plan.outgoing && v[role.key][0];
    const swap = other ? " (swap with " + (role.field ? fieldname(other) : valname(other)) + ")" : "";
    return [option(role.key,role.label + swap)];
  });
  if (options.length) dialog("Move " + name,selectInput("Destination well","destination",options.join("")),"Move",fd => {
    const plan = transferPlan(v,from,index,fd.get("destination"),defaultMetric);
    if (plan) {
      transferField(v,plan);
      const row = v[plan.to].indexOf(plan.incoming);
      requestAnimationFrame(() => {
        const destination = $(`[data-well="${plan.to}"] [data-bound-index="${row}"]`);
        (destination?.querySelector("[data-transfer-field]") || destination?.querySelector("button:enabled"))?.focus();
      });
    }
  });
}
function filterOwner(scope) {
  return scope === "report" ? report : scope === "page" ? page() : visual();
}
function readerRuleKey(owner,rule) {
  if (rule.binding) return ruleIdentity(owner,rule);
  if (rule.id) return rule.id;
  return "column:"+fkey(rule.field)+":"+owner.filters.filter(f=>eq(f.field,rule.field)).indexOf(rule);
}
function readerAccess(owner,rule) {
  return owner.readerAccess?.[readerRuleKey(owner,rule)] || "editable";
}
function readerAccessButton(scope,i,rule) {
  const access=readerAccess(filterOwner(scope),rule);
  const label=(rule.binding ? valname(rule.binding) : fieldname(rule.field))+" reader settings";
  return `<button type="button" class="reader-access" data-reader-access="${scope}:${i}" aria-label="${esc(label)}" title="${esc(label)} · ${access}">${icon(access==="hidden" ? "hiddenPage" : access==="locked" ? "locked" : "panes")}</button>`;
}
function editReaderAccess(scope,index) {
  const owner=filterOwner(scope),rule=(scope==="measure" ? owner.measureFilters : owner.filters)[index];
  const options=[["editable","Allow changes"],["locked","Show as locked"],["hidden","Hide from readers"]];
  dialog("Reader settings",selectInput("Filter in reading view","access",options.map(([k,v])=>option(k,v,k===readerAccess(owner,rule))).join("")),"Apply",fd=>{
    const id=rule.id ??= readerRuleKey(owner,rule);
    if (fd.get("access")==="editable") delete owner.readerAccess?.[id];
    else (owner.readerAccess ??= {})[id]=fd.get("access");
    touch();inspector();
  });
}
function filterList(list, scope) {
  return list
    .map((f,i)=>{
      const name=esc(fieldname(f.field)),multiple=f.op==="in",values=multiple ? f.value : [f.value];
      const column=lookup(f.field);
      const caption=values.slice(0,3).map(value=>valueCaption(value,column)).join(", ")+(values.length>3 ? " +"+(values.length-3) : "");
      const operator=multiple ? "is one of" : columnBounds[f.op] || "=";
      return `<div class="filteritem"><button class="measure-filter-edit" data-edit-column-filter="${scope}:${i}" aria-label="Edit ${name} filter">${name} ${operator} <b>${esc(caption)}</b></button>${readerAccessButton(scope,i,f)}<button data-remove-filter="${scope}:${i}" aria-label="Clear filter">×</button></div>`;
    })
    .join("");
}
async function switchInspector(next) {
  tab = next;
  if (next === "Filters") measureFilterUI ??= await import("./measure-filters.js");
  if (tab === next) inspector();
}
function referenceFormat(v, axis) {
  return axisMetricStyle(v, axis, chartMetrics(v), m => metricFormat(v, m));
}
function formatAxisRoles(v) {
  const view = readerVisual(v), roles = axisRoles(v);
  if (dateTrend(view.kind) && axisFields(view).length===1 && usesCalendarAxis(view) && lookup(axisFields(view)[0])?.numeric)
    return [["x","X axis"],...roles];
  return roles;
}
function ruleIdentity(v, rule) {
  return rule.id || `legacy:${v.measureFilters.indexOf(rule)}:${metricKey(rule.binding)}`;
}
function referenceValue(ref) {
  if (!ref.source) return ref.value;
  return linkedFilterValue(ref.source);
}
function linkedFilterValue(source) {
  const p = report.pages.find(p => p.id === source.page);
  const v = p?.visuals.find(v => v.id === source.visual);
  return v?.measureFilters?.find(rule => ruleIdentity(v,rule) === source.rule)?.value;
}
function referenceSources() {
  return report.pages.flatMap(p => p.visuals.flatMap(v => (v.measureFilters || [])
    .filter(r => Number.isFinite(r.value)).map(rule => ({
      source: {page:p.id,visual:v.id,rule:ruleIdentity(v,rule)},
      rule, label: p.name + " / " + titleOf(v) + " / " + [valname(rule.binding), comparisons[rule.op], display(rule.value,ruleFormat(rule.binding))].join(" "),
    }))));
}
function thresholdSourceInput(rule, fixed) {
  const sources = referenceSources(), link = rule.thresholdFilter;
  if (!sources.length && !link) return fixed;
  const choices = sources.map(({source,label}) => {
    const current = link && link.page === source.page && link.visual === source.visual && link.rule === source.rule;
    return option(JSON.stringify(source),label,current);
  });
  const value = link && linkedFilterValue(link);
  if (link && !Number.isFinite(value))
    choices.unshift(`<option value="" selected disabled>Linked filter unavailable</option>`);
  const picker = `<label class="formlabel" for="threshold-source">Threshold source</label><select id="threshold-source" class="control" data-cell-setting="threshold-filter">${option("","Fixed value",!link)}${choices.join("")}</select>`;
  return picker + (link ? "" : fixed);
}
function referenceControls(v, axis, title) {
  const items = (v.referenceLines || []).filter(r => referenceAxis(v,r) === axis).map(r => {
    const value = referenceValue(r);
    const detail = r.statistic ? [r.statistic.kind === "percentile" ? "P" + r.statistic.percentile : r.statistic.kind, valname(r.statistic.binding)].join(" ") : Number.isFinite(value) ? axisLabel(value, referenceFormat(v, axis)) : "Filter unavailable";
    const label = [r.name, detail].filter(Boolean).join(" · ");
    return `<div class="filteritem"><button class="measure-filter-edit" data-edit-reference="${esc(r.id)}">${esc(label)}</button><button data-remove-reference="${esc(r.id)}" aria-label="Remove ${esc(label)}">×</button></div>`;
  });
  return items.join("") + `<button class="outline" data-add-reference="${axis}" aria-label="Add reference line to ${esc(title)}">+ Add reference line</button>`;
}
function refreshFormatting() {
  touch();
  dismissTooltip?.();
  canvas();
  inspector();
}
function seriesSwatches(v) {
  return [...new Map($$(`#paper [data-id="${CSS.escape(v.id)}"] [data-series-color]`).map(el=>[el.dataset.seriesColor,el.dataset.color]))];
}
function seriesColorControls(v) {
  const swatches = seriesSwatches(v);
  if (!swatches.length) return "";
  const fixed = name => v.colors && Object.hasOwn(v.colors,name);
  const allPinned = swatches.every(([name])=>fixed(name));
  const rows = swatches.map(([name,color])=>
    `<div class="series-color-row"><label class="chart-option"><input type="color" data-color-key="${esc(name)}" value="${esc(color)}">${esc(name)}</label>` +
    (fixed(name) ? `<button data-unpin-color="${esc(name)}" title="Use automatic color" aria-label="Use automatic color for ${esc(name)}">↺</button>` : "") + "</div>"
  ).join("");
  return section("Series colors",rows + `<button class="outline" data-action="pin-series-colors" title="Keep each displayed series color when filters or themes change" ${allPinned ? "disabled" : ""}>${allPinned ? "Displayed colors pinned" : "Pin displayed colors"}</button>`);
}
function inspectorHeader(active) {
  const tabs=["Build","Format","Filters"].map(name=>
    '<button data-tab="'+name+'" class="'+(name===active ? "on" : "")+'">'+name+"</button>");
  return head("Visualizations")+'<div class="tabs">'+tabs.join("")+"</div>";
}
function inspector() {
  if (arranging) {
    $("#inspector").innerHTML = inspectorHeader(null) +
      arrangePane(page().visuals,arranging.ids,titleOf,esc,section);
    return;
  }
  const v = visual();
  let content = "";
  if (tab === "Build") {
    content += section("Visual type", kinds());
    if (v) {
      content += section(
        objects[v.kind] ? "Content" : "Field wells",
        v.kind === "narrative" ? btn("Edit narrative","edit-narrative","outline") : v.kind === "image" ? imageControls(v,{esc,fields:fields(),option,fkey,valueCaption}) : v.kind === "parameterSlicer" ? parameterControls(v,report,esc) : objects[v.kind]
          ? objectControls(v, report, esc)
          : buildRoles(v).map(r => well(r.label,r.key,v)).join(""),
      );
      content += section(
        "Visual",
        (selectedGroupMembers(v) ? btn("Group selected values","group-selection","outline") : "")+
        btn("Duplicate visual","duplicate-visuals","outline") + btn("Remove visual", "remove-visual", "outline"),
      );
    } else
      content += section(
        "Field wells",
        '<p class="hint">Select a visual to configure its fields.</p>',
      );
  }
  if (tab === "Format") {
    content = v
      ? section(
          "Appearance",
          `<label class="formlabel" for="vtitle">Visual title</label><input class="control" id="vtitle" value="${esc(v.title)}" placeholder="${esc(titleOf(v))}">` + titleSourceControl(v) + (v.kind==="narrative" ? narrativeFormat(v) : v.kind==="image" ? imageFormat(v) : v.kind==="shape" ? shapeFormat(v) : `<label class="formlabel" for="vformat">Number format</label><select class="control" id="vformat">${["auto", "number", "currency", "percent"].map((x) => `<option value="${x}" ${x === v.format ? "selected" : ""}>${{ auto: "From measure", number: "Number", currency: "Currency", percent: "Percentage" }[x]}</option>`).join("")}</select><label class="formlabel" for="vaccent">Accent color</label><input id="vaccent" type="color" value="${esc(accentOf(v))}"><button class="outline" data-action="theme-color">Use report color</button>`),
        ) +
        section(
          "Position and size",
          `<div class="dimensions">${["x", "y", "w", "h"].map((k, i) => `<label>${["Left", "Top", "Width", "Height"][i]}<input class="control" type="number" data-dim="${k}" ${v.layoutLocked ? "disabled" : ""} value="${Math.round(v[k])}"></label>`).join("")}</div><label class="chart-option"><input type="checkbox" data-opt="layoutLocked" ${v.layoutLocked ? "checked" : ""}>Lock position and size</label>`,
        )
      : section(
          "Format",
          '<p class="hint">Select a visual to edit its appearance.</p>',
        );
  }
  if (tab === "Format" && v?.kind === "navigator")
    content += section("Pages",
      `<label class="chart-option"><input type="checkbox" data-opt="showHiddenPages" ${v.showHiddenPages ? "checked" : ""}>Include hidden pages</label>
      <label class="chart-option"><input type="checkbox" data-opt="showTooltipPages" ${v.showTooltipPages ? "checked" : ""}>Include tooltip pages</label>`);
  if ((tab==="Build" || (tab==="Format" && hasSparks(v||{}))) && ["matrix","table"].includes(v?.kind))
    content+=section("Sparklines",sparkControls(v,esc));
  if (tab === "Format" && v) {
    const view = readerVisual(v);
    const metrics = metricsForVisual(view) || [];
    const bindings = new Map(metrics.map(m => [formatBindingKey(m),m]));
    if (v.kind!=="narrative" && (bindings.size > 1 || (bindings.size && v.bindingFormats)))
      content += section("Number format by measure",[...bindings].map(([key,m]) => {
        const current = v.bindingFormats?.[key] ?? "";
        const reference = view.kind === "card" && view.references?.some(r => formatBindingKey(r) === key);
        const options = [["",reference ? "Default for field" : "Use visual format"],["auto","From measure"],["number","Number"],["currency","Currency"],["percent","Percentage"]];
        return `<label class="formlabel">${esc(valname(m))}<select class="control" aria-label="Number format for ${esc(valname(m))}" data-binding-format="${esc(key)}">${options.map(([value,label]) =>
          `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
      }).join(""));
  }
  if (tab === "Format" && v?.kind === "card")
    content += section("Callout",`<label class="formlabel">Maximum text size (px)<input class="control" type="number" min="8" max="160" step="1" id="card-text-size" value="${cardTextSize(v)}"></label><small>The value scales down to fit the card.</small>`);
  if(tab==="Format" && v?.smallMultiples?.length && supportsMultiples(v.kind)) {
    const grid=(label,key)=>'<label class="formlabel">'+label+'<select class="control" aria-label="'+label+'" data-panel-setting="'+key+'">'+
      Array.from({length:6},(_,i)=>option(i+1,i+1,(v[key]||2)===i+1)).join("")+'</select></label>';
    content+=section("Small multiples",grid("Panels per row","panelColumns")+grid("Visible panel rows","panelRows")+
      '<label class="formlabel">Panel order<select class="control" aria-label="Panel order" data-panel-setting="panelOrder">'+option("asc","Ascending",v.panelOrder!=="desc")+option("desc","Descending",v.panelOrder==="desc")+'</select></label>');
  }
  if (tab === "Format" && v?.kind === "card" && v.groups.length)
    content += section("Category layout",`<label class="formlabel" for="card-columns">Cards per row</label><select class="control" id="card-columns"><option value="">Auto</option>${Array.from({length:12},(_,i)=>option(i+1,i+1,cardColumns(v)===i+1)).join("")}</select>`);
  if (
    tab === "Format" &&
    v &&
    (["bar", "slicer", "matrix"].includes(v.kind) || (["card","table"].includes(v.kind) && v.groups.length) || types[v.kind])
  )
    content += section(
      "Drillthrough",
      `<label class="formlabel" for="drill-target">Detail page</label><select id="drill-target" class="control"><option value="">None</option>${report.pages
        .filter((p) => p.id !== page().id)
        .map(
          (p) =>
            `<option value="${esc(p.id)}" ${p.id === v.target ? "selected" : ""}>${esc(p.name)}</option>`,
        )
        .join("")}</select>`,
    );
  if (tab === "Format" && v && (["list","dropdown"].includes(v.kind) || selectableChart(v.kind) || (["card","table"].includes(v.kind) && v.groups.length)))
    content += section(
      "Selection",
      `<label class="chart-option"><input type="checkbox" data-opt="multiSelect" ${v.multiSelect ? "checked" : ""}>${v.kind==="table" ? "Select multiple rows" : ["list","dropdown"].includes(v.kind) ? "Select multiple values" : "Select multiple categories"}</label>`,
    );
  if (
    tab === "Format" &&
    ["table", "matrix", "card"].includes(v?.kind) &&
    v.metrics.length
  )
    content += section(
      v.kind === "card" ? "Conditional text color" : "Cell formatting",
      cellRuleControls(v, chosenRuleField, {
        esc,
        fields:fields(), measures:report.measures, sourceFormat:ruleFormat, thresholdInput:thresholdSourceInput,
        metrics:metricsForVisual(v),
        valname: (m) => v.kind === "card" ? referenceCaption(m) : columnCaption(v, "metrics", v.metrics.indexOf(m)).text,
        format: v.kind === "card" ? cardMetricFormat : metricFormat,
      }),
    );
  if (tab === "Format" && v && ready(v))
    content += section(
      "Data",
      btn("Download chart data", "export-csv", "outline"),
    );
  if (
    tab === "Format" &&
    v &&
    page().visuals.length > 1 &&
    !objects[v.kind] &&
    (!["table","card"].includes(v.kind) || v.groups.length)
  ) {
    const targets = page().visuals.filter(
      (target) => target.id !== v.id && (!objects[target.kind] || (target.kind==="image" && target.groups.length) || (target.kind==="narrative" && target.metrics.length)),
    );
    content += section(
      "Interactions with other visuals",
      targets
        .map(
          (target) =>
            `<label class="chart-option"><input type="checkbox" data-interact="${target.id}" ${v.ignoreTargets?.includes(target.id) ? "" : "checked"}>${esc(titleOf(target))}</label>${canHighlight(target) && !v.ignoreTargets?.includes(target.id) ? `<select class="control interaction-mode" aria-label="Interaction with ${esc(titleOf(target))}" data-interaction-mode="${esc(target.id)}"><option value="filter">Filter</option><option value="highlight" ${highlights(v, target) ? "selected" : ""}>Highlight</option></select>` : ""}`,
        )
        .join(""),
    );
  }
  if (tab === "Format" && v?.kind === "matrix") {
    content += section("Row headers",matrixLayoutControls(v));
    content += section("Column widths",btn("Edit column width","matrix-width","outline"));
    content += section(
      "Matrix values",
      `<label class="chart-option"><input type="checkbox" data-opt="subtotals" ${v.subtotals !== false ? "checked" : ""}>Hierarchy subtotals</label><label class="chart-option"><input type="checkbox" data-opt="cellColors" ${v.cellColors ? "checked" : ""}>Color cells by threshold</label>${v.cellColors ? `<label class="formlabel">Threshold<input class="control" type="number" step="any" data-opt="cellThreshold" value="${esc(v.cellThreshold ?? 0)}"></label><small>Below threshold · rose. At or above · green.</small>` : ""}`,
    );
  }
  if (tab === "Build" && v?.kind === "table") {
    const dates = readerVisual(v).groups.map((f,i) => {
      const column = lookup(f);
      if (!column || column.numeric || f.parameter || column.binSize) return "";
      const name = esc(columnCaption(v,"groups",i).text);
      return `<label class="chart-option"><input type="checkbox" data-time-sort="${i}" ${v.utcSortFields?.some(field=>eq(field,f)) ? "checked" : ""}>Sort ${name} by UTC time</label>`;
    }).join("");
    if (dates) content += section("Timestamp sorting",dates);
  }
  if (
    tab === "Format" &&
    v &&
    types[v.kind] &&
    (chartMetrics(v).length || v.kind === "gantt")
  ) {
    const opts = [];
    if (!["indicator", "gauge", "decomposition"].includes(v.kind))
      opts.push(["labels", "Data labels", false]);
    if (
      !["indicator", "gauge", "map", "funnel", "decomposition"].includes(v.kind)
    )
      opts.push(["showLegend", "Legend", true]);
    if (v.kind !== "decomposition" && (v.kind !== "gauge" || v.groups.length))
      opts.push(["tooltips", "Tooltips", true]);
    if (v.kind === "combo")
      opts.push(["secondaryAxis", "Secondary line axis", true]);
    if (v.kind === "map")
      opts.push(["mapGrid", "Coordinate grid when zoomed", true]);
    if (dateTrend(v.kind) && axisFields(v).length <= 1)
      opts.push(["continuousDate",lookup(axisFields(readerVisual(v))[0])?.numeric ? "Continuous numeric axis" : "Continuous date axis",false]);
    if (canShowBinGaps(v) && axisFields(v).length === 1 && lookup(axisFields(readerVisual(v))[0])?.binSize)
      opts.push(["showBinGaps","Show empty intervals",false]);
    if (opts.length || v.kind === "indicator")
      content += section(
        "Chart",
        opts
          .map(
            ([key, title, initial]) =>
              `<label class="chart-option"><input type="checkbox" data-opt="${key}" ${(key === "continuousDate" ? usesCalendarAxis(v) : v[key] ?? initial) ? "checked" : ""}>${title}</label>`,
          )
          .join("") +
          (dateTrend(v.kind) && axisFields(v).length<=1 ? `<label class="formlabel">X axis title<input class="control" data-axis-title-input="x" maxlength="120" value="${esc(v.axes?.x?.title || "")}"></label>` : "") +
          (v.kind === "indicator"
            ? `<label>Target direction<select class="control" data-opt="direction"><option value="higher">Higher is better</option><option value="lower" ${v.direction === "lower" ? "selected" : ""}>Lower is better</option></select></label>`
            : ""),
      );
  }
  if (tab==="Format" && v && (searchableSlicer(v) || syncable(v))) {
    const search=searchableSlicer(v) ? `<label class="chart-option"><input type="checkbox" data-opt="showSearch" ${v.showSearch ? "checked" : ""}>Show search box</label>` : "";
    const sync=syncable(v) ? '<button type="button" class="outline" data-sync-slicers>Sync slicers</button>' : "";
    content+=section("Slicer settings",search+sync);
  }
  if (tab === "Format" && v && supportsPageTip(v)) {
    const targets = report.pages.filter((p) => p.tooltip && p !== page());
    const choices = [
      ["", "Automatic"],
      ["fields", "Default visual tooltip"],
      ...targets.map((p) => [p.id, p.name]),
      ["new", "Create tooltip page…"],
    ];
    content += section(
      "Tooltip",
      `<label class="formlabel">Tooltip page<select class="control" id="tooltip-page" aria-label="Tooltip page">${choices.map(([id, label]) => `<option value="${esc(id)}" ${(v.tooltipPage || "") === id ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></label>`,
    );
  }
  if (tab === "Format" && v?.kind === "gantt") {
    content += section(
      "Timeline",
      `<div class="dimensions">${["from", "through"].map((k, i) => `<label>${i ? "Through" : "From"}<input class="control" type="date" data-schedule-bound="${k}" value="${esc(v.scheduleRange?.[k] || "")}"></label>`).join("")}</div><label class="chart-option"><input type="checkbox" data-opt="shadeWeekends" ${v.shadeWeekends ? "checked" : ""}>Shade weekends</label>`,
    );
  }
  if (tab === "Format" && ["pie", "donut"].includes(v?.kind)) {
    const labelMode = v.sliceLabel || "percent";
    content += section(
      "Slices",
      `<label class="formlabel">Start angle (degrees)<input type="number" class="control" min="0" max="360" step="1" data-opt="sliceAngle" value="${esc(v.sliceAngle ?? 0)}"></label>` +
        (v.kind === "donut"
          ? `<label class="formlabel">Inner radius (%)<input type="number" class="control" min="10" max="85" step="1" data-opt="holePercent" value="${esc(v.holePercent ?? 55)}"></label>`
          : "") +
        (v.labels
          ? `<label class="formlabel">Slice label<select class="control" aria-label="Slice label" data-opt="sliceLabel">${[
              ["percent", "Percent of total"],
              ["value", "Value"],
              ["category", "Category"],
              ["categoryPercent", "Category and percent"],
            ]
              .map(
                ([key, title]) =>
                  `<option value="${key}" ${key === labelMode ? "selected" : ""}>${title}</option>`,
              )
              .join("")}</select></label>`
          : ""),
    );
  }
  if (tab === "Format" && v)
    for (const [axis, title] of formatAxisRoles(v)) {
      content += section(
        title,
        `<div class="dimensions">${["min", "max"].map((key) => `<label>${key === "min" ? "Minimum" : "Maximum"}<input type="number" step="any" class="control" data-axis-key="${axis}" data-bound="${key}" aria-label="${title} ${key}" placeholder="Auto" value="${esc(v.axes?.[axis]?.[key] ?? "")}"></label>`).join("")}</div>` + referenceControls(v, axis, title),
      );
    }
  if (tab === "Format" && v && types[v.kind])
    content += `<div id="series-colors-pane">${seriesColorControls(v)}</div>`;
  if (tab === "Format" && v && supportsPointColors(v)) {
    content += `<div id="point-colors-pane">${pointColorControls(v)}</div>`;
    const view = readerVisual(v);
    if (view.metrics.length) content += section("Conditional fill color",cellRuleControls(v,chosenRuleField,{
      chart:true, keyOf:formatBindingKey, esc, valname, fields:fields(), measures:report.measures,
      metrics:view.metrics, format:metricFormat, sourceFormat:ruleFormat, thresholdInput:thresholdSourceInput,
    }));
  }
  if (tab === "Filters") {
    const selections = [...page().visuals,...hiddenSlicers(report,page())].filter(v=>v.selection);
    content += section(
      "Selections",
      selections
        .map(
          (v) =>
            `<div class="filteritem">${esc(selectionCaption(v))}<button data-clear="${v.id}" aria-label="Clear selection">×</button></div>`,
        )
        .join("") || '<span class="hint">No active selections</span>',
    );
    for (const [scope, list] of [
      ["visual", v?.filters],
      ["page", page().filters],
      ["report", report.filters],
    ])
      if (list)
        content += section(
          "This " + scope,
          filterList(list, scope) +
            `<button class="outline" data-new-filter="${scope}">+ Add filter</button>` +
            (scope === "visual" && !objects[v.kind] && measureFilterUI ? measureFilterUI.measureFilterList(v, {esc, valname, ruleFormat, display,readerAccessButton}) : ""),
        );
  }
  if (
    v &&
    rankable(v) &&
    tab === "Build"
  )
    content += section(
      "Sort and limit",
      `<label class="formlabel" for="rank-order">Sort by</label><select id="rank-order" class="control" data-rank>${[
        ["category", "Category"],
        ["desc", "Value · highest first"],
        ["asc", "Value · lowest first"],
      ]
        .map(
          ([k, n]) =>
            `<option value="${k}" ${(v.order || "category") === k ? "selected" : ""}>${n}</option>`,
        )
        .join(
          "",
        )}</select>${rankingMeasureControl(v)}<label class="formlabel" for="rank-limit">Number of categories</label><input class="control" id="rank-limit" type="number" min="1" max="500" placeholder="All" value="${v.top || ""}">
        <label class="chart-option"><input id="rank-ties" type="checkbox" ${v.includeTies ? "checked" : ""} ${v.top && ["asc","desc"].includes(v.order) ? "" : "disabled"}>Include ties at the cutoff</label>`,
    );
  $("#inspector").innerHTML = inspectorHeader(tab) + content;
}
function chooseKind(kind) {
  const v = visual();
  if (v) {
    if (v.kind === kind) return;
    const keepDrill = hasAxisHierarchy(v.kind) && hasAxisHierarchy(kind);
    const keepChartSelection = selectableChart(v.kind) && selectableChart(kind);
    const keepSelection = keepChartSelection ||
      (slicerMode(v.kind)==="category" && slicerMode(kind)==="category");
    if (v.kind === "card") {
      v.metrics = metricsForVisual(v);
      delete v.references;
    }
    delete v.treePath;
    if (types[kind]) compatible(v, kind);
    else {
      if (types[v.kind] && ["matrix", "table", "bar", "card", "narrative"].includes(kind)) {
        v.metrics = chartMetrics(v);
        if (["matrix", "table", "card"].includes(kind)) {
          const seen = new Set();
          v.groups = chartGroups(readerVisual(v)).flatMap(field => {
            if (!field.member) return [field.sourceIndex === undefined ? field : ref(field)];
            if (seen.has(field.parameter)) return [];
            seen.add(field.parameter);
            return [dimensionField(findParameter(report,field.parameter))];
          });
        }
      }
      for (const key of [
        "other",
        "size",
        "legendFields",
        "startFields",
        "endFields",
        "phaseFields",
        "smallMultiples",
      ])
        delete v[key];
      v.kind = kind;
    }
    delete v.range;
    if (!keepSelection) v.selection = null;
    if (!keepDrill) {
      delete v.expandedLevels;
      v.trail = [];
      v.level = 0;
    }
    if (kind === "card") {
      v.references = v.metrics.slice(1);
    }
    if (kind === "slicer") {
      v.metrics = [];
      v.groups = v.groups.slice(0, 1);
    }
    if (kind==="narrative") {
      v.groups=[];delete v.columns;delete v.measureFilters;
      const previous=v.metrics.slice(0,32);v.metrics=[];v.narrativeText="";
      for(const binding of previous)addNarrativeValue(v,binding,valname(binding));
    }
    if (!types[kind] && !["matrix", "table", "narrative"].includes(kind))
      v.metrics = v.metrics.slice(0, 1);
    if (!rankable(v) || !(v.includeTies || v.rankSource || (v.rankMetric && metricsForVisual(readerVisual(v)).some(m=>formatBindingKey(m)===v.rankMetric)))) {
      delete v.top;
      delete v.order;
      delete v.rankMetric;
      delete v.rankSource;
      delete v.includeTies;
    }
    if (v.selection && keepChartSelection) {
      restoreSelection(v,activeGroups(readerVisual(v)),fieldname);
      if (v.selection) v.selection.checkPoint = true;
    }
  } else makeVisual(kind);
  change();
}
function boundFields(v) {
  const view = readerVisual(v);
  return JSON.stringify([
    v.kind,
    view.groups,
    v.metrics,
    view.columns,
    v.legendFields,
    ...(v.smallMultiples?.length ? [v.smallMultiples] : []),
    v.other,
    v.size,
    ...(v.kind === "gantt" ? [v.startFields, v.endFields, v.phaseFields] : []),
  ]);
}
function bookmarksDialog() {
  const bookmarks = report.bookmarks || [];
  if (authorView) return dialog("Bookmarks",bookmarks.map(b =>
    `<div class="bookmark-row"><button type="button" data-bookmark-go="${esc(b.id)}">${esc(b.name)}</button></div>`).join(""));
  const list = bookmarks
    .map(
      (b) =>
        `<div class="bookmark-row"><button type="button" data-bookmark-go="${esc(b.id)}">${esc(b.name)}</button><button type="button" data-bookmark-update="${esc(b.id)}" title="Replace saved view with current state">Update</button></div>`,
    )
    .join("");
  dialog(
    "Bookmarks",
    list + textInput("New bookmark name", "name", ""),
    "Add current view",
    (fd) => {
      const name = fd.get("name").trim();
      if (
        !name ||
        bookmarks.some((b) => b.name.toLowerCase() === name.toLowerCase())
      )
        throw Error("Use a distinct bookmark name.");
      report.bookmarks ??= [];
      report.bookmarks.push({
        id: uid(),
        name,
        ...bookmarkState(report, boundFields),
      });
      change();
    },
  );
}
function addDialog() {
  dialog(
    "Add visual",
    '<div class="choose-visual">' +
      Object.entries({
        "Compare categories": [
          "bar",
          "clusteredBar",
          "stackedBar",
          "percentBar",
          "clusteredColumn",
          "stackedColumn",
          "percentColumn",
        ],
        Trends: ["line", "area", "stackedArea", "percentArea", "combo"],
        Distributions: ["dot", "scatter", "bubble", "pie", "donut"],
        "Detail and indicators": ["table", "matrix", "card", "indicator"],
        Slicers: ["slicer", "list", "dropdown", "dateRange", "parameterSlicer"],
        Specialized: Object.keys(specializedTypes),
        "Report objects": ["textBox","narrative","image","shape","navigator","actionButton"],
      })
        .filter(([, items]) => items.length)
        .map(
          ([label, items]) =>
            `<h4>${label}</h4>${items.map((k) => `<button type="button" class="outline" data-create="${k}">${icon(k)}${names[k]}</button>`).join("")}`,
        )
        .join("") +
      "</div>",
  );
}
function attachLink(existing, link) {
  const edges = [...existing, link];
  for (const root of new Set(edges.map((e) => e.many.t))) {
    const seen = new Set([root]),
      todo = [root];
    while (todo.length) {
      const t = todo.pop();
      for (const e of edges.filter((e) => e.many.t === t)) {
        if (seen.has(e.one.t))
          throw Error(
            "This relationship creates a duplicate or ambiguous filter path.",
          );
        seen.add(e.one.t);
        todo.push(e.one.t);
      }
    }
  }
}
function suggestedLinks() {
  const links = [],
    normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const dim of report.tables)
    for (const [i, c] of dim.columns.entries()) {
      const key = normalize(c.name),
        table = normalize(dim.name);
      if (![table + "key", table + "id"].includes(key)) continue;
      for (const fact of report.tables) {
        if (dim.id === fact.id) continue;
        const j = fact.columns.findIndex(
          (f) => normalize(f.name) === key && f.numeric === c.numeric,
        );
        if (j < 0) continue;
        const link = { one: { t: dim.id, c: i }, many: { t: fact.id, c: j } };
        try {
          attachLink([...report.links, ...links], link);
          links.push(link);
        } catch {}
      }
    }
  return links;
}
function relationshipDialog() {
  if (report.tables.length < 2)
    return notify("Import two tables to create a relationship.");
  const opts = fieldOptions(
    fields().filter(
      (f) => f.c < report.tables.find((t) => t.id === f.t).columns.length,
    ),
  );
  const suggested = suggestedLinks();
  const suggestions = suggested.length
    ? `<section class="suggestions"><h3>Suggested relationships</h3>${suggested.map((l, i) => `<label><input type="checkbox" data-suggestion="${i}" checked><span>${esc(lookup(l.one).table)} <b>1 → *</b> ${esc(lookup(l.many).table)}<small>${esc(fieldname(l.one))}</small></span></label>`).join("")}<button type="button" class="primary" id="apply-links">Create selected</button></section>`
    : "";
  dialog(
    "Create relationship",
    suggestions +
      selectInput("One-side key", "one", opts) +
      selectInput("Many-side key", "many", opts),
    "Create",
    async (fd) => {
      const link = { one: decode(fd.get("one")), many: decode(fd.get("many")) };
      attachLink(report.links, link);
      await api("/api/relationship", link);
      report.links.push(link);
      change();
      notify("Relationship created");
    },
  );
  if (suggested.length)
    $("#apply-links").onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try {
        const chosen = $$("[data-suggestion]:checked").map(
          (el) => suggested[Number(el.dataset.suggestion)],
        );
        if (!chosen.length) throw Error("Select at least one relationship.");
        await Promise.all(chosen.map((l) => api("/api/relationship", l)));
        report.links.push(...chosen);
        $("#dialog").close();
        change();
        notify("Relationships created");
      } catch (error) {
        $("#dlgform .err").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
}
function monthlyDialog(existing) {
  const bases = report.measures.filter((m) => !m.baseMeasure);
  const calendars = fields().filter(
    (f) => !f.numeric && report.links.some((l) => l.one.t === f.t),
  );
  if (!bases.length || !calendars.length)
    return notify(
      "Create a base measure and relate a calendar table with an ISO date or month field.",
    );
  dialog(
    "Month comparison",
    textInput(
      "Measure name",
      "name",
      existing?.name || "Change from previous month",
    ) +
      selectInput(
        "Base measure",
        "base",
        bases.map((m) => option(m.id, m.name)).join(""),
      ) +
      selectInput("Calendar date or month", "month", fieldOptions(calendars)) +
      selectInput(
        "Result",
        "mode",
        option("change", "Change from previous month") +
          option("previous", "Previous month value"),
      ) +
      '<p class="hint">Each result compares one visible calendar month with the whole preceding month. Other dimension filters stay in effect.</p>',
    "Save measure",
    async (fd) => {
      const name = fd.get("name").trim();
      if (
        !name ||
        report.measures.some(
          (m) => m !== existing && m.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error("Use a distinct measure name.");
      const definition = {
        id: existing?.id || uid(),
        name,
        baseMeasure: fd.get("base"),
        comparison: { month: decode(fd.get("month")), mode: fd.get("mode") },
      };
      const { updateMeasures } = await import("./formulas.js");
      report.measures = updateMeasures(report.measures, definition, fields());
      change();
    },
  );
  if (existing) {
    $("#dialog [name=base]").value = existing.baseMeasure;
    $("#dialog [name=month]").value = fkey(existing.comparison.month);
    $("#dialog [name=mode]").value = existing.comparison.mode;
  }
}
async function editFormula(existing) {
  if (existing?.baseMeasure) return monthlyDialog(existing);
  if (!report.tables.length) return notify("Import a table first.");
  const { formulaDialog } = await import("./formulas.js");
  formulaDialog(existing, { report, fields, lookup, dialog, esc, change, uid });
}
function newCalculation(source, name, definition) {
  const siblings = fields().filter(f => f.t === source.t);
  if (!name) throw Error("Enter a column name.");
  if (siblings.some(f => f.name.toLowerCase() === name.toLowerCase()))
    throw Error("This column name already exists.");
  const field = {t:source.t, c:1 + Math.max(...siblings.map(f => f.c))};
  return {field, name, left:ref(source), ...definition};
}
function selectedGroupMembers(v) {
  if (!v.selection || !selectableChart(v.kind) || v.groups.length!==1 || v.groups[0].parameter) return;
  const field=v.groups[0],column=lookup(field);
  if (!column || column.numeric || column.binSize || column.grouped) return;
  const members=selectionRows(v.selection,[field]).map(([member])=>member);
  if (members.length>1) return members;
}
async function openMemberGroups(bound,apply,initialMembers=[]) {
  const owner=report,existing=report.calculations.find(c=>c.op==="memberGroups" && eq(c.field,bound));
  const source=lookup(existing?.left || bound), field=ref(source);
  const {memberGroupsDialog}=await import("./member-groups.js");
  if (owner!==report) return;
  memberGroupsDialog(source,existing,{dialog,esc,initialMembers,caption:value=>valueCaption(value,source),
    fetchMembers:async(search,offset)=>(await api("/api/query",{...modelRequest(),visuals:[{groups:[field],metrics:[],
      filters:search?[{field,op:"contains",value:search}]:[],order:"category",limit:50,offset}]}))[0],
    commit(name,definition){
      if (existing) {
        if (!name || fields().some(f=>f.t===field.t && !eq(f,existing.field) && f.name.toLowerCase()===name.toLowerCase()))
          throw Error("Use a distinct group field name.");
        delete existing.otherLabel;
        Object.assign(existing,definition,{name});
        offsets.clear();change();
      } else {
        const calc=newCalculation(source,name,definition);
        report.calculations.push(calc);
        if (apply) {
          const exact=initialMembers.length && definition.groups.find(g=>g.members.length===initialMembers.length && initialMembers.every(m=>g.members.includes(m)));
          apply(calc.field,exact?.name);
        } else change();
      }
    }});
}
function binDialog(bound, apply, time=false) {
  const sources = fields().filter(f => !f.binSize && !f.grouped && f.numeric !== time);
  const initial = bound ? lookup(bound) : sources[0];
  if (!initial) return notify(time ? "Import a column with ISO dates or timestamps first." : "Import a table with numeric columns first.");
  const defaultName = f => f.name + " (bins)";
  dialog(time ? "Create time bins" : "Create numeric bins",
    (time && bound ? btn("Create named groups","groups-from-field","outline") : "")+
    (bound ? "" : selectInput("Source column","source",fieldOptions(sources))) +
    textInput("Bin field name","name",defaultName(initial)) +
    '<label class="formlabel" for="bin-size">Bin size</label><input id="bin-size" name="size" type="number" required '+
    (time ? 'step="1" min="1" value="1">' : 'step="any" value="10">') +
    (time ? selectInput("Interval unit","unit",[[3600000,"Hours"],[60000,"Minutes"],[1000,"Seconds"],[1,"Milliseconds"],[86400000,"Days"],[604800000,"Weeks"],["month","Months"],["quarter","Quarters"],["year","Years"]].map(([n,s])=>option(n,s)).join("")) +
      '<div id="week-origin" hidden>'+selectInput("Week starts on","weekStart",["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((s,i)=>option(i+1,s)).join(""))+'</div>'+
      '<p class="hint">Use ISO dates or timestamps. Intervals are anchored to January 1970 UTC. Calendar quarters begin in January, April, July and October. Times without an offset use UTC.</p>' :
      '<p class="hint">Intervals start at multiples of the bin size. Each interval includes its lower bound and excludes its upper bound. Blank values stay blank.</p>'),
    "Create bins", async fd => {
      const size = Number(fd.get("size"));
      if (!Number.isFinite(size) || size <= 0) throw Error("Enter a bin size greater than zero.");
      const source = bound || decode(fd.get("source"));
      const unit = fd.get("unit"), months = {month:1,quarter:3,year:12}[unit];
      const width = size * (months || Number(unit));
      if (time && (!Number.isSafeInteger(size) || !Number.isSafeInteger(width) || width > (months ? 119988 : 315537897600000)))
        throw Error("Choose a whole interval within the supported date range.");
      const duration = {op:"timeBin",...(months ? {calendarMonths:width} : {timeBinMs:width})};
      if (time && fd.get("unit") === "604800000") duration.weekStart = Number(fd.get("weekStart"));
      const calc = newCalculation(source,fd.get("name").trim(),time ? duration : {op:"bin",binSize:size});
      if (time) {
        const form = $("#dlgform");
        await validateTimeSource([calc],calc.field);
        if (!$("#dialog").open || form !== $("#dlgform")) return;
      }
      report.calculations.push(calc);
      if (apply) apply(calc.field);
      else change();
      notify("Bin field created");
    });
  if (time) $("#inp-unit").onchange = e => { $("#week-origin").hidden = e.target.value !== "604800000"; };
  if (time && bound) $('#dlgform [data-action="groups-from-field"]').onclick=()=>openMemberGroups(bound,apply);
  if (!bound) {
    let previous = defaultName(initial);
    $('#dlgform [name=source]').onchange = e => {
      const input = $('#dlgform [name=name]'), next = defaultName(lookup(decode(e.target.value)));
      if (input.value === previous) input.value = next;
      previous = next;
    };
  }
}
function measureDialog(calc = false) {
  const nums = fields().filter(
    (f) =>
      f.numeric &&
      (!calc || f.c < report.tables.find((t) => t.id === f.t).columns.length),
  );
  if (!nums.length) {
    if (calc) return binDialog(null,null,true);
    if (report.measures.some((m) => !m.baseMeasure))
      return dialog(
        "New measure",
        btn("Write a DAX formula", "formula", "outline") +
          btn("Compare months", "monthly", "outline"),
      );
    return editFormula();
  }
  const options = fieldOptions(nums);
  dialog(
    calc ? "Calculated column" : "New measure",
    (calc
      ? btn("Create numeric bins", "new-bins", "outline") +
        (fields().some(f => !f.numeric && !f.binSize) ? btn("Create time bins","new-time-bins","outline") : "")
      : btn("Write a DAX formula", "formula", "outline") +
        btn("Compare months", "monthly", "outline")) +
      textInput("Name", "name", calc ? "Calculated column" : "Margin") +
      (calc
        ? ""
        : selectInput(
            "Calculation",
            "operation",
            option("ratio", "Ratio of sums") +
              option("difference", "Difference of sums") +
              option("variance_pct", "Variance percentage"),
          )) +
      selectInput(calc ? "Left column" : "Numerator · sum of", "a", options) +
      (calc
        ? selectInput(
            "Operator",
            "op",
            ["+", "-", "*", "/"].map((o) => option(o, o)).join(""),
          )
        : "") +
      selectInput(
        calc ? "Right column" : "Denominator · sum of",
        "b",
        options,
      ) +
      (calc
        ? ""
        : selectInput(
            "Number format",
            "format",
            option("percent", "Percentage") +
              option("number", "Number") +
              option("currency", "Currency"),
          )),
    "Create",
    (fd) => {
      const a = decode(fd.get("a")),
        b = decode(fd.get("b")),
        name = fd.get("name").trim();
      if (!name || (calc && a.t !== b.t))
        throw Error(
          "Provide a name. Calculated columns require fields from one table.",
        );
      if (calc) {
        report.calculations.push(newCalculation(a,name,{right:b,op:fd.get("op")}));
      } else {
        if (
          report.measures.some(
            (m) => m.name.toLowerCase() === name.toLowerCase(),
          )
        )
          throw Error("This measure name already exists.");
        report.measures.push({
          id: uid(),
          name,
          field: a,
          op: fd.get("operation"),
          denominator: b,
          format: fd.get("format"),
        });
      }
      change();
      notify(name + " created");
    },
  );
}
function ruleFormat(binding) {
  return metricFormat({format:"auto"}, binding);
}
function editMeasureFilter(index, preset) {
  const v = visual();
  if (!v) return;
  const candidates = [
    ...measuresAndParameters().map(m => ({measure:m.id})),
    ...(types[v.kind] ? chartMetrics(v) : v.metrics),
    ...(v.measureFilters || []).map((r) => r.binding),
  ];
  if (!candidates.length) return notify("Create a measure or add a value to this visual first.");
  measureFilterUI.measureFilterDialog(v, index, preset, candidates, {
    dialog, esc, valname, metricKey, ruleFormat, ruleIdentity,
    apply() { offsets.delete(v.id); v.selection = null; change(); },
  });
}
function loadFilterValues(fields,offset=0,search="") {
  return api("/api/query",{...modelRequest(),visuals:fields.map(field=>({groups:[field],metrics:[],
    filters:memberFilters(field,search),order:"category",limit:Array.isArray(search) ? 500 : 150,offset}))});
}
function memberFilters(field,criteria) {
  return criteria ? [{field,op:Array.isArray(criteria) ? "in" : "contains",value:criteria}] : [];
}
function setSlicerValues(v,field,values) {
  const rule={field,op:"in",value:values};
  v.selection=values.length ? {...rule,filters:[rule],label:values.map(value=>valueCaption(value,lookup(field))).join(", ")} : null;
}
const canPasteSlicer=v=>v?.groups?.length===1 && ["slicer","list","dropdown"].includes(v.kind);
async function chooseSlicerValues(v,initialText) {
  const {mountValueList}=await import("./filter-values.js");
  if (!page().visuals.includes(v) || !canPasteSlicer(v)) return;
  const view=readerVisual(v),field=view.groups[0],query=spec(view);
  const values=v.selection ? (Array.isArray(v.selection.value) ? v.selection.value : [v.selection.value]) : [];
  let read;
  dialog("Choose "+fieldname(field)+' values','<div data-slicer-members></div>',"Apply",async()=>{
    setSlicerValues(v,field,(await read()).value || []);
    offsets.clear();change();
  });
  read=mountValueList($("#dlgform [data-slicer-members]"),{column:lookup(field),values,all:!values.length,reader:true,
    slicer:true,searchable:v.showSearch===true,initialText,
    load:async(offset,text)=>{
      const filters=[...query.filters,...memberFilters(field,text)];
      return (await api("/api/query",{...modelRequest(),visuals:[{...query,filters,limit:Array.isArray(text) ? 500 : 150,offset}]}))[0];
    }});
  if (initialText===undefined) $("#dlgform input[type=search]")?.focus();
}
async function filterDialog(scope,index) {
  if (!fields().length) return notify("Import data before adding a filter.");
  const owner=filterOwner(scope),rule=owner.filters[index];
  const {columnFilterDialog}=await import("./filter-values.js");
  columnFilterDialog({scope,rule,dialog,selectInput,textInput,fieldOptions:fieldOptions(),decode,lookup,fkey,
    load:async(field,offset,search)=>(await loadFilterValues([field],offset,search))[0],
    commit:next=>{
      if (rule) {
        rule.id ??= readerRuleKey(owner,rule);
        delete rule.op;
        Object.assign(rule,next);
      } else owner.filters.push({id:uid(),...next});
      offsets.clear();change();
    },
  });
}
let pendingUpdate;
function workbookOrigin(file,item) {
  return typeof item==="string" ? {file:file.name,sheet:item} : {file:file.name,...item};
}
async function updateTable(owner, table, version, file, plan, mode, sheet) {
  const unchanged = () =>
    report === owner &&
    owner.tables.includes(table) &&
    (table.storageId || table.id) === version;
  if (!unchanged())
    throw Error("Reopen this table to update its latest version.");
  const payload = new FormData();
  if (sheet) payload.append("worksheets",JSON.stringify([sheet]));
  if (plan) payload.append("preparation", JSON.stringify(plan));
  const unpivot = plan && table.preparation?.unpivot;
  if (unpivot) payload.append("unpivot", JSON.stringify(unpivot));
  payload.append("revision", JSON.stringify({ table: version, mode }));
  payload.append("files", file, file.name);
  const [next] = await api("/api/import", payload);
  const replacement = {
    ...table,
    workbook:sheet ? workbookOrigin(file,sheet) : undefined,
    rows: next.rows,
    storageId: next.id,
    dataRevision: next.id,
    parquetTypes: next.parquetTypes,
    preparation: plan
      ? {
          source: file.name,
          columns: plan,
          ...(unpivot ? { unpivot } : {}),
        }
      : table.preparation,
    lastLoad: { mode, file: file.name, at: new Date().toISOString() },
  };
  const proposed = owner.tables.map((t) => (t === table ? replacement : t));
  await Promise.all(
    owner.links
      .filter((l) => l.one.t === table.id || l.many.t === table.id)
      .map((l) => api("/api/relationship", l, proposed)),
  );
  if (!unchanged())
    throw Error(
      "The table changed while loading. Reopen it to update the latest version.",
    );
  owner.tables[owner.tables.indexOf(table)] = replacement;
  offsets.clear();
  change();
  notify(
    "Updated " + table.name + " · " + next.rows.toLocaleString() + " rows",
  );
}
function importFiles(fileList, plan, unpivot) {
  const files=Array.from(fileList);
  if (!plan && files.some(file=>/\.xlsx$/i.test(file.name))) {
    const owner=report;
    if (owner.tables.some(t=>t.source)) throw Error("Create a separate report for imported data.");
    return trackAuthorChange(import("./workbook-import.js").then(({chooseWorksheets})=>{
      if (owner!==report) return;
      return chooseWorksheets(files,{api,dialog,esc,current:()=>owner===report,
        load:(selected,sheets)=>trackAuthorChange(loadFiles(selected,undefined,undefined,sheets))});
    }));
  }
  return trackAuthorChange(loadFiles(fileList,plan,unpivot));
}
async function loadFiles(fileList, plan, unpivot, sheets) {
  if (!fileList.length) return;
  const owner = report;
  if (report.tables.some((t) => t.source))
    throw Error("Create a separate report for imported data.");
  const data = new FormData();
  if (plan) data.append("preparation", JSON.stringify(plan));
  if (unpivot) data.append("unpivot", JSON.stringify(unpivot));
  for (const f of fileList) {
    if (sheets?.has(f)) data.append("worksheets",JSON.stringify(sheets.get(f)));
    data.append("files", f, f.name);
  }
  notify("Importing data…");
  const tables = await api("/api/import", data);
  if (report !== owner) return;
  if (sheets) {
    const sources=Array.from(fileList).flatMap(f=>sheets.has(f) ? sheets.get(f).map(item=>workbookOrigin(f,item)) : [null]);
    tables.forEach((t,i)=>{if (sources[i]) t.workbook=sources[i];});
  }
  if (plan)
    tables[0].preparation = {
      source: fileList[0].name,
      columns: plan,
      ...(unpivot ? { unpivot } : {}),
    };
  report.tables.push(...tables);
  change();
  notify(
    `Imported ${tables.length} ${tables.length === 1 ? "table" : "tables"}`,
  );
}
async function sqlSource() {
  if (report.tables.some((t) => !t.source))
    return notify("Create a separate report for live data.");
  dialog(
    "SQL Server",
    '<p id="sql-status">Reading the configured database…</p>',
  );
  let choices;
  try {
    choices = await api("/api/sqlserver");
  } catch (e) {
    if ($("#sql-status")) $("#sql-status").textContent = e.message;
    return;
  }
  if (!$("#dialog").open || !$("#sql-status")) return;
  if (!choices.length) {
    $("#sql-status").textContent =
      "No supported tables or views are available.";
    return;
  }
  dialog(
    "Connect live tables",
    `<div class="suggestions">${choices.map((c, i) => `<label><input name="table" type="checkbox" value="${i}">${esc(c.schema)}.${esc(c.table)}</label>`).join("")}</div>`,
    "Connect",
    async (fd) => {
      const selected = fd.getAll("table").map((i) => choices[Number(i)]);
      if (!selected.length) throw Error("Select a source table.");
      report.tables.push(...(await api("/api/sqlserver", selected)));
      change();
    },
  );
}
function saveReport(copy = false) {
  const owner=report, prior=[...pendingAuthorChanges];
  return trackAuthorChange(Promise.allSettled(prior).then(()=>owner===report && writeReport(copy)));
}
async function writeReport(copy) {
  if (mode === "home" || authorView) return;
  const owner = report;
  if (mode === "report" && $("#paper").dataset.pending === "true")
    await refresh();
  const images=$$("#paper .report-image").filter(img=>!img.complete);
  if (images.length) await Promise.allSettled(images.map(img=>img.decode()));
  if (busy) {
    await busy;
    if (!dirty && !copy) return;
  }
  if (owner !== report || authorView) return;
  const stamp = serial;
  const snapshot = structuredClone(report);
  if (
    mode === "report" &&
    page().visuals.length &&
    (report.active === 0 || !report.preview)
  ) {
    snapshot.preview = thumbnail(
      page(),
      results,
      displayTitle,
      (v, n) =>
        display(n, v.metrics[0] ? metricFormat(v, v.metrics[0]) : "number"),
      accentOf,
    );
    report.preview = snapshot.preview;
  }
  if (copy) {
    delete snapshot.id;
    delete snapshot.revision;
    snapshot.title += " (copy)";
  }
  try {
    busy = api("/api/reports", { report: snapshot });
    const saved = await busy;
    if (owner !== report) return;
    report.id = saved.id;
    report.revision = saved.revision;
    if (copy) report.title = saved.title;
    if (copy) { edits.reset(report,selected);visualClipboard=null; }
    edits.markSaved(snapshot);
    dirty = serial !== stamp;
    history.replaceState(null, "", "#" + saved.id);
    draw();
    notify("Report saved");
  } finally {
    busy = false;
  }
}
async function showReaderFilters(v) {
  const owner=report;
  const {readerFilters}=await import("./reader-filters.js");
  if (owner!==report || !authorView) return;
  readerFilters({report,page:page(),visual:v,disabled:authorView.disabledFilters,lookup,fieldname,valname,ruleFormat,display,readerAccess,comparisons,dialog,esc,
    loadValues:loadFilterValues,
    apply:()=>{offsets.clear();draw();return refresh();},
  });
}
function resetReading() {
  authorView.disabledFilters = new WeakSet();
  report = structuredClone(authorView.report);
  report.active = authorView.entry;
  mode = "report";
  selected = null;
  results = new Map();
  offsets = new Map(authorView.offsets);
  draw();
  return refresh();
}
async function enterReading(entry = report.active) {
  const owner = report;
  while (pendingAuthorChanges.size) await Promise.all([...pendingAuthorChanges]);
  if (owner!==report || mode==="home" || authorView) return;
  authorView = {report,entry,selected,mode,tab,offsets,hash:location.hash};
  if (report.id) history.replaceState(null,"","#"+report.id+"/read/page/"+report.pages[entry].id);
  return resetReading();
}
function restoreAuthor() {
  ({report,selected,mode,tab,offsets} = authorView);
  history.replaceState(null,"",location.pathname+location.search+authorView.hash);
  authorView = null;
  results = new Map();
}
async function openReport(id, pageId, reading = false) {
  const published=id.startsWith("p");
  let next;
  try {next=await api((published?"/api/publications/":"/api/reports/")+id);}
  catch(error){
    if(!published) throw error;
    await home();
    dialog("Published report unavailable","<p>"+esc(error.message)+"</p>");
    return;
  }
  restoreLegacyRankings(next, rankable);
  authorView = null;
  report = next;
  visualClipboard=null;
  const requested = pageId
    ? report.pages.findIndex((p) => p.id === pageId)
    : -1;
  if (requested >= 0) report.active = requested;
  edits.reset(report,null);
  dirty = false;
  selected = null;
  mode = "report";
  results.clear();
  offsets.clear();
  tab = "Build";
  search = "";
  history.replaceState(
    null,
    "",
    "#" + id + (requested >= 0 ? "/page/" + pageId : ""),
  );
  if (reading || published) await enterReading();
  else { draw(); await refresh(); }
  if (pageId && requested < 0)
    notify("This page is unavailable. Opened the saved report.");
}
function guardSwitch(fn) {
  if (!dirty) return fn();
  dialog(
    "Unsaved changes",
    "<p>Save your report before leaving this canvas?</p>" +
      btn("Save and continue", "save-switch", "primary") +
      btn("Discard changes", "discard-switch", "outline"),
  );
  $('#dialog [data-action="save-switch"]').onclick = async () => {
    try {
      if (authorView) { restoreAuthor(); draw(); await refresh(); }
      await saveReport();
      $("#dialog").close();
      await fn();
    } catch (e) {
      notify(e.message);
    }
  };
  $('#dialog [data-action="discard-switch"]').onclick = async () => {
    $("#dialog").close();
    await fn();
  };
}
async function library() {
  const list = await api("/api/reports");
  const transfer =
    btn("Import report", "import-package", "outline") +
    (mode !== "home"
      ? btn(
          dirty || !report.id ? "Save and export .keybi" : "Export .keybi",
          "export-package",
          "outline",
        )
      : "");
  dialog(
    "Workspace library",
    `<div class="library-actions">${btn("New report", "new", "outline")}${transfer}${mode!=="home" && !authorView ? btn("Publish report","publish-report","outline") : ""}${report.id ? btn("Save a copy", "copy", "outline") + btn("Get page link", "page-link", "outline") : ""}${page().visuals.length ? btn("Save dashboard", "dashboard", "outline") : ""}</div><div>${list.map((r) => `<button data-open="${esc(r.id)}" type="button" class="saveditem">${icon(r.kind === "dashboard" ? "library" : "report")}<b>${esc(r.title)}</b><small>${esc(new Date(r.updated).toLocaleDateString())}</small></button>`).join("") || '<p class="hint">Your saved reports appear here.</p>'}</div>`,
  );
}
async function home() {
  publishedLibrary=false;
  visualClipboard=null;
  focusView = null;
  dismissTooltip?.();
  generation++;
  mode = "home";
  authorView = null;
  document.body.classList.remove("reading");
  dirty = false;
  selected = null;
  document.body.classList.add("at-home");
  $("#home").hidden = false;
  $("#home h1").textContent="Saved reports";
  $('[data-action="published-library"]').textContent="Published reports";
  document.title = "Saved reports · KeyBI";
  $("#stats").textContent = "";
  $("#zoom").textContent = "";
  history.replaceState(null, "", location.pathname);
  const cards = await api("/api/reports");
  if (mode !== "home" || publishedLibrary) return;
  $("#report-cards").innerHTML =
    cards
      .map(
        (r) =>
          `<div class="library-report"><button class="report-card" data-open="${esc(r.id)}"><div class="report-preview">${/^data:image\/png;base64,/.test(r.preview || "") ? `<img alt="" src="${esc(r.preview)}">` : icon("report")}</div><div class="cardtext"><small>${r.pages} ${r.pages === 1 ? "page" : "pages"} · ${r.tables} tables</small><h2>${esc(r.title)}</h2><p>${esc(r.question || "")}</p></div></button><a class="library-read" href="#${esc(r.id)}/read" aria-label="Read ${esc(r.title)}">Read</a></div>`,
      )
      .join("") || "<p>Your saved reports will appear here.</p>";
}
function sampleDialog() {
  dialog(
    "Sample data",
    `<p>Download the three related tables, then choose them together in Get data.</p><div class="samplelinks">${["Sales", "Product", "Date"].map((t) => `<a href="/samples/${t}.csv" download>${t}.csv</a>`).join("")}</div><div class="dfoot">${btn("Import CSV", "sample-import", "primary")}</div>`,
  );
}
async function editPageSettings() {
  const { pageSettings } = await import("./tooltips.js");
  pageSettings(page(), {
    dialog,
    esc,
    textInput,
    titleOf,
    options:
      fieldOptions() +
      report.measures.map((m) => option("@" + m.id, m.name)).join(""),
    change,
  });
}
function dimensionChoices(p) {
  const members = p.members.map(id => lookup(decode(id)));
  return members.map((f,i) => ({id:p.members[i],name:!f ? "Missing field" :
    members.some((other,j) => i !== j && other?.name === f.name) ? f.table + " · " + f.name : f.name}));
}
function parameterChanged(id, previous) {
  const p = findParameter(report,id);
  const oldModel = previous && {...report,parameters:report.parameters.map(item => item.id === id ? previous : item)};
  for (const page of report.pages) for (const v of page.visuals) {
    if (p.kind === "dimension") {
      const changedAxis = [v.groups,v.columns].some(axis => axis?.some(field => field.parameter === id));
      const before = changedAxis && oldModel && {...readerVisual(v,oldModel)};
      const multiple = before && (previous.multiple || p.multiple);
      const priorSelection = v.selection;
      const next = dimensionField(p);
      for (const well of ["groups","columns","legendFields","startFields","endFields","phaseFields","smallMultiples"])
        (v[well] || []).forEach((prior,i) => {
          if (prior.parameter !== id || eq(prior,next)) return;
          if (multiple && v.kind === "matrix") v[well] = v[well].with(i,{...next});
          else replaceDimension(v,well,i,prior,{...next});
        });
      if (multiple) {
        const view = readerVisual(v);
        if (v.kind === "matrix") {
          const state = {...view,selection:priorSelection};
          updateMatrix(state,before,fieldname);
          v.selection = state.selection;
        } else if (hasAxisHierarchy(v.kind)) {
          v.level = Math.min(v.level || 0,Math.max(0,view.groups.length-1));
          v.expandedLevels = (v.expandedLevels || []).filter(i => i <= v.level);
          const axis = {...view,level:v.level,expandedLevels:v.expandedLevels};
          const ancestors = axis.groups.slice(0,v.level+1-axisFields(axis).length);
          v.trail = (v.trail || []).filter(step => ancestors.some(f => eq(step.field,f)));
          if (v.selection) v.selection.checkPoint = true;
        } else if (v.kind === "card") {
          v.selection = priorSelection;
          restoreSelection(v,view.groups,fieldname);
        } else if (v.kind === "decomposition") {
          v.treePath = (v.treePath || []).filter(step => view.groups.some(f => eq(step.field,f)));
          if (!view.groups.some(f => fkey(f) === v.splitField)) delete v.splitField;
          v.selection = null;
        }
      }
    } else if (v.selection && hasAxisHierarchy(v.kind) && [...v.metrics,...(v.other || [])].some(m => m.measure === id))
      v.selection.checkPoint = true;
  }
  offsets.clear();
}
function editParameter(existing) {
  const columns = fields().map(f => ({id:fkey(f),name:f.table + " · " + f.name}));
  if (columns.length < 2 && report.measures.length < 2) return notify("Import columns or create measures before defining a field parameter.");
  parameterDialog(existing,{report,columns,dialog,esc,textInput,uid,commit(p,addSlicer,previous) {
    if (addSlicer) {
      const slicer = visual()?.kind === "parameterSlicer" && !visual().parameter ? visual() : makeVisual("parameterSlicer");
      slicer.parameter = p.id;
    }
    parameterChanged(p.id,previous);
    change();
  }});
}
async function setParameterSelection(param,selection,source,member) {
  const previous = {...param};
  if (selection.length === 1 && selection[0] === param.default) delete param.current;
  else param.current = param.multiple ? selection : selection[0];
  parameterChanged(param.id,previous);
  touch();
  draw();
  const control = `[data-id="${source}"] [data-parameter-choice]${param.multiple ? '[value="' + CSS.escape(member) + '"]' : ""}`;
  $(control)?.focus({preventScroll:true});
  await refresh();
  if (mode === "report" && document.activeElement === document.body)
    $(control)?.focus({preventScroll:true});
}
function setMatrixWidth(v,key,width) {
  const matrix = $(`[data-id="${v.id}"] .vbody > folio-matrix`);
  const heading = matrix?.columns.find(th => th.dataset.columnKey === key);
  if (!heading || (v.matrixWidths?.[key] ?? null) === width) return;
  if (width === null) {
    delete v.matrixWidths[key];
    if (!Object.keys(v.matrixWidths).length) delete v.matrixWidths;
    delete heading.dataset.columnWidth;
  } else {
    (v.matrixWidths ??= {})[key] = width;
    heading.dataset.columnWidth = width;
  }
  matrix.sizeColumns();
  touch();
}
function editMatrixWidth(v) {
  const matrix = $(`[data-id="${v.id}"] .vbody > folio-matrix`);
  if (!matrix?.columns.length) return notify("Add fields to the matrix to size its columns.");
  const headings = matrix.columns;
  dialog("Edit matrix column width",
    selectInput("Column","column",headings.map(th => option(th.dataset.columnKey,th.dataset.columnLabel)).join("")) +
    '<label class="formlabel" for="column-width">Width (px)</label><input id="column-width" name="width" type="number" min="32" max="2000" step="1" aria-describedby="column-width-help"><small id="column-width-help">Leave blank to size this column automatically.</small>',
    "Apply", fd => setMatrixWidth(v,fd.get("column"),fd.get("width") === "" ? null : Number(fd.get("width"))));
  const select = $("#inp-column"), input = $("#column-width");
  function showWidth() {
    const th = headings[select.selectedIndex];
    input.value = th.dataset.columnWidth || "";
    input.placeholder = "Auto (" + th.offsetWidth + " px)";
  }
  select.onchange = showWidth;
  showWidth();
}
async function action(key) {
  switch (key) {
    case "publish-report": {
      if (authorView || mode==="home") return;
      const owner=report, {publicationDialog}=await import("./publication.js");
      if (report===owner) await publicationDialog({owner,current:()=>owner===report && !authorView,dirty:()=>dirty,save:saveReport,api,dialog,esc,option,notify});
      break;
    }
    case "published-library": {
      if (publishedLibrary) {await home();break;}
      publishedLibrary=true;
      $("#home h1").textContent="Published reports";
      $('[data-action="published-library"]').textContent="Saved reports";
      $("#report-cards").textContent="Loading published reports…";
      const [records,{publicationCards}]=await Promise.all([api("/api/publications"),import("./publication.js")]);
      if (mode==="home" && publishedLibrary) $("#report-cards").innerHTML=publicationCards(records,esc);
      break;
    }
    case "choose-image": {
      const item=visual();
      if (authorView || item?.kind!=="image") return;
      pendingImage={owner:report,sheet:page(),item};
      $("#image-file").click();
      break;
    }
    case "lock-layout": {
      if (authorView || !arranging) return;
      const items=page().visuals.filter(v=>arranging.ids.has(v.id));
      const lock=items.some(v=>!v.layoutLocked);
      for (const v of items) {
        if (lock) v.layoutLocked=true; else delete v.layoutLocked;
      }
      refreshFormatting();$('[data-action="lock-layout"]')?.focus({preventScroll:true});
      break;
    }
    case "copy-visuals":
      commandClipboard=rememberVisuals();
      try { if (commandClipboard) document.execCommand("copy"); }
      finally { commandClipboard=null; }
      break;
    case "paste-visuals":
      pasteRememberedVisuals();
      break;
    case "duplicate-visuals":
      insertVisuals(copyVisuals(page(),layoutSelection()));
      break;
    case "arrange":
      if (!authorView && mode==="report" && !focusView)
        chooseLayoutVisuals(arranging?.ids || (selected ? [selected] : []));
      break;
    case "undo":return travelHistory(-1);
    case "redo":return travelHistory(1);
    case "pin-series-colors": {
      const v = visual();
      v.colors = {...v.colors,...Object.fromEntries(seriesSwatches(v))};
      refreshFormatting();
      break;
    }
    case "focus-visual":
      focusVisual(visual());
      break;
    case "leave-focus":
      leaveFocus();
      break;
    case "toggle-reading":
      if (publishedReport()) return;
      if (authorView) { restoreAuthor(); draw(); await refresh(); }
      else await enterReading();
      $('[data-action="toggle-reading"]').focus({preventScroll:true});
      break;
    case "reader-reset":
      await resetReading();
      notify("Reading view reset");
      break;
    case "reader-filters":
      await showReaderFilters();
      break;
    case "matrix-width":
      if (visual()?.kind === "matrix") editMatrixWidth(visual());
      break;
    case "home":
      await guardSwitch(home);
      break;
    case "drill-back": {
      if (report.drill) {
        const origin = report.pages.findIndex(
          (p) => p.id === report.drill.from,
        );
        report.active = Math.max(0, origin);
        delete report.drill;
        selected = null;
        offsets.clear();
        change();
      }
      break;
    }
    case "dismiss":
      $("#dialog").close();
      break;
    case "bookmarks":
    case "reader-bookmarks":
      bookmarksDialog();
      break;
    case "monthly":
      monthlyDialog();
      break;
    case "formula":
      await editFormula();
      break;
    case "theme": {
      const { themeDialog } = await import("./theme.js");
      themeDialog(report, { dialog, esc, change });
      break;
    }
    case "theme-color": {
      const v = visual();
      if (v) {
        v.accent = null;
        change();
      }
      break;
    }
    case "show-chart-table":
    case "export-csv": {
      if (!visual()) return;
      const source = visual();
      if ($("#paper").dataset.pending === "true") await refresh();
      const {summarizeRows,showChartTable,downloadChartRows} = await import("./visual-data.js");
      if (source !== visual()) return;
      const v = readerVisual(visual());
      const result = results.get(v.id);
      if (!result || result.error || result.shape !== visualShape(v))
        return notify("Complete this visual to inspect its data.");
      const groups =
        v.kind === "matrix"
          ? [...v.groups, ...(v.columns || [])]
          : activeGroups(v);
      const metrics = metricsForVisual(v);
      const headings = ["table", "matrix"].includes(v.kind)
        ? [
            "groups",
            ...(v.kind === "matrix" ? ["columns"] : []),
            "metrics",
          ].flatMap((well) =>
            (v[well] || []).map((_, i) => columnCaption(v, well, i).text),
          )
        : [...groups.map(fieldname), ...metrics.map((m,i) => v.kind === "card" && i >= v.metrics.length ? referenceCaption(m) : valname(m))];
      const {header,rows:exportRows} = summarizeRows(result,groups,metrics,headings,valname);
      if (key === "show-chart-table") {
        showChartTable({source:$(`#paper [data-id="${v.id}"]`),title:displayTitle(v),header,rows:exportRows,groups,metrics,
          format:(metric,n)=>display(n,metricFormat(v,metric)),more:result.more,dialog,esc});
        return;
      }
      downloadChartRows(displayTitle(v),header,exportRows);
      break;
    }
    case "prepare":
      $("#prepare-file").click();
      break;
    case "import":
      $("#files").click();
      break;
    case "sqlserver":
      await sqlSource();
      break;
    case "sample-import":
      $("#dialog").close();
      $("#files").click();
      break;
    case "samples":
      sampleDialog();
      break;
    case "add":
      addDialog();
      break;
    case "measure":
      measureDialog();
      break;
    case "new-parameter":
      editParameter();
      break;
    case "calculation":
      measureDialog(true);
      break;
    case "new-bins":
      binDialog();
      break;
    case "new-time-bins":
      binDialog(null,null,true);
      break;
    case "group-selection": {
      const chart=visual(),members=chart && selectedGroupMembers(chart);
      if (members) await openMemberGroups(chart.groups[0],(field,name)=>replaceField(chart,"groups",0,fkey(field),name),members);
      break;
    }
    case "reset-heading-style":
      if (visual()) {delete visual().headingStyle;change();}
      break;
    case "merge":
      if (!authorView && report.tables.some(t=>!t.source)) openMerge();
      break;
    case "relationship":
      relationshipDialog();
      break;
    case "report":
    case "model":
      mode = key;
      draw();
      refresh();
      break;
    case "filter":
      document.body.classList.remove("hide-panes");
      await switchInspector("Filters");
      break;
    case "panes":
      document.body.classList.toggle("hide-panes");
      layout();
      break;
    case "library":
      await library();
      break;
    case "save":
      await saveReport();
      break;
    case "export-package": {
      if (report.tables.some((t) => t.source))
        throw Error(
          "Only reports with imported data can be exported as .keybi files.",
        );
      if (!report.id || dirty) await saveReport();
      const { downloadReport } = await import("./package.js");
      await downloadReport(report.id, report.title);
      $("#dialog").close();
      break;
    }
    case "import-package":
      $("#package-file").click();
      break;
    case "page-link":
    case "reader-link":
    case "save-page-link": {
      if (key === "save-page-link") await saveReport();
      else if (dirty) {
        const saved = await api("/api/reports/" + report.id);
        if (!saved.pages.some((p) => p.id === page().id)) {
          if (authorView) return notify("Save this page in the editor to create a reading link.");
          dialog(
            "Save this page first",
            btn("Save and get page link", "save-page-link", "primary"),
          );
          break;
        }
      }
      const url = new URL(location.pathname, location.origin);
      url.hash = report.id + (authorView ? "/read" : "") + "/page/" + page().id;
      dialog(
        "Link to " + page().name,
        `<label class="formlabel">Local page link<input class="control" id="local-page-link" readonly value="${esc(url.href)}"></label>${authorView ? "<p>Opens the saved page with its authored filters.</p>" : ""}${btn("Copy link", "copy-link", "primary")}`,
      );
      $("#local-page-link").select();
      break;
    }
    case "copy-link": {
      await navigator.clipboard.writeText($("#local-page-link").value);
      notify("Page link copied");
      break;
    }
    case "copy":
      $("#dialog").close();
      await saveReport(true);
      break;
    case "dashboard": {
      const snap = structuredClone(report);
      delete snap.id;
      delete snap.revision;
      snap.kind = "dashboard";
      snap.title += " dashboard";
      snapshotSlicerFilters(snap,snap.pages[snap.active]);
      snap.pages = [snap.pages[snap.active]];
      snap.active = 0;
      await api("/api/reports", { report: snap });
      await library();
      notify("Dashboard saved to library");
      break;
    }
    case "new":
      $("#dialog").close();
      guardSwitch(() => {
        report = fresh();
        visualClipboard=null;
        edits.reset(report,null);
        mode = "report";
        tab = "Build";
        dirty = false;
        selected = null;
        results.clear();
        offsets.clear();
        search = "";
        history.replaceState(null, "", location.pathname);
        draw();
        refresh();
      });
      break;
    case "page-settings":
      await editPageSettings();
      break;
    case "page-add":
      report.pages.push({
        id: uid(),
        name: "Page " + (report.pages.length + 1),
        filters: [],
        visuals: [],
      });
      report.active = report.pages.length - 1;
      selected = null;
      mode = "report";
      change();
      break;
    case "remove-visual": {
      const v = visual();
      if (!v) break;
      dialog(
        "Remove visual",
        `<p>Remove ${esc(titleOf(v))} from this page?</p>`,
        "Remove",
        () => {
          page().visuals = page().visuals.filter((o) => o.id !== v.id);
          selected = null;
          change();
        },
      );
      break;
    }
  }
}

function clearOffsetsExceptPanel(v) {
  const key="panels:"+v.id,offset=offsets.get(key);offsets.clear();if(offset)offsets.set(key,offset);
}
function clearSelection(id) {
  const v = page().visuals.find(x=>x.id===id) || hiddenSlicers(report,page()).find(x=>x.id===id);
  if (v) {
    v.selection = null;
    delete v.range;
    copySyncedSelection(report,v);
    clearOffsetsExceptPanel(v);
    change();
  }
}
document.addEventListener("folio-map-view", (event) => {
  const id = event.target.closest(".visual")?.dataset.id;
  const v = page().visuals.find((v) => v.id === id && v.kind === "map");
  if (!v) return;
  v.mapView = event.detail;
  touch();
});
document.addEventListener("click", async (event) => {
  const el = event.target.closest(
    "button,[data-tab],[data-point],[data-gantt-toggle],[data-axis-pick],[data-detail-row]",
  );
  const article = event.target.closest(".visual");
  if (article && !authorView && !focusView && (event.ctrlKey || event.metaKey) &&
      event.target.closest(".vhead") && !el) {
    toggleLayoutVisual(article.dataset.id);
    return;
  }
  if (article && (selected !== article.dataset.id || (arranging && !event.target.closest(".vhead"))))
    selectedVisual(article.dataset.id);
  if (!el) {
    if (event.target.id === "paper") {
      selectedVisual(null);
    }
    return;
  }
  const d = el.dataset;
  try {
    if (d.layer && arranging && !authorView) {
      const reordered=moveLayers(page().visuals,arranging.ids,d.layer);
      if (reordered.some((v,i)=>v!==page().visuals[i])) {
        page().visuals=reordered;
        touch();canvas();inspector();
        const control=$('#inspector [data-layer="'+d.layer+'"]');
        (control?.disabled ? $('#inspector [data-layout-id="'+CSS.escape(selected)+'"]') : control)?.focus({preventScroll:true});
      }
      return;
    }
    if (d.arrange && arranging && !authorView) {
      const visuals=page().visuals.filter(v=>arranging.ids.has(v.id) && !v.layoutLocked);
      if (arrangeVisuals(visuals,d.arrange)) {
        visuals.forEach(paintPosition);
        touch();layout();
      }
      return;
    }
    if (el.hasAttribute("data-unpin-color")) {
      const v = visual();
      delete v.colors[el.dataset.unpinColor];
      if (!Object.keys(v.colors).length) delete v.colors;
      refreshFormatting();
      return;
    }
    if (el.hasAttribute("data-reset-point-color")) return setPointColor(null);
    if (d.parameterMove) {
      const p = findParameter(report,visual()?.parameter);
      if (!p?.multiple) return;
      const order = [...membersOf(p)], from = order.indexOf(d.member), to = from + Number(d.parameterMove);
      if (from < 0 || to < 0 || to >= order.length) return;
      order.splice(to,0,...order.splice(from,1));
      await setParameterSelection(p,order,article.dataset.id,d.member);
      return;
    }
    if (d.bookmarkGo || d.bookmarkUpdate) {
      const b = report.bookmarks?.find(
        (mark) => mark.id === (d.bookmarkGo || d.bookmarkUpdate),
      );
      if (!b) return notify("Bookmark unavailable.");
      if (d.bookmarkGo) {
        applyBookmark(report, b, boundFields, fieldname, alignBookmark, parameterChanged);
        selected = null;
        mode = "report";
        offsets.clear();
      } else Object.assign(b, bookmarkState(report, boundFields));
      if ($("#dialog").open) $("#dialog").close();
      change();
      return;
    }
    if (d.action==="edit-narrative" && !authorView) {
      const v=visual(),owner=report,sheet=page();
      const {editNarrative}=await import("./narrative-editor.js");
      if (owner!==report || sheet!==page() || v!==visual() || v.kind!=="narrative") return;
      const sources=valueSources();
      editNarrative(v,{dialog,esc,sources,commit:(story,metrics)=>{
        if (owner!==report || sheet!==page() || !sheet.visuals.includes(v)) throw Error("Reopen this narrative to edit its current values.");
        v.narrativeText=story;v.metrics=metrics;change();
      }});
      return;
    }
    if (d.sparkDetail!==undefined && article) {
      const v=page().visuals.find(item=>item.id===article.dataset.id),s=v?.sparklines?.find(s=>s.id===d.sparkDetail);
      if (s) {
        const view=readerVisual(v),[row,pivot]=JSON.parse(d.sparkPath);
        const context=[...row.map((value,i)=>fieldname(view.groups[i])+" · "+groupLabels(view.groups)(value,i)),
          ...pivot.map((value,i)=>fieldname(view.columns[i])+" · "+groupLabels(view.columns)(value,i))].join(" / ");
        inspectSpark(s,results.get(v.id)?.sparks?.get(s.id),d.sparkPath,{esc,dialog,heading:el.getAttribute("aria-label").slice(8),
          context,axisName:fieldname(s.axis),axisLabel:value=>groupLabels([s.axis])(value,0),format:sparkFormat});
      }
      return;
    }
    if ((d.sparkEdit!==undefined || d.sparkRemove!==undefined) && !authorView) {
      const v=visual(),owner=report,sheet=page();
      if (!["matrix","table"].includes(v?.kind)) return;
      if (d.sparkRemove!==undefined) {
        v.sparklines=v.sparklines.filter(s=>s.id!==d.sparkRemove);change();return;
      }
      const {editSparkline}=await import("./sparkline-editor.js");
      if (owner!==report || sheet!==page() || v!==visual()) return;
      const sources=valueSources(),columns=sources.filter(s=>s.binding.field).map(s=>({...s,field:s.binding.field}));
      if (!columns.length) return notify("Import a table before adding a sparkline.");
      const existing=v.sparklines?.find(s=>s.id===d.sparkEdit);
      editSparkline({existing,initial:v.metrics[Number(d.sparkSource||0)],columns,sources,uid,dialog,esc,commit:s=>{
        if (owner!==report || sheet!==page() || !sheet.visuals.includes(v)) throw Error("Reopen the current visual to edit its sparklines.");
        const list=v.sparklines||[];
        if (list.some(t=>t!==existing && t.name===s.name)) throw Error("Choose a distinct column heading.");
        if (!existing && list.length>=5) throw Error("Use at most five sparklines per visual.");
        v.sparklines=existing?list.map(t=>t===existing?s:t):[...list,s];
        if(!v.metrics.length && (!v.groups.length || v.kind==="matrix"))v.metrics.push(structuredClone(s.binding));
        change();
      }});return;
    }
    if (d.viewImage) {
      const img=el.querySelector("img");
      if (img) viewImage(img,dialog,esc);
      return;
    }
    if ((d.mapImage!==undefined || d.removeImage!==undefined) && !authorView) {
      const v=visual(), field=v?.groups[0];
      if (v?.kind!=="image" || !field) return;
      if (d.removeImage!==undefined) {
        v.imageMappings.splice(Number(d.removeImage),1);refreshFormatting();return;
      }
      const owner=report, sheet=page(), existing=v.imageMappings?.[Number(d.mapImage)];
      const {mapImageDialog}=await import("./map-image.js");
      if (owner!==report || page()!==sheet || !sheet.visuals.includes(v)) return;
      mapImageDialog({existing,field,column:lookup(field),dialog,esc,valueCaption,api,uploadImage,
        load:async(offset,query)=>(await loadFilterValues([field],offset,query))[0],
        commit:(value,image,alt)=>{
          if (report!==owner || !sheet.visuals.includes(v) || !eq(v.groups[0],field)) throw Error("Reopen the image to edit its current field.");
          v.imageMappings??=[];
          const previous=v.imageMappings.find(m=>eq(m.field,field) && m.value===value);
          if (previous && previous!==existing) throw Error("This field value already has an image. Select its entry to replace it.");
          if (existing) Object.assign(existing,{image,value,alt});
          else v.imageMappings.push({field:ref(field),value,image,alt});
          refreshFormatting();
        }
      });
      return;
    }
    if (d.refreshMerge) {
      const table=report.tables.find(t=>t.id===d.refreshMerge);
      if (table?.merge && !authorView) await openMerge(table);
      return;
    }
    if (d.revise) {
      const table = report.tables.find((t) => t.id === d.revise);
      if (!table || table.source) return;
      pendingUpdate = {
        owner: report,
        table,
        version: table.storageId || table.id,
      };
      $("#update-file").click();
      return;
    }
    if (d.editParameter) {
      editParameter(findParameter(report,d.editParameter));
      return;
    }
    if (d.editMeasure) {
      await editFormula(measure(d.editMeasure));
      return;
    }
    if (d.action) {
      await action(d.action);
      return;
    }
    if ((d.slicerValues!==undefined || d.slicerPaste!==undefined) && article) {
      await chooseSlicerValues(page().visuals.find(item=>item.id===article.dataset.id),d.slicerPaste!==undefined ? "" : undefined);
      return;
    }
    if (d.open) {
      $("#dialog").close();
      await guardSwitch(() => openReport(d.open));
      return;
    }
    if (d.tab || d.viewFilters !== undefined) {
      if (authorView && d.viewFilters !== undefined) return await showReaderFilters(visual());
      if (arranging) selectedVisual(selected);
      await switchInspector(d.tab || "Filters");
      return;
    }
    if (d.create) {
      $("#dialog").close();
      makeVisual(d.create);
      change();
      return;
    }
    if (d.kind) {
      chooseKind(d.kind);
      return;
    }
    if (d.field) {
      addField(d.field);
      return;
    }
    if (d.page !== undefined) {
      if (report.active === Number(d.page) && mode === "report") return;
      delete report.drill;
      offsets.clear();
      report.active = Number(d.page);
      selected = null;
      mode = "report";
      change();
      if (event.detail === 0) $('#pages [aria-current="page"]')?.focus({preventScroll:true});
      return;
    }
    if (d.clear) {
      const fromOther = el.closest("#other-selections");
      clearSelection(d.clear);
      if (fromOther) ($("#other-selections button") || $('[data-action="leave-focus"]') || $("#focus-picker")).focus({preventScroll:true});
      return;
    }
    if (d.newFilter || d.editColumnFilter) {
      const [scope,index]=(d.newFilter || d.editColumnFilter).split(":");
      await filterDialog(scope,index);
      return;
    }
    if (d.measureFilter !== undefined) {
      editMeasureFilter(d.measureFilter === "new" ? null : Number(d.measureFilter));
      return;
    }
    if (d.readerAccess) {
      const [scope,index]=d.readerAccess.split(":");
      editReaderAccess(scope,Number(index));return;
    }
    if (d.clearMeasureFilter !== undefined) {
      const v = visual();
      // Keep links to older rules stable as their positions in the list change.
      for (const rule of v.measureFilters) rule.id ??= ruleIdentity(v, rule);
      delete v.readerAccess?.[v.measureFilters[Number(d.clearMeasureFilter)].id];
      v.measureFilters.splice(Number(d.clearMeasureFilter), 1);
      offsets.delete(visual().id);
      change();
      return;
    }
    if (d.removeFilter) {
      const [scope, i] = d.removeFilter.split(":");
      const owner=filterOwner(scope);
      if (owner.readerAccess) {
        for (const rule of owner.filters) rule.id ??= readerRuleKey(owner,rule);
        delete owner.readerAccess[owner.filters[Number(i)].id];
      }
      owner.filters.splice(Number(i), 1);
      offsets.clear();
      change();
      return;
    }
    if (d.unlink !== undefined) {
      const i = Number(d.unlink);
      dialog(
        "Remove relationship",
        "<p>Visuals using both tables will need a new relationship.</p>",
        "Remove",
        () => {
          report.links.splice(i, 1);
          change();
        },
      );
      return;
    }
    const v = visual();
    if (d.syncSlicers!==undefined && syncable(v)) {
      syncSlicerDialog(report,v,{dialog,esc,titleOf,fieldname,change});return;
    }
    if (d.addReference || d.editReference || d.removeReference) {
      const ref = v?.referenceLines?.find(r => r.id === (d.editReference || d.removeReference));
      if (!v || (!d.addReference && !ref)) return;
      if (d.removeReference) {
        v.referenceLines = v.referenceLines.filter(r => r !== ref);
        refreshFormatting();
        return;
      }
      const axis = ref ? referenceAxis(v,ref) : d.addReference;
      const role = formatAxisRoles(v).find(([key]) => key === axis);
      if (!role) return;
      const {editReferenceLine} = await import("./reference-editor.js");
      editReferenceLine(v, axis, ref, {title:role[1],format:referenceFormat(v,axis),sources:referenceSources(),valname,dialog,esc,uid,apply:refreshFormatting});
      return;
    }
    if (d.tableSort !== undefined && v?.kind === "table") {
      const i = Number(d.tableSort);
      const keys = tableColumnKeys(v),
        key = keys[i];
      if (!key) return;
      const sorts = tableSorts(v, keys);
      const previous = sorts.find((s) => s.key === key)?.order;
      const order = previous
        ? previous === "desc"
          ? "asc"
          : "desc"
        : i < readerVisual(v).groups.length
          ? "asc"
          : "desc";
      v.tableSort = [
        ...(event.shiftKey ? sorts.filter((s) => s.key !== key) : []),
        { key, order },
      ];
      offsets.delete(v.id);
      const focused = document.activeElement === el;
      touch();
      await refresh();
      if (focused && document.activeElement === document.body && v === visual())
        article
          .querySelector(`[data-table-sort="${i}"]`)
          ?.focus({ preventScroll: true });
      return;
    }
    if (d.ganttToggle !== undefined && v?.kind === "gantt") {
      const phase = JSON.parse(d.ganttToggle),
        hidden = v.hiddenWorkstreams || [];
      v.hiddenWorkstreams = hidden.includes(phase)
        ? hidden.filter((x) => x !== phase)
        : [...hidden, phase];
      change();
      return;
    }
    if (d.matrixAxis && v) {
      v.collapsed ??= {};
      const list = v.collapsed[d.matrixAxis] || [];
      v.collapsed[d.matrixAxis] = list.includes(d.branch)
        ? list.filter((p) => p !== d.branch)
        : [...list, d.branch];
      change();
      return;
    }
    if(d.panelPage!==undefined && v?.smallMultiples?.length){
      offsets.set("panels:"+v.id,Math.max(0,Number(d.panelPage)));
      await refresh(v.id);
      const article=$('#paper [data-id="'+CSS.escape(v.id)+'"]');
      (article?.querySelector('[data-panel-page]:enabled') || article?.querySelector(".panel-heading"))?.focus({preventScroll:true});
      return;
    }
    if (d.facetPick!==undefined && v) {
      const field=readerVisual(v).smallMultiples?.[0];if(!field)return;
      selectPoint(v,[{field,value:JSON.parse(d.facetPick)}],event.ctrlKey || event.metaKey || v.multiSelect);
      if(v.selection)v.selection.facet=true;
      clearOffsetsExceptPanel(v);change();return;
    }
    if (d.axisPick !== undefined && v) {
      const values = JSON.parse(d.axisPick), fields = axisFields(readerVisual(v));
      selectPoint(v,values.map((value,i) => ({field:fields[i],value})),event.ctrlKey || event.metaKey || v.multiSelect);
      if (v.selection) v.selection.axis = true;
      clearOffsetsExceptPanel(v);
      change();
      return;
    }
    if (d.legendPick !== undefined && v) {
      const field = legendField(readerVisual(v));
      if (!field) return;
      selectPoint(v,[{field,value:JSON.parse(d.legendPick)}],event.ctrlKey || event.metaKey || v.multiSelect);
      if (v.selection) v.selection.legend = true;
      clearOffsetsExceptPanel(v);
      change();
      return;
    }
    if ((d.detailRow!==undefined || el.hasAttribute("data-detail-pick")) && v?.kind==="table") {
      const selection=window.getSelection();
      if (d.detailRow!==undefined && selection && !selection.isCollapsed && el.contains(selection.anchorNode)) return;
      const values=JSON.parse(d.detailRow ?? d.selectionKey),fields=activeGroups(readerVisual(v));
      if (!fields.length || fields.length!==values.length) return;
      selectPoint(v,fields.map((field,i)=>({field,value:values[i]})),event.ctrlKey || event.metaKey || v.multiSelect);
      const offset=offsets.get(v.id);
      offsets.clear();if (offset) offsets.set(v.id,offset);
      change();return;
    }
    if ((d.matrixPick || d.cardPick || d.point !== undefined || d.selectionKey !== undefined) && v) {
      const row = d.selectionKey === undefined ? results.get(v.id)?.rows?.[Number(d.point)] : JSON.parse(d.selectionKey);
      const filters = d.matrixPick || d.cardPick
        ? JSON.parse(d.matrixPick || d.cardPick)
        : chartGroups(readerVisual(v)).map((field, i) => ({ field, value: row[i] }));
      if (d.cardPick || d.selectionKey !== undefined) selectPoint(v,filters,event.ctrlKey || event.metaKey || v.multiSelect);
      else v.selection =
        samePoint(v.selection?.filters,filters)
          ? null
          : {
              ...filters[0],
              filters,
              label: filters.map(filterCaption).join(" · "),
            };
      const sourceOffset = d.cardPick && offsets.get(v.id);
      clearOffsetsExceptPanel(v);
      if (sourceOffset) offsets.set(v.id,sourceOffset);
      change();
      return;
    }
    if (d.treeStep !== undefined || d.treeUp !== undefined) {
      if (d.treeUp !== undefined)
        v.treePath = (v.treePath || []).slice(0, Number(d.treeUp));
      else
        v.treePath = [
          ...(v.treePath || []),
          {
            field: chartGroups(readerVisual(v))[0],
            value: results.get(v.id).rows[Number(d.treeStep)][0],
          },
        ];
      v.selection = null;
      delete v.splitField;
      change();
      return;
    }
    if (d.replaceField !== undefined && v) {
      chooseReplacement(v,el.closest("[data-well]").dataset.well,Number(d.replaceField));
      return;
    }
    if (d.transferField !== undefined && v) {
      chooseFieldDestination(v,el.closest("[data-well]").dataset.well,Number(d.transferField));
      return;
    }
    if (d.moveField && v) {
      const from = Number(el.closest("[data-bound-index]").dataset.boundIndex);
      moveField(v, el.closest("[data-well]").dataset.well, from, from + Number(d.moveField));
      return;
    }
    if (d.removeField && v) {
      const [well, i] = d.removeField.split(":");
      if (well === "tooltipFields") {
        v[well].splice(Number(i), 1);
        change();
        return;
      }
      delete v.treePath;
      delete v.range;
      const removedRule = well === "metrics" ? metricKey(v.metrics[i]) : null;
      v[well].splice(Number(i), 1);
      if (v.kind === "card") offsets.delete(v.id);
      v.headings?.[well]?.splice(Number(i), 1);
      if (removedRule && !v.metrics.some((m) => metricKey(m) === removedRule)) {
        delete v.cellRules?.[removedRule];
        delete v.cellBars?.[removedRule];
        delete v.cellIcons?.[removedRule];
      }
      if (v.kind === "table") {
        offsets.delete(v.id);
        if (v.tableSort) v.tableSort = tableSorts(v, tableColumnKeys(v));
      }
      v.selection = null;
      v.trail = [];
      v.level = 0;
      delete v.expandedLevels;
      change();
      return;
    }
    if (d.item !== undefined && v) {
      const r = results.get(v.id)?.rows?.[Number(d.item)];
      if (!r) return;
      const field = activeGroups(readerVisual(v))[0];
      if (
        v.kind === "list" &&
        (v.multiSelect || event.ctrlKey || event.metaKey)
      ) {
        const previous = Array.isArray(v.selection?.value)
          ? v.selection.value
          : v.selection
            ? [v.selection.value]
            : [];
        const value = previous.includes(r[0])
          ? previous.filter((item) => item !== r[0])
          : [...previous, r[0]];
        setSlicerValues(v,field,value);
      } else
        v.selection =
          v.selection &&
          eq(field, v.selection.field) &&
          v.selection.value === r[0]
            ? null
            : { field, value: r[0] };
      offsets.clear();
      change();
      return;
    }
    if (d.pageDelta && v) {
      const inc = v.kind === "table" ? 25 : types[v.kind] ? 500 : 100;
      offsets.set(
        v.id,
        Math.max(0, (offsets.get(v.id) || 0) + Number(d.pageDelta) * inc),
      );
      refresh();
      return;
    }
    if (d.through && v?.selection) {
      const target = report.pages.findIndex((p) => p.id === v.target);
      if (target < 0) return;
      report.drill = {
        from: page().id,
        target: v.target,
        filters: [
          ...spec(v).filters,
          ...(v.selection.filters || [predicate(v)]),
        ],
        label: selectionCaption(v),
      };
      report.active = target;
      selected = null;
      offsets.clear();
      change();
      return;
    }
    if (d.drill && v) {
      v.trail ??= [];
      const level = v.level || 0;
      if (d.drill === "up" && level) {
        v.expandedLevels = (v.expandedLevels || []).filter(n => n < level);
        v.level = level - 1;
        const restored = axisFields(readerVisual(v));
        v.trail = v.trail.filter(p => !restored.some(f => eq(f, p.field)));
      } else if (readerVisual(v).groups[level + 1]) {
        if (d.drill === "expand") (v.expandedLevels ??= []).push(level + 1);
        else if (d.drill === "down" && v.selection) {
          const axis = axisFields(readerVisual(v));
          v.trail.push(...(v.selection.filters || [predicate(v)]).slice(0, axis.length));
        }
        else if (d.drill !== "next") return;
        v.level = level + 1;
      } else return;
      v.selection = null;
      offsets.clear();
      change();
    }
  } catch (e) {
    notify(e.message);
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.dataset.layoutId && arranging && !authorView) {
    const id=e.target.dataset.layoutId;
    toggleLayoutVisual(id);
    $('#inspector [data-layout-id="'+CSS.escape(id)+'"]')?.focus({preventScroll:true});
    return;
  }
  const el = e.target,
    v = visual();
  try {
    if (el.hasAttribute("data-image-field") && v?.kind==="image" && !authorView) {
      v.groups=el.value ? [decode(el.value)] : [];change();return;
    }
    if (el.id==="image-file") {
      const file=el.files[0], pending=pendingImage;
      pendingImage=null;el.value="";
      if (!file || !pending) return;
      await trackAuthorChange((async()=>{
        const image=await uploadImage(file,api);
        if (report!==pending.owner || !report.pages.includes(pending.sheet) || !pending.sheet.visuals.includes(pending.item) || authorView) return;
        pending.item.image=image;
        refreshFormatting();
      })());
      return;
    }
    if (el.id === "focus-picker") {
      if (!el.value) leaveFocus();
      else focusVisual(page().visuals.find(item=>item.id===el.value),true);
      return;
    }
    if (el.id === "reader-layout" && authorView) {
      authorView.layout = el.value;
      canvas();
      $("#viewport").scrollTo(0,0);
      return;
    }
    if (el.id === "package-file") {
      const file = el.files[0];
      el.value = "";
      if (file)
        await guardSwitch(async () => {
          const { importReport } = await import("./package.js");
          const saved = await importReport(file);
          if ($("#dialog").open) $("#dialog").close();
          await openReport(saved.id);
          notify("Imported " + saved.title);
        });
      return;
    }
    if (el.id === "update-file") {
      const file = el.files[0],
        pending = pendingUpdate;
      el.value = "";
      pendingUpdate = null;
      if (file && pending?.owner === report) {
        if (/\.xlsx$/i.test(file.name)) {
          const {updateWorksheet}=await import("./workbook-import.js");
          await updateWorksheet(file,pending.table,{api,dialog,esc,current:()=>pending.owner===report,
            commit:(sheet,mode)=>trackAuthorChange(updateTable(pending.owner,pending.table,pending.version,file,null,mode,sheet))});
          return;
        }
        const { updateFileDialog } = await import("./preparation.js");
        await updateFileDialog(file, pending.table, {
          dialog,
          esc,
          commit: (plan, mode) =>
            updateTable(
              pending.owner,
              pending.table,
              pending.version,
              file,
              plan,
              mode,
            ),
        });
      }
      return;
    }
    if (el.id === "prepare-file") {
      const file = el.files[0];
      el.value = "";
      if (file) {
        const { prepareCsv } = await import("./preparation.js");
        await prepareCsv(file, { dialog, esc, importFiles });
      }
      return;
    }
    if (el.id === "files") {
      const files = Array.from(el.files);
      el.value = "";
      await importFiles(files);
      return;
    }
    if (!v && !el.closest(".visual")) return;
    if (el.hasAttribute("data-parameter-binding") && v?.kind === "parameterSlicer") {
      if (el.value) v.parameter = el.value;
      else delete v.parameter;
      change();
      return;
    }
    if (el.dataset.parameterChoice) {
      const param = findParameter(report,el.dataset.parameterChoice);
      if (!param?.members.includes(el.value)) return;
      const source = el.closest(".visual").dataset.id;
      let selection = [el.value];
      if (param.multiple) {
        const previous = membersOf(param);
        selection = el.checked ? [...previous,el.value] : previous.filter(id => id !== el.value);
        if (!selection.length) selection = [...param.members];
      }
      await setParameterSelection(param,selection,source,el.value);
      return;
    }
    if (el.hasAttribute("data-binding-format")) {
      const key = el.dataset.bindingFormat;
      if (el.value) (v.bindingFormats ??= {})[key] = el.value;
      else if (v.bindingFormats) {
        delete v.bindingFormats[key];
        if (!Object.keys(v.bindingFormats).length) delete v.bindingFormats;
      }
      refreshFormatting();
      $(`[data-binding-format="${CSS.escape(key)}"]`)?.focus({preventScroll:true});
      return;
    }
    if (el.id === "cell-rule-field") {
      chosenRuleField = el.value;
      inspector();
      return;
    }
    if (el.id === "card-columns" && v.kind === "card") {
      if (el.value) v.cardColumns = Number(el.value);
      else delete v.cardColumns;
      touch();
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (body) body.innerHTML = visualBody(v);
      return;
    }
    if (el.id === "card-text-size" && v.kind === "card") {
      if (!el.validity.valid || !Number.isInteger(el.valueAsNumber)) {
        el.value = cardTextSize(v);
        return notify("Enter a whole-number text size from 8 to 160 px.");
      }
      v.calloutSize = el.valueAsNumber;
      touch();
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (body) body.innerHTML = visualBody(v);
      return;
    }
    if (el.dataset.cellSetting) {
      const key = $("#cell-rule-field").value;
      const chart = supportsPointColors(v);
      const view = readerVisual(v);
      editCellRule(
        v,
        key,
        el.dataset.cellSetting,
        el,
        v.kind === "card" ? cardMetricFormat : metricFormat,
        results.get(v.id),
        ruleFormat,
        chart ? () => ({...view,groups:activeGroups(view),metrics:metricsForVisual(view)}) : readerVisual,
        formatBindingKey,
        chart ? view.metrics : metricsForVisual(v),
        chart,
      );
      chosenRuleField = key;
      if (chart && v.cellRules && v.tooltips !== false) ensureTooltips();
      if (["icon-source","icon-op","color-source","color-op"].includes(el.dataset.cellSetting)) {
        const rules = el.dataset.cellSetting.startsWith("icon-") ? v.cellIcons : v.kind === "card" ? v.calloutRules : v.cellRules;
        const source = rules?.[key]?.source;
        const available = [...metricsForVisual(readerVisual(v)).map(formatBindingKey), ...(results.get(v.id)?.hiddenKeys || [])];
        if (source && (!available.includes(metricKey(source)) || $("#paper").dataset.pending === "true")) {
          change();
          return;
        }
      }
      touch();
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (body) body.innerHTML = visualBody(v);
      inspector();
      return;
    }
    if (el.hasAttribute("data-range") || el.hasAttribute("data-slice-drop")) {
      const source = page().visuals.find(
        (item) => item.id === el.closest(".visual").dataset.id,
      );
      const field = source.groups[0];
      if (el.hasAttribute("data-range")) {
        const range = [...(source.range || ["", ""])];
        range[Number(el.dataset.range)] = el.value;
        if (
          !el.validity.valid ||
          (range[0] && range[1] && range[0] > range[1])
        ) {
          el.value = source.range?.[Number(el.dataset.range)] || "";
          return notify("Choose a valid date range.");
        }
        source.range = range;
        const filters = range.flatMap((value, i) =>
          value ? [{ field, value, op: i ? "lte" : "gte" }] : [],
        );
        source.selection = filters.length
          ? {
              ...filters[0],
              filters,
              label: range.map((v) => v || "Any date").join(" – "),
            }
          : null;
      } else {
        source.selection =
          el.value === ""
            ? null
            : {
                field,
                value: results.get(source.id).rows[Number(el.value)][0],
              };
      }
      offsets.clear();
      change();
      return;
    }
    if (el.hasAttribute("data-tree-split")) {
      const source = page().visuals.find(
        (item) => item.id === el.closest(".visual").dataset.id,
      );
      source.splitField = el.value;
      source.selection = null;
      change();
      return;
    }
    if (el.id === "color-point") {
      chosenColorPoint = el.value;
      inspector();
      $("#color-point")?.focus({preventScroll:true});
      return;
    }
    if (el.id === "point-fill") return setPointColor(el.value);
    if (el.hasAttribute("data-color-key")) {
      v.colors = {...v.colors,[el.dataset.colorKey]:el.value};
      refreshFormatting();
      return;
    }
    if (el.dataset.interactionMode) {
      const id = el.dataset.interactionMode;
      v.highlightTargets = (v.highlightTargets || []).filter(
        (target) => target !== id,
      );
      if (el.value === "highlight") v.highlightTargets.push(id);
      change();
      return;
    }
    if (el.dataset.interact) {
      const id = el.dataset.interact;
      v.ignoreTargets = (v.ignoreTargets || []).filter(
        (target) => target !== id,
      );
      if (!el.checked) v.ignoreTargets.push(id);
      change();
      return;
    }
    if (el.dataset.axisTitleInput) {
      const axis = el.dataset.axisTitleInput;
      const settings = {...v.axes?.[axis]};
      if (el.value.trim()) settings.title = el.value.trim();
      else delete settings.title;
      v.axes = {...v.axes,[axis]:settings};
      refreshFormatting();
      return;
    }
    if (el.dataset.axisKey) {
      const axis = el.dataset.axisKey,
        key = el.dataset.bound,
        range = { ...v.axes?.[axis] };
      if (el.value === "") delete range[key];
      else range[key] = Number(el.value);
      if (
        !el.validity.valid ||
        (range.min !== undefined &&
          range.max !== undefined &&
          range.max <= range.min)
      ) {
        inspector();
        return notify("The maximum must exceed the minimum.");
      }
      v.axes = { ...v.axes, [axis]: range };
      refreshFormatting();
      return;
    }
    if (el.dataset.scheduleBound) {
      const range = {
        ...v.scheduleRange,
        [el.dataset.scheduleBound]: el.value,
      };
      if (
        !el.validity.valid ||
        (range.from && range.through && range.from > range.through)
      ) {
        inspector();
        return notify("Choose a timeline end on or after its start.");
      }
      v.scheduleRange = range;
      change();
      return;
    }
    if (el.id === "tooltip-page") {
      if (el.value === "new") {
        const target = {
          id: uid(),
          name: "Tooltip " + (1 + report.pages.filter((p) => p.tooltip).length),
          tooltip: true,
          visuals: [],
          filters: [],
        };
        report.pages.push(target);
        v.tooltipPage = target.id;
        report.active = report.pages.length - 1;
        selected = null;
        tab = "Build";
      } else v.tooltipPage = el.value;
      if (v.tooltipPage !== "fields") v.tooltips = true;
      change();
      return;
    }
    if (el.dataset.timeSort !== undefined && v?.kind === "table") {
      const index = Number(el.dataset.timeSort), field = readerVisual(v).groups[index];
      if (!field) return;
      const key = tableColumnKeys(v)[index];
      if (el.checked) {
        el.disabled = true;
        await trackAuthorChange((async () => {
          const [check] = await api("/api/query",{...modelRequest(),visuals:[{groups:[field],metrics:[],
            filters:[],sortColumn:0,utcSortColumns:[0],order:"asc",limit:1}]});
          if (!el.isConnected || visual() !== v) return;
          if (check.error) {
            inspector();
            return notify("Choose a column containing ISO dates or timestamps. " + check.error);
          }
          v.utcSortFields = [...(v.utcSortFields || []).filter(f=>!eq(f,field)),ref(field)];
          const sorts = tableSorts(v,tableColumnKeys(v));
          if (!sorts.some(s=>s.key===key)) v.tableSort = [{key,order:"asc"},...sorts];
          offsets.delete(v.id);change();
        })()).finally(()=>{el.disabled=false;});
      } else {
        v.utcSortFields = (v.utcSortFields || []).filter(f=>!eq(f,field));
        offsets.delete(v.id);change();
      }
      return;
    }
    if (el.dataset.panelSetting && v?.smallMultiples?.length) {
      const key=el.dataset.panelSetting;
      v[key]=key==="panelOrder"?el.value:Number(el.value);
      if(results.get(v.id)?.pager){offsets.delete("panels:"+v.id);change();}else refreshFormatting();
      return;
    }
    if (el.dataset.opt) {
      if (el.dataset.opt==="layoutLocked") {
        if (el.checked) v.layoutLocked=true; else delete v.layoutLocked;
        refreshFormatting();return;
      }
      if (["shape","image","narrative"].includes(v.kind) && el.dataset.opt.startsWith(v.kind)) {
        if (el.type==="number" && (!el.value || !el.validity.valid)) {
          inspector();return notify("Enter a value from "+el.min+" to "+el.max+".");
        }
        v[el.dataset.opt]=el.type==="number" ? Number(el.value) : el.value;
        refreshFormatting();return;
      }
      if (el.dataset.opt==="showSearch") {
        clearTimeout(slicerSearches.get(v)?.timer);
        slicerSearches.delete(v);offsets.delete(v.id);
      }
      if (el.dataset.opt === "continuousDate") {
        setCalendarAxis(v, el.checked);
        change();
        return;
      }
      if (el.dataset.opt === "showEmpty") offsets.delete(v.id);
      if (["sliceAngle", "holePercent"].includes(el.dataset.opt)) {
        if (el.value === "") {
          delete v[el.dataset.opt];
          change();
          return;
        }
        if (!el.validity.valid) {
          inspector();
          return notify(
            "Enter a whole number from " + el.min + " to " + el.max + ".",
          );
        }
      }
      v[el.dataset.opt] =
        el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.value;
      if (el.dataset.opt === "multiSelect") {
        if (v.kind==="dropdown") {
          clearTimeout(slicerSearches.get(v)?.timer);slicerSearches.delete(v);offsets.delete(v.id);
          change();return;
        }
        touch();
        return;
      }
      if (v.kind === "navigator" && ["showHiddenPages","showTooltipPages"].includes(el.dataset.opt)) {
        touch();
        $(`[data-id="${v.id}"] .vbody`).innerHTML = visualBody(v);
        return;
      }
      if (v.kind === "matrix" && ["freezeRowHeaders","wrapRowHeaders"].includes(el.dataset.opt)) {
        touch();
        dismissTooltip?.();
        const matrix = $(`[data-id="${v.id}"] folio-matrix`);
        if (el.dataset.opt === "freezeRowHeaders") matrix?.toggleAttribute("frozen",el.checked);
        else matrix?.toggleAttribute("nowrap",!el.checked);
        if (el.dataset.opt === "wrapRowHeaders") matrix?.sizeColumns(true);
        return;
      }
      if (v.kind === "matrix" && ["matrixLayout","rowSubtotalPosition","repeatRowLabels","subtotals"].includes(el.dataset.opt)) {
        touch();
        dismissTooltip?.();
        const body = $(`[data-id="${v.id}"] .vbody`);
        if (body) body.innerHTML = visualBody(v);
        if (el.dataset.opt === "matrixLayout") {
          inspector();
          $('[data-opt="matrixLayout"]')?.focus({preventScroll:true});
        }
        return;
      }
      change();
      return;
    }
    if (el.dataset.pick && el.value) {
      addField(el.value, el.dataset.pick);
      return;
    }
    if (el.dataset.agg !== undefined) {
      const well = el.dataset.aggWell || "metrics",
        index = Number(el.dataset.agg);
      const priorKey = well === "metrics" ? metricKey(v.metrics[index]) : null;
      const changedBinding = v[well][index];
      const changedKey = metricKey(changedBinding);
      const statisticRules = (v.referenceLines || []).filter(r => r.statistic &&
        metricKey(r.statistic.binding) === changedKey && axisBindings(v,referenceAxis(v,r)).includes(changedBinding));
      const sorts = v.kind === "table" ? tableSorts(v, tableColumnKeys(v)) : [];
      v[well][index].op = el.value;
      if (["metrics","other","references"].includes(well) && v.rankMetric === changedKey) v.rankMetric = metricKey(changedBinding);
      if (v.rankMetric && v.selection && selectableChart(v.kind)) v.selection.checkPoint = true;
      for (const r of statisticRules) r.statistic.binding = structuredClone(changedBinding);
      const nextKey = priorKey ? metricKey(v.metrics[index]) : null;
      if (priorKey !== nextKey) {
        for (const rules of [v.cellRules, v.cellBars, v.cellIcons]) {
          if (!rules?.[priorKey]) continue;
          rules[nextKey] ??= { ...rules[priorKey] };
          if (!v.metrics.some((m) => metricKey(m) === priorKey))
            delete rules[priorKey];
        }
        if (chosenRuleField === priorKey) chosenRuleField = nextKey;
      }
      if (sorts.some((s) => s.key === priorKey)) {
        v.tableSort = sorts.map((s) =>
          s.key === priorKey ? { ...s, key: nextKey } : s,
        );
      }
      if (v.kind === "table") offsets.delete(v.id);
      change();
      return;
    }
    if (el.dataset.heading) {
      const [well, rawIndex] = el.dataset.heading.split(":");
      const index = Number(rawIndex),
        text = el.value.trim();
      const { key } = columnCaption(v, well, index);
      v.headings ??= {};
      const names = (v.headings[well] ??= []);
      names[index] = text ? { key, text } : null;
      el.value = text;
      touch();
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (body) body.innerHTML = visualBody(v);
      return;
    }
    if (el.dataset.referenceCaption !== undefined) {
      const item = v.references[Number(el.dataset.referenceCaption)];
      if (el.value.trim()) item.label = el.value.trim(); else delete item.label;
      touch();
      const body = $(`[data-id="${v.id}"] .vbody`);
      if (body) body.innerHTML = visualBody(v);
      return;
    }
    if (el.dataset.tipLabel !== undefined) {
      const item = v.tooltipFields[Number(el.dataset.tipLabel)];
      if (el.value.trim()) item.label = el.value.trim();
      else delete item.label;
      change();
      return;
    }
    if (el.id === "drill-target") {
      v.target = el.value;
      change();
      return;
    }
    if (["rank-order","rank-limit","rank-measure","rank-ties"].includes(el.id)) {
      if (el.id === "rank-order") v.order = el.value;
      else if (el.id === "rank-ties") v.includeTies = el.checked;
      else if (el.id === "rank-measure") {
        delete v.rankMetric;
        delete v.rankSource;
        if (el.value.startsWith("model:")) v.rankSource = el.value.slice(6);
        else if (el.value) v.rankMetric = el.value;
        if (!v.order || v.order === "category") v.order = "desc";
      }
      else
        v.top = el.value
          ? Math.min(500, Math.max(1, Math.floor(Number(el.value))))
          : null;
      if (v.selection?.axis || (["rank-measure","rank-ties"].includes(el.id) && v.selection && selectableChart(v.kind))) v.selection.checkPoint = true;
      else if (!v.selection?.legend) v.selection = null;
      offsets.delete(v.id);
      change();
      return;
    }
    if (el.id === "vtitle") v.title = el.value.trim();
    else if (el.id === "vsubtitle") v.subtitle=el.value.trim();
    else if (el.id === "title-source" || el.id === "subtitle-source") {
      const key=el.id.split("-")[0]+"Binding";
      if (el.value && measure(el.value)) v[key]={measure:el.value};
      else delete v[key];
    }
    else if (["heading-size","heading-align","heading-color"].includes(el.id)) {
      const key=el.id.slice(8);
      if (key==="size" && !el.checkValidity()) return;
      v.headingStyle={...v.headingStyle,[key]:key==="size"?Math.max(10,Math.min(36,Number(el.value))):el.value};
    }
    else if (el.id === "vformat") v.format = el.value;
    else if (el.id === "vaccent") v.accent = el.value;
    else if (el.dataset.dim) {
      if (v.layoutLocked) return;
      const val = Number(el.value);
      if (!Number.isFinite(val)) return;
      const k = el.dataset.dim;
      v[k] = Math.max(
        k === "w" ? (v.kind==="shape" ? 1 : 145) : k === "h" ? (v.kind==="shape" ? 1 : 85) : 0,
        Math.min(visualBounds(page(),v)[k], val),
      );
    } else return;
    change();
  } catch (err) {
    notify(err.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.hasAttribute("data-slicer-search")) {
    const article=e.target.closest(".visual"),v=page().visuals.find(item=>item.id===article.dataset.id);
    clearTimeout(slicerSearches.get(v)?.timer);
    offsets.delete(v.id);
    const state={field:readerVisual(v).groups[0],text:e.target.value};
    slicerSearches.set(v,state);
    article.querySelector(".vbody").textContent="Searching…";
    state.timer=setTimeout(()=>{if (page().visuals.includes(v) && slicerSearches.get(v)===state) refresh(v.id);},120);
    return;
  }
  if (e.target.classList.contains("search")) {
    search = e.target.value;
    const cur = e.target.selectionStart;
    dataPane();
    $(".search").focus();
    $(".search").setSelectionRange(cur, cur);
  }
});
document.addEventListener(
  "toggle",
  (e) => {
    if (e.target.dataset.tree) {
      if (e.target.open) closed.delete(e.target.dataset.tree);
      else closed.add(e.target.dataset.tree);
    }
  },
  true,
);
document.addEventListener("dblclick", (e) => {
  if (authorView) return;
  if (e.target.matches(".matrix-width-grip")) {
    const v = page().visuals.find(item => item.id === e.target.closest(".visual").dataset.id);
    if (v) setMatrixWidth(v,e.target.parentElement.dataset.columnKey,null);
    return;
  }
  if (e.target.closest("#pages [data-page]")) editPageSettings();
});
$("#data").addEventListener("contextmenu", e => {
  if (authorView) return;
  const key = e.target.closest("[data-field]")?.dataset.field;
  if (!key || key.startsWith("@")) return;
  const source = lookup(decode(key));
  if (!source || source.binSize) return;
  e.preventDefault();
  if (source.grouped) {openMemberGroups(source);return;}
  binDialog(source,null,!source.numeric);
});
$("#report-name").onclick = () =>
  dialog(
    "Rename report",
    textInput("Report name", "name", report.title) +
      '<label class="formlabel" for="question">Business question</label><input type="text" id="question" name="question" maxlength="160" value="' +
      esc(report.question || "") +
      '">',
    "Save",
    (fd) => {
      report.title = fd.get("name").trim() || "Untitled report";
      report.question = fd.get("question").trim();
      change();
    },
  );
function bindingDrop(e) {
  if (!bindingDrag) return;
  const well = e.target.closest("[data-well]");
  if (!well || selected !== bindingDrag.id) return;
  const v = visual(), source = bindingDrag;
  if (v?.[source.well]?.[source.from] !== source.item) return;
  const key = well.dataset.well, same = key === source.well;
  const plan = same ? null : transferPlan(v,source.well,source.from,key,defaultMetric);
  if (!same && !plan) return;
  const row = e.target.closest("[data-bound-index]");
  const box = row?.getBoundingClientRect();
  const after = box && e.clientY >= box.top + box.height/2;
  const insertion = row ? Number(row.dataset.boundIndex) + Number(after) : v[key]?.length || 0;
  return {well,row,after,plan,to:insertion - Number(same && insertion > source.from)};
}
function clearBindingDrop() {
  $$(".fieldwell[data-drop]").forEach(well => delete well.dataset.drop);
  $$(".wellrow[data-insert]").forEach(row => delete row.dataset.insert);
}
document.addEventListener("dragstart", (e) => {
  const row = e.target.closest("[data-bound-index]");
  if (row) {
    const well = row.closest("[data-well]").dataset.well, from = Number(row.dataset.boundIndex);
    bindingDrag = {id:selected,well,from,item:visual()[well][from]};
    e.dataTransfer.setData("text/folio-binding",String(from));
    e.dataTransfer.effectAllowed = "move";
    return;
  }
  const f = e.target.closest("[data-field]");
  if (f) {
    e.dataTransfer.setData("text/folio-field", f.dataset.field);
    e.dataTransfer.effectAllowed = "copy";
  }
});
document.addEventListener("dragover", (e) => {
  if (bindingDrag) {
    const drop = bindingDrop(e);
    clearBindingDrop();
    if (drop) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (drop.plan) drop.well.dataset.drop = drop.plan.outgoing ? "swap" : "move";
      if (drop.row && !drop.plan?.outgoing && (drop.plan || drop.to !== bindingDrag.from)) drop.row.dataset.insert = drop.after ? "after" : "before";
    }
    return;
  }
  const target = e.target.closest('[data-well],.visual,#paper,[data-measure-filter="new"]');
  if (target && e.dataTransfer.types.includes("text/folio-field")) {
    e.preventDefault();
    (e.target.closest("[data-bound-index]") || target).classList.add("dragover");
  }
});
document.addEventListener("dragleave", (e) =>
  e.target.closest(".dragover")?.classList.remove("dragover"),
);
document.addEventListener("dragend", () => {
  bindingDrag = null;
  clearBindingDrop();
  $$(".dragover").forEach(x => x.classList.remove("dragover"));
});
document.addEventListener("drop", (e) => {
  if (authorView) return;
  if (bindingDrag) {
    const drop = bindingDrop(e), source = bindingDrag;
    bindingDrag = null;
    clearBindingDrop();
    if (drop) {
      e.preventDefault();
      if (drop.plan) transferField(visual(),drop.plan,drop.to);
      else moveField(visual(),source.well,source.from,drop.to);
    }
    return;
  }
  const target = e.target.closest('[data-well],.visual,#paper,[data-measure-filter="new"]'),
    key = e.dataTransfer.getData("text/folio-field");
  if (!target || !key) return;
  e.preventDefault();
  $$(".dragover").forEach((x) => x.classList.remove("dragover"));
  if (target.dataset.measureFilter === "new") {
    if (key.startsWith("@") && measure(key.slice(1))) editMeasureFilter(null, "measure:" + key.slice(1));
    else notify("Drag a measure here, or use Add filter for a column.");
    return;
  }
  if (target.classList.contains("visual")) selected = target.dataset.id;
  if (target.id === "paper") makeVisual("bar");
  const row = e.target.closest("[data-bound-index]");
  if (row && target.dataset.well) {
    replaceField(visual(),target.dataset.well,Number(row.dataset.boundIndex),key);
    return;
  }
  addField(key, target.dataset.well);
});
document.addEventListener("pointerdown", (e) => {
  if (authorView) return;
  const lockedBackground=e.target.closest("[data-shape-object][data-position-locked]");
  if ((e.target.id==="paper" || lockedBackground) && mode==="report" && !focusView && page().visuals.length) {
    const owner=page();
    beginCanvasSelection(e,$("#paper"),layoutSelection(),ids=>{
      if (page()===owner && !authorView && mode==="report" && !focusView) {
        if (ids.size) chooseLayoutVisuals(ids); else selectedVisual(null);
      }
    });
    return;
  }
  if (e.target.matches(".matrix-width-grip") && e.button === 0) {
    const grip = e.target, th = grip.parentElement, art = grip.closest(".visual");
    selectedVisual(art.dataset.id);
    const v = visual(), width = th.offsetWidth, start = e.clientX;
    const localScale = th.getBoundingClientRect().width / width;
    const newWidth = x => Math.max(32, Math.min(2000, width + Math.round((x-start)/localScale)));
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add("dragging");
    grip.onpointermove = ev => { grip.style.transform = `translateX(${newWidth(ev.clientX)-width}px)`; };
    grip.onpointerup = grip.onpointercancel = ev => {
      grip.classList.remove("dragging");
      grip.style.removeProperty("transform");
      grip.onpointermove = grip.onpointerup = grip.onpointercancel = null;
      if (ev.type === "pointerup" && Math.abs(ev.clientX-start) >= 2)
        setMatrixWidth(v,th.dataset.columnKey,newWidth(ev.clientX));
    };
    return;
  }
  const el = e.target.closest(".vhead,.resize,[data-shape-object] .vbody");
  if (!el || focusView || e.target.closest("button") || e.button !== 0) return;
  const art = el.closest(".visual");
  if (el.classList.contains("vhead") && (e.ctrlKey || e.metaKey)) return;
  if (art.hasAttribute("data-position-locked")) {selectedVisual(art.dataset.id);return;}
  const groupDrag = !el.classList.contains("resize") && arranging?.ids.has(art.dataset.id) && arranging.ids.size > 1;
  if (groupDrag) {
    selected=art.dataset.id;
    edits.select(selected);
  } else selectedVisual(art.dataset.id);
  const v = visual(),
    orig = { ...v },
    bounds = visualBounds(page(),v),
    sx = e.clientX,
    sy = e.clientY,
    resizing = el.classList.contains("resize");
  const moving = (groupDrag ? page().visuals.filter(item=>arranging.ids.has(item.id) && !item.layoutLocked) : [v]).map(item=>
    ({item,x:item.x,y:item.y,bounds:visualBounds(page(),item)}));
  const minX=Math.max(...moving.map(m=>-m.x)),maxX=Math.min(...moving.map(m=>m.bounds.x-m.x));
  const minY=Math.max(...moving.map(m=>-m.y)),maxY=Math.min(...moving.map(m=>m.bounds.y-m.y));
  el.setPointerCapture(e.pointerId);
  let moved = false;
  el.onpointermove = (ev) => {
    const dx = Math.round((ev.clientX - sx) / scale),
      dy = Math.round((ev.clientY - sy) / scale);
    if (Math.abs(dx) + Math.abs(dy) < 3 && !moved) return;
    moved = true;
    if (resizing) {
      v.w = Math.max(v.kind==="shape" ? 1 : 145, Math.min(bounds.w, orig.w + dx));
      v.h = Math.max(v.kind==="shape" ? 1 : 85, Math.min(bounds.h, tooltipCanvasSize(page()) ? Infinity : 4000, orig.h + dy));
      art.style.width=v.w+"px";
      art.style.height=v.h+"px";
    } else {
      const moveX=Math.max(minX,Math.min(maxX,dx)),moveY=Math.max(minY,Math.min(maxY,dy));
      for (const {item,x,y} of moving) {
        item.x=x+moveX;item.y=y+moveY;
        paintPosition(item);
      }
    }
    layout();
  };
  el.onpointerup = el.onpointercancel = ev => {
    el.onpointermove = el.onpointerup = el.onpointercancel = null;
    if (moved && ev.type==="pointercancel") {
      for (const {item,x,y} of moving) { item.x=x;item.y=y;paintPosition(item); }
      v.w=orig.w;v.h=orig.h;art.style.width=v.w+"px";art.style.height=v.h+"px";
      layout();
    } else if (moved) {
      touch();
      if (resizing && v.kind==="shape") art.querySelector(".vbody").innerHTML=visualBody(v);
      inspector();
    } else if (groupDrag && ev.type==="pointerup") selectedVisual(v.id);
  };
});
function isClipboardEdit(event) {
  return event.composedPath().some(el=>el.isContentEditable || el.matches?.("input,textarea,select"));
}
document.addEventListener("copy",e=>{
  if ((!commandClipboard && (isClipboardEdit(e) || !document.getSelection()?.isCollapsed)) || $("#dialog").open || !e.clipboardData) return;
  const clip=commandClipboard || rememberVisuals();
  if (!clip) return;
  e.preventDefault();
  e.clipboardData.setData(visualMime,clip.token);
  e.clipboardData.setData("text/plain",clip.snapshot.visuals.map(titleOf).join("\n"));
});
document.addEventListener("paste",e=>{
  if (!authorView && mode==="report" && !focusView && !$("#dialog").open && !isClipboardEdit(e) &&
      visualClipboard && e.clipboardData?.getData(visualMime)===visualClipboard.token) {
    e.preventDefault();
    try { pasteRememberedVisuals(); } catch(error) { notify(error.message); }
    return;
  }
  if (mode!=="report" || $("#dialog").open || e.target.closest("textarea,[contenteditable=true],input:not([data-slicer-search])")) return;
  const article=e.target.closest("#paper .visual");
  if (!article && e.target!==document.body && e.target.id!=="paper") return;
  const v=article ? page().visuals.find(item=>item.id===article.dataset.id) : visual();
  const text=e.clipboardData?.getData("text/plain");
  if (!canPasteSlicer(v) || !text || (e.target.hasAttribute("data-slicer-search") && !/[\r\n]/.test(text))) return;
  e.preventDefault();chooseSlicerValues(v,text).catch(err=>notify(err.message));
});
async function navigateTableRow(button,key) {
  const article=button.closest(".visual"),v=page().visuals.find(item=>item.id===article.dataset.id);
  const controls=()=>[...article.querySelectorAll("[data-detail-pick]")];
  const list=controls(),i=list.indexOf(button),last=list.length-1;
  const direction=key==="PageDown" || (key==="ArrowDown" && i===last) ? 1 :
    key==="PageUp" || (key==="ArrowUp" && i===0) ? -1 : 0;
  if (!direction) {
    const next={Home:0,End:last,ArrowDown:i+1,ArrowUp:i-1}[key];
    list[next]?.focus();return;
  }
  const offset=offsets.get(v.id)||0;
  if ((direction<0 && !offset) || (direction>0 && !results.get(v.id)?.more)) return;
  offsets.set(v.id,Math.max(0,offset+direction*25));
  const pending=refresh(v.id),ticket=generation;
  await pending;
  if (ticket===generation && article.isConnected && [button,document.body].includes(document.activeElement))
    controls().at(direction>0 ? 0 : -1)?.focus();
}
document.addEventListener("keydown", (e) => {
  if (e.target.matches("[data-detail-pick]") && !e.altKey && !e.ctrlKey && !e.metaKey &&
      ["ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(e.key)) {
    e.preventDefault();navigateTableRow(e.target,e.key).catch(err=>notify(err.message));return;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !authorView && mode!=="home" && !$("#dialog").open &&
      !e.composedPath().some(el=>el.isContentEditable || el.matches?.("input,textarea,select"))) {
    const key=e.key.toLowerCase();
    if (key==="d" && !e.shiftKey && mode==="report" && !focusView && layoutSelection().size) {
      e.preventDefault();
      if (!e.repeat) action("duplicate-visuals").catch(err=>notify(err.message));
      return;
    }
    if (key==="z" || key==="y") {
      e.preventDefault();
      travelHistory(key==="y" || e.shiftKey ? 1 : -1).catch(err=>notify(err.message));return;
    }
  }
  if (e.target.matches("#pages [data-page]") && !e.altKey && !e.ctrlKey && !e.metaKey &&
      ["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
    const tabs = $$("#pages [data-page]"), i = tabs.indexOf(e.target);
    const to = {Home:0,End:tabs.length-1,ArrowLeft:Math.max(0,i-1),ArrowRight:Math.min(tabs.length-1,i+1)};
    e.preventDefault();
    tabs[to[e.key]].focus();
    return;
  }
  if (e.key === "Escape" && focusView && !$("#dialog").open && !$("#chart-tooltip:not([hidden])") && !$(".selection-rectangle") && !e.target.matches("input,select,textarea")) {
    e.preventDefault();
    leaveFocus();
    return;
  }
  if (e.altKey && e.shiftKey && e.key === "F11" && !$("#dialog").open && mode === "report") {
    const source = e.target.closest("#paper .visual") || $(`#paper [data-id="${selected}"]:not([hidden])`);
    const button = source?.querySelector('[data-action="show-chart-table"]');
    if (button) {
      e.preventDefault();
      button.click();
    }
    return;
  }
  if (
    (e.key === "Enter" || e.key === " ") &&
    (e.target.matches("[data-point],[data-gantt-toggle],[data-axis-pick]") ||
      ((e.ctrlKey || e.metaKey) && e.target.matches("[data-card-pick],[data-selection-key],[data-legend-pick]")))
  ) {
    e.preventDefault();
    if (!e.repeat)
      e.target.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey:e.ctrlKey, metaKey:e.metaKey }));
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveReport().catch((err) => notify(err.message));
  }
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
new ResizeObserver(layout).observe($("#viewport"));
new ResizeObserver(showCurrentPageTab).observe($("#pages"));
decorate();
const parseReportLink = (hash) =>
  /^#([rp][a-f0-9]+)(\/read)?(?:\/page\/([a-f0-9-]+))?$/.exec(hash);
window.addEventListener("hashchange", (event) => {
  const link = parseReportLink(location.hash),
    previous = new URL(event.oldURL);
  history.replaceState(
    null,
    "",
    previous.pathname + previous.search + previous.hash,
  );
  if (link && report.id === link[1] && mode !== "home" && (link[2] || link[3] || authorView)) {
    const index = link[3] ? report.pages.findIndex((p) => p.id === link[3]) : (authorView?.report || report).active;
    if (index < 0) return notify("This page is unavailable.");
    if (link[2] && !authorView) { enterReading(index).catch(e=>notify(e.message)); return; }
    if (!link[2] && authorView && !publishedReport()) restoreAuthor();
    history.replaceState(null, "", link[0]);
    report.active = index;
    mode = "report";
    delete report.drill;
    selected = null;
    offsets.clear();
    draw();
    refresh();
    return;
  }
  Promise.resolve(
    guardSwitch(() => (link ? openReport(link[1], link[3], !!link[2]) : home())),
  ).catch((e) => notify(e.message));
});
const initialLink = parseReportLink(location.hash);
if (initialLink) {
  openReport(initialLink[1], initialLink[3], !!initialLink[2]).catch((e) => {
    draw();
    notify(e.message);
  });
} else {
  home().catch((e) => notify(e.message));
}
