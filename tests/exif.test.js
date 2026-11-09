import assert from "node:assert";
import sharp from "sharp";
import { addStickerMetadata } from "../src/services/exif.js";

const dummyWebp = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).webp().toBuffer();

const withExif = addStickerMetadata(dummyWebp, "Stiker TikTok", "TikTok to WA");

assert(withExif instanceof Buffer, "Result must be a Buffer");
assert.strictEqual(withExif.subarray(0, 4).toString(), "RIFF", "File must begin with RIFF");
assert.strictEqual(withExif.subarray(8, 12).toString(), "WEBP", "File must have WEBP signature");
assert(withExif.includes(Buffer.from("Stiker TikTok")), "Metadata pack name must be present in buffer");
assert(withExif.includes(Buffer.from("TikTok to WA")), "Metadata author must be present in buffer");
assert(withExif.includes(Buffer.from("EXIF")), "EXIF chunk header must be present in buffer");

console.log("EXIF metadata tests passed!");

