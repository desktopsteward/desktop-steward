import fs from "node:fs/promises";
import { ACTIVITY_FILE } from "../config.js";
export async function logActivity(e) {
    const line = JSON.stringify({ time: new Date().toISOString(), ...e });
    await fs.appendFile(ACTIVITY_FILE, line + "\n").catch(() => { });
}
export async function recentActivity(limit = 30) {
    try {
        const lines = (await fs.readFile(ACTIVITY_FILE, "utf8")).trim().split("\n").filter(Boolean);
        return lines.slice(-limit).map((l) => JSON.parse(l));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=log.js.map