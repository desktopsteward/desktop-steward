import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { requireReadable, pretty } from "../policy/paths.js";
import { run, type Ctx } from "./shared.js";

async function rg(args: string[], cwd: string, maxBytes = 200_000): Promise<string> {
  const { rgPath } = await import("@vscode/ripgrep");
  return new Promise((resolve, reject) => {
    const child = spawn(rgPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), 20_000);
    child.stdout.on("data", (d) => { if (out.length < maxBytes) out += d.toString(); else child.kill(); });
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || code === 1 || code === null) resolve(out);
      else reject(new Error(err.trim() || `search failed (${code})`));
    });
  });
}

export function registerSearchTools(ctx: Ctx): void {
  const { server, cfg } = ctx;
  server.registerTool(
    "search_files",
    {
      title: "Search files",
      description: "Finds files by name (part of the name, case-insensitive) or by text inside them. Searches only the folders opened to the AI. Hidden files and node_modules are skipped.",
      inputSchema: {
        folder: z.string().describe("Where to search, e.g. ~/Documents"),
        query: z.string().describe("Part of a file name, or text to look for inside files"),
        in: z.enum(["name", "content"]).default("name"),
        max_results: z.number().int().min(1).max(500).default(100),
      },
    },
    async ({ folder, query, in: mode, max_results }) =>
      run("search_files", `search "${query}" in ${folder}`, async () => {
        const root = await requireReadable(folder, cfg);
        if (mode === "name") {
          const out = await rg(["--files", "--hidden", "-g", "!.*", "-g", "!node_modules", "."], root, 2_000_000);
          const q = query.toLowerCase();
          const hits = out.split("\n").filter((l) => l && path.basename(l).toLowerCase().includes(q));
          if (!hits.length) return `No file names containing "${query}" in ${pretty(root)}.`;
          return [`${hits.length} match(es) in ${pretty(root)}${hits.length > max_results ? `, first ${max_results}` : ""}:`, ...hits.slice(0, max_results).map((h) => `  ${h.replace(/^\.\//, "")}`)].join("\n");
        }
        const out = await rg(["-n", "-i", "--max-count", "3", "--max-columns", "200", "-g", "!node_modules", "-g", "!.*", "--", query, "."], root);
        const lines = out.split("\n").filter(Boolean);
        if (!lines.length) return `No files containing "${query}" in ${pretty(root)}.`;
        return [`${lines.length} line(s) in ${pretty(root)}${lines.length > max_results ? `, first ${max_results}` : ""}:`, ...lines.slice(0, max_results).map((l) => `  ${l.replace(/^\.\//, "")}`)].join("\n");
      }),
  );
}
