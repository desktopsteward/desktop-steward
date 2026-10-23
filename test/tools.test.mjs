import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const home = await fs.mkdtemp(path.join(os.tmpdir(), "ds-tools-"));
const ws = await fs.mkdtemp(path.join(os.tmpdir(), "ds-tools-ws-"));
const c = new Client({ name: "tools", version: "0" });
await c.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve("dist/index.js")], env: { ...process.env, DESKTOP_STEWARD_HOME: home, DESKTOP_STEWARD_READ_FOLDERS: ws, DESKTOP_STEWARD_WRITE_FOLDERS: ws } }));
const call = async (name, args) => { const r = await c.callTool({ name, arguments: args }); return { text: r.content[0]?.text ?? "", err: r.isError === true, content: r.content }; };

test("list_folder shows files, sizes, sub-folders by depth, skips hidden, marks iCloud stubs", async () => {
  await fs.mkdir(path.join(ws, "Photos", "2025"), { recursive: true });
  await fs.writeFile(path.join(ws, "notes.txt"), "x".repeat(2048));
  await fs.writeFile(path.join(ws, ".secret"), "hidden");
  await fs.writeFile(path.join(ws, ".Report.pdf.icloud"), "");
  await fs.writeFile(path.join(ws, "Photos", "2025", "a.jpg"), "jpg");
  const r1 = await call("list_folder", { path: ws, depth: 1 });
  assert.match(r1.text, /\[Photos\]/); assert.match(r1.text, /notes\.txt\s+2\.0 KB/); assert.doesNotMatch(r1.text, /\.secret/);
  assert.match(r1.text, /Report\.pdf\s+\(in iCloud/); assert.doesNotMatch(r1.text, /a\.jpg/);
  const r2 = await call("list_folder", { path: ws, depth: 3 });
  assert.match(r2.text, /a\.jpg/);
});

test("create_folder and file_info", async () => {
  const r = await call("create_folder", { path: path.join(ws, "New", "Deep") });
  assert.match(r.text, /Created folder/); assert.ok((await fs.stat(path.join(ws, "New", "Deep"))).isDirectory());
  const again = await call("create_folder", { path: path.join(ws, "New", "Deep") });
  assert.match(again.text, /already exists/);
  const info = await call("file_info", { path: path.join(ws, "notes.txt") });
  assert.match(info.text, /type: file/); assert.match(info.text, /size: 2\.0 KB/);
  const u = await call("undo", {});
  assert.match(u.text, /Removed empty folder/);
});

test("read_file paginates, reads PDF text, refuses folders and shows images", async () => {
  await fs.writeFile(path.join(ws, "long.txt"), Array.from({ length: 1000 }, (_, i) => `line ${i + 1}`).join("\n"));
  const p1 = await call("read_file", { path: path.join(ws, "long.txt"), limit: 10 });
  assert.match(p1.text, /lines 1–10 of 1000/); assert.match(p1.text, /Call again with offset 10/);
  const p2 = await call("read_file", { path: path.join(ws, "long.txt"), offset: 990, limit: 10 });
  assert.match(p2.text, /line 1000/); assert.doesNotMatch(p2.text, /more lines/);
  // A minimal one-page PDF with the text "Hello Steward"
  const pdf = `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 50>>stream\nBT /F1 18 Tf 20 40 Td (Hello Steward) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>`;
  await fs.writeFile(path.join(ws, "doc.pdf"), pdf);
  const pr = await call("read_file", { path: path.join(ws, "doc.pdf") });
  assert.match(pr.text, /Hello Steward/);
  const folder = await call("read_file", { path: ws });
  assert.equal(folder.err, true); assert.match(folder.text, /is a folder/);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await fs.writeFile(path.join(ws, "dot.png"), png);
  const img = await call("read_file", { path: path.join(ws, "dot.png") });
  assert.equal(img.content[0].type, "image"); assert.equal(img.content[0].mimeType, "image/png");
  const bin = await call("read_file", { path: path.join(ws, "blob.bin") }).catch(() => null);
  await fs.writeFile(path.join(ws, "blob.bin"), Buffer.from([0, 1, 2, 3]));
  const bin2 = await call("read_file", { path: path.join(ws, "blob.bin") });
  assert.match(bin2.text, /binary file/);
});

test("disk_usage and find_duplicates", async () => {
  await fs.mkdir(path.join(ws, "Big"), { recursive: true });
  await fs.writeFile(path.join(ws, "Big", "video.mov"), Buffer.alloc(300 * 1024, 1));
  await fs.writeFile(path.join(ws, "copy1.jpg"), Buffer.alloc(20 * 1024, 7));
  await fs.writeFile(path.join(ws, "Photos", "copy2.jpg"), Buffer.alloc(20 * 1024, 7));
  await fs.writeFile(path.join(ws, "Photos", "different.jpg"), Buffer.alloc(20 * 1024, 8));
  const du = await call("disk_usage", { path: ws, top: 5 });
  assert.match(du.text, /Biggest sub-folders:/); assert.match(du.text, /Big/); assert.match(du.text, /video\.mov/);
  const dup = await call("find_duplicates", { path: ws, min_size_kb: 1 });
  assert.match(dup.text, /1 duplicate group/); assert.match(dup.text, /copy1\.jpg/); assert.match(dup.text, /copy2\.jpg/); assert.doesNotMatch(dup.text, /different\.jpg/);
  assert.match(dup.text, /20 KB could be freed/);
});

test("history lists changes with undo ids; prompts carry the task cards", async () => {
  await call("write_file", { path: path.join(ws, "h.txt"), content: "1" });
  const h = await call("history", { limit: 5 });
  assert.match(h.text, /Created .*h\.txt.*id: /); assert.match(h.text, /Recent activity/);
  const prompts = (await c.listPrompts()).prompts.map((p) => p.name);
  for (const n of ["tidy_downloads", "find_duplicate_photos", "free_disk_space", "tidy_desktop", "find_documents", "photos_by_date"]) assert.ok(prompts.includes(n), n);
  const got = await c.getPrompt({ name: "tidy_downloads", arguments: {} });
  assert.match(got.messages[0].content.text, /Downloads/); assert.match(got.messages[0].content.text, /Do not delete/);
});

test("show_rules describes zones and limits in plain words", async () => {
  const r = await call("show_rules", {});
  assert.match(r.text, /Simple: files only, no terminal/); assert.match(r.text, /Always asks first: deleting anything/); assert.match(r.text, /undone for 7 days/);
});

test("edit_file refuses when the text count does not match", async () => {
  await fs.writeFile(path.join(ws, "e.txt"), "a b a");
  const r = await call("edit_file", { path: path.join(ws, "e.txt"), find: "a", replace: "c" });
  assert.match(r.text, /Found the text 2 time\(s\), expected 1. Nothing changed/);
  assert.equal(await fs.readFile(path.join(ws, "e.txt"), "utf8"), "a b a");
  const ok = await call("edit_file", { path: path.join(ws, "e.txt"), find: "a", replace: "c", expected_count: 2 });
  assert.match(ok.text, /replaced 2/); assert.equal(await fs.readFile(path.join(ws, "e.txt"), "utf8"), "c b c");
});

test.after(async () => { await c.close(); });
