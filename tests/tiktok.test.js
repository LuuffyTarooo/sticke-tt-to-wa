import assert from "node:assert";
import { extractIds, resolveTikTokUrl, fetchTikTokStickerComment } from "../src/services/tiktok.js";

// Test 1: extractIds
const sampleUrl = "https://www.tiktok.com/@kiwooyyo/video/7699857497426971925?share_comment_id=7700577294884750081";
const { videoId, commentId } = extractIds(sampleUrl);

assert.strictEqual(videoId, "7699857497426971925", "Video ID mismatch");
assert.strictEqual(commentId, "7700577294884750081", "Comment ID mismatch");

// Test 2: fetchTikTokStickerComment
const data = await fetchTikTokStickerComment(sampleUrl);
assert(data.imageUrl && data.imageUrl.startsWith("http"), "Image URL must be valid HTTP URL");
assert(typeof data.author === "string" && data.author.length > 0, "Author must be present");
assert.strictEqual(data.commentId, "7700577294884750081");

console.log("TikTok service tests passed!");

