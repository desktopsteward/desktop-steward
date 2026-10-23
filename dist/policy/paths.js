import path from "node:path";
import fs from "node:fs/promises";
import { realpath as realpathCb } from "node:fs";
import { promisify } from "node:util";
// The native realpath expands Windows 8.3 short names (RUNNER~1) to their long form, so a short name cannot stand in for a different folder.
const realpathNative = promisify(realpathCb.native);
import { HOME, APP_DIR, expandHome } from "../config.js";
export class PolicyError extends Error {
}
const CASE_INSENSITIVE = process.platform === "win32" || process.platform === "darwin";
const norm = (p) => {
    const n = p.normalize("NFC");
    return CASE_INSENSITIVE ? n.toLowerCase() : n;
};
/** Places the AI must never touch, whatever the user configured. */
export function builtinForbidden() {
    const h = (...p) => path.join(HOME, ...p);
    const common = [
        h(".ssh"), h(".gnupg"), h(".aws"), h(".azure"), h(".kube"), h(".docker"), h(".config", "gcloud"), APP_DIR,
        h(".git-credentials"), h(".netrc"), h(".npmrc"), h(".pypirc"),
        // Anything that runs automatically or shapes the shell.
        h(".bashrc"), h(".bash_profile"), h(".zshrc"), h(".zprofile"), h(".profile"), h(".config", "autostart"),
    ];
    if (process.platform === "darwin") {
        return [
            ...common,
            "/System", "/usr", "/bin", "/sbin", "/etc", "/private/etc", "/var/root", "/var/db", "/Library", "/Applications",
            h("Library", "Keychains"), h("Library", "Cookies"), h("Library", "Application Support", "Google"),
            h("Library", "Application Support", "Firefox"), h("Library", "Safari"), h("Library", "Mail"), h("Library", "Messages"),
            h("Library", "Accounts"), h("Library", "Application Support", "com.apple.TCC"), h("Library", "LaunchAgents"),
            h("Library", "Preferences"), h("Library", "Application Support", "Claude"), h("Library", "Application Support", "com.anthropic.claudefordesktop"),
        ];
    }
    if (process.platform === "win32") {
        const sys = process.env.SystemRoot ?? "C:\\Windows";
        const pf = process.env.ProgramFiles ?? "C:\\Program Files";
        const pf86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
        const local = process.env.LOCALAPPDATA ?? h("AppData", "Local");
        const roaming = process.env.APPDATA ?? h("AppData", "Roaming");
        return [
            ...common, sys, pf, pf86, "C:\\ProgramData",
            path.join(local, "Google"), path.join(local, "Microsoft", "Edge"), path.join(roaming, "Mozilla"),
            path.join(local, "Microsoft", "Credentials"), path.join(roaming, "Microsoft", "Credentials"),
            path.join(roaming, "Microsoft", "Protect"), path.join(local, "Microsoft", "Vault"),
            path.join(roaming, "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
            path.join(roaming, "Claude"), path.join(local, "AnthropicClaude"),
        ];
    }
    return [...common, "/etc", "/usr", "/bin", "/sbin", "/boot", "/root", "/var", h(".config", "google-chrome"), h(".mozilla"), h(".local", "share", "keyrings")];
}
/** File names that are secrets wherever they live. Checked on read and write. */
const SENSITIVE_NAME = /(^|[._-])(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.pub)?$|\.(pem|key|p12|pfx|kdbx|kdb|keychain|keychain-db|ppk|asc|gpg|jks|ovpn)$|^\.env(\..*)?$|^(credentials|secrets?|passwords?|wallet)(\.[a-z0-9]+)?$|\.wallet$|seed[-_ ]?phrase/i;
/** Things that run when double-clicked. Never written in Simple mode. */
const EXECUTABLE_EXT = /\.(exe|msi|msp|bat|cmd|com|scr|pif|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|url|reg|inf|scf|cpl|dll|sys|jar|py|pyw|rb|pl|sh|bash|zsh|command|tool|app|pkg|dmg|scpt|applescript|workflow|action|terminal|desktop|appimage|run|bin|plist|xpi|crx)$/i;
const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
export function isSensitiveName(p) {
    return SENSITIVE_NAME.test(path.basename(p));
}
export function isExecutableName(p) {
    return EXECUTABLE_EXT.test(path.basename(p));
}
/** Rejects path shapes that smuggle something past a plain-folder check. */
export function rejectOddPaths(p) {
    if (p.includes("\0"))
        throw new PolicyError("The path contains a NUL character.");
    if (/^\\\\|^\/\//.test(p))
        throw new PolicyError("Network paths are not allowed.");
    if (process.platform === "win32") {
        const rest = p.replace(/^[a-zA-Z]:/, "");
        if (rest.includes(":"))
            throw new PolicyError("Alternate data streams are not allowed.");
        for (const part of rest.split(/[\\/]/)) {
            if (!part)
                continue;
            if (WIN_RESERVED.test(part))
                throw new PolicyError(`"${part}" is a reserved device name.`);
            if (/[. ]$/.test(part))
                throw new PolicyError("Names ending with a dot or space are not allowed.");
        }
    }
}
/** Absolute, `~`-expanded path with symlinks (and Windows short names) resolved as far as the path exists. */
export async function realize(p) {
    rejectOddPaths(p);
    let abs = path.resolve(expandHome(p));
    let suffix = [];
    for (;;) {
        try {
            const real = await realpathNative(abs);
            return suffix.length ? path.join(real, ...suffix) : real;
        }
        catch {
            const parent = path.dirname(abs);
            if (parent === abs)
                return path.join(abs, ...suffix);
            suffix.unshift(path.basename(abs));
            abs = parent;
        }
    }
}
export function isInside(parent, child) {
    const rel = path.relative(norm(parent), norm(child));
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
export async function classify(p, cfg) {
    const real = await realize(p);
    const forbidden = [...builtinForbidden(), ...cfg.forbiddenFolders];
    for (const f of forbidden) {
        const rf = await realize(f);
        if (isInside(rf, real))
            return { zone: "forbidden", path: real };
    }
    if (isSensitiveName(real))
        return { zone: "forbidden", path: real };
    for (const w of cfg.writeFolders)
        if (isInside(await realize(w), real))
            return { zone: "write", path: real };
    for (const r of cfg.readFolders)
        if (isInside(await realize(r), real))
            return { zone: "read", path: real };
    return { zone: "outside", path: real };
}
export function pretty(p) {
    return isInside(HOME, p) ? "~" + p.slice(HOME.length) : p;
}
export async function requireReadable(p, cfg) {
    const c = await classify(p, cfg);
    if (c.zone === "forbidden")
        throw new PolicyError(`${pretty(c.path)} is off limits: it may hold passwords, keys or system files.`);
    if (c.zone === "outside")
        throw new PolicyError(`${pretty(c.path)} is outside the folders the user opened to the AI (${cfg.readFolders.map(pretty).join(", ")}). Ask the user to add it in the extension settings.`);
    return c.path;
}
/**
 * Checks a path the AI wants to change. Beyond the zone:
 * - no hidden files or folders (dotfiles) in Simple mode
 * - nothing that runs on double-click in Simple mode
 * - the final name must not be a symlink or a hard link to somewhere else (they would change a file outside the zone)
 */
export async function requireWritable(p, cfg) {
    const c = await classify(p, cfg);
    if (c.zone === "forbidden")
        throw new PolicyError(`${pretty(c.path)} is off limits: it may hold passwords, keys or system files.`);
    if (c.zone !== "write")
        throw new PolicyError(`The AI may only change files inside ${cfg.writeFolders.map(pretty).join(" and ")}. ${pretty(c.path)} is read-only. Save the result into one of those folders instead, or ask the user to open this folder for changes.`);
    let root = c.path;
    for (const w of cfg.writeFolders) {
        const rw = await realize(w);
        if (isInside(rw, c.path)) {
            root = rw;
            break;
        }
    }
    const rel = path.relative(root, c.path);
    if (cfg.mode === "simple") {
        if (rel.split(/[\\/]/).some((part) => part.startsWith(".")))
            throw new PolicyError(`${pretty(c.path)} is a hidden file or folder; the AI does not change hidden items.`);
        if (isExecutableName(c.path))
            throw new PolicyError(`${pretty(c.path)} is a program or script; the AI does not create or change programs. Use a plain text, document or data file instead.`);
    }
    const st = await fs.lstat(c.path).catch(() => null);
    if (st?.isSymbolicLink())
        throw new PolicyError(`${pretty(c.path)} is a link to another place and is left alone.`);
    if (st?.isFile() && st.nlink > 1)
        throw new PolicyError(`${pretty(c.path)} is shared with another location (hard link) and is left alone.`);
    return c.path;
}
//# sourceMappingURL=paths.js.map