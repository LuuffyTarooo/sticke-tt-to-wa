// src/services/image.js
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Mengunduh buffer gambar secara instan dan andal menggunakan curl.exe
 */
export async function downloadImageBuffer(imageUrl) {
  try {
    const { stdout } = await execFileAsync("curl.exe", [
      "-s", "-L", imageUrl,
      "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "-H", "Referer: https://www.tiktok.com/"
    ], {
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10000
    });
    if (stdout && stdout.length > 0) {
      return stdout;
    }
  } catch (err) {
    // fallback ke fetch jika curl tidak tersedia
  }

  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.tiktok.com/"
      }
    });
    if (res.ok) {
      const arr = await res.arrayBuffer();
      if (arr.byteLength > 0) {
        return Buffer.from(arr);
      }
    }
  } catch (err) {
    throw new Error(`Gagal mengunduh gambar stiker: ${err.message}`);
  }

  throw new Error("Gagal mengunduh gambar stiker dari tautan TikTok.");
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
}

/**
 * Membuat buffer stiker WhatsApp dari stiker teks TikTok (content_type 17)
 */
export async function createTextStickerBuffer(rawText) {
  const cleanText = rawText.replace(/^\[Sticker\]\s*/i, "").trim() || "Sticker";
  
  const words = cleanText.split(/\s+/);
  const lines = [];
  let currentLine = "";
  for (const w of words) {
    if ((currentLine + " " + w).trim().length > 16) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = w;
    } else {
      currentLine = (currentLine + " " + w).trim();
    }
  }
  if (currentLine) lines.push(currentLine.trim());
  if (lines.length === 0) lines.push(cleanText);

  const fontSize = lines.length > 3 ? 32 : (lines.length > 1 ? 38 : 46);
  const lineHeight = fontSize + 16;
  const paddingY = 40;
  const boxHeight = lines.length * lineHeight + paddingY * 2;
  const boxWidth = 450;
  const startY = 256 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;

  const tspanElements = lines.map((line, i) => 
    `<tspan x="256" y="${startY + i * lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");

  const svg = `
  <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.4" />
      </filter>
    </defs>
    <rect x="${(512 - boxWidth) / 2}" y="${Math.max(30, 256 - boxHeight / 2)}" width="${boxWidth}" height="${boxHeight}" rx="32" fill="#161823" stroke="#FE2C55" stroke-width="6" filter="url(#shadow)" />
    <circle cx="${(512 - boxWidth) / 2 + 24}" cy="${Math.max(30, 256 - boxHeight / 2) + 24}" r="8" fill="#25F4EE" />
    <circle cx="${(512 - boxWidth) / 2 + 36}" cy="${Math.max(30, 256 - boxHeight / 2) + 24}" r="8" fill="#FE2C55" opacity="0.8" />
    <text font-family="'Segoe UI', Roboto, Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="#ffffff" text-anchor="middle">
      ${tspanElements}
    </text>
  </svg>
  `;

  return sharp(Buffer.from(svg))
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toBuffer();
}

/**
 * Mengonversi buffer gambar ke format stiker resmi WhatsApp:
 * - Format: WebP
 * - Dimensi: Tepat 512 x 512 piksel (fit: contain dengan padding transparan)
 * - Ukuran file: Di bawah 95 KB (memberikan ruang untuk metadata EXIF agar <= 100 KB)
 */
export async function convertToWaSticker(inputBuffer) {
  let quality = 80;
  let webpBuffer;

  // Lakukan konversi awal
  webpBuffer = await sharp(inputBuffer, { animated: false })
    .resize(512, 512, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality })
    .toBuffer();

  // Jika ukuran melebihi 95 KB, turunkan kualitas bertahap
  while (webpBuffer.length > 95 * 1024 && quality > 30) {
    quality -= 15;
    webpBuffer = await sharp(inputBuffer, { animated: false })
      .resize(512, 512, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .webp({ quality })
      .toBuffer();
  }

  return webpBuffer;
}
