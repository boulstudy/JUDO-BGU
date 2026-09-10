// Drives the real /tv screen with a script that plays the coach's phone.
//
// The phone UI does not exist yet, and that is the point: this speaks protocol
// v2 straight onto the relay, so what is under test is the receiver — the
// anchor derivation, the catch-up, the ownership gate — and not a UI that
// happens to sit in front of it.
//
// Playwright is not a project dependency (it is enormous and Vercel installs
// devDependencies); it is picked up from a global install or PLAYWRIGHT_PATH.

function requirePlaywright() {
  const tries = [process.env.PLAYWRIGHT_PATH, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) {} }
  console.error('playwright not found — npm i --no-save playwright, or set PLAYWRIGHT_PATH');
  process.exit(2);
}
const { chromium } = requirePlaywright();
const WebSocket = require('ws');

const APP   = process.env.APP   || 'http://127.0.0.1:3100';
const RELAY = process.env.RELAY || 'ws://127.0.0.1:8899';
const ROOM  = 'K7M3QP';
const TOPIC = 'realtime:judo-remote-' + ROOM;
const V     = 2;

// The bundled browser lives under PLAYWRIGHT_BROWSERS_PATH here; let the
// library find its own if that layout is not present.
function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const fs = require('fs'), path = require('path');
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) {
      const exe = path.join(root, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return exe;
    }
  } catch (e) {}
  return null;
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok });
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra === undefined ? '' : '\n      ' + extra));
}

// Point the app's WebSocket at the local relay without touching app code.
const redirect = `(() => {
  const Orig = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    if (String(url).includes('/realtime/v1/websocket')) url = '${RELAY}';
    return protocols ? new Orig(url, protocols) : new Orig(url);
  };
  window.WebSocket.prototype = Orig.prototype;
  Object.assign(window.WebSocket, { CONNECTING:0, OPEN:1, CLOSING:2, CLOSED:3 });
})();`;

// ── the stand-in phone ───────────────────────────────────────────────────────
function makePhone(key) {
  const ws = new WebSocket(RELAY);
  let ref = 0, seq = 0;
  const inbox = [];
  const ready = new Promise(res => {
    ws.on('open', () => {
      ws.send(JSON.stringify({
        topic: TOPIC, event: 'phx_join',
        payload: { config: { broadcast: { self: false }, private: false } }, ref: ++ref,
      }));
      setTimeout(res, 150);
    });
  });
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.event === 'broadcast' && m.payload && m.payload.payload) inbox.push(m.payload.payload);
  });
  const send = msg => ws.send(JSON.stringify({
    topic: TOPIC, event: 'broadcast',
    payload: { type: 'broadcast', event: 'm', payload: msg }, ref: ++ref,
  }));
  return {
    ready, inbox, close: () => ws.close(),
    state: (a, d, extra = {}) => send({ v: V, t: 'state', key, seq: ++seq, rev: d ? 1 : 1, a, ...(d ? { d } : {}), opts: { globalAutoNext: true }, ...extra }),
    raw: send,
    key,
  };
}

const DRILLS = [
  { id: 1, name: 'חימום כללי', section: 'warmup', type: 'group', durationWork: 300, autoNext: true },
  { id: 2, name: 'נאגה גדן',  section: 'technique', type: 'partner', durationWork: 60, durationRest: 15,
    rounds: 2, pattern: 'alternate', restTiming: 'after_each', activeColor: 'white', autoNext: true },
  { id: 3, name: 'ראנדורי',    section: 'randori', type: 'partner', durationWork: 120, durationRest: 0,
    rounds: 1, pattern: 'together', restTiming: 'none', autoNext: false },
];
const CONTENT = {
  drills: DRILLS,
  athletes: [{ id: 1, name: 'יואב', color: 'white' }, { id: 2, name: 'ניר', color: 'blue' }],
  pairs: [[1, 2]],
  notes: 'דגש על אחיזה',
  soundType: 'mute',
  projection: false,
  groupName: 'נבחרת בוגרים',
};

const anchor = (over = {}) => ({
  drillIdx: 0, phaseIdx: 0, running: false, remaining: 300, elapsed: 0, at: Date.now(), ...over,
});

const proj = (page, what) => page.evaluate(w => {
  const el = document.querySelector('[data-proj="' + w + '"]');
  return el ? el.textContent.trim() : '';
}, what);
const clockText = page => proj(page, 'clock');

const bodyText = page => page.evaluate(() => document.body.innerText);

