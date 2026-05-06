#!/usr/bin/env node
// Copy self-hosted woff2 fonts from @fontsource into assets/fonts/.
// Run via `npm run fonts` after `npm install`.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'fonts');

const FILES = [
  // Crimson Pro — the body/display serif.
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-300-normal.woff2', out: 'crimson-pro-300.woff2' },
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-300-italic.woff2', out: 'crimson-pro-300-italic.woff2' },
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-400-normal.woff2', out: 'crimson-pro-400.woff2' },
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-400-italic.woff2', out: 'crimson-pro-400-italic.woff2' },
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-500-normal.woff2', out: 'crimson-pro-500.woff2' },
  { src: 'node_modules/@fontsource/crimson-pro/files/crimson-pro-latin-700-normal.woff2', out: 'crimson-pro-700.woff2' },
  // Caveat — the wordmark.
  { src: 'node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2', out: 'caveat-400.woff2' },
  { src: 'node_modules/@fontsource/caveat/files/caveat-latin-500-normal.woff2', out: 'caveat-500.woff2' },
];

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

let copied = 0, missing = 0;
for (const f of FILES) {
  const src = path.join(ROOT, f.src);
  const dst = path.join(OUT, f.out);
  if (!fs.existsSync(src)) {
    console.log('  (missing) ' + f.src);
    missing++;
    continue;
  }
  fs.copyFileSync(src, dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(1);
  console.log('  + ' + f.out + ' (' + kb + 'KB)');
  copied++;
}

console.log('\n' + copied + ' copied, ' + missing + ' missing.');
if (missing > 0) {
  console.log('Run `npm install` first to fetch the @fontsource/* packages.');
}
