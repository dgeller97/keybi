import {phoneEntries,tooltipCanvasSize} from "./page-layout.js";

export function pageSettings(
  page,
  { dialog, esc, textInput, options, titleOf, change },
) {
  const matches = new Set(
    page.tooltipMatches || (page.tooltipMatch ? [page.tooltipMatch] : []),
  );
  const size = tooltipCanvasSize(page);
  const phone = phoneEntries(page);
  const extent = {
    width:Math.ceil(Math.max(160,...page.visuals.map(v=>v.x+v.w))),
    height:Math.ceil(Math.max(100,...page.visuals.map(v=>v.y+v.h))),
  };
  const dimensions = ["width","height"].map(key => {
    const min = key === "width" ? 160 : 100;
    const suggested = Math.min(10000,Math.max(key === "width" ? 320 : 240,extent[key]+12));
    return `<label>Canvas ${key} (px)<input class="control" type="number" min="${min}" max="10000" step="1" required name="${key}" value="${size?.[key] ?? suggested}"></label>`;
  }).join("");
  dialog(
    "Page settings",
    textInput("Page name", "name", page.name) +
      `<label class="chart-option"><input type="checkbox" name="phoneLayout" ${Array.isArray(page.phoneLayout) ? "checked" : ""}>Use a phone layout</label><div id="phone-order" hidden><p>Arrange visuals in reading order. Two consecutive half-width visuals share a row.</p><ol></ol></div>` +
      `<label class="chart-option"><input type="checkbox" name="hiddenPage" ${page.hidden ? "checked" : ""}>Hide page from navigators</label>` +
      `<label class="chart-option"><input type="checkbox" name="tooltip" ${page.tooltip ? "checked" : ""}>Use as tooltip page</label><div id="tooltip-matches"><label class="formlabel">Tooltip canvas size<select class="control" name="sizing"><option value="auto">Fit to visuals</option><option value="fixed" ${size ? "selected" : ""}>Fixed size</option></select></label><div id="tooltip-dimensions" class="dimensions">${dimensions}</div><label class="formlabel">Automatic tooltip fields<select class="control" aria-label="Automatic tooltip field"><option value="">+ Add field</option>${options}</select></label><div class="tooltip-matches"></div></div>`,
    "Save",
    (fd) => {
      let fixed;
      if (fd.has("tooltip") && fd.get("sizing") === "fixed") {
        fixed = {width:Number(fd.get("width")),height:Number(fd.get("height"))};
        if (fixed.width < extent.width || fixed.height < extent.height)
          throw Error(`The visuals need at least ${extent.width} × ${extent.height} px. Increase the canvas size or move and resize the visuals.`);
      }
      if (fixed) page.tooltipSize = fixed;
      else delete page.tooltipSize;
      if (fd.has("hiddenPage")) page.hidden = true;
      else delete page.hidden;
      page.name = fd.get("name");
      if (fd.has("phoneLayout")) page.phoneLayout = phone.map(({visual,height,hidden,width})=>({id:visual.id,height,...(width==="half" ? {width} : {}),...(hidden ? {hidden:true} : {})}));
      else delete page.phoneLayout;
      page.tooltip = fd.has("tooltip");
      delete page.tooltipMatch;
      if (page.tooltip && matches.size) page.tooltipMatches = [...matches];
      else delete page.tooltipMatches;
      change();
    },
  );
  const editor = document.querySelector("#phone-order");
  const toggle = document.querySelector("#dlgform [name=phoneLayout]");
  function phoneList() {
    editor.hidden = !toggle.checked;
    editor.querySelector("ol").innerHTML = phone.map(({visual,height,hidden,width},index)=>{
      const name = esc(titleOf(visual));
      return `<li><label class="phone-inclusion"><input type="checkbox" data-phone-show="${index}" aria-label="Show ${name} on phone" ${hidden ? "" : "checked"}><span>${name}</span></label>
        <select data-phone-width="${index}" aria-label="${name} phone width" ${hidden ? "disabled" : ""}><option value="full">Full width</option><option value="half" ${width==="half" ? "selected" : ""}>Half width</option></select>
        <label><input type="number" min="80" max="2000" step="1" required value="${height}" data-height="${index}" aria-label="${name} height in pixels" ${toggle.checked && !hidden ? "" : "disabled"}> px</label>
        <button type="button" aria-label="Move ${name} up" data-phone-move="-1" data-index="${index}" ${index===0 ? "disabled" : ""}>↑</button>
        <button type="button" aria-label="Move ${name} down" data-phone-move="1" data-index="${index}" ${index===phone.length-1 ? "disabled" : ""}>↓</button></li>`;
    }).join("");
  }
  toggle.onchange = phoneList;
  editor.oninput = e=>{
    if (e.target.matches("[data-phone-width]")) phone[Number(e.target.dataset.phoneWidth)].width = e.target.value;
    if (e.target.matches("[data-height]")) phone[Number(e.target.dataset.height)].height = e.target.valueAsNumber;
    if (e.target.matches("[data-phone-show]")) {
      const i = Number(e.target.dataset.phoneShow);
      phone[i].hidden = !e.target.checked;
      const input = editor.querySelector(`[data-height="${i}"]`);
      if (!input.validity.valid) {
        phone[i].height = Math.round(Math.max(100,Math.min(420,phone[i].visual.h)));
        input.value = phone[i].height;
      }
      input.disabled = phone[i].hidden;
      editor.querySelector(`[data-phone-width="${i}"]`).disabled = phone[i].hidden;
    }
  };
  editor.onclick = e=>{
    const button = e.target.closest("[data-phone-move]");
    if (!button) return;
    const from = Number(button.dataset.index), to = from + Number(button.dataset.phoneMove);
    phone.splice(to,0,...phone.splice(from,1));
    phoneList();
    const nextButton = editor.querySelector(`[data-index="${to}"][data-phone-move="${button.dataset.phoneMove}"]:enabled`) ||
      editor.querySelector(`[data-index="${to}"]:enabled`);
    nextButton?.focus();
  };
  phoneList();
  const group = document.querySelector("#tooltip-matches"),
    select = group.querySelector('[aria-label="Automatic tooltip field"]'),
    sizing = group.querySelector('[name="sizing"]'),
    dimensionsGroup = group.querySelector("#tooltip-dimensions"),
    list = group.querySelector(".tooltip-matches"),
    enabled = document.querySelector("#dlgform [name=tooltip]");
  function render() {
    group.hidden = !enabled.checked;
    dimensionsGroup.hidden = !enabled.checked || sizing.value !== "fixed";
    for (const input of dimensionsGroup.querySelectorAll("input")) input.disabled = dimensionsGroup.hidden;
    const labels = new Map(
      Array.from(select.options, (o) => [o.value, o.text]),
    );
    list.innerHTML = [...matches]
      .map(
        (k) =>
          `<button type="button" class="outline" data-match="${esc(k)}" aria-label="Remove ${esc(labels.get(k) || k)}">${esc(labels.get(k) || k)} ×</button>`,
      )
      .join("");
    for (const o of select.options) o.disabled = matches.has(o.value);
    select.value = "";
  }
  enabled.onchange = render;
  sizing.onchange = render;
  select.onchange = () => {
    if (select.value) matches.add(select.value);
    render();
  };
  list.onclick = (e) => {
    const button = e.target.closest("[data-match]");
    if (button) {
      matches.delete(button.dataset.match);
      render();
    }
  };
  render();
}

