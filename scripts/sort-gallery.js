#!/usr/bin/env node
// Reorder the photos in gallery/index.html so portraits are spread evenly
// through the sequence and never sit next to each other. Run via
// `npm run gallery-sort`, ideally after adding photos with the admin tool
// (which prepends new ones and so lets runs of one orientation build up).
//
// Why: the justified layout in app.js packs photos in DOM order and flushes
// a row once a landscape and a portrait are side by side. Two or more
// adjacent portraits instead pull in a third or fourth photo and the row
// collapses into narrow slivers. With portraits interleaved, every row is
// either a landscape+portrait spread or a landscape pair.
//
// Landscapes keep their relative order; so do portraits. The lead photo
// stays a landscape. Nothing inside an item is changed except the loading
// hints: the first two get `loading="eager" fetchpriority="high"`, the rest
// `loading="lazy"`, so the hints follow the photos to their new positions.

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'gallery', 'index.html');
const EAGER = 2; // photos above the fold at desktop: one row

const src = fs.readFileSync(FILE, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const text = src.replace(/\r\n/g, '\n');

const open = text.indexOf('<section class="gallery-full">');
const close = text.indexOf('</section>', open);
if (open === -1 || close === -1) {
  console.error('sort-gallery: could not find <section class="gallery-full"> in ' + FILE);
  process.exit(1);
}
const head = text.slice(0, open);
const section = text.slice(open, close);
const tail = text.slice(close);

// each item is an 8-space-indented <div class="gallery-item ...> block closed
// by an 8-space-indented </div>, which is how the admin tool writes them
const itemRe = /^ {8}<div class="gallery-item[\s\S]*?^ {8}<\/div>\n/gm;
const blocks = section.match(itemRe) || [];
const expected = (section.match(/data-lightbox/g) || []).length;
if (blocks.length !== expected) {
  console.error('sort-gallery: parsed ' + blocks.length + ' items but found ' + expected + ' data-lightbox attributes; refusing to rewrite');
  process.exit(1);
}

function orientation(block) {
  const m = block.match(/width="(\d+)"\s+height="(\d+)"/);
  if (!m) return 'L';
  return Number(m[2]) > Number(m[1]) ? 'P' : 'L';
}
function loc(block) {
  const m = block.match(/data-loc="([^"]*)"/);
  return m ? m[1] : '';
}

const N = blocks.length;
const landscapes = blocks.filter((b) => orientation(b) === 'L');
const portraits = blocks.filter((b) => orientation(b) === 'P');

// Build units. Each portrait claims the nearest unclaimed landscape from its
// own place, preferring one before it, forming a landscape→portrait couple;
// unclaimed landscapes are singles. A portrait then always follows a landscape
// from its own place, so two portraits can never touch, either in the full
// gallery or inside any place filter. A portrait whose place has no landscape
// left borrows the nearest spare from any place; with none left it goes alone.
//
// "Nearest preceding" keeps the script idempotent: on already-sorted input
// every portrait's nearest landscape is its own partner, so nothing moves.
const meta = blocks.map((b, i) => ({ block: b, at: i, place: loc(b), o: orientation(b) }));
const claimed = new Set();
function nearest(p, pool) {
  const before = pool.filter((l) => !claimed.has(l.at) && l.at < p.at).pop();
  if (before) return before;
  return pool.find((l) => !claimed.has(l.at) && l.at > p.at) || null;
}
const couples = []; // { first, second, at }
const singles = []; // { block, at }
const allL = meta.filter((m) => m.o === 'L');
const orphans = [];
for (const p of meta.filter((m) => m.o === 'P')) {
  const l = nearest(p, allL.filter((m) => m.place === p.place));
  if (l) { claimed.add(l.at); couples.push({ first: l.block, second: p.block, at: Math.min(l.at, p.at) }); }
  else orphans.push(p);
}
for (const p of orphans) {
  const l = nearest(p, allL);
  if (l) { claimed.add(l.at); couples.push({ first: l.block, second: p.block, at: Math.min(l.at, p.at) }); }
  else singles.push({ block: p.block, at: p.at });
}
for (const l of allL) if (!claimed.has(l.at)) singles.push({ block: l.block, at: l.at });
couples.sort((a, b) => a.at - b.at);
singles.sort((a, b) => a.at - b.at);

// Keep the existing lead photo when it is a single landscape, then spread the
// remaining singles evenly among the couples.
const out = [];
let lead = null;
if (singles.length && singles[0].at === 0 && meta[0].o === 'L') lead = singles.shift();
if (lead) out.push(lead.block);
const U = couples.length + singles.length;
let ci = 0, si = 0;
for (let i = 0; i < U; i++) {
  const ideal = Math.round(((i + 1) * singles.length) / U);
  const wantSingle = si < singles.length && si < ideal;
  if (wantSingle || ci >= couples.length) out.push(singles[si++].block);
  else { out.push(couples[ci].first, couples[ci].second); ci++; }
}
if (out.length !== N) {
  console.error('sort-gallery: internal error, rebuilt ' + out.length + ' of ' + N + ' items; refusing to rewrite');
  process.exit(1);
}

// move the loading hints with the photos
const sorted = out.map((block, i) => {
  let b = block.replace(/\s+fetchpriority="[^"]*"/, '');
  if (i < EAGER) {
    b = b.replace(/loading="[^"]*"/, 'loading="eager" fetchpriority="high"');
  } else {
    b = b.replace(/loading="[^"]*"/, 'loading="lazy"');
  }
  return b;
});

// rebuild the section: keep whatever precedes the first item (the opening
// tag and its newline), then items separated by one blank line, then the
// original trailing whitespace before </section>
const firstIdx = section.indexOf(blocks[0]);
const lastBlock = blocks[blocks.length - 1];
const lastEnd = section.lastIndexOf(lastBlock) + lastBlock.length;
const before = section.slice(0, firstIdx);
const after = section.slice(lastEnd);
const rebuilt = before + sorted.join('\n') + after;

const result = (head + rebuilt + tail).replace(/\n/g, eol);
if (result !== src) fs.writeFileSync(FILE, result);

// report
function runs(seq) {
  const m = seq.join('').match(/P+/g) || [];
  return m.length ? Math.max(...m.map((r) => r.length)) : 0;
}
const beforeSeq = blocks.map(orientation);
const afterSeq = out.map(orientation);
console.log('sort-gallery: ' + N + ' photos, ' + landscapes.length + ' landscape, ' + portraits.length + ' portrait');
console.log('  before  ' + beforeSeq.join('') + '   longest portrait run: ' + runs(beforeSeq));
console.log('  after   ' + afterSeq.join('') + '   longest portrait run: ' + runs(afterSeq));
const byLoc = {};
out.forEach((b) => { (byLoc[loc(b)] = byLoc[loc(b)] || []).push(orientation(b)); });
const worst = Object.entries(byLoc).map(([k, v]) => k + ':' + runs(v)).filter((s) => !/:[01]$/.test(s));
console.log('  per-place filters with adjacent portraits: ' + (worst.length ? worst.join(', ') : 'none'));
console.log(result === src ? '  (no change)' : '  wrote ' + path.relative(process.cwd(), FILE));
