// The QR encoder (app/lib/qr.js) is checked against an independent decoder.
// Needs: npm i --no-save jsqr
let jsQR;
try { jsQR = require('jsqr'); } catch (e) { console.error('jsqr not found — npm i --no-save jsqr'); process.exit(2); }

(async () => {
  const { encodeQR } = await import('../app/lib/qr.js');
  const cases = [
    'A',
    'https://judo-bgu.vercel.app/remote?code=A7K2',
    'https://judo-bgu.vercel.app/remote?code=ZZZZ',
    'http://127.0.0.1:3100/remote?code=5QWY',
    'x'.repeat(60),
    'https://judo-bgu.vercel.app/remote?code=A7K2&x=' + 'y'.repeat(80),   // version ~7 (alignment + version bits)
    'שלום עולם — ג׳ודו',                                                  // multi-byte UTF-8
    'z'.repeat(200),
  ];
  let ok = 0;
  for (const text of cases) {
    const m = encodeQR(text);
    const quiet = 4, scale = 6, n = m.length, px = (n + quiet * 2) * scale;
    const img = new Uint8ClampedArray(px * px * 4).fill(255);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (!m[y][x]) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const i = (((y + quiet) * scale + dy) * px + (x + quiet) * scale + dx) * 4;
        img[i] = img[i + 1] = img[i + 2] = 0;
      }
    }
    const res = jsQR(img, px, px);
    const pass = !!res && res.data === text;
    if (pass) ok++;
    console.log((pass ? '  PASS  ' : '  FAIL  ') + 'decodes: ' + text.slice(0, 48) + (text.length > 48 ? '…' : '') + '  (' + n + '×' + n + ')');
  }
  let threw = false;
  try { encodeQR('q'.repeat(400)); } catch (e) { threw = true; }
  console.log((threw ? '  PASS  ' : '  FAIL  ') + 'refuses text that is too long');
  if (threw) ok++;
  console.log('\n' + ok + '/' + (cases.length + 1) + ' checks passed');
  process.exit(ok === cases.length + 1 ? 0 : 1);
})();
