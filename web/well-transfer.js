import { buildRoles, axisFields, hasAxisHierarchy, chartGroups } from "./visual-types.js";
import { metricKey } from "./cell-format.js";

const sameField = (a,b) => a.t === b.t && a.c === b.c;
const contains = (fields,field) => fields.some(other => sameField(other,field));

// Plan both directions before editing either well. An occupied single-value
// well exchanges its binding with the source, including its caption.
export function transferPlan(v, from, index, to, makeMetric) {
  const roles = buildRoles(v);
  const source = roles.find(r => r.key === from), target = roles.find(r => r.key === to);
  const item = v[from]?.[index];
  if (!source || !target || !item || from === to) return;
  const destination = v[to] || [];
  const occupied = !target.multiple && destination.length > 0;
  function convert(binding, origin, role) {
    if (origin.field === role.field) return binding;
    if (binding.parameter) return;
    return role.field ? binding.field : makeMetric(v,role.key,binding);
  }
  function duplicate(role, list, binding, except) {
    return list.some((other,i) => i !== except && (role.field
      ? sameField(other,binding) : metricKey(other) === metricKey(binding)));
  }
  const incoming = convert(item,source,target);
  if (!incoming || duplicate(target,destination,incoming,-1)) return;
  let outgoing;
  if (occupied) {
    outgoing = convert(destination[0],target,source);
    if (!outgoing || duplicate(source,v[from],outgoing,index)) return;
  }
  return {from,index,to,incoming,outgoing};
}

export function restoreSelection(v, groups, fieldname) {
  if (!v.selection) return;
  if(v.selection.facet){
    if(!v.smallMultiples?.some(f=>sameField(f,v.selection.field)))v.selection=null;
    return;
  }
  if (v.selection.legend) {
    // The series is filtered across every category, including those outside Top N.
    const field = v.legendFields?.[0] || (groups.length === 1 ? groups[0] : null);
    if (!field || !sameField(field,v.selection.field)) { v.selection = null; return; }
    if (!v.legendFields?.length && !["pie","donut"].includes(v.kind)) delete v.selection.legend;
    else return;
  }
  const axis = v.selection.axis && hasAxisHierarchy(v.kind) && v.kind !== "bar";
  if (axis) groups = groups.slice(0,Math.min(v.selection.filters.length,groups.length-(v.legendFields?.length || 0)));
  const predicates = [...(v.selection.filters || [{field:v.selection.field,value:v.selection.value}])];
  const ordered = [];
  for (const field of groups) {
    const index = predicates.findIndex(p => sameField(p.field,field));
    if (index < 0) { v.selection = null; return; }
    ordered.push(...predicates.splice(index,1));
  }
  v.selection = predicates.length || !ordered.length ? null : {
    ...ordered[0], filters:ordered, ...(axis ? {axis:true} : {}),
    label:["tuple","in"].includes(ordered[0].op) ? ordered[0].value.length + " categories selected" :
      ordered.map(p => fieldname(p.field) + " = " + String(p.value ?? "(Blank)")).join(" · ")
  };
}

function updateHierarchy(v, previous) {
  const visible = chartGroups(previous);
  const last = v.groups.findLastIndex(f => contains(visible,f));
  const level = Math.max(0,last);
  let first = level;
  while (first > 0 && contains(visible,v.groups[first-1])) first--;
  const ancestors = v.groups.slice(0,first);
  const trail = previous.trail || [];
  if (trail.some(p => !contains(ancestors,p.field))) {
    v.level = 0;
    v.trail = [];
    delete v.expandedLevels;
    v.selection = null;
    return;
  }
  v.level = level;
  v.trail = ancestors.flatMap(f => trail.filter(p => sameField(f,p.field)));
  // Keep expansion history for earlier drill levels that still have the same
  // parent and child. A drill-up after the move can then restore that view.
  v.expandedLevels = (previous.expandedLevels || []).filter(i => i < first &&
    v.groups[i] && sameField(v.groups[i],previous.groups[i]) && sameField(v.groups[i-1],previous.groups[i-1]));
  for (let i=first+1; i<=level; i++) v.expandedLevels.push(i);
}

