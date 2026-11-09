import assert from "node:assert";
import { 
  normalizeEvil0ctalResponse, 
  buildEvil0ctalHeaders,
  extractStickerFromEvil0ctalComments
} from "../src/services/evil0ctal.js";

console.log("Menjalankan pengujian Evil0ctal Douyin_TikTok_Download_API service...");

// Test 1: Header building (dengan dan tanpa API key)
const headersNoKey = buildEvil0ctalHeaders();
assert.strictEqual(headersNoKey["Accept"], "application/json");
assert.strictEqual(headersNoKey["Authorization"], undefined);

const headersWithKey = buildEvil0ctalHeaders("dtk_secret_key_123");
assert.strictEqual(headersWithKey["Authorization"], "Bearer dtk_secret_key_123");

// Test 2: Normalize response dari berbagai format Evil0ctal API
const respFormatV5 = {
  status_code: 200,
  message: "success",
  data: {
    comments: [
      { cid: "111", text: "Kucing lucu", user: { nickname: "CatLover", uid: "u1" } }
    ],
    cursor: 20,
    has_more: 1
  }
};
const normalizedV5 = normalizeEvil0ctalResponse(respFormatV5);
assert.strictEqual(normalizedV5.comments.length, 1);
assert.strictEqual(normalizedV5.comments[0].cid, "111");
assert.strictEqual(normalizedV5.cursor, 20);

const respFormatFlat = {
  comments: [
    { cid: "222", text: "Stiker", user: { nickname: "StickerFan", uid: "u2" } }
  ]
};
const normalizedFlat = normalizeEvil0ctalResponse(respFormatFlat);
assert.strictEqual(normalizedFlat.comments.length, 1);
assert.strictEqual(normalizedFlat.comments[0].cid, "222");

// Test 3: Ekstraksi stiker dari list komentar Evil0ctal
const mockComments = [
  {
    cid: "333",
    text: "Teks saja",
    user: { nickname: "TextUser" }
  },
  {
    cid: "444",
    text: "Ada stiker",
    user: { nickname: "StickerUser", unique_id: "stick_user", avatar_thumb: { url_list: ["https://avatar.jpg"] } },
    cmt_sticker_struct: {
      animated_url: {
        high_resolution_url: {
          url_list: ["https://p16-tiktok.com/sticker.awebp"]
        }
      }
    }
  }
];

const found = extractStickerFromEvil0ctalComments(mockComments, "444", null);
assert(found, "Harus menemukan komentar dengan stiker");
assert.strictEqual(found.commentId, "444");
assert.strictEqual(found.imageUrl, "https://p16-tiktok.com/sticker.awebp");
assert.strictEqual(found.author, "StickerUser");

console.log("Evil0ctal service tests passed!");

