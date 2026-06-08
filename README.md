# JUDO-BGU — מנהל אימוני יודו BGU

## סטטוס נוכחי
אתר פעיל בכתובת: `judo-bgu.vercel.app`  
GitHub: `boulstudy/JUDO-BGU`  
Supabase: `BGU-JUDO-SUP` — `https://oakbpcjxjunppuyddpsj.supabase.co`

---

## מבנה הפרויקט
```
JUDO-BGU/
├── app/
│   ├── page.js          — מייבא את JudoTrainer
│   ├── layout.js        — PWA meta tags + manifest
│   └── JudoTrainer.jsx  — כל הלוגיקה והUI (1100+ שורות)
├── public/
│   └── manifest.json    — PWA manifest (fullscreen, landscape)
└── package.json         — Next.js 14, React 18
```

---

## טבלאות Supabase
```sql
-- אימונים שמורים
workouts (id, date, name, drills jsonb, judokas jsonb, pairs jsonb, created_at)

-- ספריית תרגילים לשימוש חוזר
drill_library (id, name, duration_work, duration_rest, rounds, pattern, active_color, note, created_at)

-- נוכחות
attendance (id, date, present_ids jsonb, total, created_at)
```
כל הטבלאות עם RLS מופעל + policy "allow all".

---

## ארכיטקטורת הקוד (JudoTrainer.jsx)

### קומפוננטות
| קומפוננטה | תפקיד |
|---|---|
| `useSound(soundType)` | צלילי interval timer (Flex Timer style) |
| `TimeWheel` / `TimePicker` | גלגלת זמן דקות:שניות |
| `Toggle` | כפתור on/off |
| `DrillForm` | טופס עריכת תרגיל |
| `EditorModal` | עורך מערך אימון (3 טאבים: תרגילים / חברי נבחרת / זוגות) |
| `WorkoutModal` | שמירה/טעינה/עדכון אימונים מ-Supabase |
| `AttendanceModal` | נוכחות לפי תאריך |
| `SplitPanel` | פאנל לבן/כחול — מי עובד עכשיו |
| `JudoTV` | קומפוננטת ראשית |

### מבנה תרגיל (drill object)
```js
{
  id, name, section, type,        // "group" | "partner" | "personal" | "rest"
  durationWork, durationRest,     // שניות
  rounds, pattern,                // "alternate" | "together"
  restTiming,                     // "none" | "after_each" | "after_round"
  activeColor,                    // "white" | "blue" | "both"
  autoNext, note
}
```

### מנוע שלבים (getDrillPhases)
כל תרגיל מתפרק לרצף שלבים: `{ phase, who, duration, label, round }`  
השעון עובר אוטומטית בין שלבים, עם התראה בכל מעבר.

---

## Layout (3 עמודות)
```
[הערות אימון] | [שעון + שלבים + מי עובד] | [מערך האימון]
   (ניתן לסגור)   (CENTER — גמיש)           (240px קבוע)
```

---

## פיצ'רים קיימים

### תצוגה
- שעון ענק — **ירוק** כשרץ, **אדום** כשעצור
- פסי שלבים ויזואליים (לבן עובד → כחול עובד → מנוחה)
- פאנל לבן/כחול — הצד הפעיל גדול ובהיר, השני עמום וקטן
- כשניהם עובדים — שניהם מוארים
- הבא: שם התרגיל/שלב הבא

### שליטה
- ▶ הפעל / ⏸ עצור
- ← קודם / הבא →
- ↺ אפס שלב
- כפתורי זמן: **− דקה / − 30ש׳ / − 10ש׳ / + 10ש׳ / + 30ש׳ / + דקה**
- תיבת עריכה ידנית של השעון (MM:SS)
- מעבר אוטומטי — toggle גלובלי + הגדרה לכל תרגיל

### צלילים (Flex Timer style)
- t=3,2: ביפ קצר 1000Hz
- t=1: ביפ ארוך 1000Hz  
- סיום שלב: 3 ביפים עולים (880→880→1320Hz)
- אפשרויות: 🔔 ביפ / ⚡ באזר / 🔇 שקט

### עריכה
- גרירת תרגילים לשינוי סדר (drag & drop)
- שכפול תרגיל
- ספריית תרגילים (שמירה ב-Supabase)
- + תרגיל / + מנוחה

### חברי הנבחרת
- שמות בלבד (ללא כחול/לבן)
- שיוך לקבוצות + כפתור "קבוצה חדשה"
- סינון לפי קבוצה

### Supabase
- שמירת אימונים לפי תאריך
- עדכון אימון שמור (כפתור "עדכן")
- טעינת האימון האחרון בפתיחה
- נוכחות + היסטוריה

### תצוגה / נגישות
- כפתורי + / − לזום (50%–150%)
- פאנלים ניתנים לגרירה לשינוי רוחב (mouse + touch)
- PWA — ניתן להוסיף לדף הבית ולהריץ fullscreen
- תמיכה מלאה באייפד (touch events)

---

## תפריט ☰ (תחתון)
- ✏️ ערוך אימון
- 📅 אימונים שמורים
- 📋 נוכחות היום
- 👥 חברי הנבחרת
- 🔔 הגדרות צליל
- גודל תצוגה

---

## מה שתוכנן לגרסה הבאה

### מערכת משתמשים (Auth)
- Supabase Auth (אימייל + סיסמה)
- כל מאמן רואה רק את הנבחרת שלו
- מנהל נבחרת מוסיף חברים
- RLS policies לפי user_id
- טבלת `teams` עם מנהל + חברים

### בניית תרגיל היררכי
- שורות בודדות (לבן עובד / כחול עובד / מנוחה)
- → קיבוץ ל**סט**
- → קיבוץ סטים ל**מחזור**
- → הגדרת כמה פעמים המחזור חוזר

---

## הערות טכניות חשובות
- **AudioContext** חייב להיאתחל בתוך לחיצת משתמש (iOS) — נעשה ב-`initCtx()` בכפתור הפעל
- **`typeof window === "undefined"`** guard לכל קוד צד-לקוח
- **`'use client'`** חייב להיות שורה ראשונה בקובץ
- **`סה"כ`** בתוך JSX strings — להשתמש ב-`סה\"כ` עם escape
- הקובץ עבר babel parse validation לפני כל העלאה
