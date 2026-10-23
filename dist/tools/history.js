import { z } from "zod";
import { pretty } from "../policy/paths.js";
import { recentActivity } from "../activity/log.js";
import { run } from "./shared.js";
export function describeRules(cfg) {
    const modeText = { simple: "Simple: files only, no terminal.", standard: "Standard: files plus approved commands.", expert: "Expert: full access with undo." }[cfg.mode];
    return [
        `Mode — ${modeText}`,
        `The AI can read and search: ${cfg.readFolders.map(pretty).join(", ")}`,
        `The AI can change files in: ${cfg.writeFolders.map(pretty).join(", ")}`,
        `Always asks first: deleting anything${cfg.askBeforeDelete ? "" : " (turned off by the user)"}, replacing an existing file, moving more than ${cfg.confirmThreshold} items.`,
        "Never touches: passwords, keys, browser data, mail, system folders.",
        `Every change can be undone for ${cfg.keepHistoryDays} days.`,
    ].join("\n");
}
export function registerHistoryTools(ctx) {
    const { server, cfg, journal } = ctx;
    server.registerTool("undo", { title: "Undo", description: "Reverts the last change made by the AI, or a specific one by its undo id. Works for written, edited, moved and deleted files.", inputSchema: { id: z.string().optional() } }, async ({ id }) => run("undo", id ? `undo ${id}` : "undo last change", async () => {
        const { entry, lines } = await journal.undo(id);
        return entry ? [`Undid: ${entry.summary} (${entry.time.slice(0, 16).replace("T", " ")})`, ...lines].join("\n") : lines.join("\n");
    }));
    server.registerTool("history", { title: "What the AI did", description: "Lists recent changes with their undo ids, and recent activity.", inputSchema: { limit: z.number().int().min(1).max(100).default(20) } }, async ({ limit }) => run("history", "show history", async () => {
        const entries = await journal.list(limit);
        const acts = await recentActivity(limit);
        return [
            "Changes (newest first):",
            ...(entries.length ? entries.map((e) => `  ${e.time.slice(0, 16).replace("T", " ")}  ${e.summary}${e.undone ? "  [undone]" : ""}  id: ${e.id}`) : ["  none yet"]),
            "", "Recent activity:",
            ...(acts.length ? acts.reverse().map((a) => `  ${a.time.slice(11, 16)}  ${a.ok ? "✓" : "✗"} ${a.text}`) : ["  none yet"]),
        ].join("\n");
    }));
    server.registerTool("show_rules", { title: "Show the rules", description: "Explains in plain words what the AI may and may not do on this computer right now.", inputSchema: {} }, async () => run("show_rules", "show rules", async () => describeRules(cfg)));
}
//# sourceMappingURL=history.js.map