export function updateMatrix(v, previous, fieldname) {
  const filters = v.selection?.filters || [];
  const visible = [];
  for (const [axis,key] of [["rows","groups"],["columns","columns"]]) {
    const fields = v[key] || [], old = previous[key] || [];
    if (v.collapsed?.[axis]) v.collapsed[axis] = v.collapsed[axis].filter(path => {
      const depth = JSON.parse(path).length;
      return depth < fields.length && old.slice(0,depth).every((f,i) => sameField(f,fields[i]));
    });
    for (const f of fields) {
      if (!filters.some(p => sameField(p.field,f))) break;
      visible.push(f);
    }
  }
  restoreSelection(v,visible,fieldname);
}

// An axis replacement keeps the authored depth. A drill scoped to the removed
// field must return to that level before querying the new field.
export function replaceDimension(v, well, index, prior, next) {
  v[well][index] = next;
  const predicates = v.selection?.filters || (v.selection ? [v.selection] : []);
  if (predicates.some(p => sameField(p.field,prior))) v.selection = null;
  if (well === "groups") {
    if (v.trail?.some(p => sameField(p.field,prior))) {
      v.level = index;
      v.expandedLevels = (v.expandedLevels || []).filter(i => i <= index);
      const start = index + 1 - axisFields(v).length;
      v.trail = v.trail.filter(p => contains(v.groups.slice(0,start),p.field));
      v.selection = null;
    }
    if (v.calendarAxes) v.calendarAxes = v.calendarAxes.filter(f => !sameField(f,prior));
    if (!index) delete v.continuousDate;
    delete v.range;
  }
  if (v.kind === "matrix") {
    const axis = well === "groups" ? "rows" : "columns";
    if (v.collapsed?.[axis])
      v.collapsed[axis] = v.collapsed[axis].filter(path => JSON.parse(path).length <= index);
  }
  if (v.kind === "decomposition") {
    const depth = v.treePath?.findIndex(p => sameField(p.field,prior)) ?? -1;
    if (depth >= 0) {
      v.treePath = v.treePath.slice(0,depth);
      v.selection = null;
    }
    if (depth >= 0 || v.splitField === prior.t+"."+prior.c) delete v.splitField;
  }
  if (well === "phaseFields") delete v.hiddenWorkstreams;
  if (["startFields","endFields"].includes(well)) delete v.scheduleRange;
}

export function applyTransfer(v, plan, position, fieldname) {
  const {from,index,to,incoming,outgoing} = plan;
  const previous = {...v};
  const source = [...v[from]], target = [...(v[to] || [])];
  const at = outgoing ? 0 : Math.max(0,Math.min(position ?? target.length,target.length));
  source.splice(index,1,...(outgoing ? [outgoing] : []));
  target.splice(at,outgoing ? 1 : 0,incoming);
  if (v.headings?.[from] || v.headings?.[to]) {
    const a = previous[from].map((_,i) => v.headings[from]?.[i] ?? null);
    const b = (previous[to] || []).map((_,i) => v.headings[to]?.[i] ?? null);
    const caption = a[index];
    a.splice(index,1,...(outgoing ? [b[0]] : []));
    b.splice(at,outgoing ? 1 : 0,caption);
    Object.assign(v.headings,{[from]:a,[to]:b});
  }
  Object.assign(v,{[from]:source,[to]:target});
  if (!buildRoles(v).some(r => r.field && (r.key === from || r.key === to))) return;
  if (v.kind === "matrix") return updateMatrix(v,previous,fieldname);
  if (hasAxisHierarchy(v.kind)) {
    if (v.continuousDate && !v.calendarAxes && previous.groups[0]) {
      v.calendarAxes = [previous.groups[0]];
      delete v.continuousDate;
    }
    updateHierarchy(v,previous);
    return restoreSelection(v,[...axisFields(v),...(v.legendFields || [])],fieldname);
  }
  if (["table","card"].includes(v.kind)) return restoreSelection(v,v.groups,fieldname);
  if (v.kind === "gantt") {
    delete v.hiddenWorkstreams;
    delete v.scheduleRange;
  }
  if (v.kind === "decomposition") {
    delete v.treePath;
    delete v.splitField;
    v.selection = null;
  }
  restoreSelection(v,chartGroups(v),fieldname);
}
