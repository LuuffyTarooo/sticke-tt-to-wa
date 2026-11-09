// src/services/exif.js

/**
 * Menyuntikkan metadata EXIF resmi WhatsApp Sticker ke dalam buffer WebP
 * Memastikan standar Extended WebP (VP8X) dipenuhi agar dikenali WhatsApp
 */
export function addStickerMetadata(webpBuffer, packName = "Stiker TikTok", author = "TikTok to WA") {
  const json = {
    "sticker-pack-id": "com.tiktok.sticker",
    "sticker-pack-name": packName,
    "sticker-pack-publisher": author,
    "emojis": ["⭐"]
  };

  const exifHeader = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, // II*\0 (TIFF little endian)
    0x08, 0x00, 0x00, 0x00, // Offset ke IFD pertama
    0x01, 0x00,             // Jumlah tag (1)
    0x41, 0x57,             // Tag 0x5741 ("WA" WhatsApp metadata)
    0x07, 0x00,             // Tipe: UNDEFINED (bytes)
    0x00, 0x00, 0x00, 0x00, // Panjang data JSON (akan diisi)
    0x16, 0x00, 0x00, 0x00  // Offset lokasi data JSON (22)
  ]);

  const jsonBuffer = Buffer.from(JSON.stringify(json), "utf-8");
  exifHeader.writeUInt32LE(jsonBuffer.length, 14);

  const exifPayload = Buffer.concat([exifHeader, jsonBuffer]);
  
  // Padding jika ukuran payload ganjil (aturan kontainer RIFF)
  const isOdd = exifPayload.length % 2 !== 0;
  const padding = isOdd ? Buffer.from([0x00]) : Buffer.alloc(0);

  // Buat chunk EXIF
  const exifChunkHeader = Buffer.alloc(8);
  exifChunkHeader.write("EXIF", 0, 4, "ascii");
  exifChunkHeader.writeUInt32LE(exifPayload.length, 4);

  const exifChunk = Buffer.concat([exifChunkHeader, exifPayload, padding]);

  const fourCC = webpBuffer.subarray(12, 16).toString("ascii");

  let result;
  if (fourCC === "VP8X") {
    // WebP sudah memiliki header VP8X: set bit 3 (EXIF flag = 0x08)
    webpBuffer[20] |= 0x08;
    result = Buffer.concat([webpBuffer, exifChunk]);
  } else {
    // Simple WebP (VP8 atau VP8L): Upgrade ke Extended WebP (VP8X)
    // Canvas 512x512 -> width-1 = 511 (0x0001ff), height-1 = 511 (0x0001ff)
    const vp8xChunk = Buffer.alloc(18);
    vp8xChunk.write("VP8X", 0, 4, "ascii");
    vp8xChunk.writeUInt32LE(10, 4); // Panjang payload VP8X = 10 bytes
    
    // Flags (4 bytes): bit 3 (EXIF: 0x08) | bit 4 (Alpha: 0x10 jika ada alpha)
    const hasAlpha = fourCC === "VP8L";
    let flags = 0x08;
    if (hasAlpha) flags |= 0x10;
    vp8xChunk.writeUInt32LE(flags, 8);
    
    // Canvas width - 1 (24-bit uint LE)
    vp8xChunk.writeUInt16LE(511, 12);
    vp8xChunk.writeUInt8(0, 14);
    
    // Canvas height - 1 (24-bit uint LE)
    vp8xChunk.writeUInt16LE(511, 15);
    vp8xChunk.writeUInt8(0, 17);

    // Sisipkan VP8X di antara header RIFF (12 bytes) dan payload gambar (VP8/VP8L)
    const riffHeader = webpBuffer.subarray(0, 12);
    const imagePayload = webpBuffer.subarray(12);

    result = Buffer.concat([riffHeader, vp8xChunk, imagePayload, exifChunk]);
  }

  // Update total file size pada header RIFF (indeks 4..7)
  const newFileSize = result.length - 8;
  result.writeUInt32LE(newFileSize, 4);

  return result;
}
