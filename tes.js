import fs from 'fs';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { addStickerMetadata } from './src/services/exif.js';

// Baca .env
let TIKAPI_KEY = process.env.TIKAPI_KEY;
if (!TIKAPI_KEY && fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf-8');
    const match = envContent.match(/TIKAPI_KEY=([^\r\n]+)/);
    if (match) TIKAPI_KEY = match[1].trim();
}

if (!TIKAPI_KEY) {
    console.error('❌ Error: TIKAPI_KEY belum ditemukan di .env');
    process.exit(1);
}

const inputArg = process.argv[2] || 'https://vt.tiktok.com/ZS9yVG1JsScdx-IAcrm/';

async function resolveUrl(input) {
    if (input.startsWith('http://') || input.startsWith('https://')) {
        console.log(`🔗 Resolving link: ${input}`);
        const resp = await axios.get(input, {
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const finalUrl = resp.request?.res?.responseUrl || input;
        console.log(`📍 Final URL: ${finalUrl}`);

        const urlObj = new URL(finalUrl);
        const shareCommentId = urlObj.searchParams.get('share_comment_id');
        const shareItemId = urlObj.searchParams.get('share_item_id');
        const videoMatch = finalUrl.match(/\/video\/(\d+)/);
        const videoId = shareItemId || (videoMatch ? videoMatch[1] : null);

        return { videoId, commentId: shareCommentId, originalUrl: finalUrl };
    }

    return { videoId: process.argv[2], commentId: process.argv[3] || null };
}

function extractStickerUrl(comment) {
    if (!comment) return null;
    const struct = comment.cmt_sticker_struct || comment.sticker_struct;
    if (struct) {
        return (
            struct.animated_url?.high_resolution_url?.url_list?.[0] ||
            struct.animated_url?.mid_resolution_url?.url_list?.[0] ||
            struct.animated_url?.low_resolution_url?.url_list?.[0] ||
            struct.animated_url?.url_list?.[0] ||
            struct.static_url?.high_resolution_url?.url_list?.[0] ||
            struct.static_url?.mid_resolution_url?.url_list?.[0] ||
            struct.static_url?.url_list?.[0]
        );
    }
    if (comment.image_list && comment.image_list.length > 0) {
        return comment.image_list[0].origin_url?.url_list?.[0] || comment.image_list[0].crop_url?.url_list?.[0];
    }
    return null;
}

async function convertToWhatsAppSticker(imageUrl, outputPath, authorName = 'TikTok Sticker') {
    const resp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(resp.data);

    let sharpInstance;
    try {
        // Coba decode sebagai animated webp/gif
        sharpInstance = sharp(buffer, { animated: true });
        await sharpInstance.metadata();
    } catch {
        // Fallback decode standar jika format non-animasi
        sharpInstance = sharp(buffer);
    }

    const resized = await sharpInstance
        .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 80 })
        .toBuffer();

    const withExif = await addStickerMetadata(resized, 'TikTok Sticker Pack', authorName);
    fs.writeFileSync(outputPath, withExif);
    return withExif.length;
}

async function main() {
    const { videoId, commentId } = await resolveUrl(inputArg);

    console.log(`\n======================================================`);
    console.log(`🎬 Video ID   : ${videoId}`);
    console.log(`💬 Comment ID : ${commentId || '(Semua stiker di video)'}`);
    console.log(`======================================================`);

    const stickersDir = path.resolve('./stickers');
    if (!fs.existsSync(stickersDir)) fs.mkdirSync(stickersDir, { recursive: true });

    let cursor = 0;
    let hasMore = true;
    let allComments = [];
    let foundTarget = null;

    // 1. Fetch Main Comments (Loop sampai benar-benar tidak ada data atau mencapai batas maksimal)
    let consecutiveEmpty = 0;
    while (cursor < 500 && consecutiveEmpty < 2) {
        const res = await axios.get('https://api.tikapi.io/public/comment/list', {
            headers: { 'X-API-KEY': TIKAPI_KEY },
            params: { media_id: videoId, count: 30, cursor }
        });

        const list = res.data.comments || [];
        if (list.length === 0) {
            consecutiveEmpty++;
            cursor += 30;
            continue;
        }
        consecutiveEmpty = 0;
        allComments.push(...list);

        if (commentId) {
            foundTarget = list.find(c => String(c.cid) === String(commentId));
            if (foundTarget) break;
        }

        // Jangan langsung berhenti di has_more: 0 karena TikTok Web sering kirim has_more: 0 palsu di tengah-tengah
        cursor = res.data.cursor || (cursor + 30);
    }

    // 2. If target not found in main comments, check replies
    if (commentId && !foundTarget) {
        const parentCandidates = allComments.filter(c => c.reply_comment_total > 0);
        console.log(`🔍 Memeriksa balasan dari ${parentCandidates.length} komentar utama...`);

        for (const parent of parentCandidates) {
            try {
                const repRes = await axios.get('https://api.tikapi.io/public/comment/reply/list', {
                    headers: { 'X-API-KEY': TIKAPI_KEY },
                    params: { media_id: videoId, comment_id: parent.cid, count: 20 }
                });
                const replies = repRes.data.comments || [];
                foundTarget = replies.find(r => String(r.cid) === String(commentId));
                if (foundTarget) {
                    console.log(`📍 Ditemukan di dalam reply komentar ${parent.cid}!`);
                    break;
                }
            } catch (e) {
                // ignore
            }
        }
    }

    // 3. Process Sticker
    if (foundTarget) {
        console.log(`\n🎉 TARGET KOMENTAR DITEMUKAN!`);
        console.log(`👤 Pengguna : @${foundTarget.user?.unique_id} (${foundTarget.user?.nickname})`);
        console.log(`💬 Teks     : ${foundTarget.text || '(Tanpa Teks)'}`);

        const url = extractStickerUrl(foundTarget);
        if (url) {
            const outName = `sticker_${foundTarget.user?.unique_id || 'tiktok'}_${foundTarget.cid}.webp`;
            const outPath = path.join(stickersDir, outName);
            const size = await convertToWhatsAppSticker(url, outPath, foundTarget.user?.unique_id);
            console.log(`\n✅ BERHASIL MEMBUAT STIKER WHATSAPP:`);
            console.log(`📁 Lokasi : ${outPath}`);
            console.log(`⚖️ Ukuran : ${(size / 1024).toFixed(1)} KB`);
        } else {
            console.log(`⚠️ Komentar ditemukan tetapi bukan merupakan stiker.`);
        }
    } else {
        console.log(`\n⚠️ Komentar spesifik ID ${commentId} tidak ditemukan di feed publik.`);
        console.log(`✨ Mengonversi semua stiker yang tersedia di video ini:\n`);

        const stickerComments = allComments.filter(c => extractStickerUrl(c));
        let count = 0;
        for (const c of stickerComments) {
            try {
                const url = extractStickerUrl(c);
                const outName = `sticker_${c.user?.unique_id || 'user'}_${c.cid}.webp`;
                const outPath = path.join(stickersDir, outName);
                const size = await convertToWhatsAppSticker(url, outPath, c.user?.unique_id);
                console.log(`✅ Stiker: @${c.user?.unique_id} - ${outPath} (${(size / 1024).toFixed(1)} KB)`);
                count++;
            } catch (err) {
                console.log(`⚠️ Gagal convert stiker @${c.user?.unique_id}: ${err.message}`);
            }
        }

        if (count === 0) {
            console.log('Tidak ditemukan komentar berstiker pada video ini.');
        }
    }
}

main().catch(console.error);
