import { metricKey } from "./cell-format.js";
import { samePoint } from "./visual-types.js";

const layoutOf = v => ["outline","tabular"].includes(v.matrixLayout) ? v.matrixLayout : "compact";
const parentsFirst = v => (v.rowSubtotalPosition ?? (layoutOf(v) === "outline" ? "top" : "bottom")) === "top";
const repeatLabels = v => v.repeatRowLabels ?? (layoutOf(v) === "tabular");
const validWidth = n => Number.isInteger(n) && n >= 32 && n <= 2000;

// Observe the actual column widths in table coordinates, including at canvas zoom.
// One set of offsets serves the headings and every row of the matrix.
customElements.define("folio-matrix", class extends HTMLElement {
  connectedCallback() {
    this.columns = [...this.querySelectorAll("th[data-column-key]")];
    this.containerObserver = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (width !== this.containerWidth) {
        this.containerWidth = width;
        this.sizeColumns(true);
      }
    });
    this.sizeColumns();
    const headings = [...this.querySelectorAll("th[data-row-level]")];
    if (headings.length < 2) return;
    const widths = new Map();
    this.observer = new ResizeObserver(entries => {
      for (const entry of entries) widths.set(entry.target, entry.borderBoxSize[0].inlineSize);
      let left = 0;
      for (const [i, heading] of headings.entries()) {
        if (i) this.style.setProperty("--matrix-left-" + i, left + "px");
        left += widths.get(heading) ?? heading.offsetWidth;
      }
    });
    for (const heading of headings) this.observer.observe(heading, {box:"border-box"});
  }
  // Measure unmodified columns with the browser's normal table layout. Apply
  // overrides to that geometry so widening a pivot leaf cannot shrink its siblings.
  sizeColumns(remeasure = false) {
    const table = this.querySelector("table");
    if (!table || !this.columns) return;
    const configured = this.columns.some(th => validWidth(Number(th.dataset.columnWidth)));
    if (!configured && !this.colgroup) return;
    const body = this.parentElement, left = body.scrollLeft, top = body.scrollTop;
    if (this.colgroup && (remeasure || !configured)) {
      this.colgroup.remove();
      this.colgroup = null;
      table.style.removeProperty("width");
      table.style.removeProperty("table-layout");
    }
    if (configured) {
      if (!this.colgroup) {
        this.naturalWidths = this.columns.map(th => parseFloat(getComputedStyle(th).width));
        const style = getComputedStyle(body);
        this.containerWidth = Math.round(body.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
        this.colgroup = document.createElement("colgroup");
        this.colgroup.append(...this.columns.map(() => document.createElement("col")));
        table.prepend(this.colgroup);
        table.style.tableLayout = "fixed";
        this.containerObserver.observe(body);
      }
      let total = 0;
      this.columns.forEach((th,i) => {
        const override = Number(th.dataset.columnWidth);
        const width = validWidth(override) ? override : this.naturalWidths[i];
        this.colgroup.children[i].style.width = width + "px";
        total += width;
      });
      table.style.width = total + "px";
    } else this.containerObserver.disconnect();
    body.scrollTo(left,top);
  }
  disconnectedCallback() {
    this.observer?.disconnect();
    this.containerObserver?.disconnect();
  }
});

export function matrixLayoutControls(v) {
  const layout = layoutOf(v);
  const options = ["Compact","Outline","Tabular"].map(name => {
    const value = name.toLowerCase();
    return `<option value="${value}" ${value === layout ? "selected" : ""}>${name}</option>`;
  });
  return `<label class="formlabel">Matrix layout<select class="control" aria-label="Matrix layout" data-opt="matrixLayout">${options.join("")}</select></label>` +
    `<label class="chart-option"><input type="checkbox" data-opt="freezeRowHeaders" ${v.freezeRowHeaders !== false ? "checked" : ""}>Freeze row headers</label>` +
    `<label class="chart-option"><input type="checkbox" data-opt="wrapRowHeaders" ${v.wrapRowHeaders !== false ? "checked" : ""}>Wrap row headers</label>` +
    (layout === "compact" ? "" : `<label class="chart-option"><input type="checkbox" data-opt="repeatRowLabels" ${repeatLabels(v) ? "checked" : ""}>Repeat parent labels</label>`) +
    `<label class="formlabel">Row subtotal position<select class="control" data-opt="rowSubtotalPosition"><option value="bottom">Bottom</option><option value="top" ${parentsFirst(v) ? "selected" : ""}>Top</option></select></label>`;
}

