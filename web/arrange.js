import {icon} from "./icons.js";

const commands = [
  ["left", "Align left"], ["center", "Align center"], ["right", "Align right"],
  ["top", "Align top"], ["middle", "Align middle"], ["bottom", "Align bottom"],
  ["horizontal", "Distribute horizontally"], ["vertical", "Distribute vertically"],
];

export function arrangePane(visuals, ids, titleOf, esc, section) {
  const movable=visuals.filter(v=>ids.has(v.id) && !v.layoutLocked).length;
  const choices = [...visuals].reverse().map(v =>
    '<label><input type="checkbox" aria-label="'+esc(titleOf(v))+'" data-layout-id="'+esc(v.id)+'"'+(ids.has(v.id) ? " checked" : "")+
    (v.layoutLocked ? ' aria-description="Position locked"' : "")+'>'+esc(titleOf(v))+
    (v.layoutLocked ? '<span class="position-lock" title="Position locked">'+icon("locked")+"</span>" : "")+"</label>"
  ).join("");
  const buttons = commands.map(([key, label], index) => {
    const minimum = index < 6 ? 2 : 3;
    return '<button class="outline" data-arrange="'+key+'"'+(movable < minimum ? " disabled" : "")+'>'+label+"</button>";
  }).join("");
  const layers=[["front","Bring to front"],["forward","Bring forward"],["back","Send to back"],["backward","Send backward"]]
    .map(([key,label])=>{
      const enabled=visuals.some((v,i)=>ids.has(v.id) && (key.startsWith("f") ?
        i<visuals.length-1 && !ids.has(visuals[i+1].id) : i>0 && !ids.has(visuals[i-1].id)));
      return '<button class="outline" data-layer="'+key+'"'+(enabled ? "" : " disabled")+'>'+label+"</button>";
    }).join("");
  return section("Arrange visuals",'<p class="hint">Front to back. Choose visuals here, Ctrl-click titles, or drag around them on the canvas.</p><div class="arrange-choices">'+choices+"</div>") +
    section(ids.size+" selected",(movable<ids.size ? '<p class="hint">'+(ids.size-movable)+" positions locked</p>" : "")+
      '<div class="arrange-commands">'+buttons+'</div><div class="layout-actions"><button class="outline" data-action="duplicate-visuals"'+(ids.size ? "" : " disabled")+'>Duplicate selection</button>'+
      '<button class="outline" data-action="lock-layout"'+(ids.size ? "" : " disabled")+'>'+(ids.size && !movable ? "Unlock positions" : "Lock positions")+"</button></div>") +
    section("Layer order",'<div class="arrange-commands">'+layers+"</div>");
}

export function moveLayers(visuals,ids,command) {
  const chosen=v=>ids.has(v.id);
  if (command==="front") return [...visuals.filter(v=>!chosen(v)),...visuals.filter(chosen)];
  if (command==="back") return [...visuals.filter(chosen),...visuals.filter(v=>!chosen(v))];
  const result=[...visuals],direction=command==="forward" ? 1 : -1;
  for (let i=direction===1 ? result.length-2 : 1;i>=0 && i<result.length;i-=direction) {
    const next=i+direction;
    if (chosen(result[i]) && !chosen(result[next])) [result[i],result[next]]=[result[next],result[i]];
  }
  return result;
}

