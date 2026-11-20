import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
export const url = process.env.FOLIO_URL || "http://127.0.0.1:4317/";
export const evidence = "portfolio-evidence";
export async function studio(task) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const p = await browser.newPage({ viewport: { width: 1680, height: 980 } });
  p.setDefaultTimeout(6500);
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await mkdir(evidence, { recursive: true });
  try {
    await p.goto(url);
    await p.locator("#home h1").waitFor();
    await task(p);
    assert.deepEqual(errors, []);
  } catch (e) {
    await p.screenshot({ path: resolve(evidence, "last-failure.png") });
    console.error((await p.locator("body").innerText()).slice(-2500));
    throw e;
  } finally {
    await browser.close();
  }
}
export async function settled(p) {
  await p.waitForFunction(
    () => document.querySelector("#paper").dataset.pending === "false",
  );
}
export const cards = (p) => p.locator("#report-cards .report-card");
export async function open(p, title) {
  await cards(p)
    .filter({ has: p.getByRole("heading", { name: title, exact: true }) })
    .click();
  await settled(p);
}
export async function rename(p, title, question) {
  await p.locator("#report-name").click();
  await p.getByLabel("Report name").fill(title);
  await p.getByLabel("Business question").fill(question);
  await p.locator("dialog button[type=submit]").click();
}
export async function save(p) {
  await settled(p);
  await p.locator("header [data-action=save]").click();
  await p.waitForFunction(
    () => document.querySelector("#save-state").textContent === "Saved",
  );
}
export async function pageName(p, name) {
  await p.locator("#pages .page.active").dblclick();
  await p.getByLabel("Page name").fill(name);
  await p.locator("dialog button[type=submit]").click();
}
export async function addPage(p, name) {
  await p.locator("[data-action=page-add]").click();
  await pageName(p, name);
}
export async function currentPageLink(p) {
  await p.locator("header [data-action=library]").click();
  await p.locator("dialog [data-action=page-link]").click();
  const link = await p.getByLabel("Local page link").inputValue();
  await p.keyboard.press("Escape");
  return link;
}
export async function create(p, title, question, folder, tables) {
  await p.locator("#home [data-action=new]").click();
  await rename(p, title, question);
  const picker = p.waitForEvent("filechooser");
  await p.locator(".ribbon [data-action=import]").click();
  await (
    await picker
  ).setFiles(tables.map((t) => resolve("web/datasets", folder, t + ".csv")));
  await p.waitForFunction(
    (n) => document.querySelectorAll("#data details[data-tree]").length === n,
    tables.length,
  );
}
export async function links(p, n) {
  await p.locator(".ribbon [data-action=relationship]").click();
  assert.equal(await p.locator("[data-suggestion]:checked").count(), n);
  await p.locator("#apply-links").click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
export async function measure(p, name, a, b, op = "ratio", format = "percent") {
  await p.locator(".ribbon [data-action=measure]").click();
  await p.getByLabel("Name", { exact: true }).fill(name);
  if (op !== "ratio") await p.locator("[name=operation]").selectOption(op);
  await p.locator("dialog [name=a]").selectOption({ label: a });
  await p.locator("dialog [name=b]").selectOption({ label: b });
  await p.locator("dialog [name=format]").selectOption(format);
  await p.locator("dialog button[type=submit]").click();
  await p.locator("dialog").waitFor({ state: "hidden" });
}
export async function setInput(p, selector, value) {
  const e = p.locator(selector);
  await e.fill(String(value));
  await e.press("Tab");
}
export async function visual(
  p,
  kind,
  title,
  groups,
  metrics,
  box,
  format = "auto",
) {
  await p.locator(".ribbon [data-action=add]").click();
  await p.locator('[data-create="' + kind + '"]').click();
  for (const g of groups)
    await p.locator("[data-pick=groups]").selectOption({ label: g });
  for (const raw of metrics) {
    const [field, op] = Array.isArray(raw) ? raw : [raw];
    await p.locator("[data-pick=metrics]").selectOption({ label: field });
    if (op) await p.locator("[data-agg]").last().selectOption(op);
  }
  await p.locator("[data-tab=Format]").click();
  await setInput(p, "#vtitle", title);
  if (format !== "auto") await p.locator("#vformat").selectOption(format);
  if (box) await position(p,box);
  await settled(p);
}
export async function position(p,box) {
  const [x, y, w, h] = box;
  for (const [k, n] of [
    ["x", 0],
    ["w", w],
    ["x", x],
    ["y", y],
    ["h", h],
  ])
    await setInput(p, "[data-dim=" + k + "]", n);
}
export async function filter(p, scope, field, value) {
  await p.locator("[data-tab=Filters]").click();
  await p.locator("[data-new-filter=" + scope + "]").click();
  await p.locator("dialog [name=field]").selectOption({ label: field });
  await p.locator("dialog [name=value]").fill(value);
  await p.locator("dialog button[type=submit]").click();
  await settled(p);
}
export const art = (p, title) =>
  p.locator('article[aria-label="' + title + '"]');
export async function capture(p, file) {
  await settled(p);
  await p.screenshot({ path: resolve(evidence, file + ".png") });
}
