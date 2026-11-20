import { axisScale } from "./axes.js";

const limitZoom = 1024;
const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const wrap = (lng) => ((((lng + 180) % 360) + 360) % 360) - 180;
const world = { lng: 0, lat: 0, zoom: 1 };

export function mapChart(
  v,
  { points, rows, ng, w, h, metrics, mark, tag, txt, format, valname, shown },
) {
  const locations = points.filter(
    (p) =>
      p.j === 0 &&
      Number.isFinite(p.value) &&
      Math.abs(p.value) <= 90 &&
      Number.isFinite(p.row[ng + 1]) &&
      Math.abs(p.row[ng + 1]) <= 180 &&
      (!v.size?.length || p.row[ng + 2] > 0),
  );
  if (!locations.length)
    return '<div class="vempty">Check latitude (−90 to 90), longitude (−180 to 180), and positive bubble sizes.</div>';
  const max = Math.max(1, ...locations.map((p) => p.row[ng + 2] || 0));
  const marks = locations
    .map((p) => {
      const size = p.row[ng + 2];
      const r = v.size?.length ? Math.sqrt(size / max) * 8 + 0.01 : 4;
      return mark(
        p,
        tag("circle", { r, fill: v.accent, stroke: "#fff", opacity: 0.86 }) +
          (v.labels ? txt(r + 2, 0, shown(p.cat)) : ""),
        metrics
          .map((m, j) => valname(m) + " " + format(m, p.row[ng + j]))
          .join(" · "),
        {
          "data-lat": p.value,
          "data-lng": p.row[ng + 1],
          "data-size": size ?? "",
        },
      );
    })
    .join("");
  const landId = "map-land-" + v.id;
  const land = tag(
    "g",
    { "data-land": "" },
    tag("image", { id: landId, width: 360, height: 180, href: "/land.svg" }) +
      [-360, 360].map((x) => tag("use", { href: "#" + landId, x })).join(""),
  );
  const plot = tag(
    "svg",
    {
      class: "analytic-plot",
      viewBox: `0 0 ${w} ${h}`,
      tabindex: 0,
      role: "group",
      "aria-label":
        "Map navigation. Arrow keys pan, plus and minus zoom, Home fits locations, and 0 restores the world view.",
    },
    tag(
      "svg",
      { "data-map-extent": "", overflow: "hidden" },
      land +
        (v.mapGrid === false
          ? ""
          : '<g class="map-grid" aria-hidden="true"></g>') +
        marks,
    ),
  );
  const controls = [
    ["out", "Zoom out", "−"],
    ["in", "Zoom in", "+"],
    ["fit", "Fit locations", "Fit"],
    ["focus", "Zoom to selected location", "Focus"],
    ["world", "Show world", "World"],
  ];
  const toolbar =
    '<div class="map-controls" role="group" aria-label="Map view">' +
    controls
      .map(([action, label, text]) =>
        tag(
          "button",
          {
            type: "button",
            "data-map-action": action,
            title: label,
            "aria-label": label,
          },
          text,
        ),
      )
      .join("") +
    '<output aria-label="Map zoom"></output></div>';
  return (
    tag(
      "folio-map",
      { "data-camera": JSON.stringify(v.mapView || world) },
      plot + toolbar,
    ) +
    (locations.length < rows.length
      ? "<small>Locations with invalid coordinates or sizes omitted.</small>"
      : "")
  );
}

// Put the seam in the largest gap so offices across the date line fit together.
function longitudeExtent(values) {
  const lngs = [...values].sort((a, b) => a - b);
  let gap = -1,
    start = 0;
  for (const [i, lng] of lngs.entries()) {
    const next = lngs[i + 1] ?? lngs[0] + 360;
    if (next - lng > gap) {
      gap = next - lng;
      start = next;
    }
  }
  const span = 360 - gap;
  return { center: wrap(start + span / 2), span };
}

