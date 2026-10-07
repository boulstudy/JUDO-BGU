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

  // The TV owns the code and shows it; the phone only types it.
  await tv.goto(APP + '/display', { waitUntil: 'networkidle' });
  await sleep(1200);

  const code = await tv.evaluate(() => window.localStorage.getItem('judo_room'));
  check('TV creates its own room code', !!code && code.length === 4, code);
  check('the welcome screen is held back at first (a remembered phone should not see it flash)',
    !(await tvHasText(tv, 'המשך בלי שלט')));
  await sleep(3000);
  check('TV shows the code on a welcome screen when nobody is connected', await tvHasText(tv, code) && await tvHasText(tv, 'המשך בלי שלט'));
  check('the welcome screen tells the phone where to go', await tv.evaluate(() => /\/remote/.test(document.body.innerText)));
  check('the welcome screen carries a QR code for the pairing link', (await tv.locator('svg[aria-label="קוד QR לחיבור השלט"]').count()) === 1);
  check('nothing has to be typed on the TV', (await tv.locator('input[placeholder="A7K2"]').count()) === 0);

  await phone.goto(APP + '/remote', { waitUntil: 'networkidle' });
  await sleep(800);
  check('phone asks for the code instead of inventing one',
    (await phone.locator('#room-code').count()) === 1 && !(await phone.evaluate(() => window.localStorage.getItem('judo_remote_room'))));
  check('phone offers the single-device mirror mode', await phone.evaluate(() => !!document.querySelector('a[href="/solo"]')));

  await phone.locator('#room-code').fill(code);
  await phone.getByRole('button', { name: 'התחבר', exact: true }).click();
  await sleep(1500);
  check('TV announces the connection', await tvHasText(tv, 'שלט התחבר'));
  check('welcome screen closes once the phone is connected', !(await tvHasText(tv, 'המשך בלי שלט')));
  await sleep(2500);
  check('phone moved on from the code screen once the TV connected',
    !(await phone.evaluate(() => document.body.innerText.includes('מתחבר למסך'))));

  await tv.getByTitle('חיבור שלט רחוק בנייד').click();
  await sleep(500);
  check('the pairing window shows the connected code', await tvHasText(tv, code) && await tvHasText(tv, 'השלט מחובר'));
  await tv.getByRole('button', { name: 'סגור' }).click();
  await sleep(300);

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
  check('TV hides its control buttons while a phone is connected', !(await tvHasText(tv, '+ 30ש׳')));
  await tv.mouse.move(300, 300); await tv.mouse.move(420, 380);
  await sleep(400);
  check('TV shows its control buttons again on touch / mouse move', await tvHasText(tv, '+ 30ש׳'));
  await phone.locator('div').filter({ hasText: /^מסתיר את כפתורי השליטה מהמסך$/ }).first()
    .locator('xpath=../..').locator('div[style*="border-radius: 12px"]').last().click();
  await sleep(500);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(1500);
  check('clean screen hides the TV control buttons', !(await tvHasText(tv, '+ 30ש׳')));
  check('clean screen keeps the timer on screen', !!(await tvClock(tv)));

  await tv.screenshot({ path: SHOT + '/tv-projection.png' });
  await phone.screenshot({ path: SHOT + '/phone-more.png' });

  // ── reconnect ──────────────────────────────────────────────────────────────
  // A code that was already paired is not worth showing again, so the pairing
  // screen must be skipped straight away — well before the auto-dismiss that
  // follows a connection could account for it.
  await phone.reload({ waitUntil: 'networkidle' });
  await sleep(500);
  check('a returning phone skips the pairing screen',
    !(await phone.evaluate(() => document.body.innerText.includes('מתחבר למסך'))));

  await sleep(3000);
  check('phone reconnects after a reload', await phone.evaluate(() => document.body.innerText.includes('מחובר למסך')));
  check('phone re-syncs the renamed drill', await phone.evaluate(() => document.body.innerText.includes('ראנדורי נבחרת')));

  // Opening a link that carries the code needs no typing at all.
  const phone2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone2Ctx.addInitScript(redirect);
  const phone2 = await phone2Ctx.newPage();
  await phone2.goto(APP + '/remote?code=' + code, { waitUntil: 'networkidle' });
  await sleep(4000);
  check('a link carrying the code connects without typing', await phone2.evaluate(() => document.body.innerText.includes('מחובר למסך')));
  check('the link stored the code for next time', (await phone2.evaluate(() => window.localStorage.getItem('judo_remote_room'))) === code);

  check('no runtime errors on the TV', tvErrors.length === 0, tvErrors.join(' | '));
  check('no runtime errors on the phone', phoneErrors.length === 0, phoneErrors.join(' | '));

  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
