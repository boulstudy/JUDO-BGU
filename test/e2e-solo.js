// Single-device mirror mode (/solo): the phone runs the clock itself, in
// landscape, with touch control — and edits stay private until synced.
// No relay is needed; /solo does not use the realtime link.
// Playwright is not a project dependency (see e2e-clock.js).
function requirePlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('playwright not found — npm i -g playwright, or set PLAYWRIGHT_PATH');
  process.exit(2);
}
const { chromium } = requirePlaywright();

const APP = process.env.APP || 'http://127.0.0.1:3100';
const SHOT = process.env.SHOT_DIR || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra) => {
  results.push(ok);
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : ''));
};

const clockSecs = p => p.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(e =>
    /^\d\d:\d\d$/.test(e.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) > 40);
  if (!el) return null;
  const [m, s] = el.textContent.trim().split(':').map(Number);
  return m * 60 + s;
});
const hasText = (p, t) => p.evaluate(s => document.body.innerText.includes(s), t);
const drillTitle = p => p.evaluate(() => (document.querySelector('h1') || {}).textContent || '');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));

  await p.goto(APP + '/solo', { waitUntil: 'networkidle' });
  await sleep(800);

  // ── first run ───────────────────────────────────────────────────────────────
  check('first run explains mirroring and Do-Not-Disturb', await hasText(p, 'נא לא להפריע') && await hasText(p, 'שיקוף'));
  await p.getByRole('button', { name: 'הבנתי, מתחילים' }).click();
  await sleep(400);
  check('guide is dismissed', !(await hasText(p, 'הבנתי, מתחילים')));
  check('stage shows the first drill and a full clock', (await drillTitle(p)) === 'חימום כללי' && (await clockSecs(p)) === 300, await drillTitle(p));
  check('no horizontal overflow on the phone', await p.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));

  // ── run ─────────────────────────────────────────────────────────────────────
  await p.getByRole('button', { name: 'הפעל', exact: true }).click();
  await sleep(2600);
  const t1 = await clockSecs(p);
  check('clock runs on the phone', t1 !== null && t1 <= 298 && t1 >= 296, String(t1));
  check('"paused" label disappears while running', !(await hasText(p, 'מושהה')));

  await sleep(3500);
  check('control bar hides itself while running', (await p.getByRole('toolbar').count()) === 0);
  await p.mouse.click(420, 200);
  await sleep(300);
  check('a tap brings the control bar back', (await p.getByRole('toolbar').count()) === 1);

  // ── swipe between drills ────────────────────────────────────────────────────
  await p.mouse.move(650, 150); await p.mouse.down(); await p.mouse.move(450, 155, { steps: 6 }); await p.mouse.move(250, 160, { steps: 6 }); await p.mouse.up();
  await sleep(500);
  check('swipe left goes to the next drill', (await drillTitle(p)) === 'נאגה גדן', await drillTitle(p));
  check('the swipe says what happened', await hasText(p, 'תרגיל הבא'));
  await p.mouse.move(250, 150); await p.mouse.down(); await p.mouse.move(450, 155, { steps: 6 }); await p.mouse.move(650, 160, { steps: 6 }); await p.mouse.up();
  await sleep(500);
  check('swipe right goes back', (await drillTitle(p)) === 'חימום כללי', await drillTitle(p));
  check('a vertical drag does not change drill', await (async () => {
    await p.mouse.move(400, 100); await p.mouse.down(); await p.mouse.move(405, 250, { steps: 8 }); await p.mouse.up();
    await sleep(300);
    return (await drillTitle(p)) === 'חימום כללי';
  })());

  await p.screenshot({ path: SHOT + '/solo-landscape.png' });

  // ── portrait ────────────────────────────────────────────────────────────────
  await p.setViewportSize({ width: 390, height: 844 });
  await sleep(500);
  check('portrait asks to rotate', await hasText(p, 'סובבו את הנייד לרוחב'));
  await p.getByRole('button', { name: 'המשך בכל זאת' }).click();
  await sleep(300);
  check('"continue anyway" dismisses it', !(await hasText(p, 'סובבו את הנייד לרוחב')));
  check('no horizontal overflow in portrait', await p.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth));
  await p.setViewportSize({ width: 844, height: 390 });
  await sleep(400);

  // ── private editing ─────────────────────────────────────────────────────────
  if ((await p.getByRole('toolbar').count()) === 0) { await p.mouse.click(420, 200); await sleep(300); }
  await p.getByRole('button', { name: 'הפעל', exact: true }).click();
  await sleep(1500);
  const running1 = await clockSecs(p);
  await p.getByRole('button', { name: 'עריכת האימון' }).click();
  await sleep(400);
  check('editing warns that mirroring shows the editor', await hasText(p, 'העריכה תופיע בטלויזיה'));
  await sleep(1800);
  check('opening the editor pauses the clock', running1 !== null && (await clockSecs(p)) === (await clockSecs(p)) && Math.abs((await clockSecs(p)) - running1) <= 1, running1 + ' → ' + (await clockSecs(p)));
  await p.getByRole('button', { name: 'ערוך בכל זאת' }).click();
  await sleep(600);
  check('the editor opens', await hasText(p, 'שמור וסגור'));

  await p.getByRole('button', { name: 'ערוך' }).nth(0).click();
  await sleep(400);
  await p.locator('input[placeholder="שם"]').first().fill('חימום פרטי');
  await p.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await sleep(300);
  await p.getByRole('button', { name: 'שמור וסגור' }).click();
  await sleep(500);
  check('after editing, the coach is asked to sync', await hasText(p, 'סנכרן לשיקוף') && await hasText(p, 'המסך המוקרן עדיין מציג את הגרסה הקודמת'));
  check('the stage still shows the OLD name until synced', (await drillTitle(p)) === 'חימום כללי', await drillTitle(p));

  await p.getByRole('button', { name: 'סנכרן לשיקוף' }).click();
  await sleep(500);
  check('sync puts the edit on the stage', (await drillTitle(p)) === 'חימום פרטי', await drillTitle(p));
  check('sync tells the coach mirroring can resume', await hasText(p, 'לחדש את השיקוף'));

  // discard path
  if ((await p.getByRole('toolbar').count()) === 0) { await p.mouse.click(420, 200); await sleep(300); }
  await p.getByRole('button', { name: 'עריכת האימון' }).click();
  await sleep(300);
  await p.getByRole('button', { name: 'ערוך בכל זאת' }).click();
  await sleep(500);
  await p.getByRole('button', { name: 'ערוך' }).nth(0).click();
  await sleep(300);
  await p.locator('input[placeholder="שם"]').first().fill('לא יישמר');
  await p.getByRole('button', { name: 'שמור', exact: true }).first().click();
  await p.getByRole('button', { name: 'שמור וסגור' }).click();
  await sleep(400);
  await p.getByRole('button', { name: 'בטל שינויים' }).click();
  await sleep(400);
  check('discarding leaves the stage untouched', (await drillTitle(p)) === 'חימום פרטי', await drillTitle(p));

  // ── persistence ─────────────────────────────────────────────────────────────
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(800);
  check('the synced workout survives a reload', (await drillTitle(p)) === 'חימום פרטי', await drillTitle(p));
  check('guide is not shown again', !(await hasText(p, 'הבנתי, מתחילים')));

  check('no runtime errors', errors.length === 0, errors.join(' | '));
  await browser.close();

  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
