// Only explicit links share selections. Same-field slicers on other pages
// remain independent until their author selects them in this dialog.
export function slicerMode(kind) {
  if (kind==="dateRange") return "range";
  if (["slicer","list","dropdown"].includes(kind)) return "category";
}
export function syncable(v) {
  return slicerMode(v?.kind) && v.groups?.length===1 && !v.groups[0].parameter;
}
function linked(v) {
  const link=v.slicerSync;
  return link?.field && typeof link.id==="string" && syncable(v) && slicerMode(v.kind)===link.mode &&
    v.groups[0].t===link.field.t && v.groups[0].c===link.field.c;
}
export function syncPageSelections(report) {
  const page=report.pages[report.active];
  for (const source of page.visuals) {
    if (!source.slicerSync) continue;
    if (!linked(source)) {delete source.slicerSync;continue;}
    copySyncedSelection(report,source);
  }
}
export function copySyncedSelection(report,source) {
  if (!linked(source)) return;
  for (const page of report.pages) for (const peer of page.visuals) {
    if (peer===source || peer.slicerSync?.id!==source.slicerSync.id || !linked(peer)) continue;
    peer.selection=source.selection;
    if (source.range) peer.range=source.range;
    else delete peer.range;
  }
}
export function hiddenSlicers(report,target) {
  const sources=new Map();
  for (const page of report.pages) {
    if (page===target) continue;
    for (const v of page.visuals) {
      if (v.slicerSync?.hiddenPages?.includes(target.id) && linked(v) && !sources.has(v.slicerSync.id)) sources.set(v.slicerSync.id,v);
    }
  }
  return [...sources.values()];
}
export function snapshotSlicerFilters(report,page) {
  const sources=hiddenSlicers(report,page);
  function capture(filters,states) {
    for (const v of sources) {
      const state=states?.find(s=>s.group===v.slicerSync.id);
      const selection=state ? state.selection : v.selection;
      if (!selection) continue;
      for (const rule of selection.filters || [selection]) {
        const copy={id:crypto.randomUUID(),field:rule.field,value:rule.value};
        if (rule.op) copy.op=rule.op;
        filters.push(copy);
      }
    }
  }
  capture(page.filters);
  for (const bookmark of report.bookmarks || []) if (bookmark.pageId===page.id) {
    capture(bookmark.pageFilters,bookmark.synced);delete bookmark.synced;
  }
  for (const v of page.visuals) delete v.slicerSync;
}
export function syncSlicerDialog(report,source,{dialog,esc,titleOf,fieldname,change}) {
  const field=source.groups[0],mode=slicerMode(source.kind);
  const group=linked(source) ? source.slicerSync.id : undefined;
  const choices=new Map();
  for (const page of report.pages) {
    if (page===report.pages[report.active]) continue;
    const peers=page.visuals.filter(v=>syncable(v) && slicerMode(v.kind)===mode &&
      v.groups[0].t===field.t && v.groups[0].c===field.c && (!linked(v) || v.slicerSync.id===group));
    choices.set(page,peers);
  }
  const body=[...choices].map(([page,peers])=>{
    const options=peers.map(peer=>{
      const selected=group && linked(peer) && peer.slicerSync.id===group;
      return `<option value="${esc(peer.id)}"${selected ? " selected" : ""}>${esc(titleOf(peer))}</option>`;
    });
    const hidden=source.slicerSync?.hiddenPages?.includes(page.id) ? " selected" : "";
    return `<label class="formlabel" for="sync-${esc(page.id)}">${esc(page.name)}</label><select class="control" id="sync-${esc(page.id)}" name="${esc(page.id)}"><option value="">Do not sync</option><option value="~hidden"${hidden}>Filter page only</option>${options.join("")}</select>`;
  }).join("");
  if (!body) return dialog("Sync slicers","<p>Add a second report page to share this "+esc(fieldname(field))+" selection.</p>");
  dialog("Sync slicers","<p>Choose a slicer for each page. Filter page only applies the selection to all visuals on that page.</p><div class='sync-pages'>"+body+"</div>","Apply",fd=>{
    const hiddenPages=[...choices.keys()].filter(page=>fd.get(page.id)==="~hidden").map(page=>page.id);
    const link={id:group || crypto.randomUUID(),mode,field:{t:field.t,c:field.c},hiddenPages};
    let any=hiddenPages.length>0;
    for (const [page,peers] of choices) for (const peer of peers) {
      if (fd.get(page.id)===peer.id) {peer.slicerSync=link;any=true;}
      else if (group && peer.slicerSync?.id===group) {
        delete peer.slicerSync;
        if (hiddenPages.includes(page.id)) {peer.selection=null;delete peer.range;}
      }
    }
    if (any) source.slicerSync=link;else delete source.slicerSync;
    change();
  });
}