(async () => {
  const browser = await chromium.launch(chromePath() ? { executablePath: chromePath() } : {});
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(redirect);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('    [page error]', e.message));

  // ── pairing ────────────────────────────────────────────────────────────────
  await page.goto(APP + '/tv', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#tv-room-code', { timeout: 10000 });

  await page.fill('#tv-room-code', 'A0K1QP');
  check('rejects a code containing characters codes never use',
    (await bodyText(page)).includes('אין 0 ו־1 בקוד'));

  await page.fill('#tv-room-code', ROOM);
  await page.click('text=התחבר');
  await page.waitForTimeout(900);
  check('shows the code while waiting for a phone', (await bodyText(page)).includes(ROOM));

  // ── first state ────────────────────────────────────────────────────────────
  const phone = makePhone('coach-alpha');
  await phone.ready;
  phone.state(anchor(), CONTENT);
  await page.waitForTimeout(700);

  let text = await bodyText(page);
  check('renders the workout the phone published', (await proj(page, 'drill')) === 'חימום כללי' && text.includes('נבחרת בוגרים'));
  check('shows the paused clock', (await clockText(page)) === '05:00');

  // ── the anchor counts down without a single tick being sent ────────────────
  phone.state(anchor({ running: true, remaining: 30, at: Date.now() }));
  await page.waitForTimeout(3200);
  const t1 = await clockText(page);
  check('derives a running clock with no ticks on the wire',
    t1 === '00:27' || t1 === '00:26' || t1 === '00:28', 'got ' + t1);

  // ── the phone goes silent across a boundary ────────────────────────────────
  // One anchor, then nothing. The screen must cross into the next drill on its
  // own — this is the dead-phone case the whole design exists for.
  phone.state(anchor({ drillIdx: 0, phaseIdx: 0, running: true, remaining: 2, at: Date.now() }));
  await page.waitForTimeout(4000);
  text = await bodyText(page);
  check('crosses into the next drill while the phone says nothing', (await proj(page, 'drill')) === 'נאגה גדן', await proj(page, 'drill'));

  // ── deep catch-up ──────────────────────────────────────────────────────────
  // An anchor that is already long expired: 300 (warmup) is gone, and so are
  // the first three phases of the partner drill.
  phone.state(anchor({
    drillIdx: 0, phaseIdx: 0, running: true,
    remaining: 300, at: Date.now() - (300 + 60 + 15 + 60) * 1000 - 5000,
  }));
  await page.waitForTimeout(900);
  text = await bodyText(page);
  const t2 = await clockText(page);
  check('lands on the right phase after a long silence',
    (await proj(page, 'drill')) === 'נאגה גדן' && (t2 === '00:10' || t2 === '00:09' || t2 === '00:11'),
    'drill ' + (await proj(page, 'drill')) + ' clock ' + t2);

  // ── a stranger with the code ───────────────────────────────────────────────
  const intruder = makePhone('someone-else');
  await intruder.ready;
  intruder.state(anchor({ drillIdx: 2, phaseIdx: 0, running: false, remaining: 999 }), CONTENT);
  await page.waitForTimeout(800);
  text = await bodyText(page);
  check('does not obey a second phone that merely knows the code', (await proj(page, 'drill')) !== 'ראנדורי');
  check('asks a human before handing the screen over', text.includes('שלט אחר מבקש להתחבר'));

  await page.click('text=לא עכשיו');
  await page.waitForTimeout(300);
  phone.state(anchor({ drillIdx: 2, phaseIdx: 0, running: false, remaining: 120, at: Date.now() }));
  await page.waitForTimeout(600);
  check('the original phone still drives the screen after a refused takeover',
    (await proj(page, 'drill')) === 'ראנדורי');

  // ── an accepted takeover ───────────────────────────────────────────────────
  intruder.state(anchor({ drillIdx: 0, phaseIdx: 0, running: false, remaining: 300 }), CONTENT);
  await page.waitForTimeout(700);
  if ((await bodyText(page)).includes('שלט אחר מבקש להתחבר')) {
    await page.click('text=העבר לשלט החדש');
    await page.waitForTimeout(400);
    intruder.state(anchor({ drillIdx: 0, phaseIdx: 0, running: false, remaining: 300, at: Date.now() }), CONTENT);
    await page.waitForTimeout(700);
    check('an accepted takeover switches the screen to the new phone',
      (await clockText(page)) === '05:00');
  } else {
    check('an accepted takeover switches the screen to the new phone', false, 'no prompt appeared');
  }

  // ── replay ─────────────────────────────────────────────────────────────────
  const before = await clockText(page);
  intruder.raw({ v: V, t: 'state', key: intruder.key, seq: 1, rev: 1,
                 a: anchor({ drillIdx: 2, phaseIdx: 0, remaining: 999 }), opts: { globalAutoNext: true } });
  await page.waitForTimeout(600);
  check('drops a replayed message with a stale sequence number', (await clockText(page)) === before);

  // ── a screen that reloads mid-session ──────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  intruder.state(anchor({ drillIdx: 1, phaseIdx: 0, running: true, remaining: 45, at: Date.now() }), CONTENT);
  await page.waitForTimeout(900);
  check('a reloaded screen rejoins its room by itself and catches up',
    (await proj(page, 'drill')) === 'נאגה גדן');

  phone.close(); intruder.close();
  await browser.close();

  const failed = results.filter(r => !r.ok).length;
  console.log('\n  ' + (results.length - failed) + ' passed' + (failed ? ', ' + failed + ' failed' : ''));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
