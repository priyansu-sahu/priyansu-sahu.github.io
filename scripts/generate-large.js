#!/usr/bin/env node
// Build the high-resolution "large" tier the lightbox zooms into:
//   assets/<stem>-lg.webp   (LARGE_EDGE px on the long edge, WebP q90)
// from the original camera files, then bake data-large="…/assets/<stem>-lg.webp"
// onto every gallery item in gallery/index.html and index.html.
// Idempotent: existing -lg files are kept unless --force; attributes are replaced.
//
//   npm run large                 default 4000px edge, sources under ~/Desktop
//   npm run large -- --force      re-encode everything
//   LARGE_EDGE=6192 npm run large full-resolution export
//   PHOTO_SOURCES="D:/photos;E:/more" npm run large   other source folders (';'-separated)

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const FILES = ['gallery/index.html', 'index.html'];
const EDGE = parseInt(process.env.LARGE_EDGE || '4000', 10);
const QUALITY = parseInt(process.env.LARGE_QUALITY || '90', 10);
const FORCE = process.argv.includes('--force');
const SOURCES = (process.env.PHOTO_SOURCES || path.join(os.homedir(), 'Desktop'))
  .split(';').map(s => s.trim()).filter(Boolean);
const SKIP_DIRS = new Set(['node_modules', '.git', 'priyansu-sahu.github.io']);

// stem -> best original path. Several copies of a camera file may exist
// (raw card dump, an edited export in a "best" folder); prefer the newest.
function indexOriginals() {
  const found = new Map();
  function walk(dir, depth) {
    if (depth > 8) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(p, depth + 1); continue; }
      if (!/\.jpe?g$/i.test(e.name)) continue;
      const stem = e.name.replace(/\.[^.]+$/, '');
      const mtime = fs.statSync(p).mtimeMs;
      const prev = found.get(stem);
      if (!prev || mtime > prev.mtime) found.set(stem, { path: p, mtime });
    }
  }
  SOURCES.forEach(s => walk(s, 0));
  return found;
}

function galleryItems(html) {
  // every gallery-item opening tag, with the stem and asset prefix of its <img>
  const tagRe = /<(div|figure)([^>]*class="gallery-item[^"]*"[^>]*)>/g;
  const out = [];
  for (const m of html.matchAll(tagRe)) {
    const after = html.slice(m.index, m.index + 800);
    const src = after.match(/src="([^"]*assets\/)([A-Za-z0-9_-]+)\.jpg"/);
    if (src) out.push({ tag: m[0], el: m[1], attrs: m[2], prefix: src[1], stem: src[2] });
  }
  return out;
}

async function encode(stem, src) {
  const out = path.join(ASSETS, stem + '-lg.webp');
  if (fs.existsSync(out) && !FORCE) return { out, skipped: true };
  await sharp(src).rotate()
    .resize(EDGE, EDGE, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(out);
  return { out, skipped: false };
}

async function main() {
  console.log('Indexing originals under: ' + SOURCES.join(', '));
  const originals = indexOriginals();
  console.log('  ' + originals.size + ' camera files found\n');

  const perFile = FILES.map(rel => ({ rel, html: fs.readFileSync(path.join(ROOT, rel), 'utf8') }))
    .map(f => ({ ...f, items: galleryItems(f.html) }));
  const stems = [...new Set(perFile.flatMap(f => f.items.map(i => i.stem)))];

  let made = 0, skipped = 0, missing = [];
  let totalBytes = 0;
  for (const stem of stems) {
    const o = originals.get(stem);
    if (!o) { missing.push(stem); console.log('  ! no original for ' + stem); continue; }
    const t0 = Date.now();
    const r = await encode(stem, o.path);
    const bytes = fs.statSync(r.out).size;
    totalBytes += bytes;
    if (r.skipped) { skipped++; continue; }
    made++;
    console.log('  + ' + stem + '-lg.webp  ' + (bytes / 1e6).toFixed(2) + 'MB  ' +
      ((Date.now() - t0) / 1000).toFixed(1) + 's  <- ' + path.relative(os.homedir(), o.path));
  }

  // bake data-large onto the items whose file exists
  for (const f of perFile) {
    let html = f.html;
    for (const it of f.items) {
      const file = path.join(ASSETS, it.stem + '-lg.webp');
      let attrs = it.attrs.replace(/\s+data-large="[^"]*"/, '');
      if (fs.existsSync(file)) {
        attrs = attrs.replace(/(\s+data-lightbox)(?=\s|$)/, `$1 data-large="${it.prefix}${it.stem}-lg.webp"`);
        if (!attrs.includes('data-large=')) attrs += ` data-large="${it.prefix}${it.stem}-lg.webp"`;
      }
      const tag = `<${it.el}${attrs}>`;
      if (tag !== it.tag) html = html.replace(it.tag, tag);
    }
    if (html !== f.html) {
      fs.writeFileSync(path.join(ROOT, f.rel), html);
      console.log('  ~ ' + f.rel + ': data-large baked into ' + f.items.length + ' items');
    }
  }

  console.log('\nEncoded ' + made + ', kept ' + skipped + ', missing originals ' + missing.length +
    '. Large tier: ' + (totalBytes / 1e6).toFixed(0) + 'MB across ' + (stems.length - missing.length) + ' photos.');
  if (missing.length) console.log('Missing: ' + missing.join(', '));
}

main().catch(err => { console.error(err); process.exit(1); });
