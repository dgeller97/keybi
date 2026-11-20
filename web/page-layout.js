export function tooltipCanvasSize(page) {
  const size = page.tooltip && page.tooltipSize;
  return size && Number.isInteger(size.width) && size.width >= 160 && size.width <= 10000 &&
    Number.isInteger(size.height) && size.height >= 100 && size.height <= 10000 ? size : null;
}

export function visualBounds(page,visual) {
  const size = tooltipCanvasSize(page);
  const width = size?.width ?? 1000;
  return {
    x:width-visual.w, w:width-visual.x,
    y:size ? size.height-visual.h : 8000, h:size ? size.height-visual.y : 8000,
  };
}

export function phoneEntries(page) {
  const unplaced = new Map(page.visuals.map(v=>[v.id,v]));
  const entries = [];
  function place(visual,height,hidden=false,width="full") {
    const h = Number.isInteger(height) && height >= 80 && height <= 2000
      ? height : Math.round(Math.max(100,Math.min(420,visual.h)));
    entries.push({visual,height:h,hidden:hidden===true,width:width==="half" ? "half" : "full"});
    unplaced.delete(visual.id);
  }
  for (const entry of Array.isArray(page.phoneLayout) ? page.phoneLayout : []) {
    const visual = unplaced.get(entry?.id);
    if (visual) place(visual,entry.height,entry.hidden,entry.width);
  }
  for (const visual of [...unplaced.values()].sort((a,b)=>a.y-b.y || a.x-b.x)) place(visual);
  return entries;
}

// Reading order follows the page settings. A full-width visual starts a new row.
export function phoneGeometry(entries,width) {
  const boxes = new Map(), gutter = 8;
  const full = Math.max(1,width-14), half = Math.max(1,(full-gutter)/2);
  let y = 6, pendingHeight = 0;
  for (const entry of entries) {
    if (entry.hidden) continue;
    const paired = entry.width === "half";
    if (!paired && pendingHeight) {
      y += pendingHeight + gutter;
      pendingHeight = 0;
    }
    const x = paired && pendingHeight ? 6 + half + gutter : 6;
    boxes.set(entry.visual,{x,y,w:paired ? half : full,h:entry.height});
    if (paired && !pendingHeight) pendingHeight = entry.height;
    else {
      y += Math.max(entry.height,pendingHeight) + gutter;
      pendingHeight = 0;
    }
  }
  if (pendingHeight) y += pendingHeight + gutter;
  return {width,height:Math.max(100,y),boxes};
}
