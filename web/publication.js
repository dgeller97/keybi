const path=id=>"/api/reports/"+id+"/publication";
const publishedUrl=id=>new URL("#"+id+"/read",location.href).href;

export async function publicationDialog({owner,current,dirty,save,api,dialog,esc,option,notify}) {
  let published;
  dialog("Publish report","<p>Checking the local published version…</p>");
  const loading=document.getElementById("dlgform");
  if(owner.id){
    try {published=(await api(path(owner.id))).publication;}
    catch(error){if(loading.closest("dialog[open]")) loading.querySelector("p").textContent=error.message;return;}
  }
  if (!current() || !loading.closest("dialog[open]")) return;
  function show() {
    const stage=published?'Published from revision '+published.revision+' · '+new Date(published.published).toLocaleString():'No published version.';
    const choices=owner.pages.filter(p=>!p.tooltip);
    const selected=choices.find(p=>p.id===published?.page) || choices.find(p=>p===owner.pages[owner.active]) || choices[0];
    const options=(choices.length?choices:owner.pages).map(p=>option(p.id,p.name,p===selected)).join("");
    const link=published?'<label class="formlabel" for="publication-url">Published link</label><input class="control" readonly id="publication-url" value="'+esc(publishedUrl(published.id))+'"><div class="publication-links"><button type="button" class="outline" data-copy-publication>Copy link</button><a href="'+esc(publishedUrl(published.id))+'" target="_blank" rel="noopener">Open published report</a></div>':"";
    const action=published?"Update published version":"Publish version";
    const submit=dirty() || !owner.id ? (published?"Save and update published version":"Save and publish version") : action;
    dialog("Publish report",'<p>'+esc(stage)+'</p>'+link+'<label class="formlabel" for="pub-entry">Opening page</label><select class="control" id="pub-entry" name="page">'+options+'</select>'+
      '<p class="hint">Readers on this computer see the published version until you update it. Imported data stays pinned to that version.</p>'+
      (published?'<button type="button" class="outline" data-withdraw>Unpublish</button>':""),submit,async fd=>{
      const form=document.getElementById("dlgform");
      if (!current()) throw Error("Reopen this report before publishing.");
      if (!owner.id || dirty()) await save();
      if (!current() || !form.closest("dialog[open]")) return;
      if (dirty()) throw Error("The draft changed during save. Review it before publishing.");
      const result=await api(path(owner.id),{action:"publish",revision:owner.revision,previous:published?.release||null,page:fd.get("page")});
      if (!current() || !form.closest("dialog[open]")) return;
      published=result.publication;show();notify("Published revision "+published.revision);
    });
    const form=document.getElementById("dlgform");
    const copy=form.querySelector("[data-copy-publication]");
    if (copy) copy.onclick=async()=>{
      form.querySelector("#publication-url").select();
      try{await navigator.clipboard.writeText(publishedUrl(published.id));notify("Published link copied");}
      catch{notify("Select and copy the published link.");}
    };
    const withdraw=form.querySelector("[data-withdraw]");
    if (withdraw) withdraw.onclick=()=>{
      dialog("Unpublish report","<p>Readers opening this link will see that the report is unavailable. The saved draft stays in your library.</p>","Unpublish version",async()=>{
        const confirmation=document.getElementById("dlgform");
        const result=await api(path(owner.id),{action:"withdraw",revision:owner.revision,previous:published.release});
        if(!current() || !confirmation.closest("dialog[open]"))return;
        published=result.publication;show();notify("Report unpublished");
      });
    };
  }
  show();
}
export function publicationCards(records,esc) {
  return records.map(r=>'<a class="published-item" href="'+esc(publishedUrl(r.id))+'" aria-label="'+esc(r.title)+'"><h2>'+esc(r.title)+'</h2><span>Revision '+Number(r.revision)+' · '+esc(new Date(r.published).toLocaleDateString())+'</span><small>'+Number(r.pages)+' pages · '+Number(r.tables)+' tables</small></a>').join("") || "<p>Published reports will appear here.</p>";
}

