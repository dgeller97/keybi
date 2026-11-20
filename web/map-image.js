export function mapImageDialog({existing,field,column,dialog,esc,valueCaption,api,uploadImage,load,commit}) {
  const pageSize=150;
  const search=column.numeric?"":'<label class="formlabel">Search '+esc(column.name)+'<input class="control" type="search" name="search"></label>';
  const body=search+'<label class="formlabel" for="map-image-member">Field value</label><select id="map-image-member" class="control" name="member" required></select>'+
    '<div class="image-value-pages"><button type="button" class="outline" data-previous>Previous</button><span aria-live="polite"></span><button type="button" class="outline" data-next>Next</button></div>'+
    '<label class="formlabel" for="map-image-file">Image file</label><input id="map-image-file" name="file" type="file" accept="image/png,image/jpeg,image/webp"'+(existing?'':' required')+'>'+
    (existing?'<small>'+esc(existing.image.name)+'</small>':'')+
    '<label class="formlabel">Alternative text<textarea name="alt" class="control" rows="2" maxlength="1024">'+esc(existing?.alt||"")+'</textarea></label>';
  dialog(existing?"Edit image for value":"Add image for value",body,"Apply",async fd=>{
    if(!fd.has("member") || !fd.get("member")) throw Error("Choose a field value.");
    const value=JSON.parse(fd.get("member")),file=fd.get("file");
    const image=file?.name ? await uploadImage(file,api) : existing?.image;
    if (!form.closest("dialog[open]")) return;
    if (!image) throw Error("Choose an image file.");
    commit(value,image,fd.get("alt").trim());
  });
  const form=document.getElementById("dlgform"),member=form.elements.member;
  const back=form.querySelector("[data-previous]"),next=form.querySelector("[data-next]"),status=form.querySelector(".image-value-pages span");
  let offset=0,ticket=0,timer;
  const option=v=>new Option(valueCaption(v,column),JSON.stringify(v));
  async function populate() {
    const id=++ticket,query=form.elements.search?.value||"";
    member.disabled=true;member.replaceChildren();back.disabled=true;next.disabled=true;status.textContent="Loading values…";
    try {
      const result=await load(offset,query);
      if (!form.isConnected || id!==ticket) return;
      if (result.error) throw Error(result.error);
      const values=(result.rows||[]).map(r=>r[0]);
      member.replaceChildren(...values.map(option));
      if (existing && !query && !offset) {
        if (!values.includes(existing.value)) member.prepend(option(existing.value));
        member.value=JSON.stringify(existing.value);
      }
      member.disabled=!member.options.length;back.disabled=offset===0;next.disabled=!result.more;
      status.textContent=values.length?(offset+1)+"–"+(offset+values.length):"No matching values";
    } catch(error) {
      if (id===ticket && form.isConnected) {status.textContent=error.message;back.disabled=offset===0;}
    }
  }
  back.onclick=()=>{offset=Math.max(0,offset-pageSize);populate();};
  next.onclick=()=>{offset+=pageSize;populate();};
  if (form.elements.search) form.elements.search.oninput=()=>{
    ++ticket;offset=0;member.disabled=true;back.disabled=true;next.disabled=true;
    clearTimeout(timer);timer=setTimeout(populate,120);
  };
  populate();
}
