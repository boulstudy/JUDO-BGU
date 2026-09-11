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
  page.js                 מסך הכניסה — בורר הקרנה / ניהול מערך אימון + קישור ל-/clubs
  layout.js               metadata + viewport (device-width — קריטי לנייד)
  display/
    page.js                /display — עוטף את JudoTrainer, manifest.json (טלויזיה)
  JudoTrainer.jsx         הטלויזיה: JudoTV, EditorModal, WorkoutModal,
                          AttendanceModal, SplitPanel, RemotePairingModal, useSound
  remote/
    page.js               /remote + manifest נפרד
    RemoteControl.jsx     RemoteControl, SideMenu, ControlTab, WorkoutTab, MoreTab
  login/
    page.js, LoginForm.jsx    /login — התחברות / הרשמה
  clubs/
    page.js, ClubsScreen.jsx      /clubs — "מועדוני הג׳ודו שלי"
    [id]/page.js, ClubDetail.jsx  /clubs/[id] — סניפים ונבחרות בתוך מועדון
  lib/
    shared.js             SUPA_URL/KEY, supa() (מפתח anon — קריאה ציבורית),
                          DRILL_SECTIONS, SEC_COLOR, PATTERNS, REST_TIMING,
                          fmt, getDrillPhases, totalDrillTime, drillClockSignature
    auth.js               Supabase Auth דרך REST: signUp/signIn/signOut,
                          authedFetch() (כמו supa() אך עם ה-access_token של
                          המשתמש, כדי ש-RLS יראה auth.uid()), useAuth()
    ui.jsx                TimeWheel, TimePicker, Toggle, DrillForm
    manageUi.jsx           Shell/card/btn/input משותפים למסכי /clubs/*
    remoteBus.js          לקוח Phoenix/Supabase Realtime מעל WebSocket גולמי
    remoteProtocol.js     COMMANDS, קבועי תזמון, PATCH_KEYS, pickPatch
    link.js               useTvLink (טלויזיה), useRemoteLink (נייד)
    wakeLock.js           useWakeLock
public/
  manifest.json           PWA לטלויזיה (fullscreen, landscape)
  remote-manifest.json    PWA לשלט (standalone, portrait)
supabase/
  migrations/             SQL שרצים ידנית ב-SQL editor של Supabase — ראו
                          "מודל מועדונים, סניפים ונבחרות" למטה
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
ומציג אותו עד שהטלויזיה מצטרפת לחדר — **אבל רק כשהקוד חדש**. אם כבר יש קוד
שמור (כלומר כבר הזדווגנו פעם, והטלויזיה זוכרת אותו גם), מסך הקוד מדולג לגמרי
ונכנסים ישר לשלט; הקוד עדיין מוצג ברצועת הצד ובטאב "עוד". בטלויזיה, "📱 חבר שלט" פותח מודאל עם שדה
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

## מודל מועדונים, סניפים ונבחרות

שכבת ניהול נפרדת מהטלויזיה/שלט (פאזה 5 תחבר ביניהן — עדיין לא קרה). היררכיה:

```
מועדון (בעלים אחד)
  └─ סניף (עד branch_quota — 3 כברירת מחדל)
       └─ נבחרת
```

"רשת מועדוני ג׳ודו" = מועדון אחד עם כמה סניפים, לא כמה מועדונים. קטלוג התרגילים
ומערכי האימון (עוד לא נבנו — פאזות 3-4) יושבים ברמת **המועדון**, משותפים לכל
הסניפים שלו.

### חשבונות (`app/lib/auth.js`)
Supabase Auth דרך REST גולמי, כמו כל שאר הפרויקט — בלי `@supabase/supabase-js`.
`signIn`/`signUp` פונים ל-`/auth/v1/token`, `/auth/v1/signup`; הסשן
(`access_token`, `refresh_token`, `expires_at`, `user`) נשמר ב-
`localStorage.judo_auth_session` ומתרענן לבד (`REFRESH_SKEW_SEC = 60`).

**קריטי:** `shared.js`'s `supa()` שולח תמיד את מפתח ה-anon כ-`Authorization` —
זה מתאים לטלויזיה/שלט (קריאה ציבורית, בלי RLS). מסכי `/clubs/*` **חייבים**
להשתמש ב-`authedFetch()` מ-`auth.js` במקום, כי הוא שולח את ה-`access_token`
של המשתמש כ-`Authorization`, וזה מה ש-Postgres קורא כ-`auth.uid()` ב-RLS.
קריאה ל-`supa()` הרגיל ממסך מועדונים תעבור כ"אנונימי" ותיכשל בשקט (RLS דוחה).

### מודל הנתונים (`supabase/migrations/0001_clubs.sql`)
**סביבת ה-agent חסומה מ-Supabase (ראו "בדיקות" למטה) — המיגרציה הזו לא רצה
מעולם מול הפרויקט האמיתי.** יש להריץ אותה ידנית ב-SQL editor לפני שמסכי
`/login`, `/clubs`, `/clubs/[id]` יעבדו בפועל.

- `profiles` — שורה אחת לכל `auth.users`, נוצרת אוטומטית ב-trigger
  (`handle_new_user`) בהרשמה. כולל `is_site_admin`.
- `clubs` — `owner_id` יחיד, `branch_quota` (ברירת מחדל 3).
- `branches` — `club_id`; מכסת הסניפים נאכפת גם ב-DB (`enforce_branch_quota`
  trigger), לא רק ב-UI.
- `teams` — `branch_id`.
- RLS על כל הטבלאות: `owner_id = auth.uid()` (עם join לאורך ההיררכיה עבור
  branches/teams), או `is_site_admin()` — פונקציית SQL עוזרת שבודקת את
  `profiles.is_site_admin` של המשתמש המחובר.
- **קטלוג, מערכי אימון, ג׳ודוקאים עם חשבון, ומאמנים נוספים עדיין לא קיימים
  בסכימה** — אלה פאזות 3, 4 ו-6 (ראו "מצב נוכחי" למטה).

### מסכי הניהול
- `/login` — התחברות/הרשמה. אחרי הרשמה עם אישור מייל דלוק (ברירת המחדל של
  Supabase), המסך מציג "בדקו את המייל" במקום להיכנס ישר.
- `/clubs` — "מועדוני הג׳ודו שלי". ריק ⇐ טופס יצירת מועדון; מועדון קיים ⇐
  כרטיס שמוביל ל-`/clubs/[id]`.
- `/clubs/[id]` — רשימת סניפים (עם המכסה, ואם הגיעו אליה — טופס ההוספה
  מוחלף בהודעה שצריך לפנות להנהלת האתר), ותחת כל סניף רשימת נבחרות + טופס
  הוספה. שני כרטיסי "בקרוב" לקטלוג ולמערכי אימון.
- כל שלושת המסכים חוסמים גישה לא מחוברת ומפנים ל-`/login` (בודקים
  `useAuth().isAuthed` אחרי שה-`loading` הראשוני נגמר).

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
test/e2e-remote.js               28 בדיקות — טיוטה פרטית, דחיפה, הקוד (נוצר בנייד, מוקלד בטלויזיה), מצב הקרנה
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

**ענף:** `claude/adoring-lamport-xcxhi1`

### פאזה 1+2: חשבונות + מועדונים/סניפים/נבחרות — כרגע בענף, לא נבדק מול Supabase אמיתי
- מיגרציית SQL (`supabase/migrations/0001_clubs.sql`), לקוח Auth (`app/lib/auth.js`),
  ושלושה מסכים חדשים (`/login`, `/clubs`, `/clubs/[id]`) — פירוט מלא ב-"מודל
  מועדונים, סניפים ונבחרות" למעלה.
- קישור לא-פולשני מדף הבית: "🗂️ ניהול מועדונים (בטא)".
- `next build` עובר, וה-guard של המסכים (הפניה ל-`/login` כשלא מחוברים) אומת
  ב-Playwright מול `next start` מקומי.
- **מה שלא אומת, כי סביבת ה-agent חסומה מ-Supabase:** המיגרציה לא רצה בפועל,
  ולכן הרשמה/התחברות אמיתיות, RLS, ומכסת הסניפים בפועל — אף אחד מזה לא נבדק
  מול הפרויקט האמיתי. **צריך להריץ את המיגרציה ידנית ב-SQL editor לפני שמנסים
  את המסכים האלה.**
- השלב הבא (פאזה 3): קטלוג התרגילים עם תגיות (`tags`, `drill_tags`, `drills`) —
  ראו את שש הפאזות בתכנון שסוכם בשיחה.

### מה שהיה כבר קודם, ואומת
- **מסך כניסה מאוחד** ב-`/`: בורר "הקרנה" (→ `/display`) / "ניהול מערך אימון"
  (→ `/remote`). אותו קישור לשני המכשירים — אין יותר צורך להעתיק URL נפרד
  לכל אחד. הטלויזיה עצמה עברה מ-`/` ל-`/display`.
- **כיוון הקוד התהפך:** נוצר בנייד (`/remote`, אוטומטית עם הטעינה), מוקלד
  בטלויזיה ("📱 חבר שלט" → מודאל עם שדה הקלדה). הנייד מציג את הקוד ומחכה
  לטלויזיה; עם החיבור, שניהם עוברים אוטומטית למסך הרגיל (טיימאאוט 2.5ש׳
  בטלויזיה, 1.2ש׳ בנייד). קוד שכבר שמור (הזדווגות קודמת) מדלג על מסך הקוד
  לגמרי. כפתור "קוד חדש" בשני הצדדים מנתק ומייצר/מבקש קוד חדש.
- **תפריט צד קבוע בנייד** במקום שורת טאבים תחתונה — `SideMenu` ב-
  `RemoteControl.jsx`, רצועה של 72px עם שלושת הטאבים (שלט/מערך/עוד) תמיד גלויה.
- **נעילת גלילה אופקית** בנייד (`touch-action: pan-y` + `overscroll-behavior-x`
  + `overflow-x: hidden` בשלושה מקומות — ראו "מלכודות" #5).
- 38 בדיקות מקצה לקצה עוברות (28 + 10) — פרוטוקול השלט/טלויזיה, לא נוגעות
  בחשבונות/מועדונים.

מה עוד לא נבדק בשטח: אימון אמיתי מלא על טלויזיה + נייד, ובדיקה ידנית על
iPhone 16 Pro Max אמיתי (רק Playwright בסימולציה) — וכאמור, כל שכבת
המועדונים לא נבדקה מול Supabase אמיתי.

רעיונות שהוצעו ולא מומשו:
- **QR** בחלון החיבור, כדי לסרוק במקום להקליד. דורש מקודד QR ב-JS טהור (~200 שורות)
  כי CSP/offline פוסלים שירות חיצוני.
- ריבוי שלטים במקביל / הרשאות.
- מניפסט PWA ייעודי למסך הכניסה (`/`) — כרגע יורש את `manifest.json` של הטלויזיה
  (fullscreen/landscape), לא אידיאלי אם מוסיפים את `/` למסך הבית מנייד.
- פאזות 3-6 מהתכנון: קטלוג + תגיות, מערכי אימון, חיבור השלט/הטלויזיה למועדון
  (במקום `localStorage`/hardcoded), מאמנים נוספים + הרשאות + מסך אדמין לאתר.
