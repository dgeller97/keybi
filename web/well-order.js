import { axisFields, hasAxisHierarchy, treeSplit } from "./visual-types.js";
import { restoreSelection } from "./well-transfer.js";

function moved(list, from, to) {
  const copy = list.slice();
  copy.splice(to, 0, copy.splice(from, 1)[0]);
  return copy;
}

// A subtotal or collapsed branch represents a prefix of its axis fields.
function reorderedPrefix(values, order) {
  const prefix = order.slice(0,values.length);
  return prefix.every(i => i < values.length) ? prefix.map(i => values[i]) : null;
}

const sameField = (a, b) => a.t === b.t && a.c === b.c;

function setSelection(state, filters, fieldname) {
  state.selection = filters ? {
    ...filters[0], filters,
    label: ["tuple","in"].includes(filters[0].op) ? filters[0].value.length + " categories selected" :
      filters.map(p => fieldname(p.field) + " = " + String(p.value ?? "(Blank)")).join(" · "),
  } : null;
}

function chartState(state, v, oldFields, order, fieldname) {
  const first = order.findIndex((n,i) => n !== i);
  const level = state.level || 0;
  if (first < 0 || first > level) return;
  const oldAxis = axisFields({...state, groups:oldFields});
  const start = level + 1 - oldAxis.length;
  const ancestors = v.groups.slice(0,start);
  const trail = state.trail || [];
  if (trail.some(p => !ancestors.some(f => sameField(f,p.field)))) {
    state.level = first;
    state.expandedLevels = (state.expandedLevels || []).filter(n => n <= state.level);
    const remaining = state.level + 1 - axisFields({...state, groups:v.groups}).length;
    state.trail = (state.trail || []).filter(p => v.groups.slice(0,remaining).some(f => sameField(f,p.field)));
    state.selection = null;
    return;
  }
  if (first < start && trail.length)
    state.trail = ancestors.flatMap(f => trail.filter(p => sameField(f,p.field)));
  if (!state.selection || state.selection.legend || state.selection.facet) return;
  const next = axisFields({...state, groups:v.groups});
  if (state.selection.axis) {
    const fields = next.slice(0,state.selection.filters.length);
    const reordered = fields.map(f => state.selection.filters.find(p => sameField(p.field,f)));
    if (reordered.length !== state.selection.filters.length || !reordered.every(Boolean)) state.selection = null;
    else {
      setSelection(state,reordered,fieldname);
      state.selection.axis = true;
    }
    return;
  }
  if (!next.every(f => oldAxis.some(old => sameField(old,f)))) {
    state.selection = null;
    return;
  }
  if (state.selection.filters) {
    const old = state.selection.filters;
    const predicates = next.map(f => old.find(p => sameField(f,p.field)));
    if (predicates.every(Boolean)) setSelection(state,[...predicates,...old.slice(oldAxis.length)],fieldname);
    else state.selection = null;
  }
}

function matrixState(state, v, well, oldFields, order, fieldname) {
  const axis = well === "groups" ? "rows" : "columns";
  if (state.collapsed?.[axis]) {
    state.collapsed[axis] = state.collapsed[axis].flatMap(key => {
      const path = reorderedPrefix(JSON.parse(key),order);
      return path ? [JSON.stringify(path)] : [];
    });
  }
  const filters = state.selection?.filters;
  if (!filters) return;
  const rows = well === "groups" ? oldFields : v.groups;
  const cols = well === "columns" ? oldFields : v.columns || [];
  // Row predicates precede column predicates, including on subtotals.
  for (let n = Math.min(rows.length,filters.length); n >= 0; n--) {
    const left = filters.slice(0,n), right = filters.slice(n);
    if (right.length > cols.length || !left.every((p,i) => sameField(p.field,rows[i])) ||
        !right.every((p,i) => sameField(p.field,cols[i]))) continue;
    const path = reorderedPrefix(well === "groups" ? left : right,order);
    setSelection(state,path && (well === "groups" ? [...path,...right] : [...left,...path]),fieldname);
    return;
  }
  state.selection = null;
}

function updateState(state, v, well, before, order, fieldname) {
  if (well === "groups" && hasAxisHierarchy(v.kind)) chartState(state,v,before,order,fieldname);
  else if (v.kind === "matrix" && ["columns","groups"].includes(well)) matrixState(state,v,well,before,order,fieldname);
  else if (v.kind === "decomposition" && well === "groups" && state.selection) {
    const split = treeSplit({groups:v.groups,treePath:state.treePath,splitField:state.splitField});
    const field = state.selection.filters?.at(-1)?.field;
    if (!split || !field || !sameField(split,field)) state.selection = null;
  }
}

export function reorderBindings(v, well, from, to, fieldname) {
  const before = v[well];
  if (!Array.isArray(before) || ![from,to].every(i => Number.isInteger(i) && i >= 0 && i < before.length) || from === to) return false;
  if (well === "groups" && v.continuousDate && !v.calendarAxes) {
    v.calendarAxes = [before[0]];
    delete v.continuousDate;
  }
  v[well] = moved(before,from,to);
  if (v.headings?.[well]) {
    const headings = before.map((_,i) => v.headings[well][i] ?? null);
    v.headings[well] = moved(headings,from,to);
  }
  const order = moved(before.map((_,i) => i),from,to);
  updateState(v,v,well,before,order,fieldname);
  return true;
}

// Apply a saved view against a permutation of the same bindings. The stored
// snapshot stays intact if the author later restores its original field order.
export function alignBookmark(state, v, saved, current, fieldname) {
  if (saved[0] !== current[0] || saved.length !== current.length) return false;
  const layout = {...v,groups:saved[1],columns:saved[3]};
  const keys = ["kind","groups","metrics","columns","legendFields","other","size"];
  for (let i=1; i<saved.length; i++) {
    const before = saved[i], after = current[i];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) return false;
    const remaining = before.map(item => JSON.stringify(item));
    const order = [];
    for (const item of after) {
      const index = remaining.indexOf(JSON.stringify(item));
      if (index < 0) return false;
      order.push(index);
      remaining[index] = null;
    }
    const key = keys[i];
    if (key === "groups" || key === "columns") {
      layout[key] = after;
      if (layout.kind === "card" && key === "groups") restoreSelection(state,after,fieldname);
      updateState(state,layout,key,before,order,fieldname);
    }
  }
  return true;
}
