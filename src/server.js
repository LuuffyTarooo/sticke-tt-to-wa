// src/server.js
import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { fetchTikTokStickerComment } from "./services/tiktok.js";
import { fetchTikTokStickerCommentEvil0ctal } from "./services/evil0ctal.js";
import { fetchTikTokStickerCommentApify, DEFAULT_APIFY_TOKEN } from "./services/apify.js";
import { convertToWaSticker, downloadImageBuffer } from "./services/image.js";
import { addStickerMetadata } from "./services/exif.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "../public")));

// Cache in-memory untuk menyimpan stiker sementara (TTL 30 menit)
const stickerCache = new Map();

// Bersihkan stiker yang lebih lama dari 30 menit setiap 10 menit
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of stickerCache.entries()) {
    if (now - item.createdAt > 30 * 60 * 1000) {
      stickerCache.delete(id);
    }
  }
}, 10 * 60 * 1000).unref();

// Healthcheck
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Endpoint Konversi Stiker TikTok
app.post("/api/convert", async (req, res) => {
  const { 
    url, 
    packName, 
    author: customAuthor, 
    apiSource = "direct", 
    evil0ctalUrl, 
    evil0ctalKey,
    apifyToken,
    apifyActorId
  } = req.body;

  if (!url || typeof url !== "string" || !url.trim()) {
    return res.status(400).json({
      success: false,
      error: "URL TikTok wajib diisi."
    });
  }

  try {
    // 1. Ekstrak data stiker komentar dari TikTok (pilih Direct API, Apify API, Evil0ctal API, atau Auto)
    let commentData;
    let usedSource = "direct";

    if (apiSource === "apify") {
      usedSource = "apify";
      commentData = await fetchTikTokStickerCommentApify(url.trim(), { apifyToken, apifyActorId });
    } else if (apiSource === "evil0ctal") {
      usedSource = "evil0ctal";
      commentData = await fetchTikTokStickerCommentEvil0ctal(url.trim(), { evil0ctalUrl, evil0ctalKey });
    } else if (apiSource === "auto") {
      try {
        commentData = await fetchTikTokStickerComment(url.trim());
      } catch (directErr) {
        // Fallback otomatis ke Apify jika ada token Apify (termasuk default token), atau ke Evil0ctal jika ada URL Evil0ctal
        const effectiveApifyToken = apifyToken || process.env.APIFY_API_TOKEN || DEFAULT_APIFY_TOKEN;
        if (effectiveApifyToken) {
          usedSource = "apify";
          commentData = await fetchTikTokStickerCommentApify(url.trim(), { apifyToken: effectiveApifyToken, apifyActorId });
        } else if (evil0ctalUrl || process.env.EVIL0CTAL_API_URL) {
          usedSource = "evil0ctal";
          commentData = await fetchTikTokStickerCommentEvil0ctal(url.trim(), { evil0ctalUrl, evil0ctalKey });
        } else {
          throw directErr;
        }
      }
    } else {
      commentData = await fetchTikTokStickerComment(url.trim());
    }

    // 2. Unduh file gambar stiker asli secara aman
    const rawBuffer = await downloadImageBuffer(commentData.imageUrl);

    // 3. Olah gambar menjadi WebP 512x512 standar WhatsApp
    const webpBuffer = await convertToWaSticker(rawBuffer);

    // 4. Sisipkan metadata EXIF resmi WASticker
    const finalAuthor = customAuthor || commentData.author || "TikTok to WA";
    const finalPack = packName || "Stiker TikTok";
    const stickerWithExif = addStickerMetadata(webpBuffer, finalPack, finalAuthor);

    // 5. Simpan di cache memori sementara
    const stickerId = crypto.randomUUID().slice(0, 8);
    stickerCache.set(stickerId, {
      buffer: stickerWithExif,
      createdAt: Date.now()
    });

    return res.json({
      success: true,
      stickerId,
      downloadUrl: `/api/sticker/${stickerId}.webp`,
      previewBase64: `data:image/webp;base64,${stickerWithExif.toString("base64")}`,
      author: finalAuthor,
      username: commentData.username,
      text: commentData.text,
      sizeBytes: stickerWithExif.length,
      apiSource: usedSource
    });

  } catch (err) {
    const errMsg = err.message || "Terjadi kesalahan saat memproses stiker.";
    
    // Klasifikasikan error input klien vs error server
    const isClientError = errMsg.includes("tidak valid") || 
                          errMsg.includes("tidak memuat") || 
                          errMsg.includes("tidak ditemukan") ||
                          errMsg.includes("dihapus") ||
                          errMsg.includes("tidak ada stiker") ||
                          errMsg.includes("kosong");

    const statusCode = isClientError ? 400 : 500;

    return res.status(statusCode).json({
      success: false,
      error: errMsg
    });
  }
});

// Endpoint Unduhan File Stiker WebP
app.get("/api/sticker/:id.webp", (req, res) => {
  const { id } = req.params;
  const item = stickerCache.get(id);

  if (!item) {
    return res.status(404).send("Stiker tidak ditemukan atau sudah kedaluwarsa.");
  }

  res.setHeader("Content-Type", "image/webp");
  res.setHeader("Content-Disposition", `attachment; filename="tiktok-sticker-${id}.webp"`);
  res.setHeader("Cache-Control", "public, max-age=1800");
  res.send(item.buffer);
});

// Jalankan server jika dipanggil langsung
if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  app.listen(PORT, () => {
    console.log(`🚀 TikTok Sticker Converter Server berjalan di http://localhost:${PORT}`);
  });
}
