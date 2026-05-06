#!/usr/bin/env node
// Generate .webp companions for the JPG-only gallery photos.
// Run via `npm run webp`.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ASSETS = path.join(__dirname, '..', 'assets');

// Photos that ship as JPG only — the Japan set.
const STEMS = [
  'R0000407', 'R0000415', 'R0000630', 'R0000631', 'R0000645',
  'R0000763', 'R0000863', 'R0000891', 'R0000908', 'R0001115',
  'R0001439', 'R0001448', 'R0001664', 'R0001680',
];

async function main() {
  let made = 0, skipped = 0;
  for (const stem of STEMS) {
    const jpg = path.join(ASSETS, stem + '.jpg');
    const webp = path.join(ASSETS, stem + '.webp');
    if (!fs.existsSync(jpg)) {
      console.log('  (skip, no jpg)', stem);
      continue;
    }
    if (fs.existsSync(webp)) {
      console.log('  (skip, exists)', stem + '.webp');
      skipped++;
      continue;
    }
    await sharp(jpg).webp({ quality: 82 }).toFile(webp);
    const before = fs.statSync(jpg).size;
    const after = fs.statSync(webp).size;
    const pct = ((1 - after / before) * 100).toFixed(0);
    console.log('  +', stem + '.webp',
      '(' + (after / 1024).toFixed(0) + 'KB, -' + pct + '%)');
    made++;
  }
  console.log('\nGenerated ' + made + ', skipped ' + skipped + '.');
}

main().catch(err => { console.error(err); process.exit(1); });
