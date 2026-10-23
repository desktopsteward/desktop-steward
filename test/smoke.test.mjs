import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("server starts over stdio, lists tools, writes and undoes", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-smoke-"));
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-smoke-ws-"));
  const t = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/index.js")],
    env: { ...process.env, DESKTOP_STEWARD_HOME: home, DESKTOP_STEWARD_READ_FOLDERS: ws, DESKTOP_STEWARD_WRITE_FOLDERS: ws },
  });
  const c = new Client({ name: "smoke", version: "0" });
  await c.connect(t);
  try {
  const names = (await c.listTools()).tools.map((x) => x.name);
  for (const n of ["list_folder", "read_file", "write_file", "edit_file", "move_files", "delete_files", "search_files", "undo", "history", "show_rules"]) assert.ok(names.includes(n), n);
  assert.ok((await c.listPrompts()).prompts.length >= 5);
  const w = await c.callTool({ name: "write_file", arguments: { path: path.join(ws, "hello.txt"), content: "hi" } });
  assert.match(w.content[0].text, /Created/);
  assert.equal(await fs.readFile(path.join(ws, "hello.txt"), "utf8"), "hi");
  const r = await c.callTool({ name: "read_file", arguments: { path: path.join(ws, "hello.txt") } });
  assert.match(r.content[0].text, /hi/);
  const bad = await c.callTool({ name: "read_file", arguments: { path: path.join(os.homedir(), ".ssh", "id_rsa") } });
  assert.equal(bad.isError, true);
  const u = await c.callTool({ name: "undo", arguments: {} });
  assert.match(u.content[0].text, /Removed/);
  await assert.rejects(fs.access(path.join(ws, "hello.txt")));
  } finally { await c.close(); }
});

test("policy is enforced through the server: roots, programs, overwrite, search", async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-smoke2-"));
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-smoke2-ws-"));
  const t = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/index.js")],
    env: { ...process.env, DESKTOP_STEWARD_HOME: home, DESKTOP_STEWARD_READ_FOLDERS: ws, DESKTOP_STEWARD_WRITE_FOLDERS: ws },
  });
  const c = new Client({ name: "smoke2", version: "0" });
  await c.connect(t);
  try {
  const call = (name, args) => c.callTool({ name, arguments: args });
  // the opened folder itself cannot be deleted or moved
  let r = await call("delete_files", { paths: [ws] });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /opened to the AI/);
  r = await call("move_files", { moves: [{ from: ws, to: path.join(ws, "x") }] });
  assert.equal(r.isError, true);
  // no programs in simple mode
  r = await call("write_file", { path: path.join(ws, "run.sh"), content: "echo hi" });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /program or script/);
  // moves never overwrite
  await fs.writeFile(path.join(ws, "a.txt"), "a"); await fs.writeFile(path.join(ws, "b.txt"), "b");
  r = await call("move_files", { moves: [{ from: path.join(ws, "a.txt"), to: path.join(ws, "b.txt") }] });
  assert.equal(r.isError, true); assert.match(r.content[0].text, /never overwrite/);
  assert.equal(await fs.readFile(path.join(ws, "b.txt"), "utf8"), "b");
  // search by name and by content
  await fs.writeFile(path.join(ws, "invoice-march.txt"), "total due 120 EUR");
  r = await call("search_files", { folder: ws, query: "invoice" });
  assert.match(r.content[0].text, /invoice-march\.txt/);
  r = await call("search_files", { folder: ws, query: "total due", in: "content" });
  assert.match(r.content[0].text, /invoice-march\.txt:1/);
  // edit with exact match
  r = await call("edit_file", { path: path.join(ws, "invoice-march.txt"), find: "120", replace: "130" });
  assert.match(r.content[0].text, /Edited/);
  assert.equal(await fs.readFile(path.join(ws, "invoice-march.txt"), "utf8"), "total due 130 EUR");
  r = await call("undo", {});
  assert.match(r.content[0].text, /Restored/);
  assert.equal(await fs.readFile(path.join(ws, "invoice-march.txt"), "utf8"), "total due 120 EUR");
  } finally { await c.close(); }
});
