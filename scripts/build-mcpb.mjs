#!/usr/bin/env node
// Cross-platform bundle build: assembles build/bundle and packs build/desktop-steward-<platform>.mcpb.
// The bundle is platform-specific because @vscode/ripgrep ships one binary per platform.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

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

// Icon: PNG from SVG where a renderer exists; fall back to a committed PNG.
const svg = path.join(root, "mcpb", "icon.svg");
const pngCommitted = path.join(root, "mcpb", "icon.png");
const pngOut = path.join(bundle, "icon.png");
if (process.platform === "darwin") {
  try {
    run(`qlmanage -t -s 512 -o "${path.join(root, "build")}" "${svg}" >/dev/null 2>&1`);
    fs.renameSync(path.join(root, "build", "icon.svg.png"), pngOut);
  } catch {}
}
if (!fs.existsSync(pngOut) && fs.existsSync(pngCommitted)) fs.copyFileSync(pngCommitted, pngOut);
if (process.platform === "darwin" && fs.existsSync(pngOut)) {
  const set = path.join(root, "build", "icon.iconset");
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set, { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) run(`sips -z ${s} ${s} "${pngOut}" --out "${path.join(set, `icon_${s}x${s}.png`)}" >/dev/null`);
  fs.copyFileSync(path.join(set, "icon_32x32.png"), path.join(set, "icon_16x16@2x.png"));
  fs.copyFileSync(path.join(set, "icon_512x512.png"), path.join(set, "icon_256x256@2x.png"));
  run(`iconutil -c icns "${set}" -o "${path.join(bundle, "icon.icns")}"`);
}

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
