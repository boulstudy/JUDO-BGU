#!/usr/bin/env node
// Draws the app icons and writes them as PNGs.
//
// Deliberately dependency-free: Vercel installs devDependencies on every
// deploy, so an image library here would be paid for on each build. Node's
// own zlib is all a PNG needs — the format is a CRC'd container around a
// deflate stream, and both are short enough to spell out.

const zlib = require("zlib");
const fs   = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "public");

// ── PNG container ────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  // Each scanline is prefixed with its filter byte; 0 means "store as-is",
  // which costs a little size and saves a lot of code.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── drawing ──────────────────────────────────────────────────────────────────
// A tiny scanline rasteriser. Every shape is a coverage test per pixel,
// supersampled 3x3, which gives clean edges without pulling in a canvas.
//
// The mark is an obi — a judo belt seen head-on: the band running across, the
// knot square at its centre, and the two tails hanging below it. Drawn as
// solids rather than outlines so it survives being shrunk to a 32px tab icon.
function render(size, { padding }) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 3;
  const c = size / 2;
  const r = c - padding;

  const BG     = [0x0b, 0x0d, 0x14];
  const ORANGE = [0xff, 0x6b, 0x00];
  const WHITE  = [0xf2, 0xf4, 0xf8];

  // Geometry in units of the disc radius, so the mark scales with the icon.
  const beltY  = c - r * 0.16;   // the band sits above centre; tails fill below
  const beltH  = r * 0.30;
  const knotW  = r * 0.30, knotH = r * 0.40;
  const tailW  = r * 0.12, tailTop = beltY + beltH / 2, tailBot = beltY + r * 0.74;
  const tailX  = r * 0.17;
  const notch  = r * 0.055;      // dark gap that separates knot from band

  const disc = (x, y) => Math.hypot(x - c, y - c) <= r;
  const rect = (x, y, cx, cy, hw, hh) =>
    Math.abs(x - cx) <= hw && Math.abs(y - cy) <= hh;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = 0, orange = 0, white = 0;

      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const px = x + (sx + 0.5) / S;
          const py = y + (sy + 0.5) / S;
          if (!disc(px, py)) continue;
          inside++;

          const onKnot  = rect(px, py, c, beltY, knotW / 2, knotH / 2);
          const onNotch = rect(px, py, c, beltY, knotW / 2 + notch, knotH / 2 + notch);

          if (onKnot) { white++; continue; }
          if (onNotch) continue;                       // gap stays background

          const onBelt = rect(px, py, c, beltY, r, beltH / 2);
          const onTail =
            rect(px, py, c - tailX, (tailTop + tailBot) / 2, tailW / 2, (tailBot - tailTop) / 2) ||
            rect(px, py, c + tailX, (tailTop + tailBot) / 2, tailW / 2, (tailBot - tailTop) / 2);
          if (onBelt || onTail) orange++;
        }
      }

      const total = S * S;
      const i = (y * size + x) * 4;
      if (!inside) { buf[i] = buf[i + 1] = buf[i + 2] = buf[i + 3] = 0; continue; }

      const wo = orange / total, ww = white / total;
      const wb = Math.max(0, inside / total - wo - ww);
      const sum = wo + ww + wb || 1;
      for (let ch = 0; ch < 3; ch++) {
        buf[i + ch] = Math.round((ORANGE[ch] * wo + WHITE[ch] * ww + BG[ch] * wb) / sum);
      }
      buf[i + 3] = Math.round((inside / total) * 255);
    }
  }
  return buf;
}

function write(name, size, opts) {
  const png = encodePNG(size, size, render(size, opts));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log("  " + name + "  " + size + "x" + size + "  " + (png.length / 1024).toFixed(1) + "kb");
}

console.log("icons →");
// A maskable icon is cropped to a circle by the launcher, so its mark has to
// sit inside the safe zone — hence the heavier padding on that one alone.
write("icon-192.png",          192, { padding: 4 });
write("icon-512.png",          512, { padding: 10 });
write("icon-maskable-512.png", 512, { padding: 92 });
write("apple-touch-icon.png",  180, { padding: 0 });
