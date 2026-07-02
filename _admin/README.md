# Local admin tool

A local-only tool for adding content to the site — **quotes, writing posts, and gallery photos** — through a browser form instead of hand-editing HTML.

This folder is **never deployed**. GitHub Pages runs Jekyll, which ignores `_`-prefixed paths, so nothing in `_admin/` reaches the live site.

## Run it

```
npm run admin
```

Starts a local server on <http://localhost:4517> and opens it in your browser. Three tabs:

- **Quote** — appends a `<li>` to `quotes/index.html`. Straight quotes/apostrophes and ` -- ` become typographic (`&rsquo;`, `&ldquo;…&rdquo;`, `&mdash;`).
- **Post** — creates `writing/<slug>/index.html` from `templates/post.html` and prepends an entry to `writing/index.html`. Write the body as plain text, one blank line between paragraphs.
- **Photo** — pick a JPG; it's auto-rotated and resized to 1600px on the long edge, written as `.jpg` (q88) + `.webp` (q82) in `assets/`, and a gallery item is added to the **top** of `gallery/index.html`. Dimensions are read from the output and baked into the markup.

After each action you get an **open preview** link — the server also serves the real site from disk, so you see the actual page before anything is public.

## Publishing

The tool only writes files locally; it never commits or pushes. When the preview looks right, push the way you normally do (or ask Claude). GitHub Pages rebuilds in ~1–2 min.

## Notes

- **Home page featuring is manual** — that layout is hand-tuned, so new photos go to the gallery only.
- A **new city** won't get a gallery filter chip automatically; add one in `gallery/index.html` if you want it filterable.
- Needs `npm install` once (for `sharp`).
- Env: `ADMIN_PORT` to change the port; `ADMIN_NO_OPEN=1` to skip auto-opening the browser.