// Align against the selection's outer edges. Distribution fixes the ends and
// shares the remaining space between visual edges, including unequal widths.
export function arrangeVisuals(visuals, command) {
  if (visuals.length < 2 || !commands.some(([key]) => key === command)) return false;
  const horizontal = ["left", "center", "right", "horizontal"].includes(command);
  const position = horizontal ? "x" : "y", size = horizontal ? "w" : "h";
  const start = Math.min(...visuals.map(v => v[position]));
  const end = Math.max(...visuals.map(v => v[position] + v[size]));
  let changed = false;
  function place(v, value) {
    const coordinate = Math.round(value);
    if (v[position] !== coordinate) { v[position] = coordinate; changed = true; }
  }
  if (command === "horizontal" || command === "vertical") {
    if (visuals.length < 3) return false;
    const sorted = [...visuals].sort((a,b) => a[position] - b[position] || a[size] - b[size]);
    const last = sorted.at(-1);
    const span = last[position] + last[size] - start;
    const gap = (span - sorted.reduce((sum,v) => sum + v[size], 0)) / (sorted.length - 1);
    if (gap < 0) throw Error("Move the two end visuals farther apart to leave room for every selected visual.");
    let cursor = start;
    for (const v of sorted) {
      place(v,cursor);
      cursor += v[size] + gap;
    }
  } else {
    for (const v of visuals) {
      if (command === "left" || command === "top") place(v,start);
      else if (command === "right" || command === "bottom") place(v,end - v[size]);
      else place(v,(start + end - v[size]) / 2);
    }
  }
  return changed;
}

export function beginCanvasSelection(start, paper, initial, commit) {
  if (!start.isPrimary || start.pointerType === "touch" || start.button !== 0) return;
  const controller = new AbortController(), options = {signal:controller.signal};
  const additive = start.ctrlKey || start.metaKey || start.shiftKey;
  const origin = {x:start.clientX,y:start.clientY};
  let rect, cancelled = false;
  function draw(event) {
    const frame = paper.getBoundingClientRect(), scale = frame.width / paper.offsetWidth;
    const left = Math.min(origin.x,event.clientX), top = Math.min(origin.y,event.clientY);
    const right = Math.max(origin.x,event.clientX), bottom = Math.max(origin.y,event.clientY);
    Object.assign(rect.style,{
      left:(left-frame.left)/scale-paper.clientLeft+"px",top:(top-frame.top)/scale-paper.clientTop+"px",
      width:(right-left)/scale+"px",height:(bottom-top)/scale+"px",
    });
    return {left,top,right,bottom};
  }
  function stop() {
    controller.abort();rect?.remove();
    if (paper.hasPointerCapture(start.pointerId)) paper.releasePointerCapture(start.pointerId);
  }
  window.addEventListener("pointermove",event=>{
    if (event.pointerId !== start.pointerId || cancelled) return;
    if (!rect) {
      if (Math.hypot(event.clientX-origin.x,event.clientY-origin.y)<4) return;
      rect=document.createElement("div");rect.className="canvas-selection-rectangle";
      rect.setAttribute("aria-hidden","true");paper.append(rect);paper.setPointerCapture(start.pointerId);
    }
    draw(event);
  },options);
  window.addEventListener("pointerup",event=>{
    if (event.pointerId !== start.pointerId) return;
    if (!rect && !cancelled) { stop();return; }
    // A captured drag also emits a click on the paper. A plain click there
    // clears selection, so consume only the click belonging to this gesture.
    const consume = click=>{
      if (click.pointerId===start.pointerId && click.target===paper) click.stopImmediatePropagation();
    };
    window.addEventListener("click",consume,true);
    setTimeout(()=>window.removeEventListener("click",consume,true),0);
    if (cancelled) { stop();return; }
    const area=draw(event),chosen=new Set(additive ? initial : []);
    for (const element of paper.querySelectorAll(":scope > .visual:not([hidden],[data-position-locked])")) {
      const box=element.getBoundingClientRect(),id=element.dataset.id;
      if (box.left>=area.left && box.right<=area.right && box.top>=area.top && box.bottom<=area.bottom) {
        if (!additive || !chosen.delete(id)) chosen.add(id);
      }
    }
    stop();commit(chosen);
  },options);
  window.addEventListener("keydown",event=>{
    if (event.key==="Escape") {
      cancelled=true;
      if (rect) rect.hidden=true;
    }
  },options);
  window.addEventListener("pointercancel",event=>{if(event.pointerId===start.pointerId)stop();},options);
  paper.addEventListener("lostpointercapture",event=>{if(event.pointerId===start.pointerId)stop();},options);
  window.addEventListener("blur",stop,options);
}
