#!/usr/bin/env node
// encrypt-post.js — wrap a static post in an encrypted password gate.
//
// Usage:
//   node encrypt-post.js <source-plaintext.html> <output-gate.html> <password> [title]
//
// Encrypts the ENTIRE source document with the password using
// PBKDF2(SHA-256, 210k) + AES-256-GCM, then emits a standalone gate page
// that carries only the ciphertext. On correct entry the page decrypts in
// the browser via the Web Crypto API and re-renders the original document
// (document.write), so any inline scripts/styles in the post keep working.
//
// The content is NOT present in the gate's page source until unlocked, which
// is what makes this meaningfully stronger than a hide/overlay. It is still a
// *client-side* gate: the ciphertext + a correct password fully reveal the
// content, so this deters casual access and keeps a post out of search — it is
// not real access control for genuinely sensitive material.
const fs = require("fs");
const crypto = require("crypto");

const [, , SRC, OUT, PASSWORD, TITLE] = process.argv;
if (!SRC || !OUT || !PASSWORD) {
  console.error("Usage: node encrypt-post.js <source.html> <output.html> <password> [title]");
  process.exit(1);
}

const GATE_MARKER = "<!-- pw-gate:v1 -->";
const ITERATIONS = 210000;

const plaintext = fs.readFileSync(SRC); // raw bytes (utf-8)

// Guard against double-encryption: if the source is already a gate, its
// plaintext is the ciphertext blob — re-encrypting would be a silent mistake.
if (plaintext.includes(GATE_MARKER)) {
  console.error(
    "Refusing to encrypt: " + SRC + " is already a password gate.\n" +
    "To change the password, recover the original plaintext first, e.g.\n" +
    "  git show <commit-before-gating>:posts/<slug>/index.html > /tmp/plain.html\n" +
    "then run this script against that plaintext."
  );
  process.exit(2);
}

const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(PASSWORD, salt, ITERATIONS, 32, "sha256");
const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
const tag = cipher.getAuthTag();

// Web Crypto AES-GCM expects ciphertext||tag. Blob = salt(16)|iv(12)|ct|tag(16)
const blob = Buffer.concat([salt, iv, ct, tag]).toString("base64");
const title = (TITLE || "Protected").replace(/[<>&]/g, "");

const page = `<!DOCTYPE html>
${GATE_MARKER}
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title} · Pranav Dhoolia</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --ink:#0d1411; --panel:#18231e; --line:#31423a;
  --bone:#ece7db; --dim:#8d9a92; --dimmer:#5c6962;
  --brass:#c9922f; --rust:#c0503f;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{
  background:radial-gradient(120% 65% at 50% -8%, #1a2620 0%, rgba(26,38,32,0) 62%), var(--ink);
  color:var(--bone);
  font-family:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  font-size:15px;line-height:1.6;min-height:100vh;
  display:flex;align-items:center;justify-content:center;padding:24px;
  -webkit-font-smoothing:antialiased;
}
.gate{width:100%;max-width:380px;text-align:center}
.eyebrow{font-family:"IBM Plex Mono",monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);margin-bottom:14px}
h1{font-family:"Bodoni Moda",Didot,Georgia,serif;font-weight:400;font-size:30px;margin:0 0 8px}
.sub{color:var(--dim);font-size:14px;margin:0 0 26px}
form{display:flex;flex-direction:column;gap:12px}
input[type=password]{
  width:100%;padding:12px 14px;font-size:15px;
  font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  color:var(--bone);background:var(--panel);
  border:1px solid var(--line);border-radius:8px;outline:none;
  text-align:center;letter-spacing:.12em;
}
input[type=password]:focus{border-color:var(--brass)}
button{
  width:100%;padding:12px 14px;font-size:14px;cursor:pointer;
  font-family:"IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink);background:var(--brass);border:none;border-radius:8px;
  transition:opacity .15s;
}
button:hover{opacity:.9}
button:disabled{opacity:.5;cursor:default}
.err{min-height:18px;color:var(--rust);font-size:12.5px;font-family:"IBM Plex Mono",monospace;margin-top:2px}
.foot{margin-top:26px;font-size:12px;color:var(--dimmer)}
.foot a{color:var(--dim);text-decoration:none;border-bottom:1px solid var(--line)}
.foot a:hover{color:var(--bone)}
</style>
</head>
<body>
<main class="gate">
  <div class="eyebrow">Protected post</div>
  <h1>Locked</h1>
  <p class="sub">This post is password&#8209;protected. Enter the password to continue.</p>
  <form id="f" autocomplete="off">
    <input id="pw" type="password" placeholder="Password" aria-label="Password" autofocus autocomplete="off" spellcheck="false">
    <button id="go" type="submit">Unlock</button>
    <div class="err" id="err" role="alert" aria-live="polite"></div>
  </form>
  <p class="foot"><a href="/">&larr; Back to home</a></p>
</main>
<script>
const DATA = "${blob}";
const ITER = ${ITERATIONS};
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const form = document.getElementById("f");
const pwEl = document.getElementById("pw");
const goEl = document.getElementById("go");
const errEl = document.getElementById("err");

async function unlock(password){
  const raw = b64(DATA);
  const salt = raw.slice(0, 16);
  const iv = raw.slice(16, 28);
  const ct = raw.slice(28);
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    {name:"PBKDF2", salt, iterations:ITER, hash:"SHA-256"},
    baseKey, {name:"AES-GCM", length:256}, false, ["decrypt"]
  );
  const buf = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, ct);
  return new TextDecoder().decode(buf);
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  errEl.textContent = "";
  goEl.disabled = true;
  try {
    const html = await unlock(pwEl.value);
    document.open();
    document.write(html);
    document.close();
  } catch (_){
    errEl.textContent = "Incorrect password.";
    goEl.disabled = false;
    pwEl.value = "";
    pwEl.focus();
  }
});
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, page);
console.log("Wrote gate: " + OUT + " (" + page.length + " bytes; blob " + blob.length + " b64 chars)");
