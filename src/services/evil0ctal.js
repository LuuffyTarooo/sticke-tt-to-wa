// src/services/evil0ctal.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolveTikTokUrl, extractIds, extractMediaUrl } from "./tiktok.js";

const execFileAsync = promisify(execFile);

/**
 * Membangun HTTP headers untuk panggilan ke instance Evil0ctal Douyin_TikTok_Download_API
 */
export function buildEvil0ctalHeaders(apiKey = "") {
  const headers = {
    "Accept": "application/json",
    "User-Agent": "StikerTikTokToWA/1.0.0"
  };
  if (apiKey && typeof apiKey === "string" && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

/**
 * Menormalkan struktur respons JSON dari Evil0ctal API (mendukung v5, v4, dan format flat)
 */
export function normalizeEvil0ctalResponse(json) {
  if (!json || typeof json !== "object") {
    return { comments: [], cursor: 0, has_more: 0 };
  }

  // Jika dibungkus dalam properti data (v5 FastAPI structure)
  if (json.data && typeof json.data === "object") {
    return {
      comments: Array.isArray(json.data.comments) ? json.data.comments : [],
      cursor: json.data.cursor || 0,
      has_more: json.data.has_more || 0,
      total: json.data.total || 0
    };
  }

  // Jika format langsung (flat)
  return {
    comments: Array.isArray(json.comments) ? json.comments : [],
    cursor: json.cursor || 0,
    has_more: json.has_more || 0,
    total: json.total || 0
  };
}

/**
 * Mencari stiker dari daftar komentar yang didapatkan dari Evil0ctal API
 */
export function extractStickerFromEvil0ctalComments(comments, commentId = null, commentAuthorId = null) {
  if (!Array.isArray(comments) || comments.length === 0) return null;

  // 1. Jika ada commentId spesifik, cari komentar yang cocok langsung
  if (commentId) {
    const direct = comments.find(c => c.cid === commentId);
    if (direct) {
      const media = extractMediaUrl(direct);
      if (media) {
        return {
          commentId: direct.cid,
          imageUrl: media,
          author: direct.user?.nickname || direct.user?.unique_id || "Pengguna TikTok",
          username: direct.user?.unique_id || "",
          text: direct.text || "",
          avatarUrl: direct.user?.avatar_thumb?.url_list?.[0] || ""
        };
      }
    }

    // Jika ada commentAuthorId spesifik
    if (commentAuthorId) {
      const authorHit = comments.find(c => c.user?.uid === commentAuthorId && extractMediaUrl(c));
      if (authorHit) {
        return {
          commentId: authorHit.cid,
          imageUrl: extractMediaUrl(authorHit),
          author: authorHit.user?.nickname || authorHit.user?.unique_id || "Pengguna TikTok",
          username: authorHit.user?.unique_id || "",
          text: authorHit.text || "",
          avatarUrl: authorHit.user?.avatar_thumb?.url_list?.[0] || ""
        };
      }
    }
    // STRICT: Jika ada commentId spesifik tapi tidak memuat media, JANGAN comot stiker orang lain
    return null;
  }

  // 2. Jika tautan video umum (TIDAK ada commentId spesifik), ambil stiker pertama yang ada
  const anySticker = comments.find(c => extractMediaUrl(c));
  if (anySticker) {
    return {
      commentId: anySticker.cid,
      imageUrl: extractMediaUrl(anySticker),
      author: anySticker.user?.nickname || anySticker.user?.unique_id || "Pengguna TikTok",
      username: anySticker.user?.unique_id || "",
      text: anySticker.text || "",
      avatarUrl: anySticker.user?.avatar_thumb?.url_list?.[0] || ""
    };
  }

  return null;
}

/**
 * Mengambil data stiker komentar menggunakan instance Evil0ctal Douyin_TikTok_Download_API
 */
export async function fetchTikTokStickerCommentEvil0ctal(inputUrl, options = {}) {
  const fullUrl = await resolveTikTokUrl(inputUrl);
  const { videoId, commentId, commentAuthorId } = extractIds(fullUrl);

  if (!videoId) {
    throw new Error("Tidak dapat menemukan ID video atau foto dari tautan TikTok yang diberikan.");
  }

  const rawBaseUrl = options.evil0ctalUrl || process.env.EVIL0CTAL_API_URL || "http://localhost:8000";
  const baseUrl = rawBaseUrl.replace(/\/+$/, "");
  const apiKey = options.evil0ctalKey || process.env.EVIL0CTAL_API_KEY || "";
  const headers = buildEvil0ctalHeaders(apiKey);

  // Buat argumen curl
  const headerArgs = [];
  for (const [k, v] of Object.entries(headers)) {
    headerArgs.push("-H", `${k}: ${v}`);
  }

  // Panggil endpoint /api/tiktok/web/fetch_post_comment
  const targetEndpoint = `${baseUrl}/api/tiktok/web/fetch_post_comment?aweme_id=${videoId}&cursor=0&count=35`;

  let stdout;
  try {
    const res = await execFileAsync("curl.exe", [
      "-s", targetEndpoint,
      ...headerArgs
    ], {
      timeout: 10000,
      maxBuffer: 15 * 1024 * 1024
    });
    stdout = res.stdout;
  } catch (err) {
    throw new Error(`Gagal terhubung ke Evil0ctal Douyin_TikTok_Download_API di ${baseUrl}: ${err.message}. Pastikan server API sudah berjalan.`);
  }

  let json;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(`Respon dari Evil0ctal API bukan format JSON yang valid: ${stdout?.substring(0, 150)}`);
  }

  if (json.status_code !== undefined && json.status_code !== 200 && json.status_code !== 0) {
    throw new Error(json.message || `Evil0ctal API mengembalikan error code: ${json.status_code}`);
  }

  const normalized = normalizeEvil0ctalResponse(json);
  const stickerData = extractStickerFromEvil0ctalComments(normalized.comments, commentId, commentAuthorId);

  if (!stickerData) {
    throw new Error("Tidak menemukan stiker atau gambar pada komentar melalui Evil0ctal API.");
  }

  return {
    videoId,
    ...stickerData
  };
}

