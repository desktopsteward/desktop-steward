import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

process.env.DESKTOP_STEWARD_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-journal-"));
const work = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-work-"));
const { Journal } = await import("../dist/journal/journal.js");
const j = new Journal();

test("write snapshot and undo restores old content", async () => {
  const f = path.join(work, "a.txt");
  await fs.writeFile(f, "old");
  const id = j.newId();
  const snapshot = await j.snapshot(id, f);
  await fs.writeFile(f, "new");
  const item = { path: f, snapshot };
  await j.stamp(item, f);
  await j.record({ id, action: "write", summary: "t", items: [item] });
  const { lines } = await j.undo(id);
  assert.equal(await fs.readFile(f, "utf8"), "old");
  assert.match(lines[0], /Restored/);
});

test("delete goes to trash and comes back", async () => {
  const f = path.join(work, "b.txt");
  await fs.writeFile(f, "keep me");
  const id = j.newId();
  const trash = await j.toTrash(id, f);
  await j.record({ id, action: "delete", summary: "t", items: [{ path: f, trash }] });
  await assert.rejects(fs.access(f));
  await j.undo(id);
  assert.equal(await fs.readFile(f, "utf8"), "keep me");
});

test("move undo refuses when original place is taken", async () => {
  const a = path.join(work, "c.txt"), b = path.join(work, "d.txt");
  await fs.writeFile(a, "1");
  const id = j.newId();
  await fs.rename(a, b);
  await j.record({ id, action: "move", summary: "t", items: [{ path: a, to: b }] });
  await fs.writeFile(a, "taken");
  const { lines } = await j.undo(id);
  assert.match(lines[0], /Skipped/);
  assert.equal(await fs.readFile(a, "utf8"), "taken");
});
