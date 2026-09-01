// Drives the TV page and the phone remote against the local relay and checks
// that private staging / explicit push actually behaves as designed.
// Playwright is not a project dependency — it is picked up from a global
// install, or from PLAYWRIGHT_PATH if it lives somewhere unusual.
function requirePlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('playwright not found — npm i -g playwright, or set PLAYWRIGHT_PATH');
  process.exit(2);
}

const { chromium } = requirePlaywright();

const APP   = process.env.APP   || 'http://127.0.0.1:3100';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8899';
const SHOT  = process.env.SHOT_DIR || '.';

const redirect = `(() => {
  const Orig = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (String(url).includes('/realtime/v1/websocket')) url = '${RELAY}';
    return protocols ? new Orig(url, protocols) : new Orig(url);
  };
  window.WebSocket.prototype = Orig.prototype;
  Object.assign(window.WebSocket, { CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 });
})();`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
}

// Read the TV's giant clock.
const tvClock = tv => tv.evaluate(() => {
  const els = [...document.querySelectorAll('div')];
  const el = els.find(e => /^\d\d:\d\d$/.test(e.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) > 60);
  return el ? el.textContent.trim() : null;
});
const tvDrillName = tv => tv.evaluate(() => {
  const h = document.querySelector('h1');
  return h ? h.textContent.trim() : null;
});
const tvHasText = (tv, t) => tv.evaluate(s => document.body.innerText.includes(s), t);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await tvCtx.addInitScript(redirect);
  const tv = await tvCtx.newPage();
  const tvErrors = [];
  tv.on('pageerror', e => tvErrors.push('TV: ' + e.message));

  const phoneCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  await phoneCtx.addInitScript(redirect);
  const phone = await phoneCtx.newPage();
  const phoneErrors = [];
  phone.on('pageerror', e => phoneErrors.push('PHONE: ' + e.message));

  await tv.goto(APP + '/', { waitUntil: 'networkidle' });
  await sleep(1500);

  const code = await tv.evaluate(() => window.localStorage.getItem('judo_room'));
  check('TV generated a room code', !!code && code.length === 4, code);

  // The code must never sit on the projection where the room can read it.
  check('room code is NOT on the TV by default', !(await tvHasText(tv, code)));
  await tv.getByRole('button', { name: /שלט רחוק/ }).click();
  await sleep(700);
  check('pressing 📱 שלט רחוק reveals the code', await tvHasText(tv, code));
  check('the pairing window links to the mobile interface',
    await tv.evaluate(() => !!document.querySelector('a[href$="/remote"]')));

  // Connect while the window is open — it should take itself off screen.
  await phone.goto(APP + '/remote?code=' + code, { waitUntil: 'networkidle' });
  await sleep(4500);
  check('pairing window closes itself once the remote connects', !(await tvHasText(tv, code)));

  check('phone reports it is connected to the screen', await phone.evaluate(() => document.body.innerText.includes('מחובר למסך')));
  check('phone mirrors the current drill name', await phone.evaluate(() => document.body.innerText.includes('חימום כללי')));
  check('TV shows a connected remote', await tvHasText(tv, 'שלט'));

  // ── staging must stay off the TV ────────────────────────────────────────────
  const clockBefore = await tvClock(tv);
  await phone.getByRole('button', { name: '− דקה' }).click();
  await sleep(1200);
  const clockAfterStage = await tvClock(tv);
  check('time change on the phone does NOT touch the TV', clockBefore === clockAfterStage, clockBefore + ' → ' + clockAfterStage);
  check('phone shows the draft banner', await phone.evaluate(() => document.body.innerText.includes('טיוטה')));
  check('phone shows the unsent list', await phone.evaluate(() => document.body.innerText.includes('לא נשלח למסך')));

  // Stage a drill jump too — still invisible on the TV.
  await phone.getByRole('button', { name: 'מערך' }).click();
  await sleep(400);
  await phone.getByText('ראנדורי עמידה', { exact: false }).first().click();
  await sleep(1000);
  check('drill jump stays private as well', (await tvDrillName(tv)) === 'חימום כללי', await tvDrillName(tv));

  // Rename a drill in the draft.
  await phone.getByRole('button', { name: 'ערוך' }).nth(3).click();
  await sleep(400);
  const nameInput = phone.locator('input[placeholder="שם"]').first();
  await nameInput.fill('ראנדורי נבחרת');
  await phone.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await sleep(900);
  check('drill rename stays private', !(await tvHasText(tv, 'ראנדורי נבחרת')));

  await phone.screenshot({ path: SHOT + '/phone-staged.png' });
  await tv.screenshot({ path: SHOT + '/tv-untouched.png' });

  // ── explicit push ──────────────────────────────────────────────────────────
  await phone.getByRole('button', { name: 'שלט' }).click();
  await sleep(400);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(1500);

  check('TV picked up the staged drill', (await tvDrillName(tv)) === 'ראנדורי נבחרת', await tvDrillName(tv));
  check('phone cleared the draft', !(await phone.evaluate(() => document.body.innerText.includes('לא נשלח למסך'))));

  // ── start / stop are immediate ─────────────────────────────────────────────
  const beforeStart = await tvClock(tv);
  await phone.getByRole('button', { name: '▶ התחל' }).click();
  await sleep(2600);
  const afterStart = await tvClock(tv);
  check('▶ התחל starts the TV clock immediately', beforeStart !== afterStart, beforeStart + ' → ' + afterStart);

  await phone.getByRole('button', { name: '⏸ עצור' }).click();
  await sleep(1400);
  const stopped1 = await tvClock(tv);
  await sleep(1600);
  const stopped2 = await tvClock(tv);
  check('⏸ עצור stops the TV clock immediately', stopped1 === stopped2, stopped1 + ' / ' + stopped2);

  // ── live mode ──────────────────────────────────────────────────────────────
  await phone.getByText('🔒 מצב פרטי').click();
  await sleep(500);
  const beforeLive = await tvClock(tv);
  await phone.getByRole('button', { name: '+ דקה' }).click();
  await sleep(1300);
  const afterLive = await tvClock(tv);
  check('שידור ישיר pushes time straight to the TV', beforeLive !== afterLive, beforeLive + ' → ' + afterLive);

  // ── projection mode ────────────────────────────────────────────────────────
  await phone.getByText('🔴 שידור ישיר').click();
  await sleep(300);
  await phone.getByRole('button', { name: 'עוד' }).click();
  await sleep(400);
  check('TV shows its control buttons before projection mode', await tvHasText(tv, '+ 30ש׳'));
  await phone.locator('div').filter({ hasText: /^מסתיר את כפתורי השליטה מהמסך$/ }).first()
    .locator('xpath=../..').locator('div[style*="border-radius: 12px"]').last().click();
  await sleep(500);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(1500);
  check('projection mode hides the TV control buttons', !(await tvHasText(tv, '+ 30ש׳')));
  check('projection mode keeps the timer on screen', !!(await tvClock(tv)));

  await tv.screenshot({ path: SHOT + '/tv-projection.png' });
  await phone.screenshot({ path: SHOT + '/phone-more.png' });

  // ── reconnect ──────────────────────────────────────────────────────────────
  await phone.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  check('phone reconnects after a reload', await phone.evaluate(() => document.body.innerText.includes('מחובר למסך')));
  check('phone re-syncs the renamed drill', await phone.evaluate(() => document.body.innerText.includes('ראנדורי נבחרת')));

  check('no runtime errors on the TV', tvErrors.length === 0, tvErrors.join(' | '));
  check('no runtime errors on the phone', phoneErrors.length === 0, phoneErrors.join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
