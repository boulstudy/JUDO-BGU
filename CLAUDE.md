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

## שני מסכים

| מסך | נתיב | תפקיד |
|---|---|---|
| טלויזיה | `/` | תצוגה מוקרנת + **מקור האמת** + מריץ את השעון |
| שלט בנייד | `/remote` | מחזיק טיוטה פרטית, שולח פקודות, משקף מצב |

---

## מפת קבצים

```
app/
  page.js                 מסך הטלויזיה (v1 — יוחלף בשלב 2)
  layout.js               metadata + viewport (device-width — קריטי לנייד)
  JudoTrainer.jsx         הטלויזיה: JudoTV, EditorModal, WorkoutModal,
                          AttendanceModal, SplitPanel, RemotePairingModal, useSound
  remote/
    page.js               /remote + manifest נפרד
    RemoteControl.jsx     RemoteControl, ControlTab, WorkoutTab, MoreTab
  tv/
    page.js               /tv — מקלט ההקרנה (v2)
    ProjectionReceiver.jsx  הצמדה בקוד, גזירת שעון, צליל, השתלטות
  lib/
    sessionEngine.js      ★ המנוע — טהור, בלי imports. שעון עוגן, סמן,
                          מעבר שלב, התאמה לעריכה, סטיית שעונים
    ProjectionScreen.jsx  ★ הרנדרר היחיד של ההקרנה (+FittedProjection)
    sessionLink.js        צד הנייד: מחזיק את העוגן ומפרסם אותו
    projectionLink.js     צד המסך: מקבל עוגן וגוזר ממנו שעון
    remoteProtocol.js     v2 — MSG, admit(), sessionKey, seq
    supabase.js           supa() שמחזיר {data, error}
    notify.js             אפיק טוסטים
    useSound.js           צלילי האימון
    roomCode.js           קודי הצמדה (6 תווים, טהור)
    shared.js             DRILL_SECTIONS, SEC_COLOR, PATTERNS, REST_TIMING
                          + re-export של המנוע ושל supa
    ui.jsx                TimeWheel, TimePicker, Toggle, DrillForm
    remoteBus.js          לקוח Phoenix/Supabase Realtime מעל WebSocket גולמי
    remoteProtocolV1.js   הפרוטוקול הישן — משרת את / ו-/remote עד שלב 2
    linkV1.js             useTvLink / useRemoteLink הישנים
    wakeLock.js           useWakeLock
public/
  manifest.json           PWA לטלויזיה (fullscreen, landscape)
  remote-manifest.json    PWA לשלט (standalone, portrait)
  tv-manifest.json        PWA להקרנה (fullscreen, landscape)
  icon-*.png              נוצרים ב-`npm run icons` — לא לערוך ידנית
scripts/
  make-icons.js           מצייר את האייקונים עם node:zlib בלבד
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

---

## בדיקות

Supabase חסום מסביבת ה-agent, ולכן הבדיקות רצות מול **ממסר מקומי** שמחקה את
פרוטוקול Phoenix. יש בנוסף בודק חד-פעמי שרצים איתו בדפדפן אמיתי מול Supabase.

```
test/unit/run.js                 מריץ כל *.test.js — בלי דפדפן, בלי framework
test/unit/sessionEngine.test.js  39 בדיקות — דריפט, catch-up, עריכה תוך כדי
test/unit/remoteProtocol.test.js שער הבעלות: זר, replay, גרסה, השתלטות
test/unit/roomCode.test.js       אורך, אלפבית, נרמול
test/relay.js                    ממסר Phoenix מקומי (דורש: npm i --no-save ws)
test/e2e-projection.js           13 בדיקות v2 — סקריפט משחק את הנייד מול /tv
test/e2e-remote.js               25 בדיקות v1
test/e2e-clock.js                10 בדיקות v1
test/supabase-realtime-check.html  פותחים בדפדפן — REST + join + round trip
```


הסקריפטים מזריקים `WebSocket` ממופה לממסר דרך `addInitScript`, כך שקוד
האפליקציה רץ ללא שינוי. משתני סביבה: `APP`, `RELAY`, `CHROME_PATH`,
`PLAYWRIGHT_PATH`, `SHOT_DIR`.

---

## שעון העוגן — הרעיון המרכזי של v2

אף אחד לא סופר שניות ברשת. הנייד מפרסם **עוגן** — "כך וכך נשאר, ברגע הזה" —
ושני הצדדים גוזרים ממנו את הזמן, כל 100ms, באותה פונקציה טהורה.

```js
{ drillIdx, phaseIdx, running, remaining, elapsed, at }
timeLeft = running ? remaining - (now - at)/1000 : remaining
```

`project()` לא רק מחסיר — הוא **מגלגל קדימה** את כל גבולות השלבים שהזמן כבר
עבר. זה מה שהופך נייד מת לבעיה לא קיימת: המסך אף פעם לא ספר, ולכן אין לו מה
לפספס. אין catch-up לממש ואין "שעון תקוע" להתגונן ממנו.

לכן גם: **לא להחזיר `setInterval` שסופר** לשום צד. כל שינוי עובר דרך
`reanchor()` שמעגן מחדש בלי לשנות את מה שהשעון מראה כרגע.

## שער הבעלות בהצמדה

ערוץ broadcast הוא ציבורי, ולכן הקוד לבדו לא מספיק — מי שמצטרף יכול גם לשלוח.
הנייד מגריל `sessionKey`; המסך **ננעל על המפתח הראשון שראה** ומתעלם מכל אחר,
עד שאדם מאשר השתלטות על המסך עצמו. `admit()` ב-`remoteProtocol.js` מרכז את
ההחלטה, ויש לה בדיקות יחידה. `seq` עולה מונוטונית ופוסל הודעה חוזרת.

## מצב נוכחי (10.9.2026)

**ענף:** `claude/workout-management-pwa-konied` · תוכנית: `docs/PLAN-V2.md`

### שלבים 0-1 הושלמו

**שלב 0 — שהכשלון יהיה רועש**
- `supa()` מחזיר `{data, error}` במקום `null` שקט; כל 12 הקוראים עודכנו.
- מפתחות ל-`NEXT_PUBLIC_*` עם נפילה לפרויקט הקיים.
- אייקונים נוצרו (`/icon.png` פשוט לא היה קיים — ההתקנה כ-PWA הייתה שבורה).
- CI: build + בדיקות יחידה על כל PR, על Node 22.

**שלב 1 — היפוך המנוע**
- `sessionEngine.js` טהור + 39 בדיקות יחידה.
- `ProjectionScreen` — רנדרר אחד, קנבס קבוע 1280×720 שמוקטן לכל מיכל.
- `/tv` — מקלט הקרנה שמצטרף בקוד, גוזר שעון, מנגן צליל, שואל לפני השתלטות.
- פרוטוקול v2 + שער בעלות + 13 בדיקות e2e.
- v1 (`/` ו-`/remote`) ממשיך לעבוד ללא שינוי — 35 הבדיקות שלו עדיין עוברות.

**לא נעשה בכוונה:** ההפניה מ-`/remote` ל-`/` נדחתה לשלב 2. כרגע `/` היא עדיין
הטלויזיה הישנה, ולהפנות עכשיו היה שובר מערכת עובדת לפני שיש לה מחליף.

### מה שהיה קודם (v1) — עדיין נכון
- שלט מלא בנייד עם טיוטה פרטית, שידור ישיר, עריכת מערך, ספריית תרגילים,
  טעינת אימונים שמורים, הערות והגדרות.
- מצב הקרנה בטלויזיה.
- הקוד מוצג **רק** בחלון "📱 שלט רחוק", והחלון נסגר לבד 2.5 שניות אחרי שהשלט מתחבר.
- קישור נפרד לממשק הנייד בתוך החלון + העתקת קישור שכולל את הקוד.
- 35 בדיקות מקצה לקצה עוברות.
- Supabase Realtime אומת מול הפרויקט האמיתי (REST 200, join, round trip) —
  ערוץ ציבורי עם anon key מספיק, אין צורך ב-policy על `realtime.messages`.

מה עוד לא נבדק בשטח: אימון אמיתי מלא על טלויזיה + נייד.

רעיונות שהוצעו ולא מומשו:
- **QR** בחלון החיבור, כדי לסרוק במקום להקליד. דורש מקודד QR ב-JS טהור (~200 שורות)
  כי CSP/offline פוסלים שירות חיצוני.
- ריבוי שלטים במקביל / הרשאות.
- מהמסמך המקורי: Supabase Auth לפי מאמן, ובניית תרגיל היררכית (שורות → סט → מחזור).
