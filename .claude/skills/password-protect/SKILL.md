---
name: password-protect
description: Put a password gate in front of a blog post on pranav.com.au (this repo). Use this whenever the user wants to password-protect, gate, lock, restrict, or make private one or more existing posts — phrasings like "put a password on the X post", "gate this deck", "make the Lyra pitch private", "lock the game post", or "hide X behind a password". Encrypts the post so its content is not in the page source until unlocked, and gates it behind a shareable link that carries the password (?pass=...), with no password box on the page. Optionally hides it from the homepage list. Applies to any post directory under posts/. Do not use for creating/publishing new posts (that's the blog-post skill) or for real server-side auth.
---

# Password-protect a post

This is a **static** site (GitHub Pages, `pranav.com.au`). There is no backend, so any password check runs in the visitor's browser. This skill produces a **soft client-side gate**: the post's full HTML is encrypted with a shared password and shipped as ciphertext; the page decrypts in-browser (Web Crypto: PBKDF2-SHA256 + AES-256-GCM) only when the correct password is present, then re-renders the original document so all of the post's own scripts and styles keep working.

**The password travels in the link, not in a form.** The gate reads it from `?pass=<password>` on load and opens the post directly — so you hand someone one URL rather than a link plus a separate "the password is…" message, and they can forward that URL to whoever else should see it. `#pass=<password>` works identically and is the quieter option: fragments are never sent to servers and never appear in referrer headers. A visitor arriving without a password sees a short locked notice and no input box.

**What this is and isn't.** Because the content is encrypted (not merely hidden/overlaid), it is meaningfully harder to bypass than a CSS/JS reveal — the content genuinely is not in the page source until unlocked. But it is still client-side: the ciphertext plus a correct password fully reveal the content, and the password itself is only as strong as its secrecy. It's the right tool for *keep this semi-private, out of search, "ask me for the password"*. It is **not** real access control — for genuinely sensitive material, use Cloudflare Access, a hosted auth service, or move the page off GitHub Pages, and tell the user so.

Always surface three honest caveats to the user when you apply this:
1. It's a soft gate (above) — bypassable by a determined viewer.
2. Git history still holds the pre-gate plaintext, and `meta.yaml` keeps the title/description in the repo. This change only protects the *live* page source. If the repo is public and that matters, scrubbing history is a separate, larger step.
3. A password in a link travels further than a typed one: it lands in browser history and address bars, rides along in chat/social link previews, and is forwarded verbatim every time the link is passed on. Access spreads exactly as fast as the link does — which is the point of this mechanism, but it means you cannot un-share it. Rotating the password (re-encrypt, hand out a new link) is the only revocation.

## Inputs to confirm before applying

- **Which post(s)** — the slug(s) under `posts/`.
- **Password(s)** — one shared password, or a distinct one per post. Never invent a password; use exactly what the user gives.
- **Hide from the homepage?** — the homepage `index.html` is generated from `meta.yaml` files, and any post marked `draft: true` is left out of the list (the post still works via its direct URL). Gated posts are usually hidden this way, but confirm — the user may want it listed-but-gated.
- **No password box** is the default and only behavior here: access comes from the link. The gate holds no input field and no persistence — every visit re-derives the key from whatever the link carries. If the user wants a typed-password fallback for people who have the password but not a link, that's an addition to the generated gate — ask before adding it.

## Workflow

Run from the repo root. Reference the bundled scripts by absolute path (`.claude/skills/password-protect/scripts/`).

### 1. Preserve the plaintext (needed for verification and future re-encryption)

```bash
mkdir -p /tmp/pw-gate
command cp -f posts/<slug>/index.html /tmp/pw-gate/<slug>-plain.html
```

`cp` is aliased to `cp -i` in this shell — use `command cp -f` to overwrite without a silent prompt.

### 2. Encrypt the post in place

```bash
node .claude/skills/password-protect/scripts/encrypt-post.js \
  /tmp/pw-gate/<slug>-plain.html posts/<slug>/index.html '<password>'
```

The script encrypts the source and overwrites `posts/<slug>/index.html` with the gate. It refuses to run if the source is already a gate (guards against double-encryption). Pass the password in single quotes so the shell doesn't mangle it.

### 3. Hide from the homepage (if requested)

Add `draft: true` to the post's `meta.yaml` — on its own line, **never** as an inline `key: value  # comment`. The repo's tiny YAML parser (`scripts/build-index.sh`) only strips whole-line comments, so an inline comment on the value makes `draft` parse as the string `"true # ..."` and the post is **not** hidden. Put any note on the line above:

```yaml
# password-protected; hidden from the homepage post list
draft: true
```

Then regenerate the homepage:

```bash
./scripts/build-index.sh
```

Confirm the slug no longer appears: `grep -c "<slug>" index.html` should print `0`.

### 4. Verify the gate actually works

```bash
node .claude/skills/password-protect/scripts/verify-gate.js \
  posts/<slug>/index.html /tmp/pw-gate/<slug>-plain.html '<password>'
```

This uses Node's Web Crypto (the same API the browser runs) to confirm: the correct password decrypts to the byte-identical original, a wrong password is rejected, and no sampled plaintext leaked into the gate source. Expect `ALL CHECKS PASSED`.

One expected exception: if you passed the post's real title as the optional `[title]` argument, the leak check reports it as leaked — the gate's `<title>` genuinely is public. That is a deliberate choice, not a bug. Confirm the leaked tokens are *only* the title before accepting the failure, and prefer the default neutral "Protected" whenever the title itself gives away something the URL does not.

It does **not** exercise the link-reading path, so also load the page in a browser (serve the repo with `python3 -m http.server` and drive it with the headless-browser MCP). Check all four cases:

| URL | Expected |
| --- | --- |
| `…/posts/<slug>/?pass=<password>` | post renders, its own scripts run, `?pass=` still in the address bar so the link stays forwardable |
| `…/posts/<slug>/#pass=<password>` | same |
| `…/posts/<slug>/` | "Locked" notice, no input field, no plaintext in `document.documentElement.outerHTML` |
| `…/posts/<slug>/?pass=wrong` | "That link did not open it", still no plaintext |

### 5. Give the user the shareable link

The post is only reachable via its link, so hand it over explicitly:

```
https://pranav.com.au/posts/<slug>/?pass=<password>
```

### 6. Commit and push

Stage the gated post(s), the changed `meta.yaml`(s), and the rebuilt `index.html`. Use a clear message. Do not commit anything from `/tmp/pw-gate` — the plaintext must not re-enter the tree.

## Applying to several posts

Loop the per-post steps, then rebuild `index.html` **once** at the end and verify each slug is gone from it. Each post can take its own password.

## Changing or removing a password later

The gate holds only ciphertext, so you can't read the post back out of it without the password. Recover the original plaintext from git history, then re-run:

```bash
git show <commit-before-gating>:posts/<slug>/index.html > /tmp/pw-gate/<slug>-plain.html
# change password: re-run step 2 with the new password
# remove the gate entirely: command cp -f /tmp/pw-gate/<slug>-plain.html posts/<slug>/index.html,
#   drop draft:true from meta.yaml, rebuild index.html
```

## Crypto parameters (for reference / interop)

- KDF: PBKDF2-HMAC-SHA256, 210,000 iterations, 16-byte random salt
- Cipher: AES-256-GCM, 12-byte random IV, 16-byte tag
- Blob layout (base64 in the page): `salt(16) | iv(12) | ciphertext | tag(16)`

The encrypt (Node `crypto`) and decrypt (browser Web Crypto) sides must keep these in lockstep; `verify-gate.js` is the guard that they do.
