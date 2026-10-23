import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Config } from "../config.js";
import type { Journal } from "../journal/journal.js";
import { PolicyError } from "../policy/paths.js";
import { ApprovalRequired } from "../policy/approvals.js";
import { logActivity } from "../activity/log.js";

export interface Ctx { server: McpServer; cfg: Config; journal: Journal }

export type ToolResult = { content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>; isError?: boolean };

export const text = (t: string): ToolResult => ({ content: [{ type: "text", text: t }] });

/** Runs a tool body, turns policy/approval errors into friendly messages and logs the outcome. */
export async function run(tool: string, summary: string, body: () => Promise<ToolResult | string>): Promise<ToolResult> {
  try {
    const r = await body();
    const res = typeof r === "string" ? text(r) : r;
    await logActivity({ tool, text: summary, ok: true });
    return res;
  } catch (e: any) {
    const msg = e instanceof PolicyError || e instanceof ApprovalRequired ? e.message : `Could not ${summary}: ${e?.message ?? e}`;
    await logActivity({ tool, text: `${summary} — ${msg}`, ok: false });
    return { content: [{ type: "text", text: msg }], isError: true };
  }
}

export function human(bytes: number): string {
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${u[i]}`;
}
