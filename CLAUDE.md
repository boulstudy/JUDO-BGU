# CLAUDE.md — מדריך עבודה על הפרויקט

מסמך זה נועד לאפשר להתחיל סשן חדש ולהמשיך בדיוק מהנקודה הנוכחית.
`README.md` מתאר **מה** המערכת עושה; המסמך הזה מתאר **איך** עובדים עליה ומה מצב העבודה.

---

## מה זה

מנהל אימוני ג׳ודו לנבחרת BGU. Next.js 14 (app router) + React 18, ללא ספריות UI,
כל הסגנון inline. Supabase משמש כאחסון (REST גולמי, בלי `@supabase/supabase-js`)
וכערוץ realtime לשלט הרחוק.

- אתר: `judo-bgu.vercel.app`
- GitHub: `boulstudy/JUDO-BGU`
- Supabase: `oakbpcjxjunppuyddpsj.supabase.co`

## שלושה מסכים

| מסך | נתיב | תפקיד |
|---|---|---|
| כניסה | `/` | בורר תפקיד — **הקרנה** / **ניהול מערך אימון**. אותו קישור לשני המכשירים, כדי שלא צריך להעתיק URL שונה לכל אחד |
| טלויזיה | `/display` | תצוגה מוקרנת + **מקור האמת** + מריץ את השעון |
| שלט בנייד | `/remote` | מחזיק טיוטה פרטית, שולח פקודות, משקף מצב |

בטלויזיה לוחצים "הקרנה", בנייד לוחצים "ניהול מערך אימון" — פעם אחת בכל מכשיר
(הדפדפן זוכר את זה ב-history, אפשר גם להוסיף ישר לדף הבית ב-`/display`/`/remote`).

---

## מפת קבצים

```
app/
  page.js                 מסך הכניסה — בורר הקרנה / ניהול מערך אימון
  layout.js               metadata + viewport (device-width — קריטי לנייד)
  display/
    page.js                /display — עוטף את JudoTrainer, manifest.json (טלויזיה)
  JudoTrainer.jsx         הטלויזיה: JudoTV, EditorModal, WorkoutModal,
                          AttendanceModal, SplitPanel, RemotePairingModal, useSound
  remote/
    page.js               /remote + manifest נפרד
    RemoteControl.jsx     RemoteControl, SideMenu, ControlTab, WorkoutTab, MoreTab
  lib/
    shared.js             SUPA_URL/KEY, supa(), DRILL_SECTIONS, SEC_COLOR,
                          PATTERNS, REST_TIMING, fmt, getDrillPhases,
                          totalDrillTime, drillClockSignature
    ui.jsx                TimeWheel, TimePicker, Toggle, DrillForm
    remoteBus.js          לקוח Phoenix/Supabase Realtime מעל WebSocket גולמי
    remoteProtocol.js     COMMANDS, קבועי תזמון, PATCH_KEYS, pickPatch
    link.js               useTvLink (טלויזיה), useRemoteLink (נייד)
    wakeLock.js           useWakeLock
public/
  manifest.json           PWA לטלויזיה (fullscreen, landscape)
  remote-manifest.json    PWA לשלט (standalone, portrait)
test/                     ראה "בדיקות" למטה
```

**חשוב:** `app/lib/` ו-`app/remote/` הם תיקיות רגילות בתוך `app/`. רק קבצי
`page.js` יוצרים נתיבים, ולכן `app/lib/` לא הופך ל-route.

---

## פרוטוקול השלט

ערוץ broadcast של Supabase Realtime, topic `realtime:judo-remote-<CODE>`.
אפמרי — **לא נדרשת טבלה** ולא נדרשת תלות npm. `remoteBus.js` מדבר Phoenix `vsn=1.0.0`
ישירות: `phx_join` עם `config.broadcast.self=false` ו-`private:false`, heartbeat
כל 25 שניות, reconnect עם backoff אקספוננציאלי.

**הקוד נוצר בנייד, מוקלד בטלויזיה** (לא להפך). `/remote` מייצר קוד אקראי ברגע
שנטען (`makeRoomCode` ב-`remoteBus.js`, נשמר ב-`localStorage.judo_remote_room`)
ומציג אותו עד שהטלויזיה מצטרפת לחדר. בטלויזיה, "📱 חבר שלט" פותח מודאל עם שדה
הקלדה בלבד — `JudoTV` לא ממציא קוד משלו; `roomCode` נשאר `""` עד שמקלידים,
ואז נשמר ב-`localStorage.judo_room` לחיבור חוזר אחרי רענון.

