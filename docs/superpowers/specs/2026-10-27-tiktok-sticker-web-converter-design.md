# Desain Sistem: TikTok Sticker to WhatsApp Web Converter

**Tanggal:** 27 Oktober 2026  
**Status:** Disetujui (Direct TikTok API with insert_ids)

---

## 1. Ringkasan & Tujuan (Intent)
Membangun aplikasi web (*Web Converter*) yang memungkinkan pengguna memasukkan tautan komentar stiker TikTok, lalu secara otomatis mengonversinya menjadi stiker resmi WhatsApp (`.webp`, 512×512 piksel, metadata EXIF lengkap) secara instan (<0.5 detik) tanpa pihak ketiga, tanpa browser manual, dan tanpa CAPTCHA.

---

## 2. Pilihan Mesin Pengambil Data (Scraper Engine)
**Direct TikTok Official Web API (Tanpa Pihak Ketiga / No TikWM):**
- Endpoint: `https://www.tiktok.com/api/comment/list/`
- Parameter Kunci:
  - `aweme_id`: ID video TikTok.
  - `insert_ids`: ID komentar target (`share_comment_id`).
  - `aid`: `1988` (Web Client).
- **Keunggulan:**
  1. **Presisi 100%:** Menggunakan `insert_ids` membuat komentar target selalu berada di urutan pertama (`comments[0]`) tanpa perlu meloop atau mencari ratusan komentar.
  2. **Metadata Utuh:** Mempertahankan seluruh detail asli (`image_list`, `origin_url`, dimensi gambar, animasi jika ada).
  3. **Mandiri (Zero 3rd Party):** Tidak bergantung pada TikWM atau layanan perantara lain.
  4. **Kecepatan Tinggi & 0 Captcha:** Menanggapi dalam waktu ~150 milidetik via HTTP fetch standar.

---

## 3. Arsitektur Teknis & Stack

- **Runtime:** Node.js (v24, ES Module)
- **Web Framework:** Express.js
- **Image Processing:** `sharp` (resize 512x512, background transparan, kompresi WebP <100KB)
- **Metadata EXIF WhatsApp:** Raw EXIF / WebPMux injection untuk menyematkan:
  - Pack Name: `Stiker TikTok`
  - Publisher: `TikTok to WA Converter`
- **Frontend:** Single Page Application (HTML5, Tailwind CSS via CDN, modern Vanilla JS).

---

## 4. Alur Kerja Aplikasi

```
[Pengguna] Tempel URL TikTok di Web (misal: vt.tiktok.com/xxx)
     │
     ▼
[Express Server] POST /api/convert
     │
     ├─► 1. Resolve short-link -> Dapatkan URL panjang kanonikal
     ├─► 2. Ekstrak 'share_item_id' (aweme_id) dan 'share_comment_id'
     ├─► 3. Request ke TikTok Direct API:
     │      GET /api/comment/list/?aweme_id=...&insert_ids=...&aid=1988
     ├─► 4. Ambil URL gambar kualitas tertinggi dari comments[0].image_list[0].origin_url
     ├─► 5. Unduh buffer gambar & olah via Sharp (512x512, fit: contain, transparent)
     └─► 6. Sisipkan metadata EXIF resmi WhatsApp Sticker
     │
     ▼
[Pengguna] 
- Pratinjau stiker muncul seketika di layar
- HP: Tombol "Kirim ke WhatsApp" (membuka share sheet WhatsApp langsung)
- Desktop: Tombol "Download Stiker (.webp)" + panduan 1-langkah
```

---

## 5. Rincian Endpoint Backend

1. `GET /`: Halaman antarmuka Web Converter.
2. `POST /api/convert`:
   - Input: `{ "url": "https://..." }`
   - Output:
     ```json
     {
       "success": true,
       "stickerId": "unique-id",
       "downloadUrl": "/api/sticker/unique-id.webp",
       "previewBase64": "data:image/webp;base64,...",
       "author": "snop.rhayms",
       "commentText": ""
     }
     ```
3. `GET /api/sticker/:id.webp`: Endpoint streaming unduhan file `.webp` stiker.
