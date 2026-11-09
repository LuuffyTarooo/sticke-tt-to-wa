// src/services/apify.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveTikTokUrl, extractIds, extractMediaUrl } from "./tiktok.js";

const execFileAsync = promisify(execFile);

/**
 * Mengekstrak URL media (foto/stiker) dari item komentar hasil Apify Actor
 * Mendukung format clockworks, rainminer, dan struktur TikTok standar
 */
export function extractMediaFromApifyItem(item) {
  if (!item || typeof item !== "object") return null;

  // 1. Cek properti images / imageList (array of URLs or image objects)
  if (Array.isArray(item.images) && item.images.length > 0) {
    const first = item.images[0];
    if (typeof first === "string" && first.startsWith("http")) return first;
    if (first && typeof first === "object") {
      const url = first.url || first.origin_url || first.url_list?.[0];
      if (url) return url;
    }
  }

  // 2. Cek properti image_list standar TikTok
  if (Array.isArray(item.image_list) && item.image_list.length > 0) {
    const directUrl = extractMediaUrl(item);
    if (directUrl) return directUrl;
  }

  // 3. Cek cmt_sticker_struct standar TikTok
  if (item.cmt_sticker_struct) {
    const directUrl = extractMediaUrl(item);
    if (directUrl) return directUrl;
  }

  // 4. Cek properti sticker / stickers
  if (item.sticker) {
    if (typeof item.sticker === "string" && item.sticker.startsWith("http")) return item.sticker;
    if (typeof item.sticker === "object") {
      const url = item.sticker.url || item.sticker.animated_url?.url_list?.[0] || item.sticker.static_url?.url_list?.[0];
      if (url) return url;
    }
  }

  if (Array.isArray(item.stickers) && item.stickers.length > 0) {
    const s = item.stickers[0];
    if (typeof s === "string" && s.startsWith("http")) return s;
    if (s && typeof s === "object") {
      const url = s.url || s.animated_url?.url_list?.[0] || s.static_url?.url_list?.[0];
      if (url) return url;
    }
  }

  // 5. Cek mediaUrl / photoUrl
  if (typeof item.mediaUrl === "string" && item.mediaUrl.startsWith("http")) return item.mediaUrl;
  if (typeof item.photoUrl === "string" && item.photoUrl.startsWith("http")) return item.photoUrl;

  return null;
}

/**
 * Memilih stiker dari daftar komentar Apify dengan Strict Exact Matching
 */
export function extractStickerFromApifyDataset(items, commentId = null, commentAuthorId = null) {
  if (!Array.isArray(items) || items.length === 0) return null;

  // STRICT: Jika ada commentId spesifik
  if (commentId) {
    // 1. Cocokkan ID komentar secara persis
    const direct = items.find(it => String(it.id || it.cid) === String(commentId));
    if (direct) {
      const media = extractMediaFromApifyItem(direct);
      if (media) {
        return {
          commentId: String(direct.id || direct.cid),
          imageUrl: media,
          author: direct.user?.nickname || direct.author?.nickname || direct.user?.uniqueId || "Pengguna TikTok",
          username: direct.user?.uniqueId || direct.user?.unique_id || direct.author?.uniqueId || "",
          text: direct.text || direct.comment || "",
          avatarUrl: direct.user?.avatarThumb || direct.user?.avatar_thumb?.url_list?.[0] || ""
        };
      }
    }

    // 2. Jika ada commentAuthorId spesifik, cari HANYA komentar dari author tersebut
    if (commentAuthorId) {
      const authorHit = items.find(it => {
        const uid = String(it.user?.id || it.user?.uid || it.author?.id || "");
        return uid === String(commentAuthorId) && extractMediaFromApifyItem(it);
      });
      if (authorHit) {
        return {
          commentId: String(authorHit.id || authorHit.cid),
          imageUrl: extractMediaFromApifyItem(authorHit),
          author: authorHit.user?.nickname || authorHit.author?.nickname || authorHit.user?.uniqueId || "Pengguna TikTok",
          username: authorHit.user?.uniqueId || authorHit.user?.unique_id || authorHit.author?.uniqueId || "",
          text: authorHit.text || authorHit.comment || "",
          avatarUrl: authorHit.user?.avatarThumb || authorHit.user?.avatar_thumb?.url_list?.[0] || ""
        };
      }
    }

    // PENTING: Untuk Strict Matching, JANGAN mengambil stiker orang lain jika ID yang diminta tidak memuat stiker
    return null;
  }

  // Jika tautan video umum tanpa ID spesifik, ambil stiker pertama yang tersedia
  const anyHit = items.find(it => extractMediaFromApifyItem(it));
  if (anyHit) {
    return {
      commentId: String(anyHit.id || anyHit.cid),
      imageUrl: extractMediaFromApifyItem(anyHit),
      author: anyHit.user?.nickname || anyHit.author?.nickname || anyHit.user?.uniqueId || "Pengguna TikTok",
      username: anyHit.user?.uniqueId || anyHit.user?.unique_id || anyHit.author?.uniqueId || "",
      text: anyHit.text || anyHit.comment || "",
      avatarUrl: anyHit.user?.avatarThumb || anyHit.user?.avatar_thumb?.url_list?.[0] || ""
    };
  }

  return null;
}

