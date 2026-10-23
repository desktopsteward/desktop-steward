import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export const HOME = os.homedir();
export const APP_DIR = process.env.DESKTOP_STEWARD_HOME ?? path.join(HOME, ".desktop-steward");
export const CONFIG_FILE = path.join(APP_DIR, "config.json");
export const HISTORY_DIR = path.join(APP_DIR, "history");
export const TRASH_DIR = path.join(APP_DIR, "trash");
export const ACTIVITY_FILE = path.join(APP_DIR, "activity.jsonl");

export type Mode = "simple" | "standard" | "expert";

export interface Config {
  mode: Mode;
  /** Folders the AI may read and search. */
  readFolders: string[];
  /** Folders the AI may change without asking (still never deletes without asking). */
  writeFolders: string[];
  /** Extra folders that are always off limits, on top of the built-in list. */
  forbiddenFolders: string[];
  askBeforeDelete: boolean;
  /** Moving/renaming more than this many files asks first. */
  confirmThreshold: number;
  keepHistoryDays: number;
  maxFilesPerOperation: number;
}

export const DEFAULTS: Config = {
  mode: "simple",
  readFolders: ["~/Desktop", "~/Documents", "~/Downloads", "~/Pictures"],
  writeFolders: ["~/Documents/AI Workspace", "~/Downloads"],
  forbiddenFolders: [],
  askBeforeDelete: true,
  confirmThreshold: 10,
  keepHistoryDays: 7,
  maxFilesPerOperation: 200,
};

export function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(HOME, p.slice(2));
  return p.replace(/\$\{HOME\}|\$HOME|%USERPROFILE%/g, HOME);
}

/** Folder lists arrive from the extension settings as a JSON array or joined by ; : , or newlines; an unexpanded "${...}" means unset. */
function splitList(v: string | undefined): string[] | undefined {
  if (!v || !v.trim() || v.includes("${")) return undefined;
  const t = v.trim();
  if (t.startsWith("[")) {
    try {
      const arr = JSON.parse(t);
      if (Array.isArray(arr)) return arr.map(String).map((s) => s.trim()).filter(Boolean);
    } catch { /* fall through */ }
  }
  const sep = process.platform === "win32" ? /[;\n]+/ : /[:;\n]+/;
  const parts = t.split(sep).map((s) => s.trim()).filter(Boolean);
  // A Windows drive letter would be split by ":"; re-join "C" + "\\x" pairs.
  const out: string[] = [];
  for (const part of parts) {
    if (process.platform === "win32" && /^[a-zA-Z]$/.test(part)) { out.push(part + ":"); continue; }
    if (out.length && /^[a-zA-Z]:$/.test(out[out.length - 1])) out[out.length - 1] += part; else out.push(part);
  }
  return out.length ? out : undefined;
}

/** File config, then environment overrides (set by the Claude Desktop extension settings). */
export async function loadConfig(): Promise<Config> {
  let fileCfg: Partial<Config> = {};
  try {
    fileCfg = JSON.parse(await fs.readFile(CONFIG_FILE, "utf8"));
  } catch {
    /* first run */
  }
  const env = process.env;
  const cfg: Config = {
    ...DEFAULTS,
    ...fileCfg,
    mode: (env.DESKTOP_STEWARD_MODE as Mode) || fileCfg.mode || DEFAULTS.mode,
    readFolders: splitList(env.DESKTOP_STEWARD_READ_FOLDERS) ?? fileCfg.readFolders ?? DEFAULTS.readFolders,
    writeFolders: splitList(env.DESKTOP_STEWARD_WRITE_FOLDERS) ?? fileCfg.writeFolders ?? DEFAULTS.writeFolders,
    askBeforeDelete:
      env.DESKTOP_STEWARD_ASK_BEFORE_DELETE !== undefined
        ? env.DESKTOP_STEWARD_ASK_BEFORE_DELETE !== "false"
        : fileCfg.askBeforeDelete ?? DEFAULTS.askBeforeDelete,
  };
  if (!["simple", "standard", "expert"].includes(cfg.mode)) cfg.mode = "simple";
  cfg.readFolders = cfg.readFolders.map(expandHome);
  cfg.writeFolders = cfg.writeFolders.map(expandHome);
  cfg.forbiddenFolders = cfg.forbiddenFolders.map(expandHome);
  return cfg;
}

export async function saveConfig(cfg: Config): Promise<void> {
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

export async function ensureDirs(cfg: Config): Promise<void> {
  // Snapshots and trash hold copies of the user's files: keep them private to this account.
  await fs.mkdir(APP_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(APP_DIR, 0o700).catch(() => {});
  await fs.mkdir(HISTORY_DIR, { recursive: true, mode: 0o700 });
  await fs.mkdir(TRASH_DIR, { recursive: true, mode: 0o700 });
  for (const w of cfg.writeFolders) {
    await fs.mkdir(w, { recursive: true }).catch(() => {});
  }
}
