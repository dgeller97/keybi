import {drawShape} from "./report-shapes.js";
import {drawReportImage} from "./report-images.js";

function drawPlot(c, svg, w, h) {
  const box = svg.viewBox.baseVal;
  const scale = Math.min((w - 24) / box.width, (h - 48) / box.height);
  c.save();
  c.translate((w - box.width * scale) / 2, 36);
  c.scale(scale, scale);
  for (const el of svg.querySelectorAll(
    "rect,circle,line,polyline,polygon,path,text",
  )) {
    if (el.closest("defs")) continue;
    const get = (k) => el.getAttribute(k),
      n = (k) => Number(get(k));
    c.save();
    const clip = el.closest("[data-plot-clip]");
    if (clip) {
      c.beginPath();
      c.rect(...clip.dataset.plotClip.split(",").map(Number));
      c.clip();
    }
    c.globalAlpha = get("opacity") ? n("opacity") : 1;
    for (
      let node = el.parentElement;
      node && node !== svg;
      node = node.parentElement
    )
      if (node.hasAttribute("opacity"))
        c.globalAlpha *= Number(node.getAttribute("opacity"));
    c.fillStyle = get("fill") || "#30443a";
    c.strokeStyle = get("stroke") || "#30443a";
    c.lineWidth = n("stroke-width") || 1;
    let path = new Path2D();
    switch (el.localName) {
      case "path":
        path = new Path2D(get("d"));
        break;
      case "rect":
        path.rect(n("x"), n("y"), n("width"), n("height"));
        break;
      case "circle":
        path.arc(n("cx"), n("cy"), n("r"), 0, Math.PI * 2);
        break;
      case "line":
        path.moveTo(n("x1"), n("y1"));
        path.lineTo(n("x2"), n("y2"));
        break;
      case "polygon":
      case "polyline": {
        const pts = Array.from(el.points);
        pts.forEach(({ x, y }, i) =>
          i ? path.lineTo(x, y) : path.moveTo(x, y),
        );
        if (el.localName === "polygon") path.closePath();
        break;
      }
      case "text":
        c.font = (get("font-size") || 11) + "px Segoe UI";
        c.textAlign =
          { end: "right", middle: "center" }[get("text-anchor")] || "left";
        c.fillText(el.textContent, n("x"), n("y"));
        break;
    }
    if (get("fill") && get("fill") !== "none") c.fill(path);
    if (get("stroke") && get("stroke") !== "none") c.stroke(path);
    c.restore();
  }
  c.restore();
}
export function thumbnail(page, results, title, format, accentOf) {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 350;
  const c = canvas.getContext("2d"),
    s = Math.min(
      0.6,
      350 / Math.max(610, ...page.visuals.map((v) => v.y + v.h + 12)),
    );
  c.fillStyle = "#eef2ed";
  c.fillRect(0, 0, 600, 350);
  c.scale(s, s);
  for (const v of page.visuals) {
    if (v.kind==="image") {
      drawReportImage(c,v,document.querySelector('[data-id="'+CSS.escape(v.id)+'"] .report-image'));
      continue;
    }
    if (v.kind==="shape") {drawShape(c,v);continue;}
    c.save();
    c.beginPath();
    c.rect(v.x, v.y, v.w, v.h);
    c.clip();
    c.translate(v.x, v.y);
    c.fillStyle = "white";
    c.fillRect(0, 0, v.w, v.h);
    c.strokeStyle = "#cad7cc";
    c.strokeRect(0, 0, v.w, v.h);
    c.fillStyle = "#30443a";
    c.font = "600 18px Segoe UI";
    c.fillText(title(v), 13, 28, v.w - 26);
    const rows = results.get(v.id)?.rows || [];
    const plot = document.querySelector(
      `[data-id="${CSS.escape(v.id)}"] .analytic-plot`,
    );
    if (v.kind==="narrative") {
      const body=document.querySelector('[data-id="'+CSS.escape(v.id)+'"] .narrative-text');
      if (body) {
        const size=parseFloat(body.style.fontSize)||20;
        c.font=size+"px Segoe UI";c.fillStyle=body.style.color;
        let y=38+size;
        for(const paragraph of body.innerText.split("\n")) {
          let line="";
          for(const word of paragraph.split(/\s+/)) {
            const candidate=line?line+" "+word:word;
            if(line && c.measureText(candidate).width>v.w-30){c.fillText(line,15,y);y+=size*1.45;line=word;}
            else line=candidate;
          }
          c.fillText(line,15,y);y+=size*1.45;
        }
      }
    } else if (plot?.closest(".multiple-grid")) {
      const article=plot.closest(".visual"),bounds=article.getBoundingClientRect();
      const ratio=v.w/bounds.width;
      for(const tile of article.querySelectorAll(".multiple-panel")) {
        const box=tile.getBoundingClientRect(),svg=tile.querySelector("svg");
        const x=(box.left-bounds.left)*ratio,y=(box.top-bounds.top)*ratio;
        if(y>v.h || !svg)continue;
        c.save();c.translate(x,y);c.strokeStyle="#d6e0d8";c.strokeRect(0,0,box.width*ratio,box.height*ratio);
        c.font="600 13px Segoe UI";c.fillStyle="#30443a";c.fillText(tile.getAttribute("aria-label"),6,17,box.width*ratio-12);
        drawPlot(c,svg,box.width*ratio,box.height*ratio);c.restore();
      }
    } else if (plot) drawPlot(c, plot, v.w, v.h);
    else if (v.kind === "card") {
      c.font = "52px Georgia";
      c.fillStyle = accentOf(v);
      c.fillText(format(v, rows[0]?.[0]), 15, v.h * 0.66, v.w - 30);
    } else if (v.kind === "bar") {
      const max = Math.max(1, ...rows.map((r) => Math.abs(r[1] || 0)));
      rows.slice(0, 6).forEach((r, i) => {
        c.font = "15px Segoe UI";
        c.fillStyle = "#46594e";
        c.fillText(String(r[0]), 12, 58 + i * 32, v.w * 0.24);
        c.fillStyle = accentOf(v);
        c.fillRect(
          v.w * 0.29,
          45 + i * 32,
          (v.w * 0.61 * Math.abs(r[1] || 0)) / max,
          17,
        );
      });
    } else {
      c.font = "16px Segoe UI";
      rows.slice(0, 7).forEach((r, i) => {
        c.fillStyle = i % 2 ? "#f0f4ef" : "#fafbf9";
        c.fillRect(10, 40 + i * 24, v.w - 20, 23);
        c.fillStyle = "#42554a";
        c.fillText(
          r
            .map((x) => (typeof x === "number" ? Number(x.toFixed(2)) : x))
            .join("     "),
          16,
          57 + i * 24,
          v.w - 32,
        );
      });
    }
    c.restore();
  }
  return canvas.toDataURL("image/png");
}
