import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { HISTORY_DIR, TRASH_DIR } from "../config.js";
const newId = () => `${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
async function exists(p) {
    return fs.access(p).then(() => true, () => false);
}
/** Moves across devices fall back to copy + delete. */
export async function moveAnywhere(from, to) {
    await fs.mkdir(path.dirname(to), { recursive: true });
    try {
        await fs.rename(from, to);
    }
    catch (e) {
        if (e?.code !== "EXDEV")
            throw e;
        await fs.cp(from, to, { recursive: true, force: false, errorOnExist: true });
        await fs.rm(from, { recursive: true });
    }
}
export class Journal {
    /** Keep a copy of a file that is about to be changed. Returns the snapshot path, or undefined if the file does not exist yet. */
    async snapshot(id, filePath) {
        if (!(await exists(filePath)))
            return undefined;
        const st = await fs.stat(filePath);
        if (!st.isFile())
            return undefined;
        const dir = path.join(HISTORY_DIR, id);
        await fs.mkdir(dir, { recursive: true });
        const dest = path.join(dir, `${crypto.createHash("sha1").update(filePath).digest("hex").slice(0, 8)}-${path.basename(filePath)}`);
        await fs.copyFile(filePath, dest);
        return dest;
    }
    /** Put a file or folder into the app's own trash; returns where it is kept. */
    async toTrash(id, filePath) {
        const dir = path.join(TRASH_DIR, id);
        await fs.mkdir(dir, { recursive: true });
        let dest = path.join(dir, path.basename(filePath));
        let n = 1;
        while (await exists(dest))
            dest = path.join(dir, `${n++}-${path.basename(filePath)}`);
        await moveAnywhere(filePath, dest);
        return dest;
    }
    newId() {
        return newId();
    }
    async stamp(item, p) {
        try {
            const st = await fs.stat(p);
            item.resultMtime = st.mtimeMs;
            item.resultSize = st.size;
        }
        catch {
            /* file gone */
        }
    }
    async record(entry) {
        const full = { time: new Date().toISOString(), ...entry };
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        await fs.writeFile(path.join(HISTORY_DIR, `${entry.id}.json`), JSON.stringify(full, null, 2));
        return full;
    }
    async list(limit = 20) {
        await fs.mkdir(HISTORY_DIR, { recursive: true });
        const names = (await fs.readdir(HISTORY_DIR)).filter((n) => n.endsWith(".json"));
        const entries = [];
        for (const n of names) {
            try {
                entries.push(JSON.parse(await fs.readFile(path.join(HISTORY_DIR, n), "utf8")));
            }
            catch {
                /* skip corrupt */
            }
        }
        entries.sort((a, b) => (a.time < b.time ? 1 : -1));
        return entries.slice(0, limit);
    }
    async get(id) {
        try {
            return JSON.parse(await fs.readFile(path.join(HISTORY_DIR, `${id}.json`), "utf8"));
        }
        catch {
            return undefined;
        }
    }
    /** Reverts one entry. Returns plain-language lines describing what happened. */
    async undo(id) {
        const entry = id ? await this.get(id) : (await this.list(50)).find((e) => !e.undone);
        if (!entry)
            return { lines: ["Nothing to undo."] };
        if (entry.undone)
            return { entry, lines: ["This change was already undone."] };
        const lines = [];
        const unchanged = async (p, item) => {
            if (item.resultMtime === undefined)
                return true;
            try {
                const st = await fs.stat(p);
                return Math.abs(st.mtimeMs - item.resultMtime) < 2 && st.size === item.resultSize;
            }
            catch {
                return false;
            }
        };
        for (const item of entry.items) {
            try {
                switch (entry.action) {
                    case "write":
                    case "edit": {
                        if (item.snapshot) {
                            if (!(await unchanged(item.path, item))) {
                                lines.push(`Skipped ${item.path}: it was changed again after this step, so the old copy was not restored. The copy is kept at ${item.snapshot}.`);
                                break;
                            }
                            await fs.copyFile(item.snapshot, item.path);
                            lines.push(`Restored the previous version of ${item.path}.`);
                        }
                        else {
                            if (!(await unchanged(item.path, item))) {
                                lines.push(`Skipped ${item.path}: it was changed after being created.`);
                                break;
                            }
                            await fs.rm(item.path, { force: true });
                            lines.push(`Removed ${item.path} (it was created by this step).`);
                        }
                        break;
                    }
                    case "move": {
                        if (!item.to)
                            break;
                        if (await exists(item.path)) {
                            lines.push(`Skipped ${item.to}: something already exists at the original place ${item.path}.`);
                            break;
                        }
                        await moveAnywhere(item.to, item.path);
                        lines.push(`Moved ${item.to} back to ${item.path}.`);
                        break;
                    }
                    case "delete": {
                        if (!item.trash)
                            break;
                        if (await exists(item.path)) {
                            lines.push(`Skipped ${item.path}: something already exists there. The deleted copy is kept at ${item.trash}.`);
                            break;
                        }
                        await moveAnywhere(item.trash, item.path);
                        lines.push(`Brought back ${item.path}.`);
                        break;
                    }
                    case "unzip": {
                        // The extracted folder goes to the holding area whole.
                        if (!(await exists(item.path)))
                            break;
                        const kept = await this.toTrash(entry.id, item.path);
                        lines.push(`Moved the extracted folder ${item.path} to the holding area (${kept}).`);
                        break;
                    }
                    case "mkdir": {
                        const left = await fs.readdir(item.path).catch(() => null);
                        if (left === null)
                            break;
                        if (left.length) {
                            lines.push(`Kept folder ${item.path}: it is not empty.`);
                            break;
                        }
                        await fs.rmdir(item.path);
                        lines.push(`Removed empty folder ${item.path}.`);
                        break;
                    }
                }
            }
            catch (e) {
                lines.push(`Could not undo ${item.path}: ${e?.message ?? e}`);
            }
        }
        entry.undone = true;
        await this.record(entry);
        return { entry, lines };
    }
    /** Drops history and trash older than keepDays. */
    async cleanup(keepDays) {
        const cutoff = Date.now() - keepDays * 86_400_000;
        for (const e of await this.list(10_000)) {
            if (new Date(e.time).getTime() > cutoff)
                continue;
            await fs.rm(path.join(HISTORY_DIR, e.id), { recursive: true, force: true });
            await fs.rm(path.join(TRASH_DIR, e.id), { recursive: true, force: true });
            await fs.rm(path.join(HISTORY_DIR, `${e.id}.json`), { force: true });
        }
    }
}
//# sourceMappingURL=journal.js.map