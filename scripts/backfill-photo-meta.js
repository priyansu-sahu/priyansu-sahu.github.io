#!/usr/bin/env node
// Bake per-photo presentation metadata into the gallery markup:
//   - style="background-color:#xxxxxx"  (dominant color, shown while the image loads)
//   - data-exif="f/2.8 · 1/250 · iso 200 · 18.3mm"  (shown in the lightbox, when present)
// Idempotent: re-running replaces previously baked values.
// Run via `npm run photo-meta`.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
let exifReader = null;
try { exifReader = require('exif-reader'); } catch (_) {}

const ROOT = path.join(__dirname, '..');
const FILES = ['gallery/index.html', 'index.html'];

function fmtNum(v) { return String(+(+v).toFixed(1)); }

function exifLineFromTags(tags) {
  const p = (tags && (tags.Photo || tags.exif)) || {};
  const parts = [];
  if (p.FNumber) parts.push('f/' + fmtNum(p.FNumber));
  if (p.ExposureTime) parts.push(p.ExposureTime >= 1 ? fmtNum(p.ExposureTime) + 's' : '1/' + Math.round(1 / p.ExposureTime));
  const iso = p.ISOSpeedRatings || p.PhotographicSensitivity || p.ISO;
  if (iso) parts.push('iso ' + (Array.isArray(iso) ? iso[0] : iso));
  if (p.FocalLength) parts.push(fmtNum(p.FocalLength) + 'mm');
  return parts.join(' · ');
}

async function metaForStem(stem) {
  const file = path.join(ROOT, 'assets', stem + '.jpg');
  if (!fs.existsSync(file)) return null;
  const stats = await sharp(file).stats();
  const d = stats.dominant;
  const ph = '#' + [d.r, d.g, d.b].map(v => v.toString(16).padStart(2, '0')).join('');
  let exif = '';
  if (exifReader) {
    try {
      const md = await sharp(file).metadata();
      if (md.exif) exif = exifLineFromTags(exifReader(md.exif));
    } catch (_) {}
  }
  return { ph, exif };
}

async function processFile(rel) {
  const full = path.join(ROOT, rel);
  let html = fs.readFileSync(full, 'utf8');

  const tagRe = /<(div|figure)([^>]*class="gallery-item[^"]*"[^>]*)>/g;
  const matches = [...html.matchAll(tagRe)];
  const jobs = [];
  for (const m of matches) {
    const after = html.slice(m.index, m.index + 800);
    const src = after.match(/src="[^"]*assets\/([A-Za-z0-9_-]+)\.jpg"/);
    if (src) jobs.push({ tag: m[0], el: m[1], attrs: m[2], stem: src[1] });
  }

  const stems = [...new Set(jobs.map(j => j.stem))];
  const meta = {};
  for (const s of stems) meta[s] = await metaForStem(s);

  let withExif = 0, updated = 0;
  for (const j of jobs) {
    const mt = meta[j.stem];
    if (!mt) { console.log('  (skip, no jpg)', j.stem); continue; }
    let attrs = j.attrs
      .replace(/ style="background-color:[^"]*"/, '')
      .replace(/ data-exif="[^"]*"/, '');
    attrs += ` style="background-color:${mt.ph}"`;
    if (mt.exif) { attrs += ` data-exif="${mt.exif}"`; withExif++; }
    const next = `<${j.el}${attrs}>`;
    if (next !== j.tag) { html = html.replace(j.tag, next); updated++; }
  }

  fs.writeFileSync(full, html);
  console.log(`${rel}: ${jobs.length} photos, ${updated} updated, ${withExif} with exif`);
}

(async () => {
  for (const f of FILES) await processFile(f);
})().catch(e => { console.error(e); process.exit(1); });
