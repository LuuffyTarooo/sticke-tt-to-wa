import assert from "node:assert";
import { app } from "../src/server.js";

const server = app.listen(0);
const port = server.address().port;

try {
  const res = await fetch(`http://localhost:${port}/`);
  const html = await res.text();
  assert(html.includes("TikTok to WA Sticker"), "HTML should contain page title");
  assert(html.includes("Konversi ke Stiker WhatsApp"), "HTML should contain submit button");
  assert(html.includes("Evil0ctal Douyin_TikTok_Download_API"), "HTML should contain Evil0ctal option");
  assert(html.includes("Apify API"), "HTML should contain Apify option");
  assert(html.includes("apifyToken"), "HTML should contain apifyToken input");
  assert(html.includes("apiSource"), "HTML should contain apiSource selector");
  console.log("Frontend HTML verified successfully!");
} finally {
  server.close();
}