function matrixQueries(v, base) {
  const parts = [];
  for (let depth = 0; depth <= v.groups.length; depth++)
    for (
      let columnDepth = 0;
      columnDepth <= (v.columns?.length || 0);
      columnDepth++
    ) {
      const groups = [
        ...v.groups.slice(0, depth),
        ...(v.columns || []).slice(0, columnDepth),
      ];
      parts.push({
        depth,
        columnDepth,
        query: {
          ...base,
          groups,
          limit: 500,
          offset: 0,
          showEmpty:
            (!columnDepth && depth > 0 && base.showEmpty) ||
            (!depth && columnDepth > 0 && v.showEmptyColumns) ||
            undefined,
        },
      });
    }
  return parts;
}
function matrixBody(v, res, { esc, caption, format, pageTip, editable, renderCell, renderSpark, rowLabel, colLabel }) {
  const rowFields = v.groups,
    colFields = v.columns || [],
    key = JSON.stringify;
  const rowTree = new Map(),
    colTree = new Map(),
    cells = new Map();
  function addBranch(tree, path) {
    if (!path.length) return;
    const parent = key(path.slice(0, -1));
    if (!tree.has(parent)) tree.set(parent, []);
    tree.get(parent).push(path);
  }
  for (const { depth, columnDepth, rows } of res.parts) {
    for (const row of rows) {
      const path = row.slice(0, depth),
        columns = row.slice(depth, depth + columnDepth);
      cells.set(key([path, columns]), row.slice(depth + columnDepth));
      if (!columnDepth) addBranch(rowTree, path);
      if (!depth) addBranch(colTree, columns);
    }
  }
  const collapsed = (axis, path) => v.collapsed?.[axis]?.includes(key(path));
  const toggle = (axis, path) => {
    const isClosed = collapsed(axis, path),
      name = (axis === "columns" ? colLabel : rowLabel)(path.at(-1),path.length-1);
    return `<button class="branch-toggle" data-matrix-axis="${axis}" data-branch="${esc(key(path))}" aria-expanded="${!isClosed}" aria-label="${isClosed ? "Expand" : "Collapse"} ${esc(name)}"></button>`;
  };
  const columns = [];
  function collectColumns(path) {
    const children = colTree.get(key(path)) || [];
    if (path.length && !children.length) {
      columns.push({ path });
      return;
    }
    if (path.length && collapsed("columns", path)) {
      columns.push({ path, collapsed: true });
      return;
    }
    children.forEach(collectColumns);
    if (path.length && v.subtotals !== false)
      columns.push({ path, subtotal: true });
  }
  if (colFields.length) collectColumns([]);
  columns.push({ path: [] });
  const trends=v.sparklines||[],n=v.metrics.length+trends.length;
  const trendName=(s,path)=>[...(path.length?path.map(colLabel):colFields.length?["Total"]:[]),s.name].join(" / ");
  const occurrences = new Map();
  function uniqueBinding(id) {
    const k = key(id), ordinal = occurrences.get(k) || 0;
    occurrences.set(k,ordinal+1);
    return ordinal ? [...id,ordinal] : id;
  }
  const separate = layoutOf(v) !== "compact" && rowFields.length > 0;
  const repeat = repeatLabels(v), top = parentsFirst(v);
  const names = rowFields.map((_,i) => caption("groups",i).text);
  const fieldId = f => [f.t,f.c];
  function columnAttrs(id,name) {
    const k = key(uniqueBinding(id)), width = v.matrixWidths?.[k];
    return `data-column-key="${esc(k)}" data-column-label="${esc(name)}"${validWidth(width) ? ' data-column-width="'+width+'"' : ""}`;
  }
  const levelAttrs = i => `data-row-level="${i}" style="--matrix-left:var(--matrix-left-${i},0px)"`;
  const grip = editable ? '<span class="matrix-width-grip" aria-hidden="true" title="Drag to resize. Double-click for automatic width."></span>' : "";
  const headingText = name => `<span class="matrix-heading-text" title="${esc(name)}">${esc(name)}</span>${grip}`;
  const rowHeadings = (separate ? names : [names.join(" / ")]).map((name,i) => {
    const id = ["row",...(separate ? [rowFields[i]] : rowFields).map(fieldId)];
    return `<th scope="col" ${columnAttrs(id,name || "Row labels")} ${levelAttrs(i)} rowspan="${colFields.length+1}">${headingText(name)}</th>`;
  }).join("");
  const th = (body, count) => `<th colspan="${count}">${body}</th>`;
  let header = "<thead>";
  for (let depth = 0; depth < colFields.length; depth++) {
    header +=
      "<tr>" +
      (depth === 0 ? rowHeadings : "");
    for (let i = 0; i < columns.length; ) {
      const path = columns[i].path,
        part = path.slice(0, depth + 1);
      let end = i + 1;
      while (
        end < columns.length &&
        key(columns[end].path.slice(0, depth + 1)) === key(part)
      )
        end++;
      let content = "";
      if (path.length > depth) {
        if (part.length < colFields.length) content += toggle("columns", part);
        const heading = caption("columns", depth).custom;
        content += (heading ? esc(heading) + " · " : "") + esc(colLabel(part.at(-1),depth));
      } else if (!path.length && !depth) content = "Total";
      else if (path.length === depth && columns[i].subtotal)
        content = "Subtotal";
      header += th(content, (end - i) * n);
      i = end;
    }
    header += "</tr>";
  }
  header +=
    "<tr>" +
    (colFields.length ? "" : rowHeadings) +
    columns
      .map(({path}) =>
        v.metrics
          .map((m, i) => {
            const name = caption("metrics",i).text;
            const id = ["value",...path.map((value,j) => [fieldId(colFields[j]),value]),metricKey(m),m.member ?? null];
            const parts = path.map(colLabel);
            if (!path.length && colFields.length) parts.push("Total");
            return `<th scope="col" ${columnAttrs(id,[...parts,name].join(" / "))}>${headingText(name)}</th>`;
          })
          .join("") + trends.map(s=>{
            const name=trendName(s,path),id=["spark",s.id,...path.map((value,j)=>[fieldId(colFields[j]),value])];
            return `<th scope="col" ${columnAttrs(id,name)}>${headingText(s.name)}</th>`;
          }).join(""),
      )
      .join("") +
    "</tr></thead>";
  let previousPath = [];
  function renderRow(path) {
    const depth = path.length,
      isBranch = depth > 0 && depth < rowFields.length;
    const showNumbers =
      !isBranch || v.subtotals !== false || collapsed("rows", path);
    const title = depth ? esc(rowLabel(path.at(-1),depth-1)) : "Grand total";
    const heading =
      (isBranch ? toggle("rows", path) : "") +
      title +
      (isBranch && v.subtotals !== false ? " subtotal" : "");
    let html = `<tr data-path="${esc(key(path))}" class="${!depth ? "matrix-total" : isBranch ? "matrix-sub" : ""}">`;
    if (separate) {
      let shared = true;
      for (let i=0; i<rowFields.length; i++) {
        shared = shared && i < previousPath.length && path[i] === previousPath[i];
        const ownLevel = i === Math.max(0,depth-1);
        const ancestor = i < depth-1 && (repeat || !shared);
        html += `<td ${levelAttrs(i)}>${ownLevel ? heading : ancestor ? esc(rowLabel(path[i],i)) : ""}</td>`;
      }
      previousPath = path;
    } else {
      html += `<td data-row-level="0" style="padding-left:${8 + Math.max(0, depth - 1) * 16}px">${heading}</td>`;
    }
    for (const column of columns) {
      const filters = [
        ...path.map((value, i) => ({ field: rowFields[i], value })),
        ...column.path.map((value, i) => ({ field: colFields[i], value })),
      ];
      const vals = cells.get(key([path, column.path])),
        sel = samePoint(v.selection?.filters,filters);
      for (const [i, m] of v.metrics.entries()) {
        const raw = vals?.[i],
          formatted = esc(format(m, raw));
        const total =
          depth < rowFields.length ||
          column.path.length < colFields.length ||
          (!rowFields.length && !colFields.length);
        const {attributes,content:value} = renderCell(vals, 0, i, total, formatted);
        const tip = pageTip
          ? ` data-rich-tip data-tip-label="${esc([...path.map(rowLabel), ...column.path.map(colLabel)].join(" / ") || "Grand total")} · ${esc(caption("metrics", i).text)} ${formatted}"`
          : "";
        html +=
          `<td${showNumbers ? attributes : ""}>` +
          (showNumbers
            ? filters.length
              ? `<button class="matrix-cell"${tip} data-matrix-pick="${esc(key(filters))}" aria-pressed="${sel}">${value}</button>`
              : pageTip
                ? `<span${tip} data-tip-filters="[]" tabindex="0">${value}</span>`
                : value
            : "") +
          "</td>";
      }
      for(const s of trends)html+=showNumbers?renderSpark(s,path,column.path,trendName(s,column.path)):"<td></td>";
    }
    return html + "</tr>";
  }
  let body = "";
  function walk(path) {
    for (const child of rowTree.get(key(path)) || []) {
      if (top) body += renderRow(child);
      if (!collapsed("rows", child)) walk(child);
      if (!top) body += renderRow(child);
    }
  }
  walk([]);
  body += renderRow([]);
  return (
    `<folio-matrix${v.freezeRowHeaders !== false ? " frozen" : ""}${v.wrapRowHeaders === false ? " nowrap" : ""}><table class="grid matrix">${header}<tbody>${body}</tbody></table></folio-matrix>` +
    (res.parts.some((p) => p.more)
      ? '<p class="hint">Showing the first 500 groups per level. Totals include all matching rows.</p>'
      : "")
  );
}
export { matrixQueries, matrixBody };
