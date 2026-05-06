#!/usr/bin/env node
// Render "priyansu s." in Caveat as font-independent SVG paths.
// Output: assets/wordmark.svg. Run via `npm run wordmark`.

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');

const ROOT = path.join(__dirname, '..');
const TEXT = 'priyansu s.';
const FONT_SIZE = 22;
const OUT_PATH = path.join(ROOT, 'assets', 'wordmark.svg');

// opentype.js can read .ttf/.otf/.woff but not .woff2 (Brotli).
const CANDIDATES = [
  'node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff',
  'node_modules/@fontsource/caveat/files/caveat-latin-500-normal.woff',
  'node_modules/@fontsource/caveat/files/caveat-latin-400-normal.ttf',
  'vendor/caveat-regular.woff',
  'vendor/caveat-regular.ttf',
];

(async () => {
  let fontPath;
  for (const rel of CANDIDATES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) { fontPath = abs; break; }
  }
  if (!fontPath) {
    console.error('Caveat font not found. Tried:');
    for (const c of CANDIDATES) console.error('  ' + c);
    console.error('Install @fontsource/caveat or drop caveat-regular.woff in vendor/.');
    process.exit(1);
  }
  console.log('Using font: ' + path.relative(ROOT, fontPath));

  const buf = fs.readFileSync(fontPath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const font = opentype.parse(ab);
  const probe = font.getPath(TEXT, 0, FONT_SIZE * 0.85, FONT_SIZE);
  const bbox = probe.getBoundingBox();
  const dx = -bbox.x1 + 2;
  const dy = -bbox.y1 + 2;
  const final = font.getPath(TEXT, dx, FONT_SIZE * 0.85 + dy, FONT_SIZE);
  const d = final.toPathData(2);
  const width  = Math.ceil(bbox.x2 - bbox.x1 + 4);
  const height = Math.ceil(bbox.y2 - bbox.y1 + 4);

  const svg = '<svg class="logo-wordmark" aria-label="' + TEXT + '" role="img"'
    + ' viewBox="0 0 ' + width + ' ' + height + '"'
    + ' preserveAspectRatio="xMinYMid meet"'
    + ' xmlns="http://www.w3.org/2000/svg">'
    + '<path d="' + d + '" fill="currentColor"/></svg>';

  fs.writeFileSync(OUT_PATH, svg);
  console.log('Saved ' + path.relative(ROOT, OUT_PATH) + ' (' + svg.length + ' bytes)');
})().catch(err => { console.error(err); process.exit(1); });
