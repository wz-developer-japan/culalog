// 朝の通知の中身: 家族と共有した書類のまとめ（サーバーの家族の置き場所）から、7日以内の予定の名前と日付を、その人の言葉で。
// 🔴 その人と共有した書類だけ（書類を預かる人には、置き場所にあるもの全部）。済んだ予定は出さない。番号の類はまとめに入る前に落ちている。
//    執事は決めない（予定の名前と日付を知らせるだけ）。多いときは上から3件＋「ほかに○件」。
//    日本語以外の予定の名前は、朝に1回だけ Claude で訳す。訳せなければ、件数だけの文に戻す。

import type { FamilySummary, RosterMember } from "@/lib/familyShare";
import type { LanguageCode } from "@/lib/languages";

export interface MorningItem {
  date: string;
  label: string;
}

const addDays = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** その人に見せてよい書類（その人と共有した書類。書類を預かる人には全部） */
export function docsFor(docs: FamilySummary[], member: RosterMember | undefined): FamilySummary[] {
  if (!member) return [];
  if (member.holder) return docs;
  return docs.filter((d) => (d.sharedWith ?? []).includes(member.id));
}

/** 今日から7日以内（今日を含む）の、済んでいない予定。日付順・同じ日の同じ名前は1つ */
export function upcomingItems(docs: FamilySummary[], today: string, days = 7): MorningItem[] {
  const last = addDays(today, days - 1);
  const out: MorningItem[] = [];
  for (const d of docs) {
    for (const e of d.events) {
      if (e.done || e.date > last || (e.endDate || e.date) < today) continue;
      // 期間の予定（受付期間など）が今日より前から続いていれば、今日の日付で
      const date = e.date < today ? today : e.date;
      if (out.some((x) => x.date === date && (x.label.includes(e.label) || e.label.includes(x.label)))) continue;
      out.push({ date, label: e.label });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const WEEKDAY: Record<LanguageCode, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  "ja-easy": ["にち", "げつ", "か", "すい", "もく", "きん", "ど"],
  vi: ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"],
};

/** 通知の短い日付（日本語「11/25（水）」・ベトナム語「25/11 (thứ Tư)」・やさしい日本語「11/25（すいようび）」） */
export function shortDate(ymd: string, lang: LanguageCode): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const w = WEEKDAY[lang][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (lang === "vi") return `${d}/${m} (${w})`;
  if (lang === "ja-easy") return `${m}/${d}（${w}ようび）`;
  return `${m}/${d}（${w}）`;
}

const TEXT: Record<LanguageCode, { head: string; more: (n: number) => string; tail: string }> = {
  ja: { head: "7日以内の予定（共有した書類から）", more: (n) => `ほかに${n}件`, tail: "くわしくは、ここで聞いてね" },
  "ja-easy": { head: "7にち いないの よてい", more: (n) => `ほかに ${n}こ`, tail: "きに なったら、ここで きいてね" },
  vi: { head: "Việc trong 7 ngày tới (từ giấy tờ đã chia sẻ)", more: (n) => `Còn ${n} việc khác`, tail: "Muốn biết thêm thì hỏi ở đây nhé." },
};

/** 朝の通知の文（labels は items と同じ順の、その言葉の予定の名前）。上から3件＋ほかに○件 */
export function morningText(items: MorningItem[], labels: string[], lang: LanguageCode, max = 3): string {
  const t = TEXT[lang];
  const lines = items.slice(0, max).map((x, i) => `・${shortDate(x.date, lang)} ${labels[i] ?? x.label}`);
  const rest = items.length - max;
  return [`🔔 ${t.head}`, ...lines, ...(rest > 0 ? [t.more(rest)] : []), t.tail].join("\n");
}
