# TikTok Sticker to WhatsApp Web Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membangun aplikasi web konverter stiker TikTok ke WhatsApp (WASticker) yang memproses URL secara instan (<0.5 detik) menggunakan Direct TikTok Web API dengan parameter `insert_ids`, mengolahnya dengan `sharp` menjadi WebP 512×512 ber-metadata EXIF, serta menyediakan UI modern untuk unduh dan kirim langsung ke WhatsApp.

**Architecture:** Node.js Express server menyediakan REST API (`POST /api/convert`, `GET /api/sticker/:id.webp`) dan melayani frontend SPA statis. Modul `tiktok.js` mengekstrak ID dan memanggil Direct TikTok Web API; modul `image.js` mengonversi gambar ke standar 512×512 WebP via `sharp`; modul `exif.js` menyuntikkan metadata EXIF resmi WASticker.

**Tech Stack:** Node.js (v24, ES Module), Express.js, `sharp`, Tailwind CSS via CDN, Vanilla JavaScript.

**Spec:** [docs/superpowers/specs/2026-10-27-tiktok-sticker-web-converter-design.md](file:///c:/Project%20Iseng/stiker-tiktok-to-whatsapp/docs/superpowers/specs/2026-10-27-tiktok-sticker-web-converter-design.md)

## Global Constraints

- Runtime: Node.js (v24), package.json `"type": "module"`.
- Zero Third-Party Scrapers (No TikWM, No Playwright in production).
- Standar Stiker WhatsApp: Format WebP, tepat 512×512 piksel, fit contain dengan transparent padding, ukuran target < 100 KB.
- Metadata EXIF WASticker: Pack name `Stiker TikTok`, author `TikTok to WA`.

## Review Focus

1. URL shortlink `vt.tiktok.com` yang redirect beberapa kali harus ter-resolve dengan benar ke URL kanonikal.
2. Link komentar tanpa stiker gambar harus ditolak dengan pesan error ramah ("Komentar ini tidak memuat stiker atau gambar").
3. Aspek rasio gambar input yang bukan 1:1 (persegi) tidak boleh melar/gepeng; harus diberi letterbox/pillarbox transparan tepat 512×512.
4. Download stiker pada browser mobile harus mendukung Web Share API (`navigator.share`) dengan fallback download file `.webp`.
5. Error handling ketika TikTok API mengembalikan status selain 0 atau rate limit.

---

### Task 1: Environment & Dependencies Setup

**Files:**
- Modify: `package.json`
- Test: `tests/setup.test.js`

**Interfaces:**
- Produces: Installed dependencies `express`, `sharp`.

- [ ] **Step 1: Write setup verification test in `tests/setup.test.js`**

```javascript
import assert from "node:assert";
import sharp from "sharp";
import express from "express";

assert(typeof sharp === "function", "sharp should be a function");
assert(typeof express === "function", "express should be a function");
console.log("Setup verification passed!");
```

- [ ] **Step 2: Run test to verify it fails (missing packages)**

Run: `node tests/setup.test.js`  
Expected: Error `Cannot find package 'sharp'` or `Cannot find package 'express'`.

- [ ] **Step 3: Install `express` and `sharp`**

Run: `npm i express sharp`

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/setup.test.js`  
Expected: `Setup verification passed!`

---

### Task 2: TikTok URL Resolver & Comment Extractor

**Files:**
- Create: `src/services/tiktok.js`
- Test: `tests/tiktok.test.js`

**Interfaces:**
- Produces:
  - `resolveTikTokUrl(url: string) -> Promise<string>`
  - `extractIds(url: string) -> { videoId: string, commentId: string }`
  - `fetchTikTokStickerComment(url: string) -> Promise<{ imageUrl: string, author: string, text: string }>`

- [ ] **Step 1: Write unit tests in `tests/tiktok.test.js`**

```javascript
import assert from "node:assert";
import { extractIds, fetchTikTokStickerComment } from "../src/services/tiktok.js";

const sampleUrl = "https://www.tiktok.com/@kiwooyyo/video/7699857497426971925?share_comment_id=7700577294884750081";
const { videoId, commentId } = extractIds(sampleUrl);

assert.strictEqual(videoId, "7699857497426971925", "Video ID mismatch");
assert.strictEqual(commentId, "7700577294884750081", "Comment ID mismatch");

const data = await fetchTikTokStickerComment(sampleUrl);
assert(data.imageUrl.startsWith("http"), "Image URL must be valid HTTP URL");
assert(data.author.length > 0, "Author must be present");
console.log("TikTok service tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/tiktok.test.js`  
Expected: Error `Cannot find module '../src/services/tiktok.js'`.

- [ ] **Step 3: Implement `src/services/tiktok.js`**

Implement URL resolving with `fetch(redirect: "manual")`, regex/URLSearchParams ID extraction, and GET call to `https://www.tiktok.com/api/comment/list/?aweme_id=${videoId}&insert_ids=${commentId}&count=5&aid=1988`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/tiktok.test.js`  
Expected: `TikTok service tests passed!`

---

### Task 3: Image Processing to WhatsApp Sticker Standard

**Files:**
- Create: `src/services/image.js`
- Test: `tests/image.test.js`

**Interfaces:**
- Consumes: Image buffer or URL.
- Produces:
  - `convertToWaSticker(imageBuffer: Buffer) -> Promise<Buffer>`: Output WebP exactly 512x512 with transparent background padding and < 100 KB.

- [ ] **Step 1: Write test in `tests/image.test.js`**

```javascript
import assert from "node:assert";
import sharp from "sharp";
import { convertToWaSticker } from "../src/services/image.js";

// Buat dummy buffer JPEG 720x578
const dummy = await sharp({
  create: { width: 720, height: 578, channels: 3, background: { r: 255, g: 0, b: 0 } }
}).jpeg().toBuffer();

const stickerBuffer = await convertToWaSticker(dummy);
const meta = await sharp(stickerBuffer).metadata();

assert.strictEqual(meta.format, "webp", "Output must be webp");
assert.strictEqual(meta.width, 512, "Width must be 512");
assert.strictEqual(meta.height, 512, "Height must be 512");
assert(stickerBuffer.length <= 100 * 1024, "Size must be <= 100KB");
console.log("Image converter tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/image.test.js`  
Expected: FAIL `Cannot find module '../src/services/image.js'`.

- [ ] **Step 3: Implement `src/services/image.js`**

Implement `sharp(buffer).resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 80 }).toBuffer()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/image.test.js`  
Expected: `Image converter tests passed!`

---

### Task 4: WhatsApp Sticker EXIF Metadata Injector

**Files:**
- Create: `src/services/exif.js`
- Test: `tests/exif.test.js`

**Interfaces:**
- Consumes: WebP buffer.
- Produces:
  - `addStickerMetadata(webpBuffer: Buffer, packName?: string, author?: string) -> Buffer`: Returns WebP buffer with embedded EXIF chunk containing sticker metadata JSON.

- [ ] **Step 1: Write test in `tests/exif.test.js`**

```javascript
import assert from "node:assert";
import sharp from "sharp";
import { addStickerMetadata } from "../src/services/exif.js";

const dummyWebp = await sharp({
  create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
}).webp().toBuffer();

const withExif = addStickerMetadata(dummyWebp, "Stiker TikTok", "TikTok to WA");
assert(withExif.includes(Buffer.from("Stiker TikTok")), "Metadata pack name must be present in buffer");
assert(withExif.includes(Buffer.from("TikTok to WA")), "Metadata author must be present in buffer");
console.log("EXIF metadata tests passed!");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/exif.test.js`  
Expected: FAIL `Cannot find module '../src/services/exif.js'`.

- [ ] **Step 3: Implement `src/services/exif.js`**

Create EXIF binary structure containing `sticker-pack-name`, `sticker-pack-publisher`, and insert into WebP RIFF EXIF chunk.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/exif.test.js`  
Expected: `EXIF metadata tests passed!`

---

### Task 5: Express API Server & Pipeline

**Files:**
- Create: `src/server.js`
- Test: `tests/server.test.js`

**Interfaces:**
- Consumes: `src/services/tiktok.js`, `src/services/image.js`, `src/services/exif.js`.
- Produces:
  - `POST /api/convert`: `{ url: string }` -> `{ success: true, stickerId: string, downloadUrl: string, previewBase64: string, author: string }`.
  - `GET /api/sticker/:id.webp`: streams `.webp` file with `image/webp` header.
  - Serves static files from `public/`.

- [ ] **Step 1: Write server API test in `tests/server.test.js`**

```javascript
import assert from "node:assert";
import { app } from "../src/server.js";

const server = app.listen(0);
const port = server.address().port;

try {
  const res = await fetch(`http://localhost:${port}/api/health`);
  const data = await res.json();
  assert.strictEqual(data.status, "ok", "Healthcheck should return ok");
  console.log("Server healthcheck passed!");
} finally {
  server.close();
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/server.test.js`  
Expected: FAIL `Cannot find module '../src/server.js'`.

- [ ] **Step 3: Implement `src/server.js`**

Configure Express, in-memory sticker store with LRU/TTL cleanup, `/api/health`, `/api/convert`, and `/api/sticker/:id.webp`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/server.test.js`  
Expected: `Server healthcheck passed!`

---

### Task 6: Modern Web UI (Frontend)

**Files:**
- Create: `public/index.html`

**Interfaces:**
- Consumes: `/api/convert` and `/api/sticker/:id.webp`.
- Features:
  - Clean card design with gradient background & mobile responsiveness.
  - URL input with "Tempel Link" (paste) button.
  - Loading spinner & error banners.
  - Live 512x512 preview box.
  - "Kirim ke WhatsApp" (Web Share API `navigator.share` with file fallback).
  - "Download Stiker (.webp)" direct download button.
  - Quick 3-step guide on how to save stiker into WhatsApp favorites.

- [ ] **Step 1: Create `public/index.html`**
- [ ] **Step 2: Verify frontend loads correctly via `GET /`**

---

### Task 7: End-to-End Verification with Live TikTok Link

**Files:**
- Test: `tests/e2e.test.js`

- [ ] **Step 1: Run end-to-end test on the user's real TikTok link**

```bash
node -e "
import { app } from './src/server.js';
const server = app.listen(3000, async () => {
  try {
    const res = await fetch('http://localhost:3000/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.tiktok.com/@kiwooyyo/video/7699857497426971925?share_comment_id=7700577294884750081' })
    });
    const data = await res.json();
    console.log('E2E Result:', data.success, data.downloadUrl);
  } finally {
    server.close();
  }
});
"
```

Expected: `E2E Result: true /api/sticker/...webp`

