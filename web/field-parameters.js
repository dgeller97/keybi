export const findParameter = (report, id) => report.parameters?.find(p => p.id === id);
export const membersOf = p => Array.isArray(p.current) ? p.current : [p.current ?? p.default];
export const memberOf = p => membersOf(p)[0];

// Scalar wells use the first selection. Multi-value wells expand in reader order.
export function expandParameterWells(v, report, roles, decode) {
  if (!report.parameters?.some(p => p.multiple)) return v;
  let result = v;
  for (const role of roles(v)) {
    const idOf = binding => role.field ? binding.parameter : binding.measure;
    if (!role.multiple || !v[role.key]?.some(m => !m.member && findParameter(report,idOf(m))?.multiple)) continue;
    if (result === v) result = {...v};
    result[role.key] = v[role.key].flatMap((binding,index) => {
      const p = findParameter(report,idOf(binding));
      return p?.multiple ? membersOf(p).map(member => ({
        ...binding,...(role.field ? decode(member) : {}),member,sourceIndex:index
      })) : [{...binding,sourceIndex:index}];
    });
  }
  return result;
}

export function parameterControls(v, report, esc) {
  const parameters = report.parameters || [];
  const current = findParameter(report,v.parameter);
  const options = parameters.map(p => `<option value="${esc(p.id)}" ${p === current ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  return `<label class="formlabel">Field parameter<select class="control" data-parameter-binding><option value="">Choose a parameter</option>${options}</select></label>
    ${current ? `<button class="outline" data-edit-parameter="${esc(current.id)}">Edit parameter</button>` : ""}
    <button class="outline" data-action="new-parameter">New field parameter</button>`;
}
export function parameterBody(v, report, esc, dimensionChoices) {
  const p = findParameter(report,v.parameter);
  if (!p) return '<div class="vempty">Choose a field parameter in Build.</div>';
  const active = memberOf(p);
  const members = p.kind === "dimension" ? dimensionChoices(p) : p.members.map(id => report.measures.find(m => m.id === id)).filter(Boolean);
  if (p.multiple) {
    const selected = membersOf(p);
    if (p.kind === "dimension") {
      const order = [...selected,...p.members.filter(id => !selected.includes(id))];
      const names = new Map(members.map(m => [m.id,m.name]));
      return `<div class="parameter-options" role="group" aria-label="${esc(p.name)}">${order.map((id,i) => {
        const name = esc(names.get(id)), checked = i < selected.length;
        const move = (delta,label) => `<button type="button" class="field-move" data-parameter-move="${delta}" data-member="${esc(id)}" aria-label="Move ${name} ${label}" title="Move ${name} ${label}">${delta < 0 ? "↑" : "↓"}</button>`;
        return `<span class="parameter-level"><label><input type="checkbox" data-parameter-choice="${esc(p.id)}" value="${esc(id)}" ${checked ? "checked" : ""}>${name}</label>${checked && i > 0 ? move(-1,"earlier") : ""}${checked && i+1 < selected.length ? move(1,"later") : ""}</span>`;
      }).join("")}</div>`;
    }
    return `<div class="parameter-options" role="group" aria-label="${esc(p.name)}">${members.map(({id,name}) =>
      `<label><input type="checkbox" data-parameter-choice="${esc(p.id)}" value="${esc(id)}" ${selected.includes(id) ? "checked" : ""}>${esc(name)}</label>`).join("")}</div>`;
  }
  const choices = members.map(({id,name}) =>
    `<option value="${esc(id)}" ${id === active ? "selected" : ""}>${esc(name)}</option>`);
  return `<select class="control" aria-label="${esc(p.name)}" data-parameter-choice="${esc(p.id)}">${choices.join("")}</select>`;
}

export function parameterDialog(existing, {report, columns, dialog, esc, textInput, uid, commit}) {
  const measures = report.measures;
  const choices = {measure:measures, dimension:columns};
  const initial = existing?.kind || (existing || measures.length >= 2 ? "measure" : "dimension");
  const kindLabel = {measure:"Measures", dimension:"Columns"};
  const fieldsets = Object.entries(choices).map(([kind,items]) =>
    `<fieldset data-members="${kind}"><legend>${kindLabel[kind]}</legend>${items.map(m => `<label class="chart-option"><input type="checkbox" name="member" value="${esc(m.id)}" ${existing?.members.includes(m.id) ? "checked" : ""}>${esc(m.name)}</label>`).join("")}</fieldset>`).join("");
  dialog(existing ? "Edit field parameter" : "New field parameter",
    textInput("Parameter name","name",existing?.name || "") +
    `<label class="formlabel">Parameter type<select class="control" name="kind" ${existing ? "disabled" : ""}>${Object.keys(choices).map(k => `<option value="${k}" ${k === initial ? "selected" : ""}>${kindLabel[k]}</option>`).join("")}</select></label>${fieldsets}<label class="formlabel"><span data-default-label></span><select class="control" name="default" required></select></label>` +
    `<label class="chart-option"><input name="multiple" type="checkbox" ${existing?.multiple ? "checked" : ""}><span data-multiple-label></span></label>` +
    (existing ? "" : '<label class="chart-option"><input name="slicer" type="checkbox" checked>Add a slicer to this page</label>'),
    existing ? "Save parameter" : "Create parameter", fd => {
      const name = fd.get("name").trim(), members = fd.getAll("member");
      if (!name) throw Error("Enter a parameter name.");
      if ([...measures,...(report.parameters || [])].some(p => p.id !== existing?.id && p.name.toLowerCase() === name.toLowerCase()))
        throw Error("Choose a unique parameter name.");
      if (members.length < 2 || !members.includes(fd.get("default"))) throw Error("Choose at least two members and a default.");
      const p = existing || {id:uid()}, before = existing && {...existing};
      if (form.elements.kind.value === "dimension") p.kind = "dimension";
      const previous = existing && p.current ? membersOf(p).filter(id => members.includes(id)) : [];
      delete p.current;
      if (fd.has("multiple")) p.multiple = true;
      else delete p.multiple;
      if (previous.length && (previous[0] !== fd.get("default") || (p.multiple && previous.length > 1)))
        p.current = p.multiple ? previous : previous[0];
      Object.assign(p,{name,members,default:fd.get("default")});
      if (!existing) (report.parameters ??= []).push(p);
      commit(p,fd.has("slicer"),before);
    });
  const form = document.querySelector("#dlgform"), select = form.elements.default;
  function defaults() {
    const kind = form.elements.kind.value;
    form.querySelector("[data-multiple-label]").textContent = "Allow readers to select multiple " + (kind === "dimension" ? "columns" : "measures");
    for (const section of form.querySelectorAll("[data-members]"))
      section.hidden = section.disabled = section.dataset.members !== kind;
    form.querySelector("[data-default-label]").textContent = kind === "dimension" ? "Default column" : "Default measure";
    const prior = select.value || existing?.default;
    const checked = new Set(new FormData(form).getAll("member"));
    select.replaceChildren(...choices[kind].filter(m => checked.has(m.id)).map(m => new Option(m.name,m.id)));
    if (checked.has(prior)) select.value = prior;
    form.querySelector('[type="submit"]').disabled = checked.size < 2;
  }
  form.addEventListener("change",e => { if (["member","kind"].includes(e.target.name)) defaults(); });
  defaults();
}
