function previewTable(sheet,esc) {
  if (sheet.error) return "<p>"+esc(sheet.error)+"</p>";
  const headings=sheet.headers.map(h=>"<th>"+esc(h)+"</th>").join("");
  const rows=sheet.rows.map(row=>"<tr>"+row.map(v=>"<td>"+esc(v)+"</td>").join("")+"</tr>").join("");
  const location=sheet.kind==="table" ? " · "+esc(sheet.sheet) : "";
  return `<table class="grid"><caption>${esc(sheet.name)}${location} · first ${sheet.rows.length} data rows</caption><thead><tr>${headings}</tr></thead><tbody>${rows}</tbody></table>`;
}
const selectionOf=item=>item.kind==="table" ? {table:item.name,sheet:item.sheet} : item.name;
export async function chooseWorksheets(files,{api,dialog,esc,current,load}) {
  const workbooks=files.filter(file=>/\.xlsx$/i.test(file.name));
  dialog("Select workbook items","<p role='status'>Reading workbook…</p>");
  const loading=document.getElementById("dlgform");
  const catalogs=[];
  try {
    for (const file of workbooks) catalogs.push(await api("/api/workbook",file));
  } catch(error) {
    if (current() && loading.closest("dialog[open]")) {
      loading.querySelector("p").textContent="";loading.querySelector("[role=alert]").textContent=error.message;
    }
    return;
  }
  if (!current() || !loading.closest("dialog[open]")) return;
  const entries=[],ordinary=files.filter(file=>!workbooks.includes(file));
  const lists=catalogs.map((sheets,i)=>{
    function item(sheet) {
      const index=entries.push({file:workbooks[i],sheet})-1;
      const checked=sheets.length===1 && !sheet.error ? " checked" : "";
      const label=(sheet.kind==="table" ? "table " : "")+esc(sheet.name);
      return `<div class="workbook-item"><input type="checkbox" name="sheet" aria-label="Import ${label}" value="${index}"${sheet.error ? " disabled" : checked}><button type="button" data-preview-sheet="${index}" aria-label="Preview ${label}">${esc(sheet.name)}</button></div>`;
    }
    const items=[["Worksheets",sheets.filter(s=>s.kind!=="table")],["Excel tables",sheets.filter(s=>s.kind==="table")]]
      .filter(([,group])=>group.length).map(([label,group])=>"<h4>"+label+"</h4>"+group.map(item).join("")).join("");
    return `<fieldset><legend>${esc(workbooks[i].name)}</legend>${items || "<p>No visible worksheets.</p>"}</fieldset>`;
  }).join("");
  const also=ordinary.length ? "<p>Also importing "+ordinary.map(file=>esc(file.name)).join(", ")+"</p>" : "";
  dialog("Select workbook items",also+`<div class="workbook-browser"><div class="workbook-list">${lists}</div><div class="workbook-preview" aria-live="polite"></div></div>`,"Import",async fd=>{
    const chosen=fd.getAll("sheet").map(i=>entries[Number(i)]);
    if (!chosen.length && !ordinary.length) throw Error("Choose at least one worksheet or Excel table.");
    const selections=new Map();
    for (const {file,sheet} of chosen) {
      if (!selections.has(file)) selections.set(file,[]);
      selections.get(file).push(selectionOf(sheet));
    }
    await load(files.filter(file=>ordinary.includes(file) || selections.has(file)),selections);
  });
  const form=document.getElementById("dlgform"),output=form.querySelector(".workbook-preview");
  function show(index) {
    const {sheet}=entries[index];
    for (const b of form.querySelectorAll("[data-preview-sheet]"))
      b.setAttribute("aria-pressed",String(Number(b.dataset.previewSheet)===index));
    output.innerHTML=previewTable(sheet,esc);
  }
  form.addEventListener("click",e=>{
    const preview=e.target.closest("[data-preview-sheet]");
    if (preview) show(Number(preview.dataset.previewSheet));
    if (e.target.name==="sheet") show(Number(e.target.value));
  });
  if (entries.length) show(0);
}

export async function updateWorksheet(file,table,{api,dialog,esc,current,commit}) {
  const sheets=await api("/api/workbook",file);
  if (!current()) return;
  const options=sheets.map((s,i)=>`<option value="${i}"${s.error ? " disabled" : ""}>${s.kind==="table" ? "Table · " : ""}${esc(s.name)}</option>`).join("");
  if (!sheets.some(s=>!s.error)) throw Error("The workbook has no importable worksheets or tables.");
  dialog("Update "+table.name,`<p>${esc(file.name)} · ${table.rows.toLocaleString()} rows currently loaded</p>
    <label class="formlabel" for="update-sheet">Workbook item</label><select class="control" id="update-sheet" name="sheet">${options}</select>
    <label class="formlabel" for="update-mode">Load mode</label><select class="control" id="update-mode" name="mode"><option value="replace">Replace all rows</option><option value="append">Append rows</option></select>
    <div class="workbook-preview" aria-live="polite"></div>`,"Apply update",fd=>commit(selectionOf(sheets[Number(fd.get("sheet"))]),fd.get("mode")));
  const form=document.getElementById("dlgform"),select=form.elements.sheet;
  const preferred=sheets.findIndex(s=>!s.error && (table.workbook?.table ? s.kind==="table" && s.name===table.workbook.table :
    s.kind!=="table" && s.name===(table.workbook?.sheet || table.name)));
  if (preferred>=0) select.value=String(preferred);
  function show() {form.querySelector(".workbook-preview").innerHTML=previewTable(sheets[Number(select.value)],esc);}
  select.onchange=show;show();
}
