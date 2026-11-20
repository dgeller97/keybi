// Work in decimal units so adjacent labels agree at boundaries such as 0.3.
function decimalParts(number) {
  const [mantissa, exponent = "0"] = String(number).split("e");
  const digits = mantissa.split(".")[1]?.length || 0;
  return {units:BigInt(mantissa.replace(".","")), exponent:Number(exponent) - digits};
}
function commonUnits(numbers) {
  const parts = numbers.map(decimalParts);
  const exponent = Math.min(...parts.map(p => p.exponent));
  return {exponent, units:parts.map(p => p.units * 10n ** BigInt(p.exponent - exponent))};
}
function timeOfDay(iso,ms) {
  return iso.slice(11,ms % 1000 ? 23 : ms % 60000 ? 19 : 16);
}
function addMonths(start, count) {
  const date = new Date(start);
  date.setUTCMonth(date.getUTCMonth() + count, 1);
  return date;
}
function calendarTick(start, months) {
  const year = start.slice(0,4);
  if (months === 12) return year;
  if (months === 3) return year + " Q" + Math.ceil(Number(start.slice(5,7)) / 3);
  return start.slice(0,7);
}
export function timeBinTick(start,width,singleDay) {
  if (typeof start !== "string") return "(Blank)";
  if (width.months) return calendarTick(start,width.months);
  const ms = width.ms;
  if (ms % 86400000 === 0) return start.slice(0,10);
  return (singleDay ? "" : start.slice(5,10) + " ") + timeOfDay(start,ms);
}
export function binLabel(start,width) {
  if (start == null) return "(Blank)";
  if (width?.months) {
    if (typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(start)) return String(start);
    const tick = calendarTick(start,width.months);
    if ([1,3,12].includes(width.months)) return tick;
    return tick + "–" + addMonths(start,width.months-1).toISOString().slice(0,7);
  }
  if (width?.ms) {
    if (typeof start !== "string") return String(start);
    const boundary = new Date(Date.parse(start) + width.ms);
    if (!Number.isFinite(boundary.valueOf())) return String(start);
    const end = boundary.toISOString();
    const first = start.slice(0,10), last = end.slice(0,10);
    if (width.ms % 86400000 === 0) return first + "–<" + last + " UTC";
    return first + " " + timeOfDay(start,width.ms) + "–<" +
      (first === last ? "" : last + " ") + timeOfDay(end,width.ms) + " UTC";
  }
  if (!Number.isFinite(start)) return String(start);
  const {units:[lower,step],exponent} = commonUnits([start,width]);
  const end = lower + step;
  const approximate = Number(end + "e" + exponent);
  const label = Number.isFinite(approximate) && approximate > start ? String(approximate) : end + "e" + exponent;
  return start + "–<" + label;
}
export function canShowBinGaps(v) {
  return /^(clustered|stacked|percent)(Column|Bar)$/.test(v.kind) &&
    (!v.order || v.order === "category") && !v.top && !v.measureFilters?.length;
}
export function intervalStart(time, calc) {
  if (calc.calendarMonths) {
    const date = new Date(time);
    const month = (date.getUTCFullYear()-1970)*12 + date.getUTCMonth();
    const start = Math.floor(month/calc.calendarMonths)*calc.calendarMonths;
    date.setUTCFullYear(1970, start, 1);
    date.setUTCHours(0,0,0,0);
    return date.valueOf();
  }
  const shift = calc.weekStart ? ((11-calc.weekStart)%7)*86400000 : 0;
  return Math.floor((time+shift)/calc.timeBinMs)*calc.timeBinMs-shift;
}
function intervalEnd(time, calc) {
  return calc.calendarMonths ? addMonths(time,calc.calendarMonths).valueOf() : time+calc.timeBinMs;
}
export function valueCaption(value,column) {
  if (column?.binSize) return binLabel(value,column.binSize);
  if (value==null) return "(Blank)";
  return ["","(Blank)","All values","Enter exact value…"].includes(value) ? JSON.stringify(value) : String(value);
}
function intersectRanges(left,right) {
  const result=[];
  for (let i=0,j=0;i<left.length && j<right.length;) {
    const start=Math.max(left[i][0],right[j][0]), end=Math.min(left[i][1],right[j][1]);
    if (start<end) result.push([start,end]);
    if (left[i][1]<right[j][1]) i++;
    else j++;
  }
  return result;
}
// Use the actual drill, slicer and page predicates to find bounded periods
// on the same timestamp source. Disjoint selected periods stay disjoint.
export function selectedTimeIntervals(query, calculations) {
  if (!query?.filters?.length) return;
  const same=(a,b)=>a?.t===b?.t && a?.c===b?.c;
  const find=f=>calculations.find(c=>same(c.field,f));
  const child=find(query.groups[0]);
  if (child?.op!=="timeBin") return;
  let ranges=[[-Infinity,Infinity]];
  for (const filter of query.filters) {
    if (same(filter.field,child.left)) return;
    const parent=find(filter.field);
    if (parent?.op!=="timeBin" || !same(parent.left,child.left)) continue;
    const op=filter.op || "eq";
    if (!["eq","in","gt","gte","lt","lte"].includes(op)) return;
    const allowed=[];
    for (const value of new Set(op==="in" ? filter.value : [filter.value])) {
      if (typeof value!=="string") continue;
      const start=Date.parse(value);
      if (!Number.isFinite(start) || new Date(start).toISOString()!==value || intervalStart(start,parent)!==start) return;
      const end=intervalEnd(start,parent);
      if (op==="lt" || op==="lte") allowed.push([-Infinity,op==="lt" ? start : end]);
      else if (op==="gt" || op==="gte") allowed.push([op==="gt" ? end : start,Infinity]);
      else allowed.push([start,end]);
    }
    ranges=intersectRanges(ranges,allowed.sort((a,b)=>a[0]-b[0]));
  }
  if (ranges.some(([start,end])=>!Number.isFinite(start) || !Number.isFinite(end))) return;
  const keys=new Set();
  for (const [start,end] of ranges) {
    for (let t=intervalStart(start,child);t<end;t=intervalEnd(t,child)) {
      keys.add(new Date(t).toISOString());
      if (keys.size>500) return null;
    }
  }
  return [...keys];
}
export function intervalCategories(categories,width) {
  if (width.months) {
    const observed = categories.filter(v=>v != null).sort();
    if (observed.length < 2) return categories;
    const end = Date.parse(observed.at(-1)), result = [];
    for (let date = new Date(observed[0]); date.valueOf() <= end; date = addMonths(date,width.months)) {
      if (result.length >= 500) return null;
      result.push(date.toISOString());
    }
    if (categories.includes(null)) result.push(null);
    return result;
  }
  if (width.ms) {
    const times = categories.filter(value => value != null).map(Date.parse);
    if (times.length < 2) return categories;
    const min = Math.min(...times), count = (Math.max(...times)-min)/width.ms+1;
    if (!Number.isInteger(count) || count > 500) return null;
    const result = Array.from({length:count},(_,i)=>new Date(min+i*width.ms).toISOString());
    if (categories.includes(null)) result.push(null);
    return result;
  }
  const observed = categories.filter(Number.isFinite);
  if (observed.length < 2) return categories;
  const {units:[start,end,step],exponent} = commonUnits([Math.min(...observed),Math.max(...observed),width]);
  const count = (end - start) / step + 1n;
  if (count > 500n) return null;
  const result = Array.from({length:Number(count)},(_,i) => Number((start + BigInt(i)*step) + "e" + exponent));
  // Preserve every source key even at the precision limit of the imported number type.
  const keys = new Set(result);
  if (keys.size !== result.length || observed.some(value => !keys.has(value))) return null;
  if (categories.includes(null)) result.push(null);
  return result;
}
