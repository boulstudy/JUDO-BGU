// Entry screen: "what is this device?", TV recognition, remembering the last choice.
function requirePlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('playwright not found — npm i -g playwright, or set PLAYWRIGHT_PATH');
  process.exit(2);
}
const { chromium } = requirePlaywright();
const APP = process.env.APP || 'http://127.0.0.1:3100';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : '')); };
const hasText = (p, t) => p.evaluate(s => document.body.innerText.includes(s), t);

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const errors = [];

  // ── a phone ────────────────────────────────────────────────────────────────
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(APP + '/', { waitUntil: 'networkidle' });
  check('asks what THIS device is', await hasText(p, 'מה המכשיר הזה?'));
  check('offers the screen and the phone', await hasText(p, 'המסך באולם') && await hasText(p, 'הנייד שלי'));
  check('a phone is not mistaken for a TV', !(await hasText(p, 'זוהתה טלויזיה')));
  check('no last-choice shortcut on a first visit', !(await hasText(p, 'בפעם הקודמת')));

  await p.getByText('הנייד שלי').click();
  await sleep(200);
  check('the phone branch asks how the room is projected', await hasText(p, 'איך מקרינים היום?'));
  check('it offers the remote and the mirror mode',
    (await p.locator('a[href="/remote"]').count()) === 1 && (await p.locator('a[href="/solo"]').count()) === 1);
  check('there is a way back', await hasText(p, 'חזרה'));
  check('no horizontal overflow', await p.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));

  await p.locator('a[href="/solo"]').click();
  await p.waitForURL('**/solo');
  await p.goto(APP + '/', { waitUntil: 'networkidle' });
  await sleep(300);
  check('the last choice is remembered', await hasText(p, 'בפעם הקודמת: שיקוף הנייד'));

  // ── a smart TV ─────────────────────────────────────────────────────────────
  const tvCtx = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.5) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.5 TV Safari/537.36',
  });
  const tv = await tvCtx.newPage();
  tv.on('pageerror', e => errors.push(e.message));
  await tv.goto(APP + '/', { waitUntil: 'networkidle' });
  await sleep(300);
  check('a TV browser is recognised', await hasText(tv, 'זוהתה טלויזיה'));
  check('and the screen option has the focus', await tv.evaluate(() => document.activeElement && document.activeElement.getAttribute('href') === '/display'));
  check('it is not redirected away', tv.url().replace(/\/$/, '') === APP);

  check('no runtime errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
