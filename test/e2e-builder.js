// The workout builder (/build): catalog on the right, basics on the left, drag
// into the middle, a drill inside a drill, variations saved to folders — and a
// built drill really running on the clock engine (/solo).
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
const check = (name, ok, extra) => { results.push(ok); console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra ? '  → ' + extra : '')); };
const hasText = (p, t) => p.evaluate(s => document.body.innerText.includes(s), t);

// Drag with a real pointer, in steps — the same path a mouse or a finger takes.
async function drag(p, fromSel, toSel, where = 'end') {
  const from = await p.locator(fromSel).first().boundingBox();
  const to = await p.locator(toSel).first().boundingBox();
  if (!from || !to) throw new Error('drag: missing ' + (from ? toSel : fromSel));
  await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await p.mouse.down();
  await p.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 12, { steps: 3 });
  const ty = where === 'top' ? to.y + 4 : where === 'middle' ? to.y + to.height / 2 : to.y + to.height - 4;
  await p.mouse.move(to.x + to.width / 2, ty, { steps: 12 });
  await sleep(80);
  await p.mouse.up();
  await sleep(250);
}
const drillNames = p => p.evaluate(() => [...document.querySelectorAll('[data-drill]')].map(e => e.getAttribute('data-drill')));
const total = p => p.evaluate(() => { const m = document.body.innerText.match(/(\d+) תרגילים · (\d+:\d\d)/); return m ? { n: +m[1], t: m[2] } : null; });

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => d.accept(p._answer || ''));

  await p.goto(APP + '/build', { waitUntil: 'networkidle' });
  await p.evaluate(() => { localStorage.removeItem('judo_catalog_v1'); localStorage.removeItem('judo_build_workout'); });
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(500);

  // ── layout ──────────────────────────────────────────────────────────────────
  const boxes = await p.evaluate(() => {
    const r = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
    return { cat: r('[data-panel=catalog]'), basics: r('[data-panel=basics]'), zone: r('[data-zone=workout]') };
  });
  check('the catalog is on the right and the basics on the left',
    boxes.cat && boxes.basics && boxes.zone && boxes.cat.left > boxes.zone.left && boxes.basics.left < boxes.zone.left);
  check('the catalog starts with a folder and saved drills', await hasText(p, 'הקטלוג שלי') && (await p.locator('[data-catalog-item]').count()) >= 3);
  check('the basics offer work per side, rest and a repeating group',
    await hasText(p, 'עבודה — לבן') && await hasText(p, 'עבודה — כחול') && await hasText(p, 'מנוחה') && await hasText(p, 'קבוצת חזרות'));
  const start = await total(p);
  check('the sample workout is loaded', start && start.n === 5, JSON.stringify(start));

  // ── drag from the catalog / the basics into the middle ───────────────────────
  await drag(p, '[data-grip="item:ראנדורי"]', '[data-zone=workout]', 'end');
  let names = await drillNames(p);
  check('dragging a catalog drill into the workout adds it at the end', names.length === 6 && names[5] === 'ראנדורי', names.join(' | '));

  await drag(p, '[data-grip="basic:work-white"]', '[data-drill="חימום כללי"]', 'top');
  names = await drillNames(p);
  check('dragging a basic onto the top inserts a new drill first', names.length === 7 && names[0] === 'תרגיל חדש', names.join(' | '));

  await drag(p, '[data-grip="drill:ראנדורי"]', '[data-drill="תרגיל חדש"]', 'top');
  names = await drillNames(p);
  check('a drill can be dragged to a new position', names[0] === 'ראנדורי' && names.length === 7, names.join(' | '));

  // tap-to-add works without any dragging
  await p.getByRole('button', { name: 'הוסף מנוחה' }).first().click();
  await sleep(200);
  check('tapping ＋ on a basic adds it too', (await drillNames(p)).length === 8);
  await p.getByRole('button', { name: /^מחק מנוחה$/ }).last().click();
  await sleep(200);
  check('a drill can be deleted', (await drillNames(p)).length === 7);

  // ── a drill inside a drill ──────────────────────────────────────────────────
  await p.getByRole('button', { name: 'ערוך צעדים של תרגיל חדש' }).click();
  await sleep(300);
  check('opening a drill shows its steps', (await p.locator('[data-node^="step:"]').count()) === 1);

  await drag(p, '[data-grip="basic:rest"]', '[data-zone="steps:"]', 'end');
  await drag(p, '[data-grip="basic:group"]', '[data-zone="steps:"]', 'end');
  check('dragging a repeating group into the drill', (await p.locator('[data-node^="group:"]').count()) === 1);

  await drag(p, '[data-grip="item:נאגה קומי — לבן ואז כחול"]', '[data-zone="steps:2"]', 'middle');
  const nestedGroups = await p.locator('[data-node^="group:"]').count();
  check('a catalog drill dropped into a group nests as a drill inside a drill',
    nestedGroups === 3 && (await p.locator('[data-node="group:נאגה קומי — לבן ואז כחול"]').count()) === 1, String(nestedGroups));

  await p.getByRole('button', { name: 'יותר חזרות' }).first().click();
  await sleep(150);
  check('the repeat count of a group can be changed', await hasText(p, '×4'));

  // rename + step controls
  await p.getByLabel('שם התרגיל').fill('פתיחה חכמה');
  await p.getByRole('button', { name: 'הוסף משך' }).first().click();
  await sleep(150);

  // ── save as a variation, in a folder of my own ──────────────────────────────
  p._answer = 'דני';
  await p.getByRole('button', { name: 'תיקייה חדשה' }).click();
  await sleep(300);
  check('the coach can open a folder with any name', (await p.locator('[data-folder="דני"]').count()) === 1);

  await p.getByRole('button', { name: '💾 שמור בקטלוג' }).click();
  await sleep(200);
  await p.getByLabel('שם בקטלוג').fill('הכנה לטורניר — דני');
  await p.getByLabel('תיקייה', { exact: true }).selectOption({ label: 'דני' });
  await p.getByRole('button', { name: 'שמור', exact: true }).click();
  await sleep(300);
  check('saving puts the drill in that folder', (await p.locator('[data-folder="דני"] [data-catalog-item="הכנה לטורניר — דני"]').count()) === 1);

  await p.getByRole('button', { name: 'וריאציה של הכנה לטורניר — דני' }).click();
  await sleep(200);
  check('a variation is a copy that can be changed on its own', (await p.locator('[data-catalog-item="הכנה לטורניר — דני (וריאציה)"]').count()) === 1);

  await p.screenshot({ path: SHOT + '/builder-drill.png' });

  // back to the list: the renamed drill, and a total that moved
  await p.getByRole('button', { name: /חזרה למערך/ }).click();
  await sleep(200);
  names = await drillNames(p);
  check('the renamed drill is in the workout', names.includes('פתיחה חכמה'), names.join(' | '));
  await p.screenshot({ path: SHOT + '/builder-workout.png' });

  // ── persistence ─────────────────────────────────────────────────────────────
  await p.reload({ waitUntil: 'networkidle' });
  await sleep(500);
  check('the workout is kept on this device', (await drillNames(p)).includes('פתיחה חכמה'));
  check('the catalog, folders and variations are kept too',
    (await p.locator('[data-folder="דני"] [data-catalog-item]').count()) === 2);

  // ── a built drill really runs on the clock ───────────────────────────────────
  const solo = await ctx.newPage();
  solo.on('pageerror', e => errors.push('SOLO: ' + e.message));
  const steps = [
    { type: 'group', id: 'g', name: 'סבב', repeat: 2, steps: [
      { type: 'step', id: 'a', kind: 'work', who: 'white', duration: 3, label: '' },
      { type: 'step', id: 'b', kind: 'rest', who: 'none', duration: 3, label: '' },
    ] },
  ];
  await solo.addInitScript(s => {
    localStorage.setItem('judo_solo_guide_seen', '1');
    localStorage.setItem('judo_solo_state', JSON.stringify({
      drills: [{ id: 'x1', name: 'נבנה בבונה', section: 'technique', type: 'steps', steps: s, note: '', autoNext: false, durationWork: 12, durationRest: 0, rounds: 1, pattern: 'together', restTiming: 'none', activeColor: 'both' }],
      judokas: [], notes: '', soundType: 'mute', globalAutoNext: true,
    }));
  }, steps);
  await solo.setViewportSize({ width: 1000, height: 560 });
  await solo.goto(APP + '/solo', { waitUntil: 'networkidle' });
  await sleep(500);
  check('a built drill shows its first step and round', await hasText(solo, 'לבן עובד') && await hasText(solo, 'סבב 1 מתוך 2'));
  await solo.getByRole('button', { name: 'הפעל', exact: true }).click();
  await sleep(3800);
  check('after the step, the clock moves to rest', await hasText(solo, 'מנוחה'));
  await sleep(3000);
  check('then the next round begins', await hasText(solo, 'סבב 2 מתוך 2'));

  check('no runtime errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  const failed = results.filter(r => !r).length;
  console.log('\n' + (results.length - failed) + '/' + results.length + ' checks passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
