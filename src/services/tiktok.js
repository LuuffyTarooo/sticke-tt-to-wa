// src/services/tiktok.js
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Eksekusi curl.exe untuk operasi jaringan yang tahan banting (menghindari timeout IPv6 Node di Windows)
 */
async function curlRequest(args, options = {}) {
  try {
    const { stdout } = await execFileAsync("curl.exe", args, {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 12000,
      ...options
    });
    return stdout;
  } catch (err) {
    throw new Error(`Koneksi jaringan gagal: ${err.message}`);
  }
}

/**
 * Membersihkan input jika pengguna menempelkan teks bersama tautan
 */
export function extractUrlFromText(inputText) {
  if (!inputText || typeof inputText !== "string") return "";
  const match = inputText.match(/https?:\/\/[^\s"'<>]+/i);
  if (match) return match[0];
  
  let trimmed = inputText.trim();
  if (trimmed.startsWith("vt.tiktok.com") || trimmed.startsWith("www.tiktok.com") || trimmed.startsWith("tiktok.com")) {
    return "https://" + trimmed;
  }
  return trimmed;
}

/**
 * Melacak redirect link pendek (vt.tiktok.com) hingga ke URL kanonikal menggunakan curl
 */
export async function resolveTikTokUrl(rawInput) {
  let url = extractUrlFromText(rawInput);
  if (!url) {
    throw new Error("URL TikTok tidak ditemukan pada input.");
  }

  // Jika berupa shortlink vt.tiktok.com / vm.tiktok.com, telusuri header Location
  if (url.includes("vt.tiktok.com") || url.includes("vm.tiktok.com") || url.includes("/t/")) {
    for (let i = 0; i < 5; i++) {
      try {
        const headersOut = await curlRequest(["-s", "-I", url]);
        const locMatch = headersOut.match(/location:\s*([^\r\n]+)/i);
        if (locMatch && locMatch[1]) {
          const next = locMatch[1].trim();
          url = new URL(next, url).href;
          if (!url.includes("vt.tiktok.com") && !url.includes("vm.tiktok.com")) {
            break;
          }
        } else {
          break;
        }
      } catch {
        break;
      }
    }
  }

  return url;
}

/**
 * Mengekstrak videoId / photoId (aweme_id), commentId, dan commentAuthorId dari URL TikTok
 */
export function extractIds(urlStr) {
  let videoId = null;
  let commentId = null;
  let commentAuthorId = null;

  try {
    const cleanUrl = extractUrlFromText(urlStr);
    const parsed = new URL(cleanUrl);

    // 1. Ekstrak comment ID jika tersedia
    commentId = parsed.searchParams.get("share_comment_id") || 
                parsed.searchParams.get("comment_id") || 
                parsed.searchParams.get("cid");

    // 2. Ekstrak comment author ID jika tersedia
    commentAuthorId = parsed.searchParams.get("comment_author_id") ||
                      parsed.searchParams.get("author_id");

    // 3. Ekstrak video/photo ID
    const match = parsed.pathname.match(/\/(?:video|photo|v)\/(\d+)/i);
    if (match) {
      videoId = match[1];
    } else {
      videoId = parsed.searchParams.get("share_item_id") || 
                parsed.searchParams.get("item_id") || 
                parsed.searchParams.get("aweme_id");
    }

    if (!videoId) {
      const digitMatch = parsed.pathname.match(/\/(\d{18,20})/);
      if (digitMatch) videoId = digitMatch[1];
    }
  } catch (err) {
    throw new Error("Format URL TikTok tidak valid.");
  }

  return { videoId, commentId, commentAuthorId };
}

/**
 * Mengekstrak URL media gambar/stiker dari objek komentar TikTok
 * Mendukung Type A (foto unggahan `image_list`) dan Type B (stiker resmi `cmt_sticker_struct`)
 */
export function extractMediaUrl(comment) {
  if (!comment) return null;

  // 1. Cek official TikTok sticker struct (animasi atau statis)
  const s = comment.cmt_sticker_struct || comment.sticker_struct || comment.comment_sticker || comment.sticker;
  if (s && typeof s === "object") {
    const animList = s.animated_url?.high_resolution_url?.url_list || 
                     s.animated_url?.mid_resolution_url?.url_list ||
                     s.animated_url?.low_resolution_url?.url_list ||
                     s.animated_url?.url_list;
    if (animList && animList.length > 0) return animList[0];

    const staticList = s.static_url?.high_resolution_url?.url_list ||
                       s.static_url?.mid_resolution_url?.url_list ||
                       s.static_url?.low_resolution_url?.url_list ||
                       s.static_url?.url_list;
    if (staticList && staticList.length > 0) return staticList[0];

    if (typeof s.url === "string" && s.url.startsWith("http")) return s.url;
  }

  // 2. Cek image_list (foto yang diunggah)
  if (comment.image_list && Array.isArray(comment.image_list) && comment.image_list.length > 0) {
    const imgObj = comment.image_list[0];
    const urlList = imgObj.origin_url?.url_list || imgObj.crop_url?.url_list || [];
    if (urlList.length > 0) {
      return urlList.find(u => u.includes(".jpeg") || u.includes(".jpg") || u.includes(".webp")) || urlList[0];
    }
  }

  return null;
}

/**
 * Mengambil data stiker/gambar komentar langsung dari Direct TikTok Web API
 */
export async function fetchTikTokStickerComment(inputUrl) {
  const fullUrl = await resolveTikTokUrl(inputUrl);
  const { videoId, commentId, commentAuthorId } = extractIds(fullUrl);

  if (!videoId) {
    throw new Error("Tidak dapat menemukan ID video atau foto dari tautan TikTok yang diberikan.");
  }

  let target = null;
  let targetMediaUrl = null;
  let detectedComment = null;

  // KASUS 1: Pengguna menyertakan tautan ke komentar spesifik (share_comment_id / comment_id)
  if (commentId) {
    const aids = [1988, 1180]; // 1988 (TikTok Web - memuat cmt_sticker_struct & image_list lengkap), 1180 (Mobile fallback)

    for (const aid of aids) {
      if (targetMediaUrl) break;

      const ua = aid === 1180
        ? "com.zhiliaoapp.musically/2022605030 (Linux; U; Android 13; id_ID; SM-A536B; Build/TP1A.220624.014; Cronet/TTNetVersion:e647181c 2023-08-25 QuicVersion:469074b6 2023-08-07)"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

      let comments = [];
      let cursor = 0;
      for (let page = 0; page < 3; page++) {
        try {
          const rawJson = await curlRequest([
            "-s", `https://www.tiktok.com/api/comment/list/?aweme_id=${videoId}&count=50&cursor=${cursor}&aid=${aid}&insert_ids=${commentId}`,
            "-H", `User-Agent: ${ua}`,
            "-H", "Referer: https://www.tiktok.com/",
            "-H", "Accept: application/json",
            "-H", "Accept-Language: id-ID,id;q=0.9,en-US;q=0.8"
          ]);
          const json = JSON.parse(rawJson);
          const pageComments = json.comments || [];
          comments.push(...pageComments);
          if (comments.some(c => c.cid === commentId)) break;
          if (!json.has_more || pageComments.length === 0) break;
          cursor = json.cursor || (cursor + pageComments.length);
        } catch {
          break;
        }
      }

      // 1A. PRIORITAS UTAMA: Cek apakah komentar tingkat atas memiliki cid yang sama persis dan memuat media asli
      const directMatch = comments.find(c => c.cid === commentId);
      if (directMatch) {
        detectedComment = directMatch;
        const media = extractMediaUrl(directMatch);
        if (media) {
          target = directMatch;
          targetMediaUrl = media;
          break;
        }

        // Jika directMatch adalah balasan (reply_id !== '0'), coba ambil payload lengkap via list/reply/ dengan aid=1988
        if (directMatch.reply_id && directMatch.reply_id !== "0") {
          try {
            const parentReplyRaw = await curlRequest([
              "-s", `https://www.tiktok.com/api/comment/list/reply/?item_id=${videoId}&comment_id=${directMatch.reply_id}&count=50&aid=1988`,
              "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
              "-H", "Referer: https://www.tiktok.com/",
              "-H", "Accept: application/json"
            ]);
            const parentReplyJson = JSON.parse(parentReplyRaw);
            const parentReplies = parentReplyJson.comments || [];
            const exactReply = parentReplies.find(r => r.cid === commentId);
            if (exactReply) {
              const repMedia = extractMediaUrl(exactReply);
              if (repMedia) {
                target = exactReply;
                targetMediaUrl = repMedia;
                break;
              }
            }
          } catch {}
        }
      }

      // 1B. Cek balasan langsung dari commentId (jika commentId adalah thread tempat menaruh stiker gambar/animasi)
      try {
        const replyUrl = `https://www.tiktok.com/api/comment/list/reply/?item_id=${videoId}&comment_id=${commentId}&count=50&aid=${aid}`;
        const replyRaw = await curlRequest([
          "-s", replyUrl,
          "-H", `User-Agent: ${ua}`,
          "-H", "Referer: https://www.tiktok.com/",
          "-H", "Accept: application/json"
        ]);
        const replyJson = JSON.parse(replyRaw);
        const replies = replyJson.comments || [];

        if (replies.length > 0) {
          // STRICT: Hanya ambil balasan dari author yang bersangkutan jika commentAuthorId tersedia
          let hit = null;
          if (commentAuthorId) {
            hit = replies.find(r => r.user?.uid === commentAuthorId && extractMediaUrl(r));
          } else {
            hit = replies.find(r => r.cid === commentId && extractMediaUrl(r));
          }
          if (hit) {
            target = hit;
            targetMediaUrl = extractMediaUrl(hit);
            break;
          }
        }
      } catch {}

      // 1C. Cek apakah commentId adalah salah satu balasan dari komentar tingkat atas
      for (const c of comments) {
        if (c.reply_comment_total > 0) {
          try {
            const rRaw = await curlRequest([
              "-s", `https://www.tiktok.com/api/comment/list/reply/?item_id=${videoId}&comment_id=${c.cid}&count=50&aid=${aid}`,
              "-H", `User-Agent: ${ua}`,
              "-H", "Referer: https://www.tiktok.com/"
            ]);
            const rJson = JSON.parse(rRaw);
            const rReplies = rJson.comments || [];
            const replyHit = rReplies.find(r => r.cid === commentId);
            if (replyHit) {
              detectedComment = replyHit;
              const media = extractMediaUrl(replyHit);
              if (media) {
                target = replyHit;
                targetMediaUrl = media;
                break;
              }
            }
          } catch {}
        }
      }
    }

    // PENTING: Strict matching - Hanya ambil stiker media gambar/foto asli dari komentar/author yang dituju
    if (!target || !targetMediaUrl) {
      if (detectedComment) {
        if (detectedComment.content_type === 16 || detectedComment.content_type === 17 || detectedComment.text?.startsWith("[Sticker]")) {
          const sender = detectedComment.user?.nickname || detectedComment.user?.unique_id || "Pengguna";
          throw new Error(`Komentar dari "${sender}" terdeteksi sebagai Stiker Reaksi Bawaan TikTok (${detectedComment.text || "[Sticker]"}). Server TikTok tidak menyertakan file gambar untuk jenis stiker ini ke API publik/web (file dikunci di dalam aplikasi HP TikTok). Stiker yang dapat diunduh adalah Stiker Kreator Resmi TikTok (.awebp) atau Stiker Foto/Gambar (.jpeg/.webp).`);
        }
      }
      throw new Error(`Komentar yang dituju (ID: ${commentId}) tidak memuat file stiker atau gambar asli.`);
    }
  } else {
    // KASUS 2: Tautan video umum tanpa commentId tertentu (ambil stiker pertama yang tersedia di video)
    const apiUrl = `https://www.tiktok.com/api/comment/list/?aweme_id=${videoId}&count=50&aid=1988`;
    const rawJson = await curlRequest([
      "-s", apiUrl,
      "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "-H", "Referer: https://www.tiktok.com/",
      "-H", "Accept: application/json"
    ]);

    let json;
    try {
      json = JSON.parse(rawJson);
    } catch {
      throw new Error("Respon dari server TikTok tidak valid.");
    }

    if (json.status_code !== undefined && json.status_code !== 0) {
      throw new Error(json.status_msg || `Panggilan API TikTok mengembalikan status error (${json.status_code})`);
    }

    const comments = json.comments || [];

    // Cari stiker di komentar tingkat atas
    const topSticker = comments.find(c => extractMediaUrl(c));
    if (topSticker) {
      target = topSticker;
      targetMediaUrl = extractMediaUrl(topSticker);
    } else {
      // Cari stiker di balasan komentar
      for (const c of comments) {
        if (c.reply_comment_total > 0) {
          try {
            const rRaw = await curlRequest([
              "-s", `https://www.tiktok.com/api/comment/list/reply/?item_id=${videoId}&comment_id=${c.cid}&count=50&aid=1988`,
              "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "-H", "Referer: https://www.tiktok.com/"
            ]);
            const rJson = JSON.parse(rRaw);
            const rReplies = rJson.comments || [];
            const anySticker = rReplies.find(r => extractMediaUrl(r));
            if (anySticker) {
              target = anySticker;
              targetMediaUrl = extractMediaUrl(anySticker);
              break;
            }
          } catch {}
        }
      }
    }

    if (!target || !targetMediaUrl) {
      throw new Error("Tidak menemukan stiker atau gambar pada komentar video ini. Pastikan ada komentar yang memuat stiker gambar atau foto.");
    }
  }

  return {
    videoId,
    commentId: target.cid,
    imageUrl: targetMediaUrl,
    author: target.user?.nickname || target.user?.unique_id || "Pengguna TikTok",
    username: target.user?.unique_id || "",
    text: target.text || "",
    avatarUrl: target.user?.avatar_thumb?.url_list?.[0] || ""
  };
}
