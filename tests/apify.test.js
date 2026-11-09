import assert from "node:assert";
import {
  extractMediaFromApifyItem,
  extractStickerFromApifyDataset,
  fetchTikTokStickerCommentApify
} from "../src/services/apify.js";

// Test 1: extractMediaFromApifyItem
const itemImagesString = { id: "1", images: ["https://example.com/cat.jpg"] };
assert.strictEqual(extractMediaFromApifyItem(itemImagesString), "https://example.com/cat.jpg");

const itemImagesObj = { id: "2", images: [{ url: "https://example.com/cat-obj.png" }] };
assert.strictEqual(extractMediaFromApifyItem(itemImagesObj), "https://example.com/cat-obj.png");

const itemSticker = { id: "3", sticker: "https://example.com/sticker.awebp" };
assert.strictEqual(extractMediaFromApifyItem(itemSticker), "https://example.com/sticker.awebp");

const itemStickerObj = { id: "4", sticker: { url: "https://example.com/sticker-obj.webp" } };
assert.strictEqual(extractMediaFromApifyItem(itemStickerObj), "https://example.com/sticker-obj.webp");

const itemMediaUrl = { id: "5", mediaUrl: "https://example.com/media.webp" };
assert.strictEqual(extractMediaFromApifyItem(itemMediaUrl), "https://example.com/media.webp");

const itemEmpty = { id: "6", text: "hanya teks biasa tanpa stiker" };
assert.strictEqual(extractMediaFromApifyItem(itemEmpty), null);

// Test 2: Strict Exact Matching in extractStickerFromApifyDataset
const dataset = [
  {
    id: "comment_1",
    text: "Teks komentar tanpa stiker",
    user: { id: "user_1", uniqueId: "user1", nickname: "User 1" }
  },
  {
    id: "comment_2",
    text: "Stiker dari User 2",
    images: ["https://example.com/user2-sticker.jpg"],
    user: { id: "user_2", uniqueId: "user2", nickname: "User 2" }
  },
  {
    id: "comment_3",
    text: "Stiker dari User 3",
    images: ["https://example.com/user3-sticker.jpg"],
    user: { id: "user_3", uniqueId: "user3", nickname: "User 3" }
  }
];

// 2A: Cari comment_2 spesifik -> harus dapat stiker User 2
const hit2 = extractStickerFromApifyDataset(dataset, "comment_2");
assert(hit2, "Must find comment_2");
assert.strictEqual(hit2.commentId, "comment_2");
assert.strictEqual(hit2.imageUrl, "https://example.com/user2-sticker.jpg");

// 2B: Cari comment_1 (hanya teks) -> STRICT: tidak boleh comot stiker milik comment_2 atau comment_3!
const hit1 = extractStickerFromApifyDataset(dataset, "comment_1");
assert.strictEqual(hit1, null, "Strict match must return null for text-only target, NEVER steal stranger's sticker!");

// 2C: Cari berdasarkan commentAuthorId user_3
const hitAuthor = extractStickerFromApifyDataset(dataset, "unknown_cid", "user_3");
assert(hitAuthor, "Must find author user_3");
assert.strictEqual(hitAuthor.imageUrl, "https://example.com/user3-sticker.jpg");

// 2D: Tautan umum tanpa commentId -> ambil stiker pertama
const hitGeneric = extractStickerFromApifyDataset(dataset, null);
assert(hitGeneric, "Generic video link takes first available sticker");
assert.strictEqual(hitGeneric.commentId, "comment_2");

// Test 3: Validasi token wajib
try {
  await fetchTikTokStickerCommentApify("https://www.tiktok.com/@user/video/7691503339908943125", { apifyToken: "" });
  assert.fail("Should throw if token is missing");
} catch (err) {
  assert(err.message.includes("Token") || err.message.includes("Apify"));
}

console.log("Apify service tests passed!");

