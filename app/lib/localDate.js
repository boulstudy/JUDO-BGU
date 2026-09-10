// Dates as the coach's calendar sees them.
//
// The old code used new Date().toISOString().slice(0,10), which is the UTC
// date. In Israel that happens to be right for an evening session and only
// diverges after local midnight — but the moment a club sits west of Greenwich
// it files every evening training under the following day. Since the whole
// point of V2 is more than one club, the date has to come from the local
// calendar rather than from UTC.

const pad = n => String(n).padStart(2, "0");

export function localDate(d = new Date()) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

export function localTime(d = new Date()) {
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

export const dayName = (d = new Date()) => DAYS[d.getDay()];

// "יום שלישי, 10 בספטמבר"
export function longDate(d = new Date()) {
  return "יום " + DAYS[d.getDay()] + ", " + d.getDate() + " ב" + MONTHS[d.getMonth()];
}

// "היום" / "אתמול" / "10.9" — for history lists, where the exact date matters
// less than how long ago it was.
export function relativeDate(iso) {
  if (!iso) return "";
  const then = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (isNaN(then)) return iso;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that  = new Date(then); that.setHours(0, 0, 0, 0);
  const days = Math.round((today - that) / 86400000);
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  if (days > 1 && days < 7) return "לפני " + days + " ימים";
  return then.getDate() + "." + (then.getMonth() + 1);
}
