import assert from "node:assert";
import sharp from "sharp";
import { convertToWaSticker, createTextStickerBuffer } from "../src/services/image.js";

// Buat dummy buffer JPEG 720x578 (non-square, aspect ratio mirip TikTok sticker)
const dummy = await sharp({
  create: { width: 720, height: 578, channels: 3, background: { r: 255, g: 0, b: 0 } }
}).jpeg().toBuffer();

const stickerBuffer = await convertToWaSticker(dummy);
const meta = await sharp(stickerBuffer).metadata();

assert.strictEqual(meta.format, "webp", "Output format must be webp");
assert.strictEqual(meta.width, 512, "Width must be 512");
assert.strictEqual(meta.height, 512, "Height must be 512");
assert(stickerBuffer.length <= 100 * 1024, "Size must be <= 100KB for static sticker");

// Test createTextStickerBuffer
const textSticker = await createTextStickerBuffer("[Sticker] awas awas bini gw itu");
const textMeta = await sharp(textSticker).metadata();
assert.strictEqual(textMeta.format, "webp", "Text sticker must be webp");
assert.strictEqual(textMeta.width, 512, "Width must be 512");
assert.strictEqual(textMeta.height, 512, "Height must be 512");
assert(textSticker.length <= 100 * 1024, "Text sticker must be <= 100KB");

console.log("Image converter tests passed! Size:", stickerBuffer.length, "bytes, text sticker:", textSticker.length, "bytes");

