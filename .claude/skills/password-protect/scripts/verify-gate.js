#!/usr/bin/env node
// verify-gate.js — prove a generated gate decrypts correctly.
//
// Usage:
//   node verify-gate.js <gate.html> <original-plaintext.html> <password>
//
// Uses Node's Web Crypto (crypto.webcrypto) — the SAME API the browser runs —
// so a pass here means the in-browser unlock path works. Checks three things:
//   1. correct password decrypts to byte-identical original
//   2. a wrong password is rejected (AES-GCM auth tag fails)
//   3. no obvious plaintext leaked into the gate's own source
const fs = require("fs");
const { webcrypto: wc } = require("crypto");

const [, , GATE, ORIG, PASSWORD] = process.argv;
if (!GATE || !ORIG || !PASSWORD) {
  console.error("Usage: node verify-gate.js <gate.html> <original.html> <password>");
  process.exit(1);
}

const page = fs.readFileSync(GATE, "utf8");
const original = fs.readFileSync(ORIG);
const DATA = (page.match(/const DATA = "([^"]+)"/) || [])[1];
const ITER = parseInt((page.match(/const ITER = (\d+)/) || [])[1], 10);
if (!DATA || !ITER) { console.error("FAIL: could not find DATA/ITER in gate."); process.exit(1); }

const b64 = s => Uint8Array.from(Buffer.from(s, "base64"));

async function unlock(password) {
  const raw = b64(DATA);
  const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
  const enc = new TextEncoder();
  const baseKey = await wc.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await wc.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  return Buffer.from(await wc.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
}

(async () => {
  let ok = true;

  // 1. correct password round-trips
  const out = await unlock(PASSWORD);
  const matches = out.equals(original);
  console.log((matches ? "PASS" : "FAIL") + ": correct password decrypts to byte-identical original (" + out.length + " bytes)");
  ok = ok && matches;

  // 2. wrong password rejected
  let rejected = false;
  try { await unlock(PASSWORD + "-wrong"); } catch { rejected = true; }
  console.log((rejected ? "PASS" : "FAIL") + ": wrong password is rejected");
  ok = ok && rejected;

  // 3. no plaintext leak — sample distinctive tokens from the original body text
  const text = original.toString("utf8");
  const tokens = (text.match(/>[^<>{}\n]{12,60}</g) || [])
    .map(t => t.slice(1, -1).trim())
    .filter(t => /[a-zA-Z]{6,}/.test(t))
    .slice(0, 40);
  const leaked = tokens.filter(t => page.includes(t));
  const noLeak = leaked.length === 0;
  console.log((noLeak ? "PASS" : "FAIL") + ": no sampled plaintext tokens present in gate source" +
    (noLeak ? "" : " (leaked: " + JSON.stringify(leaked.slice(0, 3)) + ")"));
  ok = ok && noLeak;

  console.log(ok ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error("ERROR", e); process.exit(1); });
