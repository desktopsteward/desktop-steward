import { PolicyError } from "../policy/paths.js";
import { ApprovalRequired } from "../policy/approvals.js";
import { logActivity } from "../activity/log.js";
export const text = (t) => ({ content: [{ type: "text", text: t }] });
/** Runs a tool body, turns policy/approval errors into friendly messages and logs the outcome. */
export async function run(tool, summary, body) {
    try {
        const r = await body();
        const res = typeof r === "string" ? text(r) : r;
        await logActivity({ tool, text: summary, ok: true });
        return res;
    }
    catch (e) {
        const msg = e instanceof PolicyError || e instanceof ApprovalRequired ? e.message : `Could not ${summary}: ${e?.message ?? e}`;
        await logActivity({ tool, text: `${summary} — ${msg}`, ok: false });
        return { content: [{ type: "text", text: msg }], isError: true };
    }
}
export function human(bytes) {
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < u.length - 1) {
        n /= 1024;
        i++;
    }
    return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
//# sourceMappingURL=shared.js.map