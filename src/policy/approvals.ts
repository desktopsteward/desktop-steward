import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { t } from "./i18n.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export class ApprovalRequired extends Error {}

/**
 * Asks the person before a risky step, through a channel the model cannot fake:
 * 1. the chat app's own confirmation dialog (MCP elicitation), or
 * 2. a native system dialog on this computer (macOS / Windows), or
 * 3. refuse.
 * There is deliberately no "confirmed: true" argument: a model could set it without asking anyone.
 */
export async function confirm(server: McpServer, question: string): Promise<boolean> {
  const caps = server.server.getClientCapabilities();
  if (caps?.elicitation) {
    try {
      const res = await server.server.elicitInput({
        message: question,
        requestedSchema: {
          type: "object",
          properties: { allow: { type: "boolean", title: "Allow this?", description: question } },
          required: ["allow"],
        },
      });
      return res.action === "accept" && (res.content as { allow?: boolean } | undefined)?.allow === true;
    } catch {
      /* fall through to a native dialog */
    }
  }
  const native = await nativeDialog(question);
  if (native !== null) return native;
  throw new ApprovalRequired(`${question} This step needs the user's OK, but there is no way to ask them from here. Tell the user to do it themselves or to enable confirmations in the extension settings.`);
}

// Strip anything that could break out of the quoted dialog text (quotes, backslashes, PowerShell $ and backtick).
const clip = (s: string) => s.replace(/[\\"`$]/g, " ").replace(/[\r\n]+/g, " ").slice(0, 400);

/** Returns true/false from a system dialog, or null when no dialog is possible on this platform. */
function nativeDialog(question: string): Promise<boolean | null> {
  const q = clip(question);
  if (process.platform === "darwin") {
    const icns = fileURLToPath(new URL("../../icon.icns", import.meta.url));
    const icon = existsSync(icns) ? `with icon POSIX file "${icns}"` : "with icon caution";
    const s = t();
    const script = `display dialog "${q}" with title "${s.title}" buttons {"${s.deny}", "${s.allow}"} default button "${s.deny}" cancel button "${s.deny}" ${icon}`;
    return new Promise((resolve) => execFile("osascript", ["-e", script], { timeout: 120_000 }, (err, out) => resolve(err ? false : out.includes(`button returned:${s.allow}`))));
  }
  if (process.platform === "win32") {
    const ps = `Add-Type -AssemblyName PresentationFramework; $r=[System.Windows.MessageBox]::Show("${q}","${t().title}",[System.Windows.MessageBoxButton]::YesNo,[System.Windows.MessageBoxImage]::Warning,[System.Windows.MessageBoxResult]::No); if($r -eq "Yes"){"ALLOW"}else{"DENY"}`;
    return new Promise((resolve) => execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 120_000 }, (err, out) => resolve(err ? false : /ALLOW/.test(out))));
  }
  return Promise.resolve(null);
}
