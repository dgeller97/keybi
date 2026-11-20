const defaultColors = [
  "#43856b",
  "#d7863a",
  "#526da8",
  "#a4526a",
  "#8a8334",
  "#499ba5",
  "#805ba0",
];
function themeDialog(report, { dialog, esc, change }) {
  const active = report.theme || { name: "KeyBI", dataColors: defaultColors };
  let draft = { name: active.name, dataColors: [...active.dataColors] };
  const valid = (color) =>
    typeof color === "string" && /^#[a-f\d]{6}$/i.test(color);
  const colors = () =>
    draft.dataColors
      .map(
        (color, i) =>
          `<label>Series ${i + 1}<input type="color" value="${esc(color)}" data-series-index="${i}"></label>`,
      )
      .join("");
  dialog(
    "Report theme",
    `<label class="formlabel">Theme name<input class="control" id="theme-name" maxlength="120" value="${esc(draft.name)}"></label><div id="theme-colors">${colors()}</div><label class="formlabel">Import a JSON color palette<input type="file" accept=".json,application/json" id="theme-import"></label><small>Reads the theme name and dataColors array.</small><p><button class="outline" type="button" id="theme-export">Download palette</button></p>`,
    "Apply theme",
    () => {
      draft.name =
        document.querySelector("#theme-name").value.trim() || "Custom theme";
      report.theme = draft;
      change();
    },
  );
  const colorPane = document.querySelector("#theme-colors");
  colorPane.oninput = (e) => {
    if (e.target.dataset.seriesIndex !== undefined)
      draft.dataColors[Number(e.target.dataset.seriesIndex)] = e.target.value;
  };
  document.querySelector("#theme-import").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const theme = JSON.parse(await file.text());
      if (
        !Array.isArray(theme.dataColors) ||
        !theme.dataColors.length ||
        theme.dataColors.length > 64 ||
        !theme.dataColors.every(valid)
      )
        throw Error("Use a dataColors array with 1–64 six-digit hex colors.");
      draft = {
        name:
          typeof theme.name === "string"
            ? theme.name.slice(0, 120)
            : "Imported theme",
        dataColors: theme.dataColors,
      };
      document.querySelector("#theme-name").value = draft.name;
      colorPane.innerHTML = colors();
      document.querySelector("#dlgform .err").textContent = "";
    } catch (error) {
      document.querySelector("#dlgform .err").textContent = error.message;
    }
  };
  document.querySelector("#theme-export").onclick = () => {
    const link = document.createElement("a"),
      url = URL.createObjectURL(
        new Blob(
          [
            JSON.stringify(
              { ...draft, name: document.querySelector("#theme-name").value },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
      );
    link.href = url;
    link.download = "theme.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
export { themeDialog };