class FolioMap extends HTMLElement {
  connectedCallback() {
    this.plot = this.querySelector(".analytic-plot");
    this.extent = this.querySelector("[data-map-extent]");
    this.marks = [...this.querySelectorAll("[data-lng]")];
    this.land = this.querySelector("[data-land]");
    this.grid = this.querySelector(".map-grid");
    this.controls = this.querySelector(".map-controls");
    const { width, height } = this.plot.viewBox.baseVal;
    this.w = width;
    this.h = height;
    this.unit = Math.min(width / 360, height / 180);
    this.output = this.querySelector("output");
    this.draw(JSON.parse(this.dataset.camera));
    this.controls.onclick = (e) => {
      const action = e.target.closest("button")?.dataset.mapAction;
      if (action) this.navigate(action);
    };
    this.plot.onkeydown = (e) => {
      const key = {
        "+": "in",
        "=": "in",
        "-": "out",
        Home: "fit",
        0: "world",
        ArrowLeft: "west",
        ArrowRight: "east",
        ArrowUp: "north",
        ArrowDown: "south",
      }[e.key];
      if (key && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.navigate(key);
      }
    };
    this.plot.onwheel = (e) => {
      if (!e.ctrlKey || !e.deltaY) return;
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.25 : 0.8, this.point(e));
    };
    this.plot.onpointerdown = (e) => {
      if (e.button !== 0 || !e.isPrimary) return;
      this.drag = {
        id: e.pointerId,
        start: this.point(e),
        mouseX: e.clientX,
        mouseY: e.clientY,
        view: this.view,
        moved: false,
      };
      e.target.setPointerCapture(e.pointerId);
    };
    this.plot.onpointermove = (e) => {
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) return;
      if (
        !drag.moved &&
        Math.hypot(e.clientX - drag.mouseX, e.clientY - drag.mouseY) < 4
      )
        return;
      drag.moved = true;
      const pt = this.point(e),
        u = this.unit * drag.view.zoom;
      this.draw({
        ...drag.view,
        lng: drag.view.lng + (drag.start.x - pt.x) / u,
        lat: drag.view.lat + (pt.y - drag.start.y) / u,
      });
    };
    this.plot.onpointerup = (e) => {
      const drag = this.drag;
      if (!drag || drag.id !== e.pointerId) return;
      this.drag = null;
      if (drag.moved) {
        this.swallowClick = true;
        setTimeout(() => (this.swallowClick = false), 0);
        this.commit(drag.view);
      }
    };
    this.plot.onpointercancel = () => {
      if (this.drag) this.draw(this.drag.view);
      this.drag = null;
    };
    this.plot.onclick = (e) => {
      if (this.swallowClick) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
  }

  point(e) {
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(
      this.plot.getScreenCTM().inverse(),
    );
  }

  draw(camera) {
    const zoom = clamp(
      Number.isFinite(camera?.zoom) ? camera.zoom : 1,
      1,
      limitZoom,
    );
    const u = this.unit * zoom,
      width = Math.min(this.w, 360 * u),
      height = Math.min(this.h, 180 * u);
    const maxLat = 90 - height / (2 * u);
    const lng =
      zoom === 1 || !Number.isFinite(camera?.lng) ? 0 : wrap(camera.lng);
    const lat = clamp(
      Number.isFinite(camera?.lat) ? camera.lat : 0,
      -maxLat,
      maxLat,
    );
    this.view = { lng, lat, zoom };
    const x = (this.w - width) / 2,
      y = (this.h - height) / 2;
    for (const [k, v] of Object.entries({
      x,
      y,
      width,
      height,
      viewBox: [x, y, width, height].join(" "),
    }))
      this.extent.setAttribute(k, v);
    this.land.setAttribute(
      "transform",
      `translate(${this.w / 2 - (180 + lng) * u} ${this.h / 2 - (90 - lat) * u}) scale(${u})`,
    );
    if (this.grid) this.drawGrid(x, y, width, height, u);
    for (const mark of this.marks) {
      const delta = Number(mark.dataset.lng) - lng;
      const dx = (zoom === 1 ? delta : wrap(delta)) * u,
        dy = (lat - Number(mark.dataset.lat)) * u;
      const visible =
        Math.abs(dx) <= width / 2 + 1e-7 && Math.abs(dy) <= height / 2 + 1e-7;
      mark.style.display = visible ? "" : "none";
      mark.setAttribute(
        "transform",
        `translate(${this.w / 2 + dx} ${this.h / 2 + dy})`,
      );
    }
    this.output.value = Number(zoom.toFixed(2)) + "×";
    this.controls.querySelector('[data-map-action="out"]').disabled =
      zoom === 1;
    this.controls.querySelector('[data-map-action="in"]').disabled =
      zoom === limitZoom;
    this.controls.querySelector('[data-map-action="focus"]').disabled =
      !this.selected();
  }

  selected() {
    return this.marks.find((m) => m.getAttribute("aria-pressed") === "true");
  }

  drawGrid(x, y, width, height, u) {
    const { lng, lat, zoom } = this.view;
    let grid = "";
    if (zoom > 1) {
      for (const vertical of [true, false]) {
        const center = vertical ? lng : lat;
        const span = (vertical ? width : height) / u;
        const { ticks } = axisScale(
          [center - span / 2, center + span / 2],
          {},
          vertical ? 5 : 4,
        );
        for (const tick of ticks) {
          const dx = vertical ? this.w / 2 + (tick - lng) * u : x;
          const dy = vertical ? y : this.h / 2 + (lat - tick) * u;
          if (dx < x || dy < y || dx > x + width - 40 || dy > y + height - 12)
            continue;
          const value = Number((vertical ? wrap(tick) : tick).toFixed(4));
          const direction =
            !value || Math.abs(value) === 180
              ? ""
              : vertical
                ? value < 0
                  ? "W"
                  : "E"
                : value < 0
                  ? "S"
                  : "N";
          grid += `<line x1="${dx}" y1="${dy}" x2="${vertical ? dx : x + width}" y2="${vertical ? y + height : dy}"/><text x="${dx + 4}" y="${dy + (vertical ? 12 : -3)}">${Math.abs(value)}°${direction}</text>`;
        }
      }
    }
    this.grid.innerHTML = grid;
  }

  commit(before) {
    const v = this.view;
    if (before.zoom === v.zoom && before.lat === v.lat && before.lng === v.lng)
      return;
    this.dispatchEvent(
      new CustomEvent("folio-map-view", { bubbles: true, detail: { ...v } }),
    );
  }

  zoom(factor, pt = { x: this.w / 2, y: this.h / 2 }) {
    const prev = this.view,
      zoom = clamp(prev.zoom * factor, 1, limitZoom);
    const shift = (1 / prev.zoom - 1 / zoom) / this.unit;
    this.draw({
      zoom,
      lng: prev.lng + (pt.x - this.w / 2) * shift,
      lat: prev.lat - (pt.y - this.h / 2) * shift,
    });
    this.commit(prev);
  }

  navigate(action) {
    if (action === "in" || action === "out")
      return this.zoom(action === "in" ? 2 : 0.5);
    const prev = this.view,
      u = this.unit * prev.zoom;
    if (action === "world") this.draw(world);
    else if (action === "fit") {
      const { span, center } = longitudeExtent(
        this.marks.map((m) => Number(m.dataset.lng)),
      );
      const lats = this.marks.map((m) => Number(m.dataset.lat)),
        north = Math.max(...lats),
        south = Math.min(...lats);
      const fit = Math.min(
        (this.w * 0.8) / (this.unit * (span || 1e-6)),
        (this.h * 0.8) / (this.unit * (north - south || 1e-6)),
      );
      this.draw({
        lng: center,
        lat: (north + south) / 2,
        zoom: this.marks.length === 1 ? 16 : fit,
      });
    } else if (action === "focus") {
      const mark = this.selected();
      if (mark)
        this.draw({
          lng: Number(mark.dataset.lng),
          lat: Number(mark.dataset.lat),
          zoom: Math.max(8, prev.zoom),
        });
    } else {
      const dx = { west: -1, east: 1 }[action] || 0,
        dy = { north: 1, south: -1 }[action] || 0;
      this.draw({
        ...prev,
        lng: prev.lng + (dx * this.w) / (4 * u),
        lat: prev.lat + (dy * this.h) / (4 * u),
      });
    }
    this.commit(prev);
  }
}
customElements.define("folio-map", FolioMap);
