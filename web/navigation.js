import {hiddenSlicers,copySyncedSelection} from "./sync-slicers.js";
import {shapeControls,shapeBody} from "./report-shapes.js";
const objects = {
  textBox: "Text box",
  narrative: "Narrative",
  shape: "Shape",
  image: "Image",
  navigator: "Page navigator",
  actionButton: "Action button",
  parameterSlicer: "Field parameter slicer",
};
const stateKeys = [
  "filters",
  "measureFilters",
  "selection",
  "range",
  "trail",
  "level",
  "expandedLevels",
  "collapsed",
  "hiddenWorkstreams",
  "scheduleRange",
  "mapView",
  "tableSort",
  "utcSortFields",
  "treePath",
  "splitField",
];
const rankingKeys = ["order", "top", "rankMetric", "rankSource", "includeTies"];
function rankingState(v) {
  return Object.fromEntries(rankingKeys.filter(k => v[k] != null).map(k => [k,v[k]]));
}
function restoreLegacyRankings(report, canRank) {
  if (!report.bookmarks?.length) return;
  // Earlier bookmarks relied on the chart's saved order and limit. Capture
  // those before applying another bookmark can change the chart in memory.
  const visuals = new Map(report.pages.flatMap(p => p.visuals.filter(canRank).map(v => [v.id,v])));
  for (const bookmark of report.bookmarks) {
    for (const entry of bookmark.visuals || []) {
      const v = visuals.get(entry.id);
      if (v && !entry.ranking) entry.ranking = rankingState(v);
    }
  }
}
function bookmarkState(report, shape) {
  const page = report.pages[report.active];
  const synced=hiddenSlicers(report,page).map(v=>({group:v.slicerSync.id,selection:v.selection || null,range:v.range}));
  return structuredClone({
    pageId: page.id,
    filters: report.filters,
    pageFilters: page.filters,
    ...(synced.length ? {synced} : {}),
    drill: report.drill,
    ...(report.parameters?.length ? {parameterChoices:report.parameters.map(p => ({id:p.id,member:p.current ?? p.default}))} : {}),
    visuals: page.visuals.map((v) => ({
      id: v.id,
      shape: shape(v),
      ranking: rankingState(v),
      state: Object.fromEntries(
        stateKeys.filter((k) => v[k] !== undefined).map((k) => [k, v[k]]),
      ),
    })),
  });
}
function orderedFields(key, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((k) => [k, value[k]]),
  );
}
function compatibleView(entry, current, v, fieldname, alignBookmark) {
  if (entry.shape === current) return true;
  try {
    return alignBookmark(entry.state,v,JSON.parse(entry.shape,orderedFields),JSON.parse(current,orderedFields),fieldname);
  } catch {
    return false;
  }
}
function applyBookmark(report, bookmark, shape, fieldname, alignBookmark, parameterChanged) {
  const index = report.pages.findIndex((p) => p.id === bookmark.pageId);
  if (index < 0) throw Error("The bookmarked page was removed.");
  const snapshot = structuredClone(bookmark),
    page = report.pages[index];
  report.active = index;
  report.filters = snapshot.filters;
  page.filters = snapshot.pageFilters;
  report.drill = snapshot.drill;
  if (snapshot.synced) for (const v of hiddenSlicers(report,page)) {
    const state=snapshot.synced.find(s=>s.group===v.slicerSync.id);
    if (!state) continue;
    v.selection=state.selection;
    if (state.range) v.range=state.range;else delete v.range;
    copySyncedSelection(report,v);
  }
  for (const choice of snapshot.parameterChoices || []) {
    const p = report.parameters?.find(p => p.id === choice.id);
    if (!p) continue;
    const stored = Array.isArray(choice.member) ? choice.member : [choice.member];
    const valid = stored.filter(id => p.members.includes(id));
    if (valid.length) {
      const previous = {...p};
      if (valid[0] === p.default && (!p.multiple || valid.length === 1)) delete p.current;
      else p.current = p.multiple ? valid : valid[0];
      if (JSON.stringify(previous.current ?? previous.default) !== JSON.stringify(p.current ?? p.default)) parameterChanged(p.id,previous);
    }
  }
  for (const v of page.visuals) {
    const old = snapshot.visuals.find((item) => item.id === v.id);
    if (!old || !compatibleView(old, shape(v), v, fieldname, alignBookmark)) continue;
    if (old.ranking) {
      for (const key of rankingKeys) {
        if (old.ranking[key] == null) delete v[key];
        else v[key] = old.ranking[key];
      }
    }
    for (const k of stateKeys) delete v[k];
    for (const key of stateKeys)
      if (Object.hasOwn(old.state, key)) v[key] = old.state[key];
  }
}
function objectControls(v, report, esc) {
  if (v.kind === "shape") return shapeControls(v);
  if (v.kind === "textBox")
    return `<label class="formlabel">Report text<textarea class="control" data-opt="bodyText" rows="5">${esc(v.bodyText || "")}</textarea></label>`;
  if (v.kind === "navigator")
    return '<p class="hint">Page names and order follow the report tabs. Choose which pages appear under Format → Pages.</p>';
  const options = [
    ...report.pages.map((p) => ["page:" + p.id, p.name]),
    ...(report.bookmarks || []).map((b) => ["bookmark:" + b.id, b.name]),
  ];
  return `<label class="formlabel">Action destination<select class="control" data-opt="destination"><option value="">Select a page or bookmark</option>${options.map(([key, name]) => `<option value="${esc(key)}" ${v.destination === key ? "selected" : ""}>${key.startsWith("page:") ? "Page" : "Bookmark"} · ${esc(name)}</option>`).join("")}</select></label><label class="formlabel">Button text<input class="control" data-opt="buttonText" value="${esc(v.buttonText || "")}"></label>`;
}
function objectBody(v, report, esc) {
  if (v.kind === "shape") return shapeBody(v);
  if (v.kind === "textBox")
    return `<div class="report-text">${esc(v.bodyText || "Enter report text in Build.")}</div>`;
  if (v.kind === "navigator") {
    const links = report.pages.map((p,i) =>
      (p.tooltip && !v.showTooltipPages) || (p.hidden && !v.showHiddenPages) ? "" :
        `<button data-page="${i}" aria-current="${report.active === i ? "page" : "false"}">${esc(p.name)}</button>`,
    ).join("");
    return links ? '<nav class="page-navigator" aria-label="Report pages">' + links + "</nav>" :
      '<div class="vempty">No pages match this navigator’s settings.</div>';
  }
  const [type, id] = (v.destination || "").split(":");
  const index = report.pages.findIndex((p) => p.id === id),
    bookmark = report.bookmarks?.find((b) => b.id === id);
  const valid = type === "page" ? index >= 0 : !!bookmark;
  return `<button class="report-action" ${valid ? (type === "page" ? `data-page="${index}"` : `data-bookmark-go="${esc(id)}"`) : "disabled"}>${esc(v.buttonText || (type === "page" ? report.pages[index]?.name : bookmark?.name) || "Choose a destination")}</button>`;
}
export { objects, bookmarkState, restoreLegacyRankings, applyBookmark, objectControls, objectBody };