export function attachTooltips(load, cacheable) {
  const pages = new Map();
  let cachedChars = 0;
  function remember(mark, data) {
    if (!data?.visuals || data.cacheable === false || !cacheable()) return;
    const size = data.visuals.reduce(
      (sum, v) => sum + v.html.length + v.title.length,
      0,
    );
    if (size > 500000) return;
    while (pages.size && (pages.size >= 24 || cachedChars + size > 500000)) {
      const key = pages.keys().next().value;
      cachedChars -= pages.get(key).size;
      pages.delete(key);
    }
    pages.set(mark, { data, size });
    cachedChars += size;
  }
  const tip = document.createElement("div");
  tip.id = "chart-tooltip";
  tip.setAttribute("role", "tooltip");
  tip.hidden = true;
  document.body.append(tip);
  let anchor,
    timer,
    serial = 0,
    pointer,
    focused;
  function hide() {
    serial++;
    clearTimeout(timer);
    anchor?.removeAttribute("aria-describedby");
    tip.hidden = true;
    anchor = null;
  }
  function place() {
    const box = anchor.getBoundingClientRect();
    const x = pointer?.x ?? box.left + box.width / 2;
    const y = pointer?.y ?? box.bottom;
    const { width, height } = tip.getBoundingClientRect();
    tip.style.left =
      Math.max(6, Math.min(x + 12, window.innerWidth - width - 6)) + "px";
    tip.style.top =
      Math.max(
        6,
        Math.min(
          y + 14 + height > window.innerHeight ? y - height - 12 : y + 14,
          window.innerHeight - height - 6,
        ),
      ) + "px";
  }
  function cell(parent, tag, value) {
    const el = document.createElement(tag);
    el.textContent = value;
    parent.append(el);
    return el;
  }
  function fitPage() {
    const frame = tip.querySelector(".tooltip-page-frame");
    if (!frame) return;
    const sheet = frame.firstElementChild;
    const chromeHeight = tip.offsetHeight - frame.offsetHeight;
    const scale = Math.min(1, Math.min(510, window.innerWidth-44)/sheet.offsetWidth,
      Math.max(1,Math.min(370,window.innerHeight-chromeHeight-12))/sheet.offsetHeight);
    frame.style.width = sheet.offsetWidth*scale + "px";
    frame.style.height = sheet.offsetHeight*scale + "px";
    sheet.style.transform = `scale(${scale})`;
  }
  function renderPage(data) {
    tip.classList.add("page-tooltip");
    cell(tip, "div", data.page).className = "tooltip-page-title";
    if (!data.visuals.length && !data.size) {
      cell(tip, "small", "This tooltip page is empty.");
      return;
    }
    const left = data.size ? 0 : Math.min(...data.visuals.map((v) => v.x)),
      top = data.size ? 0 : Math.min(...data.visuals.map((v) => v.y));
    const w = data.size?.width ?? Math.max(1, ...data.visuals.map((v) => v.x + v.w - left)),
      h = data.size?.height ?? Math.max(1, ...data.visuals.map((v) => v.y + v.h - top));
    const frame = cell(tip, "div", "");
    frame.className = "tooltip-page-frame";
    const sheet = cell(frame, "div", "");
    sheet.className = "tooltip-sheet";
    Object.assign(sheet.style, {
      width: w + "px",
      height: h + "px",
    });
    fitPage();
    if (!data.visuals.length) cell(sheet, "small", "This tooltip page is empty.");
    for (const v of data.visuals) {
      const item = document.createElement("section");
      item.className = "tooltip-visual";
      if (v.kind==="shape" || v.kind==="image") item.setAttribute("data-shape-object","");
      item.setAttribute("aria-label", v.title);
      Object.assign(item.style, {
        left: v.x - left + "px",
        top: v.y - top + "px",
        width: v.w + "px",
        height: v.h + "px",
      });
      item.style.setProperty("--accent", v.accent);
      if(v.headingCss)item.style.cssText+=v.headingCss;
      const head=cell(item,"div","");
      head.className="vhead";
      cell(head,"strong",v.title).style.flex="1";
      if(v.subtitle)cell(item,"div",v.subtitle).className="vsubtitle";
      const body = cell(item, "div", "");
      body.className = "vbody";
      body.innerHTML = v.html;
      for (const el of body.querySelectorAll(
        "button,input,select,textarea,a,[tabindex]",
      ))
        el.tabIndex = -1;
      sheet.append(item);
      const card = body.querySelector(".kpi");
      if (card && card.scrollWidth > card.clientWidth && card.clientWidth > 14) {
        const fontSize = parseFloat(getComputedStyle(card).fontSize);
        card.style.fontSize =
          Math.floor(fontSize * (card.clientWidth - 14) / card.scrollWidth) + "px";
      }
    }
  }
  function show(mark, pos, keyboard = false) {
    pointer = pos;
    if (anchor === mark) {
      if (!tip.hidden) place();
      return;
    }
    hide();
    if (!mark) return;
    anchor = mark;
    const ticket = serial;
    timer = setTimeout(
      async () => {
        if (!mark.isConnected || ticket !== serial) return;
        tip.replaceChildren();
        tip.classList.remove("page-tooltip");
        cell(
          tip,
          "strong",
          mark.dataset.tipLabel ?? mark.getAttribute("aria-label"),
        );
        const description = mark.getAttribute("aria-description");
        if (description) cell(tip, "div", description).className = "tooltip-explanation";
        const status = cell(tip, "small", "Loading…");
        mark.setAttribute("aria-describedby", tip.id);
        tip.hidden = false;
        place();
        try {
          const cached = pages.get(mark);
          const data =
            cached?.data ??
            (await load(mark, () => ticket === serial && mark.isConnected));
          if (ticket !== serial) return;
          if (!mark.isConnected || !data) {
            hide();
            return;
          }
          if (!cached) remember(mark, data);
          status.remove();
          if (data.page !== undefined) {
            renderPage(data);
            place();
            return;
          }
          if (!data.rows.length) {
            place();
            return;
          }
          const table = document.createElement("table");
          if (data.highlighted) {
            const row = table.createTHead().insertRow();
            for (const heading of ["Field", "Total", "Selected"])
              cell(row, "th", heading);
          }
          const body = table.createTBody();
          for (const entry of data.rows) {
            const row = body.insertRow();
            cell(row, "th", entry.name).scope = "row";
            for (const value of entry.values) cell(row, "td", value);
          }
          tip.append(table);
          place();
        } catch (error) {
          if (ticket === serial) {
            status.textContent = error.message;
            place();
          }
        }
      },
      keyboard ? 0 : 160,
    );
  }
  const markOf = (el) =>
    el instanceof Element ? el.closest("[data-rich-tip]") : null;
  document.addEventListener("pointerover", (e) => {
    const mark = markOf(e.target);
    if (mark) show(mark, { x: e.clientX, y: e.clientY });
  });
  document.addEventListener("pointerout", (e) => {
    if (markOf(e.target) === anchor && markOf(e.relatedTarget) !== anchor) {
      if (focused && focused.isConnected) show(focused, null, true);
      else hide();
    }
  });
  document.addEventListener("focusin", (e) => {
    focused = markOf(e.target);
    if (focused) show(focused, null, true);
  });
  document.addEventListener("focusout", (e) => {
    if (markOf(e.target) === focused) {
      focused = null;
      hide();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  document.addEventListener(
    "scroll",
    (event) => {
      if (anchor && event.target instanceof Element && !event.target.contains(anchor)) return;
      if (anchor && focused === anchor && !pointer && anchor.isConnected) {
        const box = anchor.getBoundingClientRect(),
          clip =
            event.target instanceof Element
              ? event.target.getBoundingClientRect()
              : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
        if (
          box.right > Math.max(0, clip.left) &&
          box.left < Math.min(innerWidth, clip.right) &&
          box.bottom > Math.max(0, clip.top) &&
          box.top < Math.min(innerHeight, clip.bottom)
        ) {
          if (!tip.hidden) place();
          return;
        }
      }
      hide();
    },
    true,
  );
  window.addEventListener("resize", () => {
    if (!anchor?.isConnected || focused !== anchor) return hide();
    if (!tip.hidden) { fitPage(); place(); }
  });
  return () => {
    pages.clear();
    cachedChars = 0;
    hide();
  };
}
