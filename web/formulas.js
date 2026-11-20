import { monthMetric } from "./visual-types.js";

const functions = {
  SUM: "sum",
  AVERAGE: "avg",
  MIN: "min",
  MAX: "max",
  DISTINCTCOUNT: "distinctcount",
};
function parseFormula(input, fields, resolveMeasure) {
  const tokens = [], positions = [],
    lexer = /\s+|'(?:[^']|'')*'|"(?:[^"]|"")*"|\[(?:[^\]]|\]\])+\]|[a-z_][a-z0-9_]*|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|==|<>|>=|<=|[=><(),+*&-]/iy;
  const text = input;
  lexer.lastIndex = text.match(/^\s*=?\s*/)[0].length;
  while (lexer.lastIndex < text.length) {
    const pos = lexer.lastIndex,
      match = lexer.exec(text);
    if (!match)
      throw Error("Unexpected character at position " + (pos + 1) + ".");
    if (match[0].trim()) {
      tokens.push(match[0]);
      positions.push(pos);
    }
  }
  let i = 0,rowTable=null;
  const take = (expected) => {
    const token = tokens[i++];
    if (token !== expected) throw Error("Expected " + expected + ".");
  };
  const fieldRef = (f) => ({ t: f.t, c: f.c });
  function reference(tableOnly = false) {
    let table = tokens[i++] || "";
    if (table.startsWith("'")) table = table.slice(1, -1).replaceAll("''", "'");
    const candidates = fields.filter(
      (f) => f.table.toLowerCase() === table.toLowerCase(),
    );
    if (!candidates.length || new Set(candidates.map((f) => f.t)).size !== 1)
      throw Error("Unknown or ambiguous table " + table + ".");
    if (tableOnly) return candidates[0];
    const col = tokens[i++] || "";
    if (!col.startsWith("["))
      throw Error("Use Table[Column] inside the function.");
    const name = col.slice(1, -1).replaceAll("]]", "]");
    const field = candidates.find(
      (f) => f.name.toLowerCase() === name.toLowerCase(),
    );
    if (!field) throw Error("Unknown column " + name + ".");
    return field;
  }
  function mergeFields(previous = [], added) {
    const unique = new Map([...previous,...added].map(f => [JSON.stringify(f),f]));
    return [...unique.values()].sort((a,b) => a.t.localeCompare(b.t) || a.c-b.c);
  }
  const operators = {"=":"eq", "==":"strict", "<>":"ne", ">":"gt", "<":"lt", ">=":"gte", "<=":"lte"};
  function comparison() {
    const field = reference();
    const operator = tokens[i++];
    if (!Object.hasOwn(operators, operator)) throw Error("Choose a comparison operator after the column.");
    let literal = tokens[i++], value;
    if (literal?.toUpperCase() === "BLANK") {
      take("(");
      take(")");
      value = null;
    } else if (field.numeric) {
      if (literal === "-" || literal === "+") literal += tokens[i++];
      value = Number(literal);
      if (!Number.isFinite(value)) throw Error("Compare " + field.name + " with a number or BLANK().");
    } else {
      if (!literal?.startsWith('"')) throw Error("Enclose the text filter value in double quotes.");
      value = literal.slice(1,-1).replaceAll('""','"');
    }
    return {field: fieldRef(field), op: "dax_" + operators[operator], value};
  }
  const simple = (m,op) => m.op === op && !m.comparison && !m.tree;
  const literal = number => ({op:"formula",tree:{kind:"literal",number}});
  const textLiteral = value => ({op:"formula",valueType:"text",tree:{kind:"text",value}});
  const isText = value => value.valueType === "text";
  function numeric(value) {
    if (isText(value)) throw Error("This operation requires a numeric expression.");
    return value;
  }
  function asText(value) {
    if (value.tree?.kind === "literal" && value.tree.number === null) return textLiteral(null);
    if (!isText(value)) throw Error("This operation requires a text expression.");
    return value;
  }
  function binary(kind,left,right) {
    if (kind === "concat") {
      left = asText(left);
      right = asText(right);
    } else {numeric(left); numeric(right);}
    return {op:"formula",field:left.field || right.field,...(kind==="concat" && {valueType:"text"}),tree:{kind,left,right}};
  }
  function logicalTest() {
    if (tokens[i]?.toUpperCase() === "HASONEVALUE") {
      if (rowTable) throw Error("Use HASONEVALUE in a measure filter context.");
      i++; take("(");
      const field = fieldRef(reference());
      take(")");
      return {kind:"compare",left:{op:"distinctcount",field},right:literal(1),op:"strict"};
    }
    if (tokens[i]?.toUpperCase() === "ISBLANK") {
      i++;
      take("(");
      const value = expression();
      take(")");
      return {kind:"isblank",value};
    }
    const left = numeric(expression());
    if (!Object.hasOwn(operators,tokens[i])) return {kind:"truthy",value:left};
    const op = operators[tokens[i++]];
    return {kind:"compare",left,right:numeric(expression()),op};
  }
  function clear(result,removed) {
    if (result.comparison) result = {op:"formula",field:result.field,tree:{kind:"value",value:result}};
    if (result.tree?.left)
      return binary(result.tree.kind,clear(result.tree.left,removed),clear(result.tree.right,removed));
    return {...result,removeFilters:mergeFields(result.removeFilters,removed),
      ...(result.denominator && {denominatorRemoveFilters:mergeFields(result.denominatorRemoveFilters,removed)})};
  }
  function operand() {
    if (tokens[i] === "(") {
      i++;
      const value = expression();
      take(")");
      return value;
    }
    const token = tokens[i];
    if (token === "+" || token === "-") {
      i++;
      const value=numeric(operand());
      if(token==="+")return value;
      return value.tree?.kind==="literal"?literal(value.tree.number==null?null:-value.tree.number):binary("multiply",literal(-1),value);
    }
    if (token?.startsWith('"')) {
      if (rowTable) throw Error("Use a numeric expression inside SUMX.");
      i++;
      return textLiteral(token.slice(1,-1).replaceAll('""','"'));
    }
    if (/^[.\d]/.test(token || "")) {
      i++;
      if (!Number.isFinite(Number(token))) throw Error("Enter a finite numeric literal.");
      return literal(Number(token));
    }
    if(rowTable && tokens[i+1]?.startsWith("[")) {
      const f=reference();
      if(f.t!==rowTable.t || !f.numeric)throw Error("Choose a numeric column from the table being iterated.");
      return {op:"row",field:fieldRef(f)};
    }
    if (tokens[i]?.startsWith("[")) {
      if(rowTable)throw Error("Use the iterator table’s columns in a row expression.");
      const start = positions[i], token = tokens[i++], name = token.slice(1,-1).replaceAll("]]","]");
      if (!resolveMeasure) throw Error("Unknown measure [" + name + "].");
      return resolveMeasure(name,start,start+token.length);
    }
    const fn = tokens[i++]?.toUpperCase();
    take("(");
    if(rowTable && !["BLANK","IF","DIVIDE"].includes(fn))throw Error("Use numeric columns, arithmetic, IF or DIVIDE inside a physical-row expression.");
    if (fn === "BLANK") {
      take(")");
      return literal(null);
    }
    if (fn === "SELECTEDVALUE") {
      const column = reference();
      let fallback = literal(null);
      if (tokens[i] === ",") {i++; fallback = expression();}
      take(")");
      fallback = column.numeric ? numeric(fallback) : asText(fallback);
      return {op:"formula",field:fieldRef(column),...(!column.numeric && {valueType:"text"}),
        tree:{kind:"selected",text:!column.numeric,fallback}};
    }
    if (fn === "IF") {
      const test = logicalTest();
      take(",");
      let yes = expression();
      let no = literal(null);
      if (tokens[i] === ",") {
        i++;
        no = expression();
      }
      take(")");
      if (isText(yes) || isText(no)) {yes = asText(yes); no = asText(no);}
      return {op:"formula",...(isText(yes) && {valueType:"text"}),field:test.value?.field || test.left?.field || test.right?.field || yes.field || no.field,
        tree:{kind:"if",test,yes,no}};
    }
    if (fn === "SUMX") {
      if (tokens[i]?.toUpperCase() !== "VALUES" || tokens[i+1]!=="(") {
        const table=reference(true);take(",");
        rowTable=table;
        let value;
        try {value=expression();}finally{rowTable=null;}
        take(")");
        return {op:"rowsum",field:fieldRef(table),tree:{kind:"rowsum",value}};
      }
      i++;
      take("(");
      const group = fieldRef(reference());
      take(")");
      take(",");
      if (!tokens[i]?.startsWith("[") && tokens[i]?.toUpperCase() !== "CALCULATE")
        throw Error("Use a saved measure or CALCULATE(expression) as the iterator value.");
      const value = numeric(operand());
      take(")");
      return {op:"formula",field:value.field || group,tree:{kind:"sumx",group,value}};
    }
    if (fn === "CALCULATE") {
      const result = expression();
      if (tokens[i] === ")") { i++; return result; }
      const removed = [], filters = [];
      do {
        take(",");
        if (tokens[i]?.toUpperCase() !== "REMOVEFILTERS" || tokens[i+1] !== "(") {
          filters.push(comparison());
          continue;
        }
        i++;
        take("(");
        const first = fieldRef(reference());
        removed.push(first);
        while (tokens[i] === ",") {
          i++;
          const next = fieldRef(reference());
          if (next.t !== first.t) throw Error("Use a separate REMOVEFILTERS for each table.");
          removed.push(next);
        }
        take(")");
      } while (tokens[i] === ",");
      take(")");
      if (!filters.length) return clear(result,removed);
      return {op:"formula", ...(isText(result) && {valueType:"text"}),field:result.field, tree:{kind:"value", value:result, filters},
        ...(removed.length && {removeFilters: mergeFields([],removed)})};
    }
    if (fn === "DIVIDE") {
      const left = expression();
      take(",");
      const right = expression();
      take(")");
      if (!simple(right,"sum") || !(simple(left,"sum") || simple(left,"difference")))
        return binary("divide",left,right);
      if (simple(left,"difference") &&
          (JSON.stringify(left.denominator) !== JSON.stringify(right.field) ||
           JSON.stringify(left.denominatorRemoveFilters || []) !== JSON.stringify(right.removeFilters || [])))
        return binary("divide",left,right);
      return {...left,op:left.op === "sum" ? "ratio" : "variance_pct",denominator:right.field,
        ...(right.removeFilters && {denominatorRemoveFilters:right.removeFilters})};
    }
    if (!Object.hasOwn(functions, fn) && fn !== "COUNTROWS")
      throw Error("Choose a supported aggregate function.");
    const field = reference(fn === "COUNTROWS");
    if (fn !== "COUNTROWS" && fn !== "DISTINCTCOUNT" && !field.numeric)
      throw Error(fn + " requires a numeric column here.");
    take(")");
    return { op: fn === "COUNTROWS" ? "countrows" : functions[fn], field: fieldRef(field) };
  }
  function product() {
    let left = operand();
    while(tokens[i]==="*"){i++;left=binary("multiply",left,operand());}
    return left;
  }
  function addition() {
    let left = product();
    while (tokens[i] === "-" || tokens[i] === "+") {
      const operator=tokens[i];
      i++;
      const right = product();
      left = operator==="-" && simple(left,"sum") && simple(right,"sum")
        ? {...left,op:"difference",denominator:right.field,
          ...(right.removeFilters && {denominatorRemoveFilters:right.removeFilters})}
        : binary(operator==="-"?"subtract":"add",left,right);
    }
    return left;
  }
  function expression() {
    let left = addition();
    while (tokens[i] === "&") {i++; left = binary("concat",left,addition());}
    return left;
  }
  const result = expression();
  if (i !== tokens.length) throw Error("Unexpected tokens after the measure.");
  // The model stores a home field for every measure. Literals have no fact dependency.
  const home = result.field || (fields.length && fieldRef(fields[0]));
  if (!home) throw Error("Import a table before creating a measure.");
  function assignHome(node) {
    node.field ??= home;
    const tree = node.tree;
    if (!tree) return;
    for (const child of [tree.left,tree.right,tree.value,tree.fallback,tree.yes,tree.no,tree.test?.value,tree.test?.left,tree.test?.right])
      if (child && typeof child === "object") assignHome(child);
  }
  assignHome(result);
  return result;
}
// Recompile the edited dependency chain before committing any changes. Saved
// references use stable IDs so a rename also updates the editable DAX text.
export function updateMeasures(measures, definition, fields) {
  const byId = new Map(measures.map(m => [m.id, m]));
  const previous = byId.get(definition.id);
  byId.set(definition.id, definition);
  const byName = new Map([...byId.values()].map(m => [m.name.toLowerCase(), m]));
  if (previous) byName.set(previous.name.toLowerCase(), definition);
  const cache = new Map(), updates = new Map(), active = [];
  const dependents = new Map();
  for (const m of measures) {
    for (const id of m.baseMeasure ? [m.baseMeasure] : m.measureRefs || []) {
      if (!dependents.has(id)) dependents.set(id, []);
      dependents.get(id).push(m.id);
    }
  }
  const affected = new Set([definition.id]);
  for (const id of affected)
    for (const child of dependents.get(id) || []) affected.add(child);
  function compile(id) {
    if (cache.has(id)) return cache.get(id);
    const m = byId.get(id);
    if (!m) throw Error("A referenced measure is missing.");
    const cycleStart = active.indexOf(id);
    if (cycleStart >= 0) {
      const chain = [...active.slice(cycleStart), id].map(key => byId.get(key).name);
      throw Error("Circular measure reference: " + chain.join(" → ") + ".");
    }
    active.push(id);
    let metric;
    if (m.baseMeasure) {
      const base = compile(m.baseMeasure);
      metric = monthMetric(base, m.comparison);
    } else if (m.expression && affected.has(id)) {
      const refs = [], replacements = [];
      metric = parseFormula(m.expression, fields, (name, start, end) => {
        const target = id === definition.id
          ? byName.get(name.toLowerCase())
          : byId.get(m.measureRefs[refs.length]);
        if (!target) throw Error("Unknown measure [" + name + "].");
        refs.push(target.id);
        if (name !== target.name)
          replacements.push([start, end, "[" + target.name.replaceAll("]", "]]") + "]"]);
        return compile(target.id);
      });
      let expression = m.expression;
      for (const [start, end, text] of replacements.reverse())
        expression = expression.slice(0, start) + text + expression.slice(end);
      const updated = { id, name: m.name, format: m.format, expression, ...metric };
      if (refs.length) updated.measureRefs = refs;
      updates.set(id, updated);
    } else {
      const {op,field,denominator,comparison,removeFilters,denominatorRemoveFilters,tree,valueType} = m;
      metric = {op,field,denominator,comparison,removeFilters,denominatorRemoveFilters,tree,valueType};
    }
    active.pop();
    cache.set(id, metric);
    return metric;
  }
  for (const id of affected) compile(id);
  return [...byId.values()].map(m => updates.get(m.id) || m);
}
function formulaDialog(
  existing,
  { report, fields, lookup, dialog, esc, change, uid },
) {
  const ref = (f) => {
    const item = lookup(f);
    return (
      "'" +
      item.table.replaceAll("'", "''") +
      "'[" +
      item.name.replaceAll("]", "]]") +
      "]"
    );
  };
  let expression = existing?.expression || "";
  if (existing && !expression) {
    const a = "SUM(" + ref(existing.field) + ")",
      b = existing.denominator ? "SUM(" + ref(existing.denominator) + ")" : "";
    expression =
      existing.op === "difference"
        ? a + " - " + b
        : existing.op === "variance_pct"
          ? `DIVIDE(${a} - ${b}, ${b})`
          : `DIVIDE(${a}, ${b})`;
  }
  dialog(
    existing ? "Edit formula" : "Formula measure",
    `<label class="formlabel">Measure name<input class="control" required maxlength="160" name="name" value="${esc(existing?.name || "")}"></label><label class="formlabel">DAX expression<textarea rows="4" name="expression" required placeholder="SUM('Sales'[Revenue])">${esc(expression)}</textarea></label><small>SUM, AVERAGE, MIN, MAX, DISTINCTCOUNT and COUNTROWS. Use [Measure name] to reuse a saved measure. For example, IF(ISBLANK([Actual]), BLANK(), [Variance]) shows variance when an actual is available. Use SELECTEDVALUE(Table[Column], alternate) for the one distinct value in scope, or IF(HASONEVALUE(Table[Column]), …). Join text measures and quoted text with &amp; to build captions. IF also accepts numeric comparisons. Add, subtract or multiply measures and aggregates. DIVIDE returns blank for a zero denominator. SUMX(Table, Table[Quantity] * Table[Price]) adds the products of individual rows. In CALCULATE, use REMOVEFILTERS(Table[Column]) to clear a column or Table[Column] = "Online" to replace its filter. Separate conditions with commas.</small><label class="formlabel">Number format<select class="control" name="format">${["number", "percent", "currency"].map((f) => `<option value="${f}" ${existing?.format === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>`,
    "Save measure",
    (fd) => {
      const name = fd.get("name").trim(),
        expression = fd.get("expression").trim();
      if (
        !name ||
        report.measures.some(
          (m) => m !== existing && m.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw Error("Use a distinct measure name.");
      const m = {
        id: existing?.id || uid(),
        name,
        expression,
        format: fd.get("format"),
      };
      report.measures = updateMeasures(report.measures,m,fields());
      change();
    },
  );
}
export { parseFormula, formulaDialog };
