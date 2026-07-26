---
description: Create, update, or deploy a blog post (HTML page or packed deck) end to end
argument-hint: <path-to-html-or-instructions>
---

Invoke the **blog-post** skill and follow its workflow to fulfill this request: $ARGUMENTS

If no arguments were given, ask what to publish (a source HTML/deck file path, or content to write from scratch).

Follow the skill end to end: create or update the post directory and meta.yaml, rebuild the index, verify the render locally, commit and push with the repo's commit conventions, and confirm the post is live with the skill's check-live.sh script before reporting the URL.
