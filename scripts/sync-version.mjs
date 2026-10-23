// Copies the version from package.json into the manifest, the server, and the site.
import fs from "node:fs";
const v = JSON.parse(fs.readFileSync("package.json", "utf8")).version;
const edit = (f, re, to) => { if (fs.existsSync(f)) fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(re, to)); };
const m = JSON.parse(fs.readFileSync("mcpb/manifest.json", "utf8")); m.version = v; fs.writeFileSync("mcpb/manifest.json", JSON.stringify(m, null, 2) + "\n");
edit("src/version.ts", /VERSION = "[^"]+"/, `VERSION = "${v}"`);
for (const f of ["site/index.html", "site/download/index.html", "site/llms.txt"]) {
  edit(f, /desktop-steward-[0-9.]+-(mac|windows)\.mcpb/g, `desktop-steward-${v}-$1.mcpb`);
  edit(f, /Version [0-9.]+/g, `Version ${v}`);
  edit(f, /"softwareVersion":"[0-9.]+"/g, `"softwareVersion":"${v}"`);
  edit(f, /version [0-9.]+;/g, `version ${v};`);
}
console.log("version", v);
