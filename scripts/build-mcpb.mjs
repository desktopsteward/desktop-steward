#!/usr/bin/env node
// Cross-platform bundle build: assembles build/bundle and packs build/desktop-steward-<platform>.mcpb.
// The bundle is platform-specific because @vscode/ripgrep ships one binary per platform.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { makeIcons } from "./icon.mjs";

const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const run = (cmd, cwd = root) => execSync(cmd, { cwd, stdio: "inherit" });
const platform = process.platform === "win32" ? "win32" : process.platform === "darwin" ? "darwin" : "linux";
const bundle = path.join(root, "build", "bundle");

run("npm run build");
fs.rmSync(bundle, { recursive: true, force: true });
fs.mkdirSync(bundle, { recursive: true });
fs.cpSync(path.join(root, "dist"), path.join(bundle, "dist"), { recursive: true });
fs.copyFileSync(path.join(root, "package.json"), path.join(bundle, "package.json"));

const manifest = JSON.parse(fs.readFileSync(path.join(root, "mcpb", "manifest.json"), "utf8"));
manifest.compatibility.platforms = [platform];
fs.writeFileSync(path.join(bundle, "manifest.json"), JSON.stringify(manifest, null, 2));

// Icon: PNG from SVG where a renderer exists, plus .icns on macOS (used by the confirmation dialogs).
const icons = makeIcons(path.join(root, "build", "icons"));
if (icons.png) fs.copyFileSync(icons.png, path.join(bundle, "icon.png"));
if (icons.icns) fs.copyFileSync(icons.icns, path.join(bundle, "icon.icns"));

run("npm install --omit=dev --no-audit --no-fund --silent", bundle);
const out = path.join(root, "build", `desktop-steward-${manifest.version}-${platform === "darwin" ? "mac" : platform === "win32" ? "windows" : "linux"}.mcpb`);
run(`npx -y @anthropic-ai/mcpb pack "${bundle}" "${out}"`);
// Signing is opt-in (DESKTOP_STEWARD_SIGN=1) until Claude Desktop can verify signatures: as of Oct 2026 its
// verifier (node-forge pkcs7.verify) is an unimplemented stub, so every signed bundle reads as "unsigned"
// (modelcontextprotocol/mcpb issues #276/#277) and signed zips can even be rejected on install (#278).
const signDir = process.env.DESKTOP_STEWARD_SIGNING_DIR ?? path.join(process.env.HOME ?? "", ".config", "desktop-steward", "signing");
if (process.env.DESKTOP_STEWARD_SIGN === "1" && ["cert.pem", "key.pem", "DeveloperIDG2CA.pem"].every((f) => fs.existsSync(path.join(signDir, f)))) {
  run(`npx -y @anthropic-ai/mcpb sign "${out}" -c "${path.join(signDir, "cert.pem")}" -k "${path.join(signDir, "key.pem")}" -i "${path.join(signDir, "DeveloperIDG2CA.pem")}"`);
  run(`npx -y @anthropic-ai/mcpb verify "${out}"`);
} else {
  console.log("not signed (set DESKTOP_STEWARD_SIGN=1 once Claude Desktop verifies signatures)");
}
console.log("bundle:", out);
