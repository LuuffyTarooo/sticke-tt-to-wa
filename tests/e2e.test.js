import assert from "node:assert";
import { app } from "../src/server.js";

const server = app.listen(0);
const port = server.address().port;

try {
  console.log("Menjalankan pengujian End-to-End (E2E) langsung ke link TikTok...");
  const startTime = Date.now();

  const response = await fetch(`http://localhost:${port}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.tiktok.com/@kiwooyyo/video/7699857497426971925?share_comment_id=7700577294884750081",
      packName: "Meme TikTok",
      author: "Test Suite"
    })
  });

  const duration = Date.now() - startTime;
  console.log(`Waktu pemrosesan E2E: ${duration} ms`);

  const json = await response.json();
  assert.strictEqual(json.success, true, `API call failed: ${json.error}`);
  assert(json.stickerId, "Must return stickerId");
  assert(json.downloadUrl, "Must return downloadUrl");
  assert(json.previewBase64.startsWith("data:image/webp;base64,"), "Preview must be WebP data URI");
  assert(json.sizeBytes <= 100 * 1024, "Size must be <= 100 KB");

  // Unduh stiker langsung dari endpoint
  const downloadRes = await fetch(`http://localhost:${port}${json.downloadUrl}`);
  assert.strictEqual(downloadRes.status, 200, "Download must return HTTP 200");
  assert.strictEqual(downloadRes.headers.get("content-type"), "image/webp");

  const buffer = Buffer.from(await downloadRes.arrayBuffer());
  assert.strictEqual(buffer.subarray(0, 4).toString(), "RIFF");
  assert.strictEqual(buffer.subarray(8, 12).toString(), "WEBP");
  assert(buffer.includes(Buffer.from("Meme TikTok")), "Pack name metadata must exist in downloaded file");

  console.log("🎉 Pengujian End-to-End (E2E) BERHASIL 100%!");
  console.log(`- Stiker ID: ${json.stickerId}`);
  console.log(`- Ukuran Stiker: ${(json.sizeBytes / 1024).toFixed(1)} KB`);
  console.log(`- Total Latensi: ${duration} ms`);

} finally {
  server.close();
}

