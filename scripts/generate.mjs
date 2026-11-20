import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { resolve, join } from "node:path";

const rows = Number(process.argv[2] ?? 2);
if (!Number.isSafeInteger(rows) || rows < 1)
  throw Error("Supply a positive row count.");
const dir = resolve(
  process.argv[3] ?? (rows === 2 ? "web/samples" : "bench-data/" + rows),
);
await mkdir(dir, { recursive: true });
let seed = 321876;
function random(n) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return Math.floor((seed / 4294967296) * n);
}
const small = rows === 2;
const products = small ? 2 : 120;
const days = small ? 2 : 365;
const dates = Array.from({ length: days }, (_, i) =>
  new Date(Date.UTC(2025, 0, i + 1)).toISOString().slice(0, 10),
);
await writeFile(
  join(dir, "Date.csv"),
  "DateKey,Date\n" + dates.map((d, i) => i + 1 + "," + d).join("\n") + "\n",
);
await writeFile(
  join(dir, "Product.csv"),
  "ProductKey,Category,Product\n" +
    Array.from({ length: products }, (_, i) =>
      [i + 1, String.fromCharCode(65 + (i % 12)), "Product " + (i + 1)].join(
        ",",
      ),
    ).join("\n") +
    "\n",
);
const out = createWriteStream(join(dir, "Sales.csv"));
out.write("SaleID,ProductKey,DateKey,Revenue,Profit\n");
for (let i = 0; i < rows; i++) {
  const product = small ? i + 1 : 1 + random(products);
  const date = small ? i + 1 : 1 + random(days);
  const cents = small ? [10000, 90000][i] : 1000 + random(99001);
  const profit = small
    ? [4000, 9000][i]
    : Math.round((cents * (5 + random(36))) / 100);
  const line =
    [
      i + 1,
      product,
      date,
      (cents / 100).toFixed(2),
      (profit / 100).toFixed(2),
    ].join(",") + "\n";
  if (!out.write(line)) await once(out, "drain");
}
out.end();
await once(out, "finish");
console.log(rows.toLocaleString() + " sales rows written to " + dir);
