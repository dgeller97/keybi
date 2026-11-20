const levels = [
  ["year", {calendarMonths:12}], ["quarter", {calendarMonths:3}],
  ["month", {calendarMonths:1}], ["day", {timeBinMs:86400000}],
];
const same = (a,b) => a.t===b.t && a.c===b.c;
function matches(calc, source, definition) {
  return calc.op==="timeBin" && same(calc.left,source) &&
    (calc.calendarMonths ?? null)===(definition.calendarMonths ?? null) &&
    (calc.timeBinMs ?? null)===(definition.timeBinMs ?? null) && !calc.weekStart;
}

// Identify the actual four bound levels, including fields the author named.
export function boundDateHierarchy(groups, index, calculations) {
  const bindings=groups.map(f=>!f.parameter && calculations.find(c=>same(f,c.field)));
  const selected=bindings[index];
  if (!selected || selected.op!=="timeBin") return;
  const level=levels.findIndex(([,def])=>matches(selected,selected.left,def));
  const start=index-level;
  if (level<0 || start<0 || !levels.every(([,def],i)=>bindings[start+i] && matches(bindings[start+i],selected.left,def))) return;
  return {start,source:selected.left};
}

export function planDateHierarchy(source, siblings, calculations) {
  let next=1+Math.max(...siblings.map(f=>f.c));
  const names=new Set(siblings.map(f=>f.name.toLowerCase()));
  const additions=[];
  const fields=levels.map(([unit,def])=>{
    const found=calculations.find(c=>matches(c,source,def));
    if (found) return found.field;
    const base=source.name+" ("+unit+")";
    let name=base;
    for (let i=2;names.has(name.toLowerCase());i++) name=base+" "+i;
    names.add(name.toLowerCase());
    const field={t:source.t,c:next++};
    additions.push({name,field,left:{t:source.t,c:source.c},op:"timeBin",...def});
    return field;
  });
  return {fields,additions};
}
