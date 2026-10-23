#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, ensureDirs } from "./config.js";
import { Journal } from "./journal/journal.js";
import { registerFileTools } from "./tools/files.js";
import { registerSearchTools } from "./tools/search.js";
import { registerHistoryTools, describeRules } from "./tools/history.js";
import { registerPrompts } from "./prompts.js";
import { registerExtras } from "./extras/index.js";

const VERSION = "0.2.0";

/** Builds a fully registered MCP server. Used for the stdio session and, separately, for a remote session. */
export function createServer(cfg: Awaited<ReturnType<typeof loadConfig>>, journal: Journal, version = VERSION): McpServer {
  const server = new McpServer(
    { name: "desktop-steward", version },
    {
      instructions: [
        "Desktop Steward gives you safe hands on the user's computer. Rules the user set:",
        describeRules(cfg),
        "Before changing many files, say what you are about to do. Prefer moving and renaming over deleting.",
        "Risky steps (deleting, replacing, moving many files) open a confirmation window on the user's computer; the tool waits for their answer. If the user declines, do not retry, ask what they want instead.",
        "After changes, mention that they can be undone with the undo tool.",
      ].join("\n"),
    },
  );
  const ctx = { server, cfg, journal };
  registerFileTools(ctx);
  registerSearchTools(ctx);
  registerHistoryTools(ctx);
  registerPrompts(ctx);
  return server;
}

async function main() {
  const cfg = await loadConfig();
  await ensureDirs(cfg);
  const journal = new Journal();
  journal.cleanup(cfg.keepHistoryDays).catch(() => {});

  const server = createServer(cfg, journal, VERSION);
  const ctx = { server, cfg, journal };
  registerExtras(ctx);

  server.server.oninitialized = () => {
    // Goes to the chat app's log for this extension; tells us whether the client can show confirmation dialogs.
    const client = server.server.getClientVersion();
    const caps = server.server.getClientCapabilities();
    console.error(`desktop-steward ${VERSION}: client ${client?.name ?? "?"} ${client?.version ?? ""}, elicitation=${caps?.elicitation ? "yes" : "no"}, mode=${cfg.mode}`);
  };
  await server.connect(new StdioServerTransport());
}

main().catch((e) => {
  console.error("desktop-steward failed to start:", e);
  process.exit(1);
});