```
טלויזיה → נייד
  { t:"tick", rev, s:{ drillIdx, phaseIdx, timeLeft, running, totalElapsed, at } }
  { t:"full", rev, s:{…}, d:{ drills, judokas, pairs, notes,
                              globalAutoNext, soundType, projection } }
  { t:"bye" }

נייד → טלויזיה
  { t:"hello" }                 בקשת snapshot מלא
  { t:"ping" }                  מדליק "שלט מחובר" בטלויזיה
  { t:"cmd", c, … }             מיידי — ראה COMMANDS
  { t:"apply", patch, then }    שולח את הטיוטה; then:"play" גם מפעיל
  { t:"bye" }
```

`rev` נספר בטלויזיה ועולה בכל שינוי של ה-state הכבד. השלט מבקש `full` כשה-`rev`
שהגיע ב-`tick` לא תואם למה שיש לו. `patch` הוא **דליל** — רק מה שהמאמן נגע בו,
כדי שדחיפה לא תדרוס את השעון הרץ עם ערך ישן.

### מה מיידי ומה בטיוטה
- **מיידי תמיד:** ▶ התחל/המשך (שולח קודם את הטיוטה), ⏸ עצור, ✓ עדכן טלויזיה.
- **בטיוטה תמיד:** עריכת מערך, תרגילים, חברי נבחרת, זוגות, הערות, הגדרות.
- **תלוי במתג 🔒/🔴:** כפתורי זמן וניווט בין תרגילים/שלבים.

---

## מלכודות שכבר נפלנו בהן — לא לחזור עליהן

### 1. תלויות לא יציבות ב-useEffect שוברות טיימרים
זה קרה **פעמיים**:

- **השעון רץ לאט.** ה-`setInterval` תלה ב-`advancePhase`/`phases`, שמקבלים זהות
  חדשה בכל רנדר → האינטרוול נבנה מחדש בכל רנדר וכל רנדר דחה את הטיק הבא בשנייה.
  הפתרון: `tickCtxRef` + `deps: [running]` בלבד.
- **חלון החיבור לא נסגר לבד.** ה-`setTimeout` תלה ב-`onClose`, שהוא closure חדש
  בכל רנדר של `JudoTV` → הניקוי ביטל את הטיימר לפני שהספיק לירות.
  הפתרון: `closeRef` + `deps: [connected]` בלבד.

**כלל:** בכל `setTimeout`/`setInterval` בקומפוננטה שמתרנדרת הרבה — לקרוא callbacks
דרך ref, ולהשאיר ב-deps רק ערכים פרימיטיביים יציבים.

### 2. איפוס השעון
`drillClockSignature(drill)` = `id` + רשימת השלבים (phase/who/duration).
אפקט האיפוס מאפס **רק** כשהחתימה השתנתה — שינוי שם או הערה לא נוגע בשעון הרץ,
שינוי משכים/סבבים/תבנית כן. `clockOverrideRef` + `clockApplyTick` מאפשרים לשלט
לכפות מיקום שעון מדויק; **האפקט שקורא ל-override חייב להיות מוצהר אחרי אפקט
האיפוס**, כדי שירוץ אחריו באותו commit.

### 3. AudioContext
דפדפנים פותחים AudioContext רק מתוך נגיעה אמיתית, ולכן פקודת "התחל" מהנייד
**לא** יכולה לפתוח אותו. לכן יש באנר "🔊 לחצו כאן להפעלת הצלילים" בטלויזיה,
שנעלם אחרי נגיעה אחת (`unlockAudio` בודק `ctx.state === "running"`).

### 4. שונות
- `'use client'` חייב להיות שורה ראשונה בכל קובץ עם hooks.
- `typeof window === "undefined"` / קריאה מ-`useEffect` לכל גישה ל-`window`/`localStorage`.
- `סה"כ` בתוך JSX string — לכתוב `סה\"כ`.
- לא להוסיף `playwright` ל-`package.json` — הוא ענק ו-Vercel מתקין devDependencies.

