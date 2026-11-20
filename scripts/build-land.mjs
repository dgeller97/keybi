// Embed Natural Earth's public-domain 1:110m land polygons as an offline basemap.
import { writeFile } from "node:fs/promises";
const url =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";
const response = await fetch(url);
if (!response.ok)
  throw Error("Natural Earth download failed: " + response.status);
const land = await response.json();
function simplify(points, tolerance) {
  const [x1, y1] = points[0],
    [x2, y2] = points.at(-1),
    dx = x2 - x1,
    dy = y2 - y1;
  let max = tolerance * tolerance,
    split = 0;
  points.slice(1, -1).forEach(([x, y], i) => {
    const t = Math.max(
      0,
      Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy || 1)),
    );
    const d = (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2;
    if (d > max) {
      split = i + 1;
      max = d;
    }
  });
  return split
    ? [
        ...simplify(points.slice(0, split + 1), tolerance).slice(0, -1),
        ...simplify(points.slice(split), tolerance),
      ]
    : [points[0], points.at(-1)];
}
let d = "";
for (const { geometry } of land.features) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons)
    for (const ring of polygon) {
      const pts = simplify(ring, 0.55);
      if (pts.length > 3)
        d +=
          "M" +
          pts
            .map(
              ([lng, lat]) =>
                (180 + lng).toFixed(1) + " " + (90 - lat).toFixed(1),
            )
            .join("L") +
          "Z";
    }
}
await writeFile(
  "web/land.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 180"><title>Natural Earth land, 1:110m</title><rect width="360" height="180" fill="#e8f2f4"/><path fill="#cbd9ce" fill-rule="evenodd" d="' +
    d +
    '"/></svg>',
);
