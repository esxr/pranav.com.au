---
name: blog-post
description: This skill should be used when the user asks to "create a post", "add a post", "deploy this HTML as a post", "publish this deck", "update a post", "redeploy a post", or provides an HTML file (including packed deck bundles) to publish on the blog. Covers the full pipeline — post directory, meta.yaml, index rebuild, local render check, commit/push, and live verification on pranav.com.au.
---

# Blog Post Creation & Deployment

Publish or update a post on the static blog (this repo, deployed via GitHub Pages at https://pranav.com.au). A post is a directory `posts/<slug>/` containing:

- `index.html` — the post content (a full standalone HTML page)
- `meta.yaml` — sidecar metadata consumed by `scripts/build-index.sh`
- optional extra assets (e.g. a `.pptx` alongside the deck)

`index.html` (the site home page) is **generated** — never edit it by hand; always regenerate with `./scripts/build-index.sh`.

## Workflow: new post

### 1. Create the post directory

Pick a kebab-case slug from the post's title. Copy or write the content:

```bash
mkdir -p posts/<slug>
command cp -f "/path/to/source.html" posts/<slug>/index.html
```

**Gotcha:** `cp` is aliased to `cp -i` in this shell — plain `cp` over an existing file silently prompts and fails. Always use `command cp -f` when overwriting.

**Packed decks:** HTML files exported as self-contained "bundler" decks (marker: `__bundler_loading` / `<script type="__bundler/manifest">`, several MB of base64) are valid posts — copy them verbatim as `index.html`. Their content is unreadable in the source; to learn the title/subject for metadata, either `grep -o 'SomeKeyword[^<"]\{0,120\}'` for readable fragments, or render it locally (step 3) and read the title slide.

### 2. Write meta.yaml

```yaml
title: "Post Title"
date: "YYYY-MM-DD"
description: "One-sentence description — shown on the index card and used for og/meta."
tags: ["tag-one", "tag-two"]
```

Rules (the build script's YAML parser is minimal):
- Flat keys only; lists in flow style `[a, b, c]`; quoted strings.
- `date` must be `YYYY-MM-DD` (index sorts by it, newest first).
- Add `draft: true` to keep a post out of the index.
- For decks, prefer the deck's own tagline/subtitle as the description.
- A post directory **without** `meta.yaml` is ignored by the index entirely (useful for staging).

### 3. Rebuild the index and verify the render locally

```bash
./scripts/build-index.sh          # regenerates index.html; reports drafts skipped
```

Then confirm the post actually renders (mandatory for packed decks — they require JS to unpack):

```bash
python3 -m http.server 8742 --bind 127.0.0.1   # run in background from repo root
```

Open `http://127.0.0.1:8742/posts/<slug>/` with a browser tool and screenshot it. A packed deck should show slides + navigation, not a stuck "Unpacking..." indicator. A favicon.ico 404 in the console is site-wide and harmless — ignore it.

Afterward clean up: kill the server, delete any screenshot files and the `.playwright-mcp/` directory — never commit these.

### 4. Commit and push

Before committing, check `git status` for **other** uncommitted post directories: the regenerated index links every post that has a `meta.yaml`, so pushing the index without those posts creates broken links on the live site. Commit them too (each as its own `add: <name> post` commit).

Commit message conventions (see `git log`):
- `add: <short name> post` — new post
- `update: <short name>` — changed post content
- `chore: rebuild index` — index.html regeneration (separate commit)

Never commit `.DS_Store` files.

Push flow — the remote frequently has a `github-actions[bot]` "chore: rebuild index" commit not present locally, so a plain push may be rejected:

```bash
git push || (git pull --rebase && ./scripts/build-index.sh && git push)
```

If the rebase touches `index.html`, re-run `./scripts/build-index.sh` after it — the locally generated index (built from all current `meta.yaml` files) is the source of truth; confirm `git status` is clean afterward, otherwise commit the regenerated index.

### 5. Verify live

GitHub Pages deploys within ~15–60 seconds of the push. Verify with the bundled script:

```bash
.claude/skills/blog-post/scripts/check-live.sh <slug>
```

It polls `https://pranav.com.au/posts/<slug>/` until the live content's SHA-256 matches the local `index.html` (i.e. the *new* version is live, not a cached old one). Report the live URL to the user only after this passes.

## Workflow: update an existing post

1. `command cp -f` the new file over `posts/<slug>/index.html`.
2. `git diff --stat` to sanity-check the change (for packed decks the diff is opaque base64 — render locally instead to see what changed).
3. Re-verify the render (step 3 above). If the title slide/description changed, update `meta.yaml` and rebuild the index; otherwise no index rebuild is needed.
4. Commit as `update: <short name>`, push, verify live (steps 4–5).

## Quick reference

| Item | Value |
|---|---|
| Live site | https://pranav.com.au |
| Post URL | `https://pranav.com.au/posts/<slug>/` |
| Index builder | `./scripts/build-index.sh` (run from repo root) |
| Live check | `.claude/skills/blog-post/scripts/check-live.sh <slug>` |
| Draft flag | `draft: true` in meta.yaml |
