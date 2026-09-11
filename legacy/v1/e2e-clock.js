// Focused on the regression-prone path: editing the workout from the phone
// while the TV clock is running must not disturb the running clock.
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
const check = (name, ok, extra) => {
  results.push(ok);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
};

const clockSecs = tv => tv.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(e =>
    /^\d\d:\d\d$/.test(e.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) > 60);
  if (!el) return null;
  const [m, s] = el.textContent.trim().split(':').map(Number);
  return m * 60 + s;
});
const drillName = tv => tv.evaluate(() => (document.querySelector('h1') || {}).textContent);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

  const tvCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await tvCtx.addInitScript(redirect);
  const tv = await tvCtx.newPage();
  const errs = [];
  tv.on('pageerror', e => errs.push('TV: ' + e.message));

  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phoneCtx.addInitScript(redirect);
  const phone = await phoneCtx.newPage();
  phone.on('pageerror', e => errs.push('PHONE: ' + e.message));

  await tv.goto(APP + '/', { waitUntil: 'networkidle' });
  await sleep(1200);
  const code = await tv.evaluate(() => localStorage.getItem('judo_room'));
  await phone.goto(APP + '/remote?code=' + code, { waitUntil: 'networkidle' });
  await sleep(2200);

  // Get the TV running on drill 1.
  await phone.getByRole('button', { name: '▶ התחל' }).click();
  await sleep(3000);
  const t0 = await clockSecs(tv);
  check('TV clock is running', t0 !== null && t0 < 300, String(t0));

  // The clock must run at real time even while the remote link re-renders.
  const a = await clockSecs(tv);
  await sleep(10000);
  const b = await clockSecs(tv);
  check('TV clock runs at real speed with a remote attached (10s)',
    Math.abs((a - b) - 10) <= 1, (a - b) + 's elapsed on screen per 10s wall clock');

  // Edit a LATER drill (#5) on the phone and push it.
  await phone.getByRole('button', { name: 'מערך' }).click();
  await sleep(400);
  await phone.getByRole('button', { name: 'ערוך' }).nth(4).click();
  await sleep(400);
  await phone.locator('input[placeholder="שם"]').first().fill('עבודה אישית מורחבת');
  await phone.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await sleep(500);
  const beforePush = await clockSecs(tv);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(2500);
  const afterPush = await clockSecs(tv);

  check('editing a later drill does not reset the running clock',
    afterPush !== null && afterPush < beforePush && beforePush - afterPush <= 4,
    beforePush + 's → ' + afterPush + 's');
  check('TV is still on the same drill', (await drillName(tv)) === 'חימום כללי', await drillName(tv));
  check('TV is still running', await tv.evaluate(() => document.body.innerText.includes('⏸ עצור')));

  const t1 = await clockSecs(tv);
  await sleep(2500);
  const t2 = await clockSecs(tv);
  check('clock keeps counting down after the push', t2 < t1, t1 + 's → ' + t2 + 's');

  // Renaming the CURRENT drill must also keep the clock — only its timings matter.
  await phone.getByRole('button', { name: 'ערוך' }).nth(0).click();
  await sleep(400);
  await phone.locator('input[placeholder="שם"]').first().fill('חימום ארוך');
  await phone.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await sleep(400);
  const beforeRename = await clockSecs(tv);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(2200);
  const afterRename = await clockSecs(tv);
  check('renaming the CURRENT drill keeps the clock',
    afterRename < beforeRename && beforeRename - afterRename <= 4,
    beforeRename + 's → ' + afterRename + 's');
  check('TV shows the new name', (await drillName(tv)) === 'חימום ארוך', await drillName(tv));

  // Changing the current drill's DURATION should reset it — the layout changed.
  await phone.getByRole('button', { name: 'ערוך' }).nth(0).click();
  await sleep(400);
  // durationWork wheel: click the "07" minute entry
  await phone.locator('div').filter({ hasText: /^07$/ }).first().click();
  await sleep(400);
  await phone.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await sleep(400);
  await phone.getByRole('button', { name: '✓ עדכן טלויזיה' }).click();
  await sleep(2200);
  const afterDuration = await clockSecs(tv);
  check('changing the current drill duration resets the clock to it',
    afterDuration !== null && afterDuration > 400, afterDuration + 's');

  check('no runtime errors', errs.length === 0, errs.join(' | '));

  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
