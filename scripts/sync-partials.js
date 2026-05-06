#!/usr/bin/env node
// Sync HTML partials. Replaces content between
// `<!-- @partial:NAME -->` and `<!-- @end -->` with the body of
// `_partials/NAME.html`. Run via `npm run sync`.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PARTIALS_DIR = path.join(ROOT, '_partials');
const TARGETS = [
  'index.html',
  'gallery/index.html',
  'writing/index.html',
  'writing/on-looking-slowly/index.html',
  'tools/index.html',
  'tools/diff/index.html',
  'tools/wordcount/index.html',
  '404.html',
];

function loadPartials() {
  const map = {};
  if (!fs.existsSync(PARTIALS_DIR)) return map;
  for (const file of fs.readdirSync(PARTIALS_DIR)) {
    if (!file.endsWith('.html')) continue;
    const name = file.replace(/\.html$/, '');
    const content = fs.readFileSync(path.join(PARTIALS_DIR, file), 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\s+$/, '');
    map[name] = content;
  }
  return map;
}

function syncFile(rel, partials) {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) {
    console.log('  (skip missing) ' + rel);
    return;
  }
  const original = fs.readFileSync(fullPath, 'utf8');
  let updated = original;
  let touched = false;
  for (const name of Object.keys(partials)) {
    const re = new RegExp(
      '([ \\t]*)<!--\\s*@partial:' + name + '\\s*-->[\\s\\S]*?<!--\\s*@end\\s*-->',
      'g'
    );
    updated = updated.replace(re, function (_match, indent) {
      touched = true;
      const body = partials[name].split('\n').map(function (line, i) {
        if (i === 0) return line;
        return line.length ? indent + line : '';
      }).join('\n');
      return indent + '<!-- @partial:' + name + ' -->\n'
        + indent + body + '\n'
        + indent + '<!-- @end -->';
    });
  }
  if (updated !== original) {
    fs.writeFileSync(fullPath, updated);
    console.log('  synced ' + rel);
  } else if (touched) {
    console.log('  (unchanged) ' + rel);
  } else {
    console.log('  (no markers) ' + rel);
  }
}

(function main() {
  const partials = loadPartials();
  const names = Object.keys(partials);
  if (!names.length) {
    console.error('No partials found in ' + PARTIALS_DIR);
    process.exit(1);
  }
  console.log('Loaded partials: ' + names.join(', '));
  for (const rel of TARGETS) syncFile(rel, partials);
})();
