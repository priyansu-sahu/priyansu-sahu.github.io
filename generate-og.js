const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const W = 1200, H = 630;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Background — warm off-white
ctx.fillStyle = '#faf8f3';
ctx.fillRect(0, 0, W, H);

// Draw the aperture mark centred
const cx = W / 2, cy = H / 2;
const R1 = 130, R2 = 82;
const strokeColor = '#1a1815';

ctx.strokeStyle = strokeColor;
ctx.lineWidth = 2.5;

// Outer circle
ctx.beginPath();
ctx.arc(cx, cy, R1, 0, Math.PI * 2);
ctx.stroke();

// Inner circle
ctx.lineWidth = 2;
ctx.beginPath();
ctx.arc(cx, cy, R2, 0, Math.PI * 2);
ctx.stroke();

// Cardinal ticks (between the two circles)
ctx.lineWidth = 1.5;
const ticks = [
  [cx, cy - R1, cx, cy - R2 + 4],
  [cx, cy + R2 - 4, cx, cy + R1],
  [cx - R1, cy, cx - R2 + 4, cy],
  [cx + R2 - 4, cy, cx + R1, cy],
];
ticks.forEach(([x1, y1, x2, y2]) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
});

// Diagonal ticks
const d = R1 * Math.cos(Math.PI / 4);
const d2 = (R2 - 4) * Math.cos(Math.PI / 4);
const diags = [
  [cx - d, cy - d, cx - d2, cy - d2],
  [cx + d, cy - d, cx + d2, cy - d2],
  [cx + d, cy + d, cx + d2, cy + d2],
  [cx - d, cy + d, cx - d2, cy + d2],
];
ctx.lineWidth = 1;
diags.forEach(([x1, y1, x2, y2]) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
});

// Centre "p" — italic serif
ctx.fillStyle = strokeColor;
ctx.font = 'italic 300 72px Georgia, serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'alphabetic';
ctx.fillText('p', cx, cy + 26);

// Save
const buf = canvas.toBuffer('image/png');
fs.writeFileSync(path.join(__dirname, 'assets', 'og-image.png'), buf);
console.log('OG image saved');
