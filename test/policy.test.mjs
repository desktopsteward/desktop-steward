import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

process.env.DESKTOP_STEWARD_HOME = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-test-"));
const { classify, isInside, requireWritable, requireReadable, PolicyError } = await import("../dist/policy/paths.js");
const { DEFAULTS, HOME } = await import("../dist/config.js");

const cfg = { ...DEFAULTS, readFolders: [path.join(HOME, "Documents")], writeFolders: [path.join(HOME, "Documents", "AI Workspace")] };

test("isInside handles boundaries", () => {
  assert.equal(isInside("/a/b", "/a/b/c"), true);
  assert.equal(isInside("/a/b", "/a/bc"), false);
  assert.equal(isInside("/a/b", "/a"), false);
});

test("forbidden beats everything", async () => {
  const r = await classify(path.join(HOME, ".ssh", "id_rsa"), { ...cfg, readFolders: [HOME], writeFolders: [HOME] });
  assert.equal(r.zone, "forbidden");
});

test("path traversal cannot escape", async () => {
  const r = await classify(path.join(HOME, "Documents", "..", ".ssh"), { ...cfg, readFolders: [HOME] });
  assert.equal(r.zone, "forbidden");
  await assert.rejects(requireReadable("~/Documents/../../etc/passwd", cfg), PolicyError);
});

test("write only in write folders", async () => {
  await assert.rejects(requireWritable("~/Documents/report.txt", cfg), PolicyError);
  assert.equal((await classify("~/Documents/AI Workspace/x.txt", cfg)).zone, "write");
  assert.equal((await classify("~/Documents/x.txt", cfg)).zone, "read");
  assert.equal((await classify("~/Movies/x.mov", cfg)).zone, "outside");
});

test("secrets by name are forbidden anywhere", async () => {
  const open = { ...cfg, readFolders: [HOME], writeFolders: [HOME] };
  for (const f of ["Documents/.env", "Documents/server.pem", "Downloads/passwords.txt", "Downloads/id_rsa", "Documents/vault.kdbx"]) {
    assert.equal((await classify(path.join(HOME, f), open)).zone, "forbidden", f);
  }
  assert.equal((await classify(path.join(HOME, "Documents", "environment.txt"), open)).zone, "write");
});

test("simple mode refuses programs, hidden items, and links", async () => {
  const w = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-ws-"));
  const c = { ...cfg, readFolders: [w], writeFolders: [w] };
  await assert.rejects(requireWritable(path.join(w, "run.sh"), c), /program or script/);
  await assert.rejects(requireWritable(path.join(w, "setup.exe"), c), /program or script/);
  await assert.rejects(requireWritable(path.join(w, ".hidden", "x.txt"), c), /hidden/);
  await fs.writeFile(path.join(w, "real.txt"), "x");
  // A link inside the zone resolves to its target; a link pointing outside is refused by the zone check.
  // (Creating symlinks needs a privilege on some Windows setups; skip the link checks there.)
  try { await fs.symlink(path.join(w, "real.txt"), path.join(w, "link.txt")); } catch (e) { if (e.code === "EPERM") return; throw e; }
  assert.equal(await requireWritable(path.join(w, "link.txt"), c), path.join(await fs.realpath(w), "real.txt"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-steward-out-"));
  await fs.writeFile(path.join(outside, "secret.txt"), "x");
  await fs.symlink(path.join(outside, "secret.txt"), path.join(w, "escape.txt"));
  await assert.rejects(requireWritable(path.join(w, "escape.txt"), c), /read-only|off limits/);
  await assert.rejects(requireReadable(path.join(w, "escape.txt"), c), /outside|off limits/);
  await fs.link(path.join(w, "real.txt"), path.join(w, "hard.txt"));
  await assert.rejects(requireWritable(path.join(w, "hard.txt"), c), /hard link/);
  assert.equal(await requireWritable(path.join(w, "notes.md"), c), path.join(await fs.realpath(w), "notes.md"));
});

test("odd path shapes are rejected", async () => {
  await assert.rejects(classify("//server/share/x", cfg), /Network/);
  await assert.rejects(classify("~/Documents/a\0b", cfg), /NUL/);
});

test("windows path shapes are rejected when running as win32", async () => {
  const { rejectOddPaths } = await import("../dist/policy/paths.js");
  const orig = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    assert.throws(() => rejectOddPaths("C:\\Users\\me\\file.txt:hidden"), /Alternate data streams/);
    assert.throws(() => rejectOddPaths("C:\\Users\\me\\CON"), /reserved/);
    assert.throws(() => rejectOddPaths("C:\\Users\\me\\notes."), /dot or space/);
    assert.throws(() => rejectOddPaths("\\\\server\\share\\x"), /Network/);
    assert.doesNotThrow(() => rejectOddPaths("C:\\Users\\me\\Documents\\report.docx"));
  } finally {
    Object.defineProperty(process, "platform", orig);
  }
});
