// Match distinct source keys, retaining the order of the supplied column.
// A SQL Server collation can return additional spellings for an IN predicate.
async function matchColumn(text,parse,load,current) {
  if (text.includes("\t")) throw Error("Paste one column of values.");
  const lines=[...new Set(text.split(/\r\n|[\r\n]/).filter(line=>line.length))];
  if (!lines.length) throw Error("Paste at least one value.");
  const inputs=lines.map(line=>{
    try {return {line,value:parse(line)};} catch {return {line};}
  });
  const keys=[...new Set(inputs.filter(item=>"value" in item).map(item=>item.value))],found=new Set();
  for (let start=0;start<keys.length;start+=500) {
    const batch=keys.slice(start,start+500);
    let offset=0;
    while (current()) {
      const result=await load(offset,batch);
      if (result.error) throw Error(result.error);
      for (const [value] of result.rows) found.add(value);
      if (!result.more) break;
      if (!result.rows.length) throw Error("The source returned an empty values page.");
      offset+=result.rows.length;
    }
    if (!current()) break;
  }
  return {values:keys.filter(key=>found.has(key)),unmatched:inputs.filter(item=>!found.has(item.value)).map(item=>item.line)};
}

export function mountPastedValues(root,{parse,load,initialText,reviewMatches}) {
  const panel=root.querySelector(".paste-values"),input=panel.querySelector("textarea");
  const status=panel.querySelector('[role="status"]'),unmatched=panel.querySelector("[data-unmatched]");
  const review=panel.querySelector("[data-review-paste]");
  let job;
  function match() {
    const text=input.value;
    if (job?.text===text) return job.promise;
    const next={text};job=next;
    const current=()=>job===next && root.isConnected && !!root.closest("dialog[open]") && panel.open;
    status.textContent="Matching values…";unmatched.textContent="";review.hidden=true;
    next.promise=matchColumn(text,parse,load,current).then(result=>{
      if (!current()) return;
      status.textContent=result.values.length+" matched · "+result.unmatched.length+" unmatched";
      unmatched.textContent=result.unmatched.length ? "Unmatched values\n"+result.unmatched.join("\n") : "";
      review.hidden=!result.values.length;
      return result;
    }).catch(error=>{
      if (current()) {status.textContent=error.message;job=undefined;}
    });
    return next.promise;
  }
  function open(text) {
    panel.open=true;input.value=text;input.focus();
    if (text) match();
  }
  panel.ontoggle=()=>{
    if (panel.open) {input.focus();if (input.value) match();}
    else {job=undefined;}
  };
  let timer;
  input.oninput=e=>{
    clearTimeout(timer);job=undefined;status.textContent="";unmatched.textContent="";review.hidden=true;
    if (!input.value) return;
    if (e.inputType==="insertFromPaste") match();
    else timer=setTimeout(()=>{if (panel.open && root.isConnected) match();},120);
  };
  root.addEventListener("paste",e=>{
    const text=e.clipboardData?.getData("text/plain");
    if (e.target===input || !text || !/[\r\n]/.test(text)) return;
    e.preventDefault();open(text);
  });
  if (initialText!==undefined) open(initialText);
  async function read() {
    if (!panel.open) return null;
    const text=input.value,result=await match();
    if (!panel.open || !root.closest("dialog[open]") || text!==input.value)
      throw Error("The pasted selection changed.");
    if (!result?.values.length) throw Error(status.textContent || "No matching values.");
    return {value:result.values};
  }
  review.onclick=async()=>{
    try {
      const result=await read();
      if (result) {
        panel.open=false;input.value="";job=undefined;review.hidden=true;
        status.textContent="";unmatched.textContent="";
        reviewMatches(result.value);
      }
    } catch(error) {status.textContent=error.message;}
  };
  return read;
}
