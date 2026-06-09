#!/usr/bin/env bash
#
# build-index.sh — Generate index.html from posts/*/meta.yaml sidecar files.
#
# Usage: ./scripts/build-index.sh   (run from repo root)
#
# Requires: python3 (uses only stdlib — no PyYAML needed; parses simple YAML inline)
#
set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve repo root (parent of scripts/)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Use Python to parse YAML, filter, sort, and emit the final index.html
# ---------------------------------------------------------------------------
python3 - "$REPO_ROOT" <<'PYTHON_SCRIPT'
import sys, os, re, json, html
from datetime import datetime

repo_root = sys.argv[1]

# ── Tiny YAML parser (handles the subset we need) ────────────────────────
def parse_yaml(path):
    """Parse a simple flat YAML file into a dict.

    Supports scalar values (strings, booleans, numbers) and flat lists
    written in flow style ([a, b, c]).  That is all meta.yaml needs.
    """
    data = {}
    with open(path, "r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            # Strip optional leading/trailing "---"
            if line == "---":
                continue
            m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)', line)
            if not m:
                continue
            key = m.group(1)
            val = m.group(2).strip()

            # Boolean
            if val.lower() in ("true", "yes"):
                data[key] = True
                continue
            if val.lower() in ("false", "no"):
                data[key] = False
                continue

            # Flow-style list: [item1, item2, ...]
            if val.startswith("[") and val.endswith("]"):
                inner = val[1:-1]
                items = [v.strip().strip('"').strip("'") for v in inner.split(",") if v.strip()]
                data[key] = items
                continue

            # Quoted string
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1]
                # Process YAML double-quote escape sequences
                val = val.replace('\\"', '"')
                val = val.replace('\\\\', '\\')
                val = val.replace('\\n', '\n')
                val = val.replace('\\t', '\t')
            elif val.startswith("'") and val.endswith("'"):
                val = val[1:-1]
                # YAML single-quoted strings only escape '' -> '
                val = val.replace("''", "'")

            data[key] = val
    return data


# ── Discover and parse all meta.yaml files ────────────────────────────────
posts_dir = os.path.join(repo_root, "posts")
entries = []
total_found = 0
drafts_skipped = 0

if os.path.isdir(posts_dir):
    for slug in sorted(os.listdir(posts_dir)):
        meta_path = os.path.join(posts_dir, slug, "meta.yaml")
        if not os.path.isfile(meta_path):
            continue
        total_found += 1
        meta = parse_yaml(meta_path)

        # Skip drafts
        if meta.get("draft", False) is True:
            drafts_skipped += 1
            continue

        title = meta.get("title", slug)
        date_str = meta.get("date", "1970-01-01")
        description = meta.get("description", "")
        tags = meta.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        try:
            dt = datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            print(f"build-index: warning: bad date '{date_str}' in {meta_path}", file=sys.stderr)
            dt = datetime(1970, 1, 1)

        entries.append({
            "slug": slug,
            "title": title,
            "date": dt,
            "date_str": date_str,
            "description": description,
            "tags": tags,
        })

# Sort by date descending
entries.sort(key=lambda e: e["date"], reverse=True)

# Report to stderr
print(f"build-index: {total_found} posts found, {drafts_skipped} skipped (drafts)", file=sys.stderr)


# ── Format human-readable date ────────────────────────────────────────────
def fmt_date(dt):
    """Format datetime as 'Jun 9, 2026' (no zero-padding on day)."""
    return dt.strftime("%b ") + str(dt.day) + dt.strftime(", %Y")


# ── Build post list HTML ──────────────────────────────────────────────────
post_items = []
for entry in entries:
    tags_html = ""
    if entry["tags"]:
        spans = "".join(
            f'<span class="tag">{html.escape(t)}</span>'
            for t in entry["tags"]
        )
        tags_html = f'\n            <div class="tags">\n              {spans}\n            </div>'

    item = (
        f'      <li class="post-card">\n'
        f'        <a href="posts/{html.escape(entry["slug"])}/">\n'
        f'          <time datetime="{html.escape(entry["date_str"])}">{html.escape(fmt_date(entry["date"]))}</time>\n'
        f'          <h2>{html.escape(entry["title"])}</h2>\n'
        f'          <p>{html.escape(entry["description"])}</p>{tags_html}\n'
        f'        </a>\n'
        f'      </li>'
    )
    post_items.append(item)

post_list_html = "\n".join(post_items)

# ── Assemble final HTML ───────────────────────────────────────────────────
index_html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pranav Dhoolia</title>
  <meta name="description" content="Pranav Dhoolia — AI systems, evals, and fine-tuning">
  <meta property="og:title" content="Pranav Dhoolia">
  <meta property="og:description" content="AI systems, evals, and fine-tuning">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://pranav.com.au/">
  <link rel="canonical" href="https://pranav.com.au/">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <nav>
      <a href="./" class="active">Home</a>
      <a href="about.html">About</a>
    </nav>
    <div class="hero">
      <h1>Pranav Dhoolia</h1>
      <p>AI systems, evals, and fine-tuning</p>
    </div>
  </header>
  <main>
    <ul class="post-list">
{post_list_html}
    </ul>
  </main>
  <footer>
    <p>&copy; 2026 Pranav Dhoolia</p>
  </footer>
</body>
</html>
'''

# ── Write output ──────────────────────────────────────────────────────────
out_path = os.path.join(repo_root, "index.html")
with open(out_path, "w", encoding="utf-8") as fh:
    fh.write(index_html)

PYTHON_SCRIPT

echo >&2 "build-index: wrote index.html"
exit 0
