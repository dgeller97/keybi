export function summarizeRows(result, groups, metrics, headings, metricName) {
  const header = [...headings];
  if (result.highlight) header.push(...metrics.map(m => "Selected · "+metricName(m)));
  const rows = result.rows.map(row => {
    const values = row.slice(0,headings.length);
    if (result.highlight) {
      const overlay = result.highlight.get(JSON.stringify(row.slice(0,groups.length)));
      values.push(...(overlay || metrics.map(() => null)));
    }
    return values;
  });
  return {header,rows};
}

export function downloadChartRows(title,header,rows) {
  const encode = value => '"' + String(value ?? "").replaceAll('"','""') + '"';
  const csv = [header,...rows].map(row=>row.map(encode).join(",")).join("\r\n") + "\r\n";
  const url = URL.createObjectURL(new Blob(["\uFEFF",csv],{type:"text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = title.replace(/[^\w -]/g,"_")+".csv";
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function showChartTable({source,title,header,rows,groups,metrics,format,dialog,esc,more}) {
  const chart = source.querySelector(".vbody").cloneNode(true);
  chart.className = "data-chart-preview";
  chart.inert = true;
  chart.setAttribute("aria-hidden","true");
  chart.style.setProperty("--accent",source.style.getPropertyValue("--accent"));
  // Custom axes clip their SVG marks. Give the preview its own clip paths.
  for (const clip of chart.querySelectorAll("clipPath[id]")) {
    const previous = clip.id;
    clip.id = "summary-"+previous;
    for (const el of chart.querySelectorAll("[clip-path]"))
      if (el.getAttribute("clip-path") === "url(#"+previous+")") el.setAttribute("clip-path","url(#"+clip.id+")");
  }
  const head = header.map((label,i)=>`<th scope="col"${i>=groups.length ? ' class="summary-number"' : ""}><button type="button" class="sort-header" data-summary-sort="${i}" title="Sort by ${esc(label)}. Select three times to restore chart order.">${esc(label)}</button></th>`).join("");
  const data = rows.map(row=>"<tr>"+row.map((value,i)=>{
    const number = i >= groups.length;
    const text = number ? format(metrics[(i-groups.length)%metrics.length],value) : String(value ?? "(Blank)");
    return `<td${number ? ' class="summary-number"' : ""}>${esc(text)}</td>`;
  }).join("")+"</tr>").join("");
  const count = rows.length+" "+(rows.length===1?"row":"rows")+(more?" shown":"");
  dialog(title,`<div class="summary-tools"><span>${count}</span><button type="button" class="outline" data-summary-side aria-pressed="false">Side by side</button><button type="button" class="outline" data-summary-download>Download chart data</button></div>
    <div class="chart-summary"><div class="summary-scroll" tabindex="0" role="region" aria-label="Chart values"><table aria-label="${esc(title)}"><thead><tr>${head}</tr></thead><tbody>${data}</tbody></table>${rows.length ? "" : "<p>No matching rows</p>"}</div></div>`);
  const panel = document.querySelector("#dialog"), layout = panel.querySelector(".chart-summary");
  layout.prepend(chart);
  const side = panel.querySelector("[data-summary-side]");
  side.onclick = () => side.setAttribute("aria-pressed",String(layout.classList.toggle("beside")));
  const table = layout.querySelector("table"), body = table.tBodies[0], elements = [...body.rows];
  const original = rows.map((_,i)=>i), collator = new Intl.Collator(undefined,{numeric:true});
  let order = original;
  table.tHead.onclick = event => {
    const button = event.target.closest("[data-summary-sort]");
    if (!button) return;
    const column = Number(button.dataset.summarySort), cell = button.parentElement;
    const previous = cell.getAttribute("aria-sort"), first = column<groups.length ? "ascending" : "descending";
    const direction = !previous ? first : previous===first ? (first==="ascending" ? "descending" : "ascending") : null;
    for (const th of table.tHead.querySelectorAll("[aria-sort]")) {
      th.removeAttribute("aria-sort");
      delete th.dataset.sortDirection;
    }
    order = original;
    if (direction) {
      cell.setAttribute("aria-sort",direction);
      cell.dataset.sortDirection = direction;
      order = original.toSorted((a,b) => {
        const left=rows[a][column], right=rows[b][column];
        if (left==null || right==null) return Number(left==null)-Number(right==null);
        const result = typeof left==="number" && typeof right==="number" ? left-right : collator.compare(String(left),String(right));
        return direction==="ascending" ? result : -result;
      });
    }
    body.replaceChildren(...order.map(index=>elements[index]));
  };
  panel.querySelector("[data-summary-download]").onclick = () => downloadChartRows(title,header,order.map(index=>rows[index]));
  panel.addEventListener("close",()=>layout.remove(),{once:true});
}
