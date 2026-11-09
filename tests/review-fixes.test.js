import assert from "node:assert";
import sharp from "sharp";
import { addStickerMetadata } from "../src/services/exif.js";
import { extractIds } from "../src/services/tiktok.js";

// Test 1: EXIF chunk on simple WebP (opaque square without VP8X initially)
// Sharp generates simple VP8 (no VP8X) for fully opaque images
const opaqueSimpleWebp = await sharp({
  create: { width: 512, height: 512, channels: 3, background: { r: 100, g: 150, b: 200 } }
}).webp({ effort: 1 }).toBuffer();

const initialFourCC = opaqueSimpleWebp.subarray(12, 16).toString("ascii");
assert.notStrictEqual(initialFourCC, "VP8X", "Initial buffer should be simple WebP (VP8/VP8L)");

const enriched = addStickerMetadata(opaqueSimpleWebp, "My Pack", "My Author");
const enrichedFourCC = enriched.subarray(12, 16).toString("ascii");
assert.strictEqual(enrichedFourCC, "VP8X", "Enriched buffer MUST have VP8X chunk for EXIF compliance");

const parsedMeta = await sharp(enriched).metadata();
assert(parsedMeta.exif, "Sharp metadata must recognize EXIF chunk");

// Test 2: TikTok /photo/ URL and missing https://, with comment_author_id
const photoUrl = "www.tiktok.com/@creator/photo/7123456789012345678?share_comment_id=987654321&comment_author_id=555444333";
const ids = extractIds(photoUrl);
assert.strictEqual(ids.videoId, "7123456789012345678", "Must extract ID from photo posts");
assert.strictEqual(ids.commentId, "987654321", "Must extract commentId");
assert.strictEqual(ids.commentAuthorId, "555444333", "Must extract commentAuthorId");

console.log("Review fixes tests passed!");

