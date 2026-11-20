// Snapshots contain the editable report definition. Table rows stay in their
// versioned storage files, and server revisions belong to the current save.
export function authorHistory() {
  let entries=[],index=0,characters=0,saved;
  const limit=64,characterLimit=4*1024*1024;
  function state(report) {
    const {id,revision,preview,active,...definition}=report;
    return JSON.stringify(definition);
  }
  function entry(report,selected) {
    return {body:state(report),page:report.pages[report.active].id,selected};
  }
  function reset(report,selected) {
    const initial=entry(report,selected);
    entries=[initial];index=0;characters=initial.body.length;
    saved={body:initial.body,page:initial.page};
  }
  function record(report,selected) {
    const next=entry(report,selected),current=entries[index];
    if (next.body===current.body) {
      current.page=next.page;current.selected=selected;return;
    }
    for (const discarded of entries.splice(index+1)) characters-=discarded.body.length;
    entries.push(next);characters+=next.body.length;
    while (entries.length>2 && (entries.length>limit || characters>characterLimit))
      characters-=entries.shift().body.length;
    index=entries.length-1;
  }
  function restore(report,step) {
    const item=entries[index+step];
    if (!item) return;
    index+=step;
    const restored=JSON.parse(item.body);
    for (const key of ["id","revision","preview"]) if (Object.hasOwn(report,key)) restored[key]=report[key];
    restored.active=Math.max(0,restored.pages.findIndex(page=>page.id===item.page));
    return {report:restored,selected:item.selected,dirty:item.body!==saved.body || item.page!==saved.page};
  }
  return {reset,record,restore,
    select(id){if (entries[index]) entries[index].selected=id;},
    markSaved(snapshot){saved={body:state(snapshot),page:snapshot.pages[snapshot.active].id};},
    get canUndo(){return index>0;},
    get canRedo(){return index+1<entries.length;}
  };
}
