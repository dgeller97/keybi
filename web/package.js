async function checked(response) {
  if (response.ok) return response;
  const detail = await response.json().catch(() => ({}));
  throw Error(detail.error || response.statusText);
}
export async function downloadReport(id, title) {
  const response = await checked(
    await fetch("/api/reports/" + encodeURIComponent(id) + "/package"),
  );
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.download =
    (title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 160) || "Report") +
    ".keybi";
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export async function importReport(file) {
  if (file.size > 256 * 1024 * 1024)
    throw Error("Choose a report package up to 256 MiB.");
  const response = await checked(
    await fetch("/api/packages", {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
    }),
  );
  return response.json();
}
