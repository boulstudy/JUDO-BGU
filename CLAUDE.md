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

### מודל הנתונים — ⚠️ שונה בפועל ממה שהקובץ הבא אומר

**`supabase/migrations/0001_clubs.sql` מיושן ולא תואם את מה שבאמת רץ ב-Supabase.**
אל תריץ אותו כמו שהוא! הוא תיאר תוכנית (`profiles`/`clubs`/`branches`/`teams`
עם `is_site_admin`) **לפני** שהתגלה שב-DB האמיתי כבר יושבת סכימה שונה ועשירה
יותר שאף אחד מהסשנים הידועים לא כתב את ה-SQL שלה (ראו "מצב נוכחי" — זה חקר
פעיל, לא סגור). הפרטים המלאים של מה שבאמת קיים שם כרגע נמצאים בשיחה, לא
בקובץ — **אם אתה מתחיל סשן חדש, תבקש מהמשתמש את תוצאות שאילתת
`information_schema.columns` טרם שתכתוב עוד SQL.**

מה שידוע בוודאות על הסכימה האמיתית (נכון ל-7.10.2026):
- טבלאות: `profiles`, `clubs`, `athletes`, `groups`, `plans`, `sessions`,
  `drills`, `club_invites` (חדשות) + `drill_library`, `workouts`, `attendance`
  (הישנות, קיימות מאז לפני כל זה).
- **אין שום `branches`/`teams`** — `athletes`/`groups`/`plans`/`sessions` כולם
  תלויים ישירות ב-`club_id`. זה סותר את ההיררכיה שסיכמנו (מועדון → סניף →
  נבחרת) וטרם תוקן.
- `profiles` שם שונה משלי: `club_id` + `role` ישירות על הפרופיל, בלי `email`
  ובלי `is_site_admin`.
- `drills` עשיר יותר ממה שתכננתי: `spec` jsonb גמיש, `visibility`,
  `forked_from`, `tags` כמערך native.
- `sessions` — דבר שלא היה בתוכנית המקורית: רשומה של אימון שבאמת רץ (זמן
  התחלה/סיום, נוכחות, הערות, סטטיסטיקות) — פותר חלק ממה שפאזה 5 הייתה
  אמורה לפתור.

**ההחלטה שסוכמה:** לא לזרוק את זה. להוסיף `branches` *מעל* הסכימה הקיימת
(מועדון → סניף, ו-`athletes`/`groups`/`plans`/`sessions` מקבלים `branch_id`
בנוסף ל-`club_id` שכבר יש להם) — לא לבנות הכל מחדש. המיגרציה הזו עוד לא
נכתבה; היא ממתינה לתוצאות של כמה שאילתות אבחון (RLS/policies, triggers/
functions, FK, ספירת שורות) כדי לא להתנגש עם מה שכבר שם.

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

## מצב נוכחי (7.10.2026)

**ענף:** `claude/adoring-lamport-xcxhi1` — commit אחרון `b8bf0f5`, **אין PR פתוח
עליו כרגע** (ה-PR הקודם, #8, התמזג; מה שנוסף אחריו — חשבונות/מועדונים —
עדיין רק בענף).

### 🔴 באמצע חקירה פעילה — זה מה שסשן חדש צריך לעשות קודם
גילינו ש-Supabase כבר מכיל סכימה שלמה ל-club/catalog/plans/sessions שאף אחד
מאיתנו לא כתב (פירוט ב-"מודל מועדונים, סניפים ונבחרות" למעלה — **הקטע הזה
חשוב יותר מכל השאר במסמך הזה כרגע**). לא ברור איך היא נוצרה; חשד סביר:
אחד מהענפים האחרים שקיימים ב-GitHub (`claude/malanta-architecture-planning-9gzvwc`,
`claude/workout-management-pwa-konied`) — **טרם נבדק**, או כלי ה-"Ask
Assistant"/"Debug with Assistant" המובנה ב-Supabase עצמו.

סוכם עם המשתמש (לא בכוונה, אבל בפועל): לשמר את הסכימה הקיימת ולהוסיף
`branches` מעליה, לא לזרוק ולבנות מחדש. **השלב הבא המיידי:** המשתמש אמור
לשלוח תוצאות של 4 שאילתות אבחון (RLS/policies, functions/triggers, foreign
keys, ספירת שורות — הנוסח המדויק נמצא בהודעות הקודמות בשיחה, לא כאן) —
*מהן עדיין לא קיבלנו תשובה*. אחרי שיגיעו: לכתוב מיגרציה חדשה
(`supabase/migrations/0002_branches.sql` או דומה) שמוסיפה `branches` +
`branch_id` ל-`athletes`/`groups`/`plans`/`sessions`, מתואמת ל-RLS/triggers
שכבר קיימים — **ולא** להריץ שוב את `0001_clubs.sql` הישן.

גם שווה לבדוק את אותם שני ענפי GitHub לפני שממשיכים — ייתכן שיש שם את ה-SQL
המקורי של הסכימה המסתורית, מה שיחסוך ניחושים.

### תקלת Supabase שחלפה (לא קשורה לשום דבר מהנ"ל)
ב-11.9 הייתה תקלת פלטפורמה רחבה של Supabase ("Unresponsive Projects" —
status.supabase.com), שגרמה ל-timeouts ב-SQL editor. נפתרה ב-restart לפרויקט.
לא קשור לבאג בקוד או במיגרציה — רק מוזכר כדי שלא נחשוד שוב בטעות.

### קישורים נוכחיים
- **פרודקשן (מה שכולם רואים):** https://judo-bgu.vercel.app — **בלי**
  `/login`/`/clubs` עדיין, כי זה לא מוזג.
- **תצוגה מקדימה של הענף** (כולל `/login`/`/clubs`):
  https://judo-bgu-git-claude-adoring-lam-ab6a6c-boulstudy-5804s-projects.vercel.app
  — אבל שים לב: ה-UI מוכן, לא מחובר באמת לנתונים עד שסכימת ה-DB תתייצב (ראו למעלה).

### פאזה 1+2 (חשבונות + מסכי ניהול) — הקוד מוכן, לא נבדק מול DB אמיתי
- `app/lib/auth.js` (Supabase Auth דרך REST), `/login`, `/clubs`, `/clubs/[id]` —
  פירוט מלא ב-"מודל מועדונים, סניפים ונבחרות" למעלה.
- קישור לא-פולשני מדף הבית: "🗂️ ניהול מועדונים (בטא)".
- `next build` עובר, וה-guard של המסכים (הפניה ל-`/login` כשלא מחוברים) אומת
  ב-Playwright מול `next start` מקומי. **שום דבר מעבר לזה לא נבדק מול
  Supabase אמיתי** — וכרגע זה גם לא יעבוד, כי `authedFetch`/המסכים מניחים
  את הסכימה הישנה שלי (`profiles.email`, אין `club_id` על profiles וכו'),
  לא את זו שבאמת קיימת. יהיה צריך לעדכן את `app/lib/auth.js` ו-`ClubsScreen`/
  `ClubDetail` אחרי שהמיגרציה החדשה תיכתב.

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
