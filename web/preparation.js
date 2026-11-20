async function filePreview(file, format = "csv") {
  const response = await fetch("/api/" + format + "-preview", {
    method: "POST",
    body: file,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
function previewRows(selector, { rows, numericRows }, steps, reshape, esc) {
  const keys = steps.filter((s) => !reshape || !s.unpivot),
    attributes = reshape ? steps.filter((s) => s.unpivot) : [];
  const names = [
    ...keys.map((s) => s.name),
    ...(reshape ? [reshape.attribute, reshape.value] : []),
  ];
  const values = [];
  function cell(index, c) {
    const row = rows[index];
    let text = row[c.index] ?? "";
    if (c.trim) text = text.trim();
    const numeric = numericRows[index][c.index];
    if (c.kind === "number" && numeric != null) return String(numeric);
    return text;
  }
  for (const row of rows.keys()) {
    const key = keys.map((c) => cell(row, c));
    if (!reshape) values.push(key);
    else
      for (const c of attributes) {
        const value = cell(row, c);
        if (value !== "") values.push([...key, c.name.trim(), value]);
        if (values.length >= 8) break;
      }
    if (values.length >= 8) break;
  }
  document.querySelector(selector).innerHTML =
    "<thead><tr>" +
    names.map((n) => "<th>" + esc(n) + "</th>").join("") +
    "</tr></thead><tbody>" +
    values
      .map(
        (row) =>
          "<tr>" + row.map((v) => "<td>" + esc(v) + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</tbody>";
}
async function prepareCsv(file, { dialog, esc, importFiles }) {
  const data = await filePreview(file);
  const headers = data.headers;
  if (!headers.length) throw Error("CSV has no columns.");
  const columns = headers.map((name, index) => ({
    index,
    name,
    trim: false,
    kind: "auto",
    keep: true,
  }));
  const reshape = () =>
    columns.some((c) => c.keep && c.unpivot)
      ? {
          attribute: document.querySelector("#unpivot-attribute").value.trim(),
          value: document.querySelector("#unpivot-value").value.trim(),
        }
      : null;
  function preview() {
    const kept = columns.filter((c) => c.keep);
    const step = reshape();
    document.querySelector("#unpivot-names").hidden = !step;
    previewRows("#csv-preview", data, kept, step, esc);
  }
  const controls = columns
    .map(
      (c, i) =>
        `<tr data-column="${i}"><td><input type="checkbox" data-setting="keep" aria-label="Keep ${esc(c.name)}" checked></td><td>${esc(c.name)}</td><td><input type="text" data-setting="name" aria-label="Output name for ${esc(c.name)}" value="${esc(c.name)}"></td><td><select data-setting="kind" aria-label="Type for ${esc(c.name)}"><option value="auto">Detect</option><option value="text">Text</option><option value="number">Number</option></select></td><td><input type="checkbox" data-setting="trim" aria-label="Trim ${esc(c.name)}"></td><td><input type="checkbox" data-setting="unpivot" aria-label="Unpivot ${esc(c.name)}"></td></tr>`,
    )
    .join("");
  dialog(
    "Transform CSV",
    `<p>${esc(file.name)}</p><div class="prepare-scroll"><table class="grid" id="column-settings"><thead><tr><th>Keep</th><th>Source column</th><th>Output name</th><th>Type</th><th>Trim spaces</th><th>Unpivot</th></tr></thead><tbody>${controls}</tbody></table></div><div id="unpivot-names" hidden><label class="formlabel">Attribute column<input class="control" id="unpivot-attribute" value="Attribute"></label><label class="formlabel">Value column<input class="control" id="unpivot-value" value="Value"></label></div><h3>Preview · up to 8 transformed rows</h3><div class="prepare-scroll"><table class="grid" id="csv-preview"></table></div>`,
    "Load table",
    async () => {
      const plan = columns
        .filter((c) => c.keep)
        .map(({ index, name, trim, kind, unpivot }) => ({
          index,
          name: name.trim(),
          sourceName: headers[index],
          trim,
          kind,
          ...(unpivot ? { unpivot: true } : {}),
        }));
      if (!plan.length) throw Error("Keep at least one column.");
      if (
        plan.some((c) => !c.name) ||
        new Set(plan.map((c) => c.name.toLowerCase())).size !== plan.length
      )
        throw Error("Output names must be distinct and nonempty.");
      const step = reshape();
      if (step) {
        const names = [
          ...plan.filter((c) => !c.unpivot).map((c) => c.name),
          step.attribute,
          step.value,
        ];
        if (
          names.some((n) => !n) ||
          new Set(names.map((n) => n.toLowerCase())).size !== names.length
        )
          throw Error(
            "Give the attribute and value columns distinct output names.",
          );
      }
      await importFiles([file], plan, step);
    },
  );
  document.querySelector("#column-settings").addEventListener("input", (e) => {
    const el = e.target,
      row = el.closest("[data-column]");
    if (!row || !el.dataset.setting) return;
    columns[Number(row.dataset.column)][el.dataset.setting] =
      el.type === "checkbox" ? el.checked : el.value;
    preview();
  });
  document.querySelector("#unpivot-names").addEventListener("input", preview);
  preview();
}
async function updateFileDialog(file, table, { dialog, esc, commit }) {
  const parquet = /\.parquet$/i.test(file.name);
  const data = await filePreview(file, parquet ? "parquet" : "csv");
  const modeControl = `<label class="formlabel">Load mode<select class="control" name="mode"><option value="append">Append rows</option><option value="replace">Replace all rows</option></select></label>`;
  if (parquet) {
    const header = data.columns
      .map((c) => `<th>${esc(c.name)}<small>${esc(c.type)}</small></th>`)
      .join("");
    const rows = data.rows
      .map(
        (row) =>
          "<tr>" +
          row.map((v) => `<td>${esc(v ?? "(Blank)")}</td>`).join("") +
          "</tr>",
      )
      .join("");
    dialog(
      "Update " + table.name,
      `<p>${esc(file.name)} · ${data.count.toLocaleString()} incoming rows · ${table.rows.toLocaleString()} currently loaded</p>${modeControl}<p>Fields are matched by name. Existing report bindings keep their model order.</p><div class="prepare-scroll"><table class="grid" id="update-preview"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div>`,
      "Apply update",
      (fd) => commit(null, fd.get("mode")),
    );
    return;
  }
  const { headers } = data;
  const reshape = table.preparation?.unpivot;
  const steps = reshape
    ? table.preparation.columns.map((saved) => {
        const model = table.columns.find(
          (c) => c.name === (saved.unpivot ? reshape.value : saved.name),
        );
        return {
          ...saved,
          index: headers.indexOf(saved.sourceName || saved.name),
          kind:
            saved.kind === "auto"
              ? model.numeric
                ? "number"
                : "text"
              : saved.kind,
        };
      })
    : table.columns.map((column, i) => {
        const saved = table.preparation?.columns?.[i],
          source = saved?.sourceName || column.name;
        return {
          name: column.name,
          kind: column.numeric ? "number" : "text",
          trim: saved?.trim || false,
          index: headers.indexOf(source),
        };
      });
  const mappings = steps
    .map(
      (s, i) =>
        `<tr><td>${esc(s.name)}</td><td>${s.kind}${s.trim ? " · trim" : ""}</td><td><select name="column${i}" required aria-label="Source for ${esc(s.name)}"><option value="">Choose a column</option>${headers.map((h, j) => `<option value="${j}" ${s.index === j ? "selected" : ""}>${esc(h)}</option>`).join("")}</select></td></tr>`,
    )
    .join("");
  dialog(
    "Update " + table.name,
    `<p>${esc(file.name)} · ${table.rows.toLocaleString()} rows currently loaded</p>${modeControl}<div class="prepare-scroll"><table class="grid" id="update-mapping"><thead><tr><th>Model column</th><th>Applied steps</th><th>CSV column</th></tr></thead><tbody>${mappings}</tbody></table></div><h3>Incoming rows · preview</h3><div class="prepare-scroll"><table class="grid" id="update-preview"></table></div>`,
    "Apply update",
    async (fd) => {
      const plan = steps.map((s, i) => {
        const index = Number(fd.get("column" + i));
        return { ...s, index, sourceName: headers[index] };
      });
      if (new Set(plan.map((c) => c.index)).size !== plan.length)
        throw Error("Map each model column to a separate CSV column.");
      await commit(plan, fd.get("mode"));
    },
  );
  function preview() {
    const values = Array.from(
      document.querySelectorAll("#update-mapping select"),
      (el) => (el.value === "" ? -1 : Number(el.value)),
    );
    previewRows(
      "#update-preview",
      data,
      steps.map((s, i) => ({ ...s, index: values[i] })),
      reshape,
      esc,
    );
  }
  document.querySelector("#update-mapping").addEventListener("change", preview);
  preview();
}
export { prepareCsv, updateFileDialog };
