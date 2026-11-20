// Measure in the SVG's own coordinate system so canvas zoom and letterboxing
// affect the drawn rectangle and the point centers identically.
export function attachRectangleSelection(commit, dismiss, clear) {
  document.addEventListener("pointerdown", start => {
    const svg = start.target.closest("#paper svg[data-clear-space]");
    if (!svg || !start.isPrimary || start.button !== 0) return;
    const blank = target => target === svg || target.matches?.("[data-scale] line");
    const canClear = blank(start.target), canDrag = svg.hasAttribute("data-rectangle-select") && start.pointerType !== "touch";
    if (!canClear && !canDrag) return;
    const screen = svg.getScreenCTM();
    if (!screen) return;
    const inverse = screen.inverse(), origin = new DOMPoint(start.clientX,start.clientY).matrixTransform(inverse);
    const controller = new AbortController(), options = {signal:controller.signal};
    let rect, bounds, cancelled = false;
    const update = event => {
      const end = new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
      bounds = [Math.min(origin.x,end.x),Math.min(origin.y,end.y),Math.max(origin.x,end.x),Math.max(origin.y,end.y)];
      const [x,y,right,bottom] = bounds;
      for (const [key,value] of Object.entries({x,y,width:right-x,height:bottom-y})) rect.setAttribute(key,value);
    };
    const stop = () => {
      controller.abort();
      rect?.remove();
      if (svg.hasPointerCapture(start.pointerId)) svg.releasePointerCapture(start.pointerId);
    };
    window.addEventListener("pointermove",event => {
      if (event.pointerId !== start.pointerId || cancelled) return;
      if (!svg.isConnected) { stop(); return; }
      if (!rect) {
        if (Math.hypot(event.clientX-start.clientX,event.clientY-start.clientY) < 4) return;
        if (!canDrag) { stop(); return; }
        svg.setPointerCapture(start.pointerId);
        dismiss();
        rect = document.createElementNS(svg.namespaceURI,"rect");
        rect.setAttribute("class","selection-rectangle");
        svg.append(rect);
      }
      update(event);
    },options);
    window.addEventListener("pointerup",event => {
      if (event.pointerId !== start.pointerId) return;
      if (cancelled || !svg.isConnected) { stop(); return; }
      if (!rect) {
        stop();
        if (canClear && blank(event.target) && Math.hypot(event.clientX-start.clientX,event.clientY-start.clientY) < 4)
          clear(svg.closest(".visual").dataset.id);
        return;
      }
      update(event);
      const [left,top,right,bottom] = bounds, keys = new Set();
      for (const mark of svg.querySelectorAll("[data-selection-key]")) {
        const dot = mark.querySelector("circle");
        if (!dot) continue;
        const x = dot.cx.baseVal.value, y = dot.cy.baseVal.value;
        if (x < left || x > right || y < top || y > bottom) continue;
        const clip = mark.closest("[data-plot-clip]");
        if (clip) {
          const [l,t,w,h] = clip.dataset.plotClip.split(",").map(Number);
          if (x < l || x > l+w || y < t || y > t+h) continue;
        }
        keys.add(mark.dataset.selectionKey);
      }
      const id = svg.closest(".visual").dataset.id;
      stop();
      commit(id,[...keys].map(key => JSON.parse(key)),start.ctrlKey || start.metaKey);
    },options);
    window.addEventListener("pointercancel",event => { if (event.pointerId === start.pointerId) stop(); },options);
    svg.addEventListener("lostpointercapture",event => { if (event.pointerId === start.pointerId) stop(); },options);
    window.addEventListener("blur",stop,options);
    window.addEventListener("keydown",event => {
      if (event.key !== "Escape") return;
      cancelled = true;
      rect?.remove();
      // Keep pointer capture until release so cancelling over a mark cannot click it.
    },options);
  });
}
