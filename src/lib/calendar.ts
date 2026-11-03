// いつものカレンダーにつなぐ（アプリの中に別のカレンダーは作らない）。
// 予定を .ics（iPhone・Android・パソコンのカレンダーが読める形）にするのと、Google カレンダーの「予定を作る」画面を開くリンク。
// 🔴 どちらもこの端末の中で作る。CULALOG のサーバーには送らない（予定をサーバーに置かない）。
// 書類の番号は入れない（予定の名前・日付・時刻・場所・必要なもの・原本の書類名と場所だけ）。

import { addDays, parseDate, toYmd, type ActionItem } from "./deadlines";
import { maskKnownNumbers } from "./numbers";

/** カレンダーに入れる1件 */
export interface CalendarEvent {
  uid: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** 終わりの日（含む）。無ければ1日だけ */
  endDate?: string;
  /** 「10:45」「10:45〜11:30」が読めたときだけ時刻つき。読めなければ終日 */
  start?: string;
  end?: string;
  place?: string;
  description: string;
  /** 何日前に知らせるか（その日の朝9時） */
  alarmDaysBefore?: number;
}

const TIME = /(\d{1,2})[:：](\d{2})/g;

/** 「10:45〜11:30」「13時30分〜」などから、始まりと終わりの時刻を読む（読めなければ空） */
export function parseTimes(time?: string): { start?: string; end?: string } {
  if (!time) return {};
  const t = time.normalize("NFKC").replace(/(\d{1,2})時(\d{1,2})分/g, "$1:$2").replace(/(\d{1,2})時/g, "$1:00");
  const found = [...t.matchAll(TIME)].map((m) => `${m[1].padStart(2, "0")}:${m[2]}`).filter((x) => x <= "23:59");
  if (!found.length) return {};
  return { start: found[0], end: found[1] && found[1] > found[0] ? found[1] : undefined };
}

export function calendarEventOf(item: ActionItem, nameOf: (memberId: string) => string): CalendarEvent {
  const d = item.deadline;
  const who = d.memberIds.map(nameOf).filter(Boolean).join("・");
  const lines = [
    who && `誰の: ${who}`,
    d.needs?.length ? `必要なもの: ${d.needs.join("、")}` : "",
    d.reserve ? `予備日: ${d.reserve.date}${d.reserve.condition ? `（${d.reserve.condition}）` : ""}` : "",
    d.leadReason ?? "",
    `原本: ${item.document.title}${d.source?.location ? `・${d.source.location}` : ""}`,
    d.time ? `時刻（原本のまま）: ${d.time}` : "",
    "CULALOG から入れた予定です。中身は原本で確かめてください。",
  ].filter(Boolean);
  const { start, end } = parseTimes(d.time);
  return {
    uid: `${d.id}@culalog`,
    title: maskKnownNumbers(item.document, d.label),
    date: d.date,
    endDate: d.endDate && d.endDate > d.date ? d.endDate : undefined,
    start: d.endDate ? undefined : start,
    end: d.endDate ? undefined : end,
    place: d.place,
    description: maskKnownNumbers(item.document, lines.join("\n")),
    alarmDaysBefore: Math.min(Math.max(0, d.leadDays), 60),
  };
}

const compact = (ymd: string) => ymd.replace(/-/g, "");
const nextDay = (ymd: string) => toYmd(addDays(parseDate(ymd), 1));
/** 時刻つきの終わり（書いていなければ1時間後） */
function endTime(start: string, end?: string): string {
  if (end) return end;
  const [h, m] = start.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---- .ics ----

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** 1行は 75 バイトまで（日本語の文字の途中では切らない） */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 予定を .ics の文字にする（時刻つきは日本時間） */
export function toIcs(events: CalendarEvent[], createdAt: Date): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CULALOG//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp(createdAt)}`);
    if (e.start) {
      lines.push(`DTSTART;TZID=Asia/Tokyo:${compact(e.date)}T${e.start.replace(":", "")}00`);
      lines.push(`DTEND;TZID=Asia/Tokyo:${compact(e.date)}T${endTime(e.start, e.end).replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(nextDay(e.endDate ?? e.date))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`, `DESCRIPTION:${escapeText(e.description)}`);
    if (e.place) lines.push(`LOCATION:${escapeText(e.place)}`);
    if (e.alarmDaysBefore !== undefined) {
      // 終日の予定は0時が始まりなので、9時に知らせる（n日前の9時）。時刻つきは n日前の同じ時刻
      const n = e.alarmDaysBefore;
      const trigger = e.start ? (n ? `-P${n}D` : "-PT1H") : n ? `-P${n - 1}DT15H` : "PT9H";
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(e.title)}`, `TRIGGER:${trigger}`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** .ics を端末に保存する（開くと、端末のカレンダーが「追加しますか？」と聞く） */
export function downloadIcs(events: CalendarEvent[], fileName: string, createdAt: Date): void {
  const blob = new Blob([toIcs(events, createdAt)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ---- Google カレンダー ----

/** Google カレンダーの「予定を作る」画面を、中身を入れた状態で開くリンク（保存するかはそこで本人が決める） */
export function googleCalendarUrl(e: CalendarEvent): string {
  const dates = e.start
    ? `${compact(e.date)}T${e.start.replace(":", "")}00/${compact(e.date)}T${endTime(e.start, e.end).replace(":", "")}00`
    : `${compact(e.date)}/${compact(nextDay(e.endDate ?? e.date))}`;
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates, details: e.description, ctz: "Asia/Tokyo" });
  if (e.place) p.set("location", e.place);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