### 5. גלילה אופקית בנייד (`/remote`)
מסכים גדולים (iPhone Pro Max וכו') חשפו שאין שום דבר שמונע פאן אופקי אם משהו
בטעות רחב מהמסך. הפתרון בשלושה מקומות בו-זמנית: `touchAction:"pan-y"` +
`overscrollBehaviorX:"none"` על ה-`shell` ב-`RemoteControl.jsx`, אותו דבר על
`html,body` בתוך ה-`<style>` המוזרק שם, ו-`overflowX:"hidden"` על ה-`<body>`
ב-`layout.js`. שלושתם צריכים להישאר – כל אחד סוגר ערוץ פאן/גלילה אחר.

---

## בדיקות

Supabase חסום מסביבת ה-agent, ולכן הבדיקות רצות מול **ממסר מקומי** שמחקה את
פרוטוקול Phoenix. יש בנוסף בודק חד-פעמי שרצים איתו בדפדפן אמיתי מול Supabase.

```
test/relay.js                    ממסר Phoenix מקומי (דורש: npm i --no-save ws)
test/e2e-remote.js               27 בדיקות — טיוטה פרטית, דחיפה, הקוד (נוצר בנייד, מוקלד בטלויזיה), מצב הקרנה
test/e2e-clock.js                10 בדיקות — דיוק השעון ואיפוס תוך כדי עריכה
test/supabase-realtime-check.html  פותחים בדפדפן — בודק REST + join + round trip
```

הרצה:

```bash
npm i --no-save ws          # פעם אחת
npx next build
node test/relay.js &                                  # פורט 8899
npx next start -p 3100 &
node test/e2e-remote.js
node test/e2e-clock.js
```

הסקריפטים מזריקים `WebSocket` ממופה לממסר דרך `addInitScript`, כך שקוד
האפליקציה רץ ללא שינוי. משתני סביבה: `APP`, `RELAY`, `CHROME_PATH`,
`PLAYWRIGHT_PATH`, `SHOT_DIR`.

---

## מצב נוכחי (11.9.2026)

**ענף:** `claude/adoring-lamport-xcxhi1` (PR #6 הקודם כבר מוזג ל-`main`)

מה הושתנה מאז PR #6 ואומת:
- **מסך כניסה מאוחד** ב-`/`: בורר "הקרנה" (→ `/display`) / "ניהול מערך אימון"
  (→ `/remote`). אותו קישור לשני המכשירים — אין יותר צורך להעתיק URL נפרד
  לכל אחד. הטלויזיה עצמה עברה מ-`/` ל-`/display`.
- **כיוון הקוד התהפך:** נוצר בנייד (`/remote`, אוטומטית עם הטעינה), מוקלד
  בטלויזיה ("📱 חבר שלט" → מודאל עם שדה הקלדה). הנייד מציג את הקוד ומחכה
  לטלויזיה; עם החיבור, שניהם עוברים אוטומטית למסך הרגיל (טיימאאוט 2.5ש׳
  בטלויזיה, 1.2ש׳ בנייד). כפתור "קוד חדש" בשני הצדדים מנתק ומייצר/מבקש קוד חדש.
- **תפריט צד קבוע בנייד** במקום שורת טאבים תחתונה — `SideMenu` ב-
  `RemoteControl.jsx`, רצועה של 72px עם שלושת הטאבים (שלט/מערך/עוד) תמיד גלויה,
  כדי שגישה להגדרות ולכלי האפליקציה תישאר זמינה באמצע אימון בלי לאבד את המסך
  הנוכחי. גם פותר את בעיית ה-safe-area התחתון במכשירים גדולים כמו iPhone
  16 Pro Max שהתלוננו שאזור הבית מפריע לטאב-בר.
- **נעילת גלילה אופקית** בנייד (`touch-action: pan-y` + `overscroll-behavior-x`
  + `overflow-x: hidden` בשלושה מקומות — ראו "מלכודות" #5) — אימות ב-Playwright
  ש-`scrollWidth === clientWidth` בכל המסכים.
- 37 בדיקות מקצה לקצה עוברות (27 + 10), כולל את זרימת הקוד ההפוכה.

מה עוד לא נבדק בשטח: אימון אמיתי מלא על טלויזיה + נייד עם הזרימה החדשה,
ובדיקה ידנית על iPhone 16 Pro Max אמיתי (רק Playwright בגודל 430×932 בסימולציה).

רעיונות שהוצעו ולא מומשו:
- **QR** בחלון החיבור, כדי לסרוק במקום להקליד. דורש מקודד QR ב-JS טהור (~200 שורות)
  כי CSP/offline פוסלים שירות חיצוני.
- ריבוי שלטים במקביל / הרשאות.
- מניפסט PWA ייעודי למסך הכניסה (`/`) — כרגע יורש את `manifest.json` של הטלויזיה
  (fullscreen/landscape), לא אידיאלי אם מוסיפים את `/` למסך הבית מנייד.
- מהמסמך המקורי: Supabase Auth לפי מאמן, ובניית תרגיל היררכית (שורות → סט → מחזור).
