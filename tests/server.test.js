import assert from "node:assert";
import { app } from "../src/server.js";

const server = app.listen(0);
const port = server.address().port;

try {
  // Test healthcheck
  const resHealth = await fetch(`http://localhost:${port}/api/health`);
  const dataHealth = await resHealth.json();
  assert.strictEqual(dataHealth.status, "ok", "Healthcheck should return ok");

  // Test convert without URL (validation error)
  const resBad = await fetch(`http://localhost:${port}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const dataBad = await resBad.json();
  assert.strictEqual(dataBad.success, false);
  assert(dataBad.error, "Should have error message");

  // Test convert with Evil0ctal apiSource with invalid host
  const resEvil = await fetch(`http://localhost:${port}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.tiktok.com/@user/video/1234567890123456789",
      apiSource: "evil0ctal",
      evil0ctalUrl: "http://127.0.0.1:59999"
    })
  });
  const dataEvil = await resEvil.json();
  assert.strictEqual(dataEvil.success, false);
  assert(dataEvil.error.includes("Evil0ctal") || dataEvil.error.includes("Gagal terhubung"));

  // Test convert with Apify apiSource without token
  const resApify = await fetch(`http://localhost:${port}/api/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://www.tiktok.com/@user/video/1234567890123456789",
      apiSource: "apify",
      apifyToken: ""
    })
  });
  const dataApify = await resApify.json();
  assert.strictEqual(dataApify.success, false);
  assert(dataApify.error.includes("Apify") || dataApify.error.includes("Token"));

  console.log("Server tests passed!");
} finally {
  server.close();
}

