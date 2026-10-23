import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";
import { requireReadable, requireWritable, pretty, PolicyError } from "../policy/paths.js";
import { confirm } from "../policy/approvals.js";
import { t } from "../policy/i18n.js";
import { run, text, human, type Ctx, type ToolResult } from "./shared.js";

const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp" };
const MAX_WRITE_BYTES = 20 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 200 * 1024 * 1024;

/** The folders the user opened for changes must never be moved or deleted as a whole. */
async function refuseRoot(real: string, cfg: Ctx["cfg"]): Promise<void> {
  const { realize, isInside } = await import("../policy/paths.js");
  for (const w of cfg.writeFolders) {
    const rw = await realize(w);
    if (isInside(real, rw)) throw new PolicyError(`${pretty(real)} is one of the folders opened to the AI (or contains one). It can be tidied inside, but not moved or deleted itself.`);
  }
}

async function hashFile(p: string): Promise<string> {
  const { createReadStream } = await import("node:fs");
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha1");
    createReadStream(p).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

async function readAsText(p: string): Promise<string | null> {
  const ext = path.extname(p).toLowerCase();
  const buf = await fs.readFile(p);
  if (ext === ".pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text as string;
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }
  // Binary sniff: NUL byte in the first 8 KB.
  if (buf.subarray(0, 8192).includes(0)) return null;
  return buf.toString("utf8");
}

export function registerFileTools(ctx: Ctx): void {
  const { server, cfg, journal } = ctx;

  server.registerTool(
    "list_folder",
    {
      title: "List a folder",
      description: "Shows files and sub-folders with sizes and dates. Use depth 2–3 to see inside sub-folders. Only folders the user opened to the AI are visible.",
      inputSchema: { path: z.string().describe("Folder path, e.g. ~/Downloads"), depth: z.number().int().min(1).max(4).default(1) },
    },
    async ({ path: p, depth }) =>
      run("list_folder", `list ${p}`, async () => {
        const root = await requireReadable(p, cfg);
        const lines: string[] = [];
        let count = 0;
        const walk = async (dir: string, level: number) => {
          const ents = await fs.readdir(dir, { withFileTypes: true });
          ents.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
          for (const e of ents) {
            const cloud = /^\.(.+)\.icloud$/.exec(e.name);
            if (cloud) {
              if (++count > 500) { lines.push("… more items not shown (limit 500). Use search_files to narrow down."); return; }
              lines.push(`${"  ".repeat(level)}${cloud[1]}  (in iCloud, not downloaded to this Mac)`);
              continue;
            }
            if (e.name.startsWith(".")) continue;
            if (++count > 500) { lines.push("… more items not shown (limit 500). Use search_files to narrow down."); return; }
            const full = path.join(dir, e.name);
            const st = await fs.stat(full).catch(() => null);
            const indent = "  ".repeat(level);
            if (e.isDirectory()) {
              lines.push(`${indent}[${e.name}]`);
              if (level + 1 < depth) await walk(full, level + 1);
            } else {
              lines.push(`${indent}${e.name}  ${st ? human(st.size) : ""}  ${st ? st.mtime.toISOString().slice(0, 10) : ""}`);
            }
            if (count > 500) return;
          }
        };
        await walk(root, 0);
        return `${pretty(root)}\n${lines.join("\n") || "(empty)"}`;
      }),
  );

  server.registerTool(
    "read_file",
    {
      title: "Read a file",
      description: "Reads text files, PDFs and Word documents as text, and shows images. Large files come in pages: use offset and limit (in lines).",
      inputSchema: { path: z.string(), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(2000).default(400) },
    },
    async ({ path: p, offset, limit }) =>
      run("read_file", `read ${p}`, async () => {
        const real = await requireReadable(p, cfg);
        const st = await fs.stat(real).catch(async (e) => {
          const stub = path.join(path.dirname(real), `.${path.basename(real)}.icloud`);
          if (await fs.stat(stub).then(() => true, () => false)) throw new PolicyError(`${pretty(real)} is stored in iCloud and not downloaded to this Mac. Ask the user to open it once in Finder (or click the cloud icon) and try again.`);
          throw e;
        });
        if (st.isDirectory()) throw new PolicyError(`${pretty(real)} is a folder. Use list_folder.`);
        const ext = path.extname(real).toLowerCase();
        if (IMAGE_TYPES[ext]) {
          if (st.size > 5 * 1024 * 1024) return `${pretty(real)} is an image of ${human(st.size)}, too large to show.`;
          const data = (await fs.readFile(real)).toString("base64");
          return { content: [{ type: "image", data, mimeType: IMAGE_TYPES[ext] }] } as ToolResult;
        }
        if (st.size > 50 * 1024 * 1024) return `${pretty(real)} is ${human(st.size)}, too large to read here.`;
        const content = await readAsText(real);
        if (content === null) return `${pretty(real)} is a binary file (${human(st.size)}), nothing to read as text.`;
        const all = content.split(/\r?\n/);
        const page = all.slice(offset, offset + limit);
        const more = offset + limit < all.length ? `\n… ${all.length - offset - limit} more lines. Call again with offset ${offset + limit}.` : "";
        return `${pretty(real)} (lines ${offset + 1}–${offset + page.length} of ${all.length})\n${page.join("\n")}${more}`;
      }),
  );

  server.registerTool(
    "write_file",
    {
      title: "Write a file",
      description: "Creates or replaces a text file inside the folders opened for changes. Replacing an existing file asks the user first; the old version is kept so it can be undone.",
      inputSchema: { path: z.string(), content: z.string(), mode: z.enum(["rewrite", "append"]).default("rewrite") },
    },
    async ({ path: p, content, mode }) =>
      run("write_file", `write ${p}`, async () => {
        if (Buffer.byteLength(content) > MAX_WRITE_BYTES) throw new PolicyError(`That is more than ${human(MAX_WRITE_BYTES)} of text; write it in smaller parts with mode "append".`);
        const real = await requireWritable(p, cfg);
        const st = await fs.stat(real).catch(() => null);
        if (st && !st.isFile()) throw new PolicyError(`${pretty(real)} is a folder.`);
        const existed = st !== null;
        if (existed && st.size > MAX_SNAPSHOT_BYTES) throw new PolicyError(`${pretty(real)} is ${human(st.size)}; files this large are not replaced because a copy for undo cannot be kept.`);
        if (existed && mode === "rewrite") {
          const ok = await confirm(server, t().replace(pretty(real)));
          if (!ok) return "The user did not allow replacing this file.";
        }
        const id = journal.newId();
        const snapshot = await journal.snapshot(id, real);
        await fs.mkdir(path.dirname(real), { recursive: true });
        if (mode === "append") await fs.appendFile(real, content);
        else await fs.writeFile(real, content);
        const item = { path: real, snapshot };
        await journal.stamp(item, real);
        await journal.record({ id, action: "write", summary: `${existed ? "Changed" : "Created"} ${pretty(real)}`, items: [item] });
        return `${existed ? "Updated" : "Created"} ${pretty(real)} (${human(Buffer.byteLength(content))}). Undo id: ${id}`;
      }),
  );

  server.registerTool(
    "edit_file",
    {
      title: "Edit part of a file",
      description: "Replaces an exact piece of text in a file with new text. The piece must appear exactly expected_count times. The old version is kept for undo.",
      inputSchema: { path: z.string(), find: z.string(), replace: z.string(), expected_count: z.number().int().min(1).default(1) },
    },
    async ({ path: p, find, replace, expected_count }) =>
      run("edit_file", `edit ${p}`, async () => {
        const real = await requireWritable(p, cfg);
        const st = await fs.stat(real);
        if (!st.isFile()) throw new PolicyError(`${pretty(real)} is not a file.`);
        if (st.size > MAX_WRITE_BYTES) throw new PolicyError(`${pretty(real)} is ${human(st.size)}; files over ${human(MAX_WRITE_BYTES)} are not edited in place.`);
        const before = await fs.readFile(real, "utf8");
        const count = before.split(find).length - 1;
        if (count !== expected_count) return `Found the text ${count} time(s), expected ${expected_count}. Nothing changed. Make the text to find more specific.`;
        const id = journal.newId();
        const snapshot = await journal.snapshot(id, real);
        await fs.writeFile(real, before.split(find).join(replace));
        const item = { path: real, snapshot };
        await journal.stamp(item, real);
        await journal.record({ id, action: "edit", summary: `Edited ${pretty(real)}`, items: [item] });
        return `Edited ${pretty(real)}: replaced ${count} occurrence(s). Undo id: ${id}`;
      }),
  );

  server.registerTool(
    "create_folder",
    { title: "Create a folder", description: "Creates a folder (and parents) inside the folders opened for changes.", inputSchema: { path: z.string() } },
    async ({ path: p }) =>
      run("create_folder", `create folder ${p}`, async () => {
        const real = await requireWritable(p, cfg);
        if (await fs.stat(real).then(() => true, () => false)) return `${pretty(real)} already exists.`;
        await fs.mkdir(real, { recursive: true });
        const id = journal.newId();
        await journal.record({ id, action: "mkdir", summary: `Created folder ${pretty(real)}`, items: [{ path: real }] });
        return `Created folder ${pretty(real)}. Undo id: ${id}`;
      }),
  );

  server.registerTool(
    "move_files",
    {
      title: "Move or rename files",
      description: `Moves or renames files and folders. Never overwrites. Moving more than ${cfg.confirmThreshold} items asks the user first. Every move can be undone.`,
      inputSchema: { moves: z.array(z.object({ from: z.string(), to: z.string() })).min(1).max(cfg.maxFilesPerOperation) },
    },
    async ({ moves }) =>
      run("move_files", `move ${moves.length} item(s)`, async () => {
        const plan: Array<{ from: string; to: string }> = [];
        const { isInside } = await import("../policy/paths.js");
        for (const m of moves) {
          const from = await requireWritable(m.from, cfg);
          const to = await requireWritable(m.to, cfg);
          await refuseRoot(from, cfg);
          if (!(await fs.lstat(from).catch(() => null))) throw new PolicyError(`${pretty(from)} does not exist.`);
          if (await fs.lstat(to).then(() => true, () => false)) throw new PolicyError(`${pretty(to)} already exists; moves never overwrite. Pick another name.`);
          if (isInside(from, to)) throw new PolicyError(`Cannot move ${pretty(from)} into itself.`);
          plan.push({ from, to });
        }
        if (plan.length > cfg.confirmThreshold) {
          const ok = await confirm(server, t().move(plan.length, pretty(plan[0].from), pretty(plan[0].to)));
          if (!ok) return "The user did not allow this move.";
        }
        const id = journal.newId();
        const items = [];
        const { moveAnywhere } = await import("../journal/journal.js");
        for (const m of plan) {
          await moveAnywhere(m.from, m.to);
          const item = { path: m.from, to: m.to };
          await journal.stamp(item, m.to);
          items.push(item);
        }
        await journal.record({ id, action: "move", summary: `Moved ${items.length} item(s)`, items });
        return `Moved ${items.length} item(s). Undo id: ${id}`;
      }),
  );

  server.registerTool(
    "delete_files",
    {
      title: "Delete files",
      description: "Deletes files or folders. Always asks the user first. Nothing is lost right away: deleted items are kept for a week and can be brought back with undo.",
      inputSchema: { paths: z.array(z.string()).min(1).max(cfg.maxFilesPerOperation) },
    },
    async ({ paths }) =>
      run("delete_files", `delete ${paths.length} item(s)`, async () => {
        const reals: string[] = [];
        for (const p of paths) {
          const real = await requireWritable(p, cfg);
          await refuseRoot(real, cfg);
          if (!(await fs.lstat(real).catch(() => null))) throw new PolicyError(`${pretty(real)} does not exist.`);
          reals.push(real);
        }
        if (cfg.askBeforeDelete) {
          const sample = reals.slice(0, 3).map(pretty).join(", ") + (reals.length > 3 ? ", …" : "");
          const ok = await confirm(server, t().del(reals.length, sample, cfg.keepHistoryDays));
          if (!ok) return "The user did not allow deleting.";
        }
        const id = journal.newId();
        const items = [];
        for (const r of reals) {
          const trash = await journal.toTrash(id, r);
          items.push({ path: r, trash });
        }
        await journal.record({ id, action: "delete", summary: `Deleted ${items.length} item(s)`, items });
        return `Deleted ${items.length} item(s). They are kept for ${cfg.keepHistoryDays} days. Undo id: ${id}`;
      }),
  );

  server.registerTool(
    "file_info",
    { title: "File details", description: "Size, dates and type of a file or folder.", inputSchema: { path: z.string() } },
    async ({ path: p }) =>
      run("file_info", `info ${p}`, async () => {
        const real = await requireReadable(p, cfg);
        const st = await fs.stat(real);
        return [`${pretty(real)}`, `type: ${st.isDirectory() ? "folder" : "file"}`, `size: ${human(st.size)}`, `modified: ${st.mtime.toISOString()}`, `created: ${st.birthtime.toISOString()}`].join("\n");
      }),
  );

  server.registerTool(
    "disk_usage",
    {
      title: "What takes space",
      description: "Lists the biggest files and sub-folders inside a folder, to find what fills the disk.",
      inputSchema: { path: z.string(), top: z.number().int().min(5).max(100).default(20) },
    },
    async ({ path: p, top }) =>
      run("disk_usage", `disk usage ${p}`, async () => {
        const root = await requireReadable(p, cfg);
        const files: Array<[string, number]> = [];
        const dirs = new Map<string, number>();
        let scanned = 0;
        const walk = async (dir: string): Promise<number> => {
          let total = 0;
          const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
          for (const e of ents) {
            if (scanned++ > 200_000) break;
            const full = path.join(dir, e.name);
            if (e.isSymbolicLink()) continue;
            if (e.isDirectory()) total += await walk(full);
            else {
              const st = await fs.stat(full).catch(() => null);
              if (st) { files.push([full, st.size]); total += st.size; }
            }
          }
          dirs.set(dir, total);
          return total;
        };
        const total = await walk(root);
        const topDirs = [...dirs].filter(([d]) => d !== root && path.dirname(d) === root).sort((a, b) => b[1] - a[1]).slice(0, top);
        const topFiles = files.sort((a, b) => b[1] - a[1]).slice(0, top);
        return [
          `${pretty(root)}: ${human(total)} in ${files.length} files${scanned > 200_000 ? " (partial scan)" : ""}`,
          "", "Biggest sub-folders:", ...topDirs.map(([d, s]) => `  ${human(s).padStart(8)}  ${path.basename(d)}`),
          "", "Biggest files:", ...topFiles.map(([f, s]) => `  ${human(s).padStart(8)}  ${pretty(f)}`),
        ].join("\n");
      }),
  );

  server.registerTool(
    "find_duplicates",
    {
      title: "Find duplicate files",
      description: "Finds files with identical content inside a folder (same size, then same checksum). Shows groups so the user can decide which copies to delete.",
      inputSchema: { path: z.string(), min_size_kb: z.number().int().min(0).default(10) },
    },
    async ({ path: p, min_size_kb }) =>
      run("find_duplicates", `duplicates in ${p}`, async () => {
        const root = await requireReadable(p, cfg);
        const bySize = new Map<number, string[]>();
        let n = 0;
        const walk = async (dir: string) => {
          for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
            if (n++ > 50_000 || e.name.startsWith(".") || e.isSymbolicLink()) continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await walk(full);
            else {
              const st = await fs.stat(full).catch(() => null);
              if (st && st.size >= min_size_kb * 1024) bySize.set(st.size, [...(bySize.get(st.size) ?? []), full]);
            }
          }
        };
        await walk(root);
        const groups: Array<{ size: number; files: string[] }> = [];
        for (const [size, files] of bySize) {
          if (files.length < 2) continue;
          const byHash = new Map<string, string[]>();
          for (const f of files) {
            if (size > 2 * 1024 * 1024 * 1024) continue;
            const h = await hashFile(f);
            byHash.set(h, [...(byHash.get(h) ?? []), f]);
          }
          for (const g of byHash.values()) if (g.length > 1) groups.push({ size, files: g });
        }
        groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
        if (!groups.length) return `No duplicates found in ${pretty(root)}.`;
        const wasted = groups.reduce((s, g) => s + g.size * (g.files.length - 1), 0);
        return [`${groups.length} duplicate group(s) in ${pretty(root)}, ${human(wasted)} could be freed:`, ...groups.slice(0, 50).flatMap((g) => ["", `${human(g.size)} × ${g.files.length}:`, ...g.files.map((f) => `  ${pretty(f)}`)])].join("\n");
      }),
  );
}

export { text };
