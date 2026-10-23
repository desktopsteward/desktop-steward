import { test } from "node:test";
import assert from "node:assert/strict";
import { shrinkImage, REMOTE_IMAGE_LIMIT } from "../dist/extras/shrink.js";

test("shrinkImage leaves small images alone and scales big ones under the limit", { skip: process.platform === "linux" ? "no resizer on linux" : false }, async () => {
  const tiny = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64").toString("base64");
  const same = await shrinkImage(tiny, "image/png");
  assert.equal(same.data, tiny);
  // Build a large noisy PNG (3000×3000) with zlib-stored rows so it is well over the limit.
  const { deflateSync } = await import("node:zlib");
  const w = 3000, h = 3000, raw = Buffer.alloc((w * 3 + 1) * h);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 2654435761) >>> 24;
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
  assert.ok(png.length > REMOTE_IMAGE_LIMIT);
  const small = await shrinkImage(png.toString("base64"), "image/png");
  assert.ok(small, "resizer available");
  assert.equal(small.mimeType, "image/jpeg");
  assert.ok(Buffer.from(small.data, "base64").length <= REMOTE_IMAGE_LIMIT);
});
