#!/usr/bin/env node
// Generate sitemap.xml from the site's index.html pages.
// Lists every deployed page that isn't noindex. Skips Jekyll-ignored
// (_*) and dot directories, node_modules, and any noindex page (e.g. 404).
// Run via `npm run sitemap`; also runs automatically when the admin tool
// creates a writing post.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = 'https://priontherun.com';

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('_') || e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name === 'index.html') out.push(full);
  }
}

const files = [];
walk(ROOT, files);

const urls = [];
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  if (/name=["']robots["'][^>]*noindex/i.test(html)) continue; // respect noindex
  const rel = path.relative(ROOT, f).replace(/\\/g, '/').replace(/index\.html$/, '');
  urls.push(BASE + '/' + rel);
}

// home first, then alphabetical
const HOME = BASE + '/';
urls.sort((a, b) => (a === HOME ? -1 : b === HOME ? 1 : a.localeCompare(b)));

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n')
  + '\n</urlset>\n';

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`sitemap.xml — ${urls.length} urls`);
urls.forEach(u => console.log('  ' + u));
