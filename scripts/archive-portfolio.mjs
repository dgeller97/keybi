import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Archive the exact local reports that passed the fresh-session browser audit.
const verified = JSON.parse(
  await readFile("portfolio-evidence/checkpoint-5.json", "utf8"),
);
const gallery = JSON.parse(
  await readFile("portfolio-evidence/gallery.json", "utf8"),
);
const specialized = JSON.parse(
  await readFile("portfolio-evidence/gallery-specialized.json", "utf8"),
);
if (
  gallery.title !== "Visual Gallery" ||
  specialized.url !== gallery.url ||
  !specialized.specialized?.length
)
  throw Error("Verify the Visual Gallery before archiving.");
verified.push(gallery);
const root = process.env.FOLIO_DATA || ".studio",
  dest = "portfolio";
const objects = new Map();
for (const folder of ["tables", "reports", "images", "publications"])
  await mkdir(join(dest, folder), { recursive: true });
async function copy(folder, name) {
  const path = folder + "/" + name;
  if (objects.has(path)) return;
  const data = await readFile(join(root, path));
  await writeFile(join(dest, path), data);
  objects.set(path, createHash("sha256").update(data).digest("hex"));
}
async function dependencies(r) {
  for (const t of r.tables) {
    const version = t.storageId || t.id;
    if (!/^t[a-f0-9]+$/.test(version) || t.source)
      throw Error("Expected an imported portfolio table");
    for (const ext of ["json", "parquet"])
      await copy("tables", version + "." + ext);
  }
  for(const v of r.pages.flatMap(p=>p.visuals).filter(v=>v.kind==="image")){
    for(const image of [v.image,...(v.imageMappings||[]).map(m=>m.image)].filter(Boolean)){
      if(!/^[a-f0-9]{64}$/.test(image.key)) throw Error("Invalid report image key");
      await copy("images",image.key+".img");
    }
  }
}
for (const entry of verified) {
  const id = new URL(entry.url).hash.slice(1);
  if (!/^r[a-f0-9]+$/.test(id)) throw Error("Invalid report ID");
  const file=id+".json";
  const r=JSON.parse(await readFile(join(root,"reports",file),"utf8"));
  if (entry.title !== r.title) throw Error("Report changed since verification");
  await dependencies(r);
  await copy("reports",file);
  let published;
  try {published=JSON.parse(await readFile(join(root,"publications",file),"utf8"));}
  catch(error){if(error.code!=="ENOENT")throw error;}
  if(published){
    if(published.id!=="p"+id.slice(1) || published.report?.id!==published.id)throw Error("Invalid published report");
    await dependencies(published.report);
    await copy("publications",file);
  }
}
await writeFile(
  join(dest, "manifest.json"),
  JSON.stringify(
    {
      reports: verified.map((e) => ({
        id: new URL(e.url).hash.slice(1),
        title: e.title,
      })),
      files: Object.fromEntries(objects),
    },
    null,
    2,
  ) + "\n",
);
console.log(
  "Archived " +
    verified.length +
    " editable reports and " +
    objects.size +
    " files.",
);