export const DEFAULT_APIFY_TOKEN = "";

/**
 * Mengambil stiker komentar menggunakan Apify TikTok Comments Scraper API
 */
export async function fetchTikTokStickerCommentApify(inputUrl, options = {}) {
  const fullUrl = await resolveTikTokUrl(inputUrl);
  const { videoId, commentId, commentAuthorId } = extractIds(fullUrl);

  if (!videoId) {
    throw new Error("Tidak dapat menemukan ID video atau foto dari tautan TikTok yang diberikan.");
  }

  const apiToken = options.apifyToken !== undefined 
    ? options.apifyToken 
    : (process.env.APIFY_API_TOKEN || DEFAULT_APIFY_TOKEN);

  if (!apiToken || typeof apiToken !== "string" || !apiToken.trim()) {
    throw new Error("Apify API Token belum diatur. Masukkan token Apify Anda atau simpan di variabel lingkungan APIFY_API_TOKEN. Dapatkan token gratis di https://apify.com");
  }

  const actorId = (options.apifyActorId || process.env.APIFY_ACTOR_ID || "clockworks~tiktok-comments-scraper").trim();
  const endpoint = `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(apiToken.trim())}`;

  const payload = {
    postURLs: [fullUrl],
    videoUrls: [fullUrl],
    commentsPerPost: 50,
    maxRepliesPerComment: 20,
    maxItems: 50,
    maxReplies: 20
  };

  let stdout;
  try {
    const res = await execFileAsync("curl.exe", [
      "-s", endpoint,
      "-X", "POST",
      "-H", "Content-Type: application/json",
      "-H", "Accept: application/json",
      "-d", JSON.stringify(payload)
    ], {
      timeout: 120000,
      maxBuffer: 30 * 1024 * 1024
    });
    stdout = res.stdout;
  } catch (err) {
    throw new Error(`Gagal menghubungi Apify API: ${err.message}. Pastikan koneksi internet stabil.`);
  }

  let items;
  try {
    const parsed = JSON.parse(stdout);
    if (parsed.error) {
      if (parsed.error.statusCode === 401) {
        throw new Error("Apify API Token tidak valid. Periksa kembali token di dashboard Apify.");
      }
      if (parsed.error.statusCode === 402) {
        throw new Error("Kredit akun Apify Anda telah habis. Isi ulang kuota di dashboard Apify.");
      }
      throw new Error(`Apify error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
    }
    items = Array.isArray(parsed) ? parsed : (parsed.data || parsed.items || []);
  } catch (err) {
    if (err.message.startsWith("Apify error") || err.message.startsWith("Apify API Token") || err.message.startsWith("Kredit akun")) {
      throw err;
    }
    throw new Error(`Respon dari Apify bukan JSON valid: ${stdout?.substring(0, 150)}`);
  }

  const stickerData = extractStickerFromApifyDataset(items, commentId, commentAuthorId);
  if (!stickerData) {
    if (commentId) {
      throw new Error(`Komentar yang dituju (ID: ${commentId}) tidak memuat file stiker/gambar pada hasil Apify. Disarankan beralih ke Mesin 'Direct TikTok API' yang langsung membaca CDN TikTok.`);
    }
    throw new Error("Tidak menemukan stiker atau gambar pada komentar video ini melalui Apify. Disarankan beralih ke Mesin 'Direct TikTok API'.");
  }

  return {
    videoId,
    ...stickerData
  };
}

