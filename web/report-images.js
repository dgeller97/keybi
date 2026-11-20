const fits={contain:"Fit",cover:"Fill",none:"Center",fill:"Stretch"};
const fit=v=>Object.hasOwn(fits,v.imageFit)?v.imageFit:"contain";
const radius=v=>Math.min(100,Math.max(0,Number(v.imageRadius)||0));
export const imageUrl=image=>/^[a-f0-9]{64}$/.test(image?.key||"") ? "/api/images/"+image.key : "";

const sameField=(a,b)=>a && b && a.t===b.t && a.c===b.c;
export function imageControls(v,{esc,fields,option,fkey,valueCaption}) {
  const image=v.image;
  const field=v.groups[0];
  const choose='<label class="formlabel">Match image to field<select class="control" data-image-field>'+option("","Always show uploaded image",!field)+fields.map(f=>option(fkey(f),f.table+" · "+f.name,sameField(f,field))).join("")+'</select></label>';
  if (field) {
    const column=fields.find(f=>sameField(f,field));
    const list=(v.imageMappings||[]).map((m,i)=>sameField(m.field,field) ? '<div class="image-mapping"><button class="outline" data-map-image="'+i+'">'+esc(valueCaption(m.value,column))+'</button><span>'+esc(m.image.name)+'</span><button aria-label="Remove image for '+esc(valueCaption(m.value,column))+'" data-remove-image="'+i+'">×</button></div>' : "").join("");
    return choose+list+'<button class="outline" data-map-image="new">Add image for value</button>';
  }
  return choose+'<button class="outline" data-action="choose-image">'+(image?"Replace image":"Upload image")+'</button>'+
    (image?'<small class="last-load">'+esc(image.name)+' · '+Number(image.width)+' × '+Number(image.height)+'</small>':'<small class="last-load">PNG, JPEG or WebP</small>')+
    '<label class="formlabel">Alternative text<textarea class="control" data-opt="imageAlt" rows="2" maxlength="1024">'+esc(v.imageAlt||"")+'</textarea></label>';
}
export function imageFormat(v) {
  return '<label class="formlabel">Image fit<select class="control" data-opt="imageFit">'+Object.entries(fits).map(([key,label])=>'<option value="'+key+'"'+(key===fit(v)?' selected':'')+'>'+label+'</option>').join("")+'</select></label>'+
    '<label class="formlabel">Corner radius (px)<input class="control" type="number" min="0" max="100" step="1" data-opt="imageRadius" value="'+radius(v)+'"></label>';
}
export function imageBody(v,esc,{result,caption,fieldName,interactive=false,reading=false}={}) {
  let image=v.image,alt=v.imageAlt;
  if (v.groups.length) {
    const empty=label=>'<div class="vempty">'+esc(label)+'</div>';
    if (!result) return empty("Loading image…");
    if (result.error) return empty(result.error);
    const rows=result.rows||[];
    if (!rows.length) return empty("No matching "+fieldName+".");
    if (rows.length!==1 || result.more) return empty("Select one "+fieldName+" to see its image.");
    const value=rows[0][0];
    const m=(v.imageMappings||[]).find(m=>sameField(m.field,v.groups[0]) && m.value===value);
    if (!m) return empty("No image for "+caption(value)+".");
    image=m.image;alt=m.alt;
  }
  const src=imageUrl(image);
  if(!src) return '<div class="vempty">'+(reading?"No image":"Upload an image in Build.")+'</div>';
  alt=alt || image.name || "Report image";
  const img='<img class="report-image" draggable="false" alt="'+esc(alt)+'" src="'+src+'" style="object-fit:'+fit(v)+';border-radius:'+radius(v)+'px">';
  return interactive ? '<button class="view-report-image" data-view-image="1" aria-label="Enlarge '+esc(alt)+'">'+img+'</button>' : img;
}
export function viewImage(img,dialog,esc) {
  dialog("View image",'<div class="image-viewer"><img src="'+esc(img.getAttribute("src"))+'" alt="'+esc(img.alt)+'"></div><button type="button" class="outline" data-image-zoom>Actual size</button>');
  const form=document.querySelector("#dlgform"),viewer=form.querySelector(".image-viewer"),button=form.querySelector("[data-image-zoom]");
  button.onclick=()=>{const zoomed=viewer.classList.toggle("actual");button.textContent=zoomed?"Fit to window":"Actual size";};
}
export async function uploadImage(file,api) {
  if (file.size>32*1024*1024) throw Error("Choose an image under 32 MiB.");
  const url=URL.createObjectURL(file);
  const image=new Image();
  try {
    image.src=url;
    try {await image.decode();} catch {throw Error("The selected file could not be read as an image.");}
    const {key}=await api("/api/images",file);
    return {key,name:file.name,width:image.naturalWidth,height:image.naturalHeight};
  } finally {URL.revokeObjectURL(url);}
}
export function drawReportImage(context,v,img) {
  if(!img?.naturalWidth || !img.complete) return;
  const {x,y,w,h}=v,mode=fit(v);
  let width=w,height=h;
  if(mode!=="fill"){
    const scale=mode==="none"?1:(mode==="cover"?Math.max:Math.min)(w/img.naturalWidth,h/img.naturalHeight);
    width=img.naturalWidth*scale;height=img.naturalHeight*scale;
  }
  context.save();context.beginPath();context.roundRect(x,y,w,h,Math.min(radius(v),w/2,h/2));context.clip();
  context.drawImage(img,x+(w-width)/2,y+(h-height)/2,width,height);
  context.restore();
}

