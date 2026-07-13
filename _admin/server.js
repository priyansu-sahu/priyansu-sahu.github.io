#!/usr/bin/env node
/* ============================================================
   Local admin tool for priontherun.com
   Run with:  npm run admin
   Serves a small form UI (and live previews) and writes content
   files — quotes, writing posts, gallery photos — straight into
   the repo. Lives in _admin/, which Jekyll excludes from the
   GitHub Pages build, so none of this ships to the live site.
   Nothing is committed or pushed automatically: you review, then
   push when you're happy.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync, exec } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.ADMIN_PORT) || 4517;

let sharp = null;
try { sharp = require('sharp'); } catch (_) { /* photo tab reports if missing */ }
let exifReader = null;
try { exifReader = require('exif-reader'); } catch (_) { /* exif line skipped if missing */ }

/* ---------- small helpers ---------- */
const read   = p => fs.readFileSync(p, 'utf8');
const writeF = (p, s) => fs.writeFileSync(p, s, 'utf8');
const exists = p => fs.existsSync(p);
const R      = (...x) => path.join(ROOT, ...x);
const nlOf   = s => (s.includes('\r\n') ? '\r\n' : '\n');

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function attr(s) { return esc(s).replace(/"/g, '&quot;'); }
// curly apostrophes + quotes; run AFTER esc()
function typo(s) {
  return s
    .replace(/(\S)'(\S)/g, '$1&rsquo;$2')
    .replace(/'/g, '&rsquo;')
    .replace(/"([^"]*)"/g, '&ldquo;$1&rdquo;');
}
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}
function todayStamp() {
  const m = ['january','february','march','april','may','june','july',
             'august','september','october','november','december'];
  const d = new Date();
  return `${m[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ---------- QUOTE ---------- */
function addQuote({ text, author }) {
  if (!text || !text.trim()) throw new Error('Quote text is required.');
  const file = R('quotes', 'index.html');
  let c = read(file); const n = nlOf(c);
  const start = c.indexOf('<ul class="quote-list">');
  if (start < 0) throw new Error('Could not find the quote list.');
  const p = typo(esc(text.trim()));
  const author2 = (author || '').trim().toLowerCase();
  const head = c.slice(0, start);
  let tail = c.slice(start);
  let done = false;
  tail = tail.replace(/([ \t]*)<\/ul>/, (m, ind) => {
    done = true;
    const ii = ind + '  ';
    const L = [`${ii}<li class="quote reveal">`, `${ii}  <p>${p}</p>`];
    if (author2) L.push(`${ii}  <cite>${typo(esc(author2))}</cite>`);
    L.push(`${ii}</li>`, ``, `${ind}</ul>`);
    return L.join(n);
  });
  if (!done) throw new Error('Could not find the end of the quote list.');
  writeF(file, head + tail);
  return { wrote: ['quotes/index.html'], preview: '/quotes/' };
}

/* ---------- POST ---------- */
function addPost({ title, date, subtitle, body }) {
  if (!title || !title.trim()) throw new Error('Title is required.');
  const slug = slugify(title);
  if (!slug) throw new Error('Title has no usable characters for a URL slug.');
  const dir = R('writing', slug);
  if (exists(dir)) throw new Error(`writing/${slug}/ already exists, pick a different title.`);
  const tplPath = R('_admin', 'templates', 'post.html');
  if (!exists(tplPath)) throw new Error('Missing _admin/templates/post.html');

  const d = (date && date.trim()) ? date.trim() : todayStamp();
  const sub = (subtitle || '').trim();
  const paras = String(body || '').replace(/\r\n/g, '\n').split(/\n{2,}/)
    .map(s => s.trim()).filter(Boolean);
  const bodyHtml = (paras.length ? paras : [''])
    .map(p => `          <p>${typo(esc(p))}</p>`).join('\n\n');

  let html = read(tplPath);
  const titleE = esc(title.trim());
  const subE = esc(sub);
  const og = sub ? `${titleE} &middot; ${subE}` : titleE;
  const desc = sub ? `${subE}. Writing by priyansu s.` : 'Writing by priyansu s.';
  html = html.split('{{TITLE}}').join(titleE)
             .split('{{SUBTITLE}}').join(subE)
             .split('{{DATE}}').join(esc(d))
             .split('{{OGTITLE}}').join(og)
             .split('{{DESCRIPTION}}').join(esc(desc))
             .split('{{BODY}}').join(bodyHtml);
  if (!sub) html = html.replace(/\n[ \t]*<p class="article-subtitle"><\/p>/, '');

  fs.mkdirSync(dir, { recursive: true });
  writeF(path.join(dir, 'index.html'), html);
  addPostIndexEntry({ slug, title: title.trim(), date: d, subtitle: sub });
  try { execFileSync(process.execPath, [R('scripts', 'sync-partials.js')], { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}
  try { execFileSync(process.execPath, [R('scripts', 'generate-sitemap.js')], { cwd: ROOT, stdio: 'ignore' }); } catch (_) {}
  return { wrote: [`writing/${slug}/index.html`, 'writing/index.html', 'sitemap.xml'], preview: `/writing/${slug}/` };
}

function addPostIndexEntry({ slug, title, date, subtitle }) {
  const file = R('writing', 'index.html');
  let c = read(file); const n = nlOf(c);
  const anchor = '<ul class="post-list">';
  const i = c.indexOf(anchor);
  if (i < 0) throw new Error('Could not find the writing index list.');
  const at = i + anchor.length;
  const L = [``, ``,
    `        <li class="post-item reveal">`,
    `          <a href="./${slug}/" class="post-link">`,
    `            <span class="post-date">${esc(date)}</span>`,
    `            <span class="post-title">${esc(title)}</span>`];
  if (subtitle) L.push(`            <p class="post-excerpt">${typo(esc(subtitle))}</p>`);
  L.push(`          </a>`, `        </li>`);
  c = c.slice(0, at) + L.join(n) + c.slice(at);
  writeF(file, c);
}

/* ---------- PHOTO ---------- */
async function addPhoto({ imageBase64, filename, caption, loc, alt }) {
  if (!sharp) throw new Error('sharp is not installed. Run "npm install" first.');
  if (!imageBase64) throw new Error('No image was provided.');
  if (!caption || !caption.trim()) throw new Error('Caption is required.');
  if (!loc || !loc.trim()) throw new Error('City is required.');

  let stem = (filename || '').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!stem) stem = 'photo-' + Date.now();
  if (exists(R('assets', stem + '.jpg')) || exists(R('assets', stem + '.webp')))
    throw new Error(`assets/${stem}.* already exists, rename the file first.`);

  const buf = Buffer.from(String(imageBase64).replace(/^data:[^,]*,/, ''), 'base64');
  const pipe = sharp(buf).rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true });
  await pipe.clone().jpeg({ quality: 88, mozjpeg: true }).toFile(R('assets', stem + '.jpg'));
  await pipe.clone().webp({ quality: 82 }).toFile(R('assets', stem + '.webp'));
  const meta = await sharp(R('assets', stem + '.jpg')).metadata();
  const stats = await sharp(R('assets', stem + '.jpg')).stats();
  const dom = stats.dominant;
  const ph = '#' + [dom.r, dom.g, dom.b].map(v => v.toString(16).padStart(2, '0')).join('');
  let exif = '';
  if (exifReader) {
    try {
      const srcMeta = await sharp(buf).metadata();
      if (srcMeta.exif) exif = exifLine(exifReader(srcMeta.exif));
    } catch (_) {}
  }

  const warn = insertGalleryItem({
    stem, caption: caption.trim(), ph, exif,
    loc: loc.trim().toLowerCase(),
    alt: (alt && alt.trim()) ? alt.trim() : caption.trim(),
    w: meta.width, h: meta.height,
  });
  return {
    wrote: [`assets/${stem}.jpg`, `assets/${stem}.webp`, 'gallery/index.html'],
    preview: '/gallery/',
    note: `${meta.width}×${meta.height}` + (warn ? ` · ${warn}` : ''),
  };
}

function exifLine(tags) {
  const p = (tags && (tags.Photo || tags.exif)) || {};
  const parts = [];
  const n = v => String(+(+v).toFixed(1));
  if (p.FNumber) parts.push('f/' + n(p.FNumber));
  if (p.ExposureTime) parts.push(p.ExposureTime >= 1 ? n(p.ExposureTime) + 's' : '1/' + Math.round(1 / p.ExposureTime));
  const iso = p.ISOSpeedRatings || p.PhotographicSensitivity || p.ISO;
  if (iso) parts.push('iso ' + (Array.isArray(iso) ? iso[0] : iso));
  if (p.FocalLength) parts.push(n(p.FocalLength) + 'mm');
  return parts.join(' · ');
}

function insertGalleryItem({ stem, caption, loc, alt, w, h, ph, exif }) {
  const file = R('gallery', 'index.html');
  let c = read(file); const n = nlOf(c);
  const anchor = '<section class="gallery-full">';
  const i = c.indexOf(anchor);
  if (i < 0) throw new Error('Could not find the gallery section.');
  const at = i + anchor.length;
  const L = [``, ``,
    `        <div class="gallery-item reveal" data-lightbox data-loc="${attr(loc)}"${ph ? ` style="background-color:${ph}"` : ''}${exif ? ` data-exif="${attr(exif)}"` : ''}>`,
    `          <picture><source srcset="../assets/${stem}.webp" type="image/webp"><img src="../assets/${stem}.jpg" alt="${attr(alt)}" loading="lazy" decoding="async" width="${w}" height="${h}"></picture>`,
    `          <div class="gallery-caption">${typo(esc(caption))} <span class="gallery-caption-loc">${esc(loc)}</span></div>`,
    `        </div>`];
  c = c.slice(0, at) + L.join(n) + c.slice(at);
  writeF(file, c);
  const chips = [...c.matchAll(/data-filter="([^"]+)"/g)].map(m => m[1]);
  if (chips.length && !chips.includes(loc))
    return `new city "${loc}" has no filter chip yet`;
  return '';
}

/* ---------- static preview server ---------- */
const TYPES = {
  '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.json':'application/json',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
  '.webp':'image/webp', '.svg':'image/svg+xml', '.ico':'image/x-icon',
  '.woff2':'font/woff2', '.woff':'font/woff', '.txt':'text/plain; charset=utf-8',
};
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  const full = path.normalize(path.join(ROOT, urlPath));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}
function serveHTML(res, p) {
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(500); return res.end('admin UI missing'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}

/* ---------- routing ---------- */
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html'))
    return serveHTML(res, R('_admin', 'index.html'));
  if (req.method === 'POST' && req.url.startsWith('/api/')) {
    let body = '';
    req.on('data', d => { body += d; if (body.length > 80 * 1024 * 1024) req.destroy(); });
    req.on('end', async () => {
      let data; try { data = JSON.parse(body || '{}'); }
      catch { return sendJSON(res, 400, { error: 'Bad request body.' }); }
      try {
        let out;
        if (req.url === '/api/quote') out = addQuote(data);
        else if (req.url === '/api/post') out = addPost(data);
        else if (req.url === '/api/photo') out = await addPhoto(data);
        else return sendJSON(res, 404, { error: 'Unknown endpoint.' });
        sendJSON(res, 200, { ok: true, ...out });
      } catch (e) { sendJSON(res, 400, { error: e.message || String(e) }); }
    });
    return;
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end('Method not allowed');
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  admin tool running  ->  ${url}`);
  if (!sharp) console.log('  ! sharp not installed yet, the Photo tab needs "npm install"');
  console.log('  Ctrl+C to stop.\n');
  if (!process.env.ADMIN_NO_OPEN) {
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
              : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  }
});
