// Renders mcpb/icon.svg to PNG and (on macOS) an .icns; shared by the bundle and app builds.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const root = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

/** Writes icon.png (and icon.icns on macOS) into outDir; returns the paths that exist. */
export function makeIcons(outDir) {
  const run = (cmd) => execSync(cmd, { cwd: root, stdio: "inherit" });
  const svg = path.join(root, "mcpb", "icon.svg");
  const pngCommitted = path.join(root, "mcpb", "icon.png");
  const png = path.join(outDir, "icon.png");
  const icns = path.join(outDir, "icon.icns");
  fs.mkdirSync(outDir, { recursive: true });
  if (process.platform === "darwin") {
    try {
      run(`qlmanage -t -s 512 -o "${outDir}" "${svg}" >/dev/null 2>&1`);
      fs.renameSync(path.join(outDir, "icon.svg.png"), png);
    } catch {}
  }
  if (!fs.existsSync(png) && fs.existsSync(pngCommitted)) fs.copyFileSync(pngCommitted, png);
  if (process.platform === "darwin" && fs.existsSync(png)) {
    const set = path.join(outDir, "icon.iconset");
    fs.rmSync(set, { recursive: true, force: true });
    fs.mkdirSync(set, { recursive: true });
    for (const s of [16, 32, 128, 256, 512]) run(`sips -z ${s} ${s} "${png}" --out "${path.join(set, `icon_${s}x${s}.png`)}" >/dev/null`);
    fs.copyFileSync(path.join(set, "icon_32x32.png"), path.join(set, "icon_16x16@2x.png"));
    fs.copyFileSync(path.join(set, "icon_512x512.png"), path.join(set, "icon_256x256@2x.png"));
    run(`iconutil -c icns "${set}" -o "${icns}"`);
    fs.rmSync(set, { recursive: true, force: true });
  }
  return { png: fs.existsSync(png) ? png : undefined, icns: fs.existsSync(icns) ? icns : undefined };
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  console.log(makeIcons(path.resolve(process.argv[2] ?? path.join(root, "build", "icons"))));
}
