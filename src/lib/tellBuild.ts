// 「家族に伝える」の中身を、端末の中で作る（共有した書類 → 家族それぞれの言葉のまとめ）。
// 日付はコードが元の予定から、その言葉の形で入れる。同じ日の家族の予定（例: 勤務カレンダーの出勤日）も添える。
// 🔴 大事な番号は入れない（伏せる）。送る前に画面で全部見せる。

import { addDays, toYmd } from "./deadlines";
import { maskKnownNumbers } from "./numbers";
import { languageOf, type LanguageCode } from "./languages";
import type { TellBlock, TellPayload } from "./tell";
import { deadlineDateIn, type DocTranslation } from "./translate";
import type { Deadline, DocumentRecord, FamilyMember, Household } from "./types";

const TEXT: Record<LanguageCode, { needs: string; sameDay: string; todo: string; general: string }> = {
  ja: { needs: "持ち物", sameDay: "同じ日の家族の予定", todo: "やること", general: "一般的な説明" },
  "ja-easy": { needs: "もちもの", sameDay: "おなじ ひの かぞくの よてい", todo: "すること", general: "せつめい" },
  vi: { needs: "Mang theo", sameDay: "Cùng ngày trong gia đình", todo: "Cần làm", general: "Giải thích chung" },
};

/** 書類のまとめを送る相手の言葉（共有した人の言葉と、あなたの言葉）。日本語は必ず入れる */
export function tellLanguages(household: Household, doc: DocumentRecord): LanguageCode[] {
  const ids = doc.sharedWith ?? [];
  const langs = household.members.filter((m) => ids.includes(m.id) || m.relation === "self").map(languageOf);
  return [...new Set<LanguageCode>(["ja", ...langs])];
}

export const nameIn = (m: FamilyMember | undefined, lang: LanguageCode) => (m ? (m.names?.[lang] ?? m.name.split(/\s+/).pop() ?? m.name) : "");

/** 同じ日の、ほかの書類の家族の予定（行事・出勤日など） */
function sameDayEvents(household: Household, doc: DocumentRecord, d: Deadline): { doc: DocumentRecord; deadline: Deadline }[] {
  const out: { doc: DocumentRecord; deadline: Deadline }[] = [];
  for (const other of household.documents) {
    if (other.id === doc.id || !other.confirmedAt || other.supersededBy || other.notForFamily) continue;
    for (const x of other.deadlines) {
      if (x.kind === "event" && x.date === d.date && !(household.done ?? {})[x.id]) out.push({ doc: other, deadline: x });
    }
  }
  return out;
}

export function buildTell(
  household: Household,
  doc: DocumentRecord,
  translations: Partial<Record<LanguageCode, DocTranslation>>,
  /** ほかの書類の予定の名前の訳（無ければ日本語のまま） */
  labelIn: (other: DocumentRecord, deadline: Deadline, lang: LanguageCode) => string | undefined,
): TellPayload {
  const mask = (t: string) => maskKnownNumbers(doc, t);
  const self = household.members.find((m) => m.relation === "self");
  const events = doc.deadlines.filter((d) => d.kind === "event" || d.kind === "due" || d.kind === "notice");
  const blocks: TellBlock[] = tellLanguages(household, doc).map((lang) => {
    const t = lang === "ja" ? undefined : translations[lang];
    const tx = TEXT[lang];
    const itemOf = (ref: string) => t?.items.find((i) => i.ref === ref);
    const lines: string[] = [];
    const todo = t ? t.todo : doc.summary?.todo;
    if (todo) lines.push(`${tx.todo}: ${todo}`);
    for (const d of events) {
      const item = itemOf(`d:${d.id}`);
      const label = item?.label ?? d.label;
      const needs = lang === "ja" ? d.needs?.join("、") : item?.text;
      lines.push(`${deadlineDateIn(d, lang)} ${label}${needs ? ` — ${lang === "ja" ? `${tx.needs}: ` : ""}${needs}` : ""}`);
      for (const same of sameDayEvents(household, doc, d)) {
        const who = same.deadline.memberIds.map((id) => nameIn(household.members.find((m) => m.id === id), lang)).filter(Boolean).join("・");
        const other = (lang === "ja" ? same.deadline.label : labelIn(same.doc, same.deadline, lang)) ?? `「${same.deadline.label}」`;
        lines.push(`⚠ ${tx.sameDay}: ${who ? `${who} — ` : ""}${other}`);
      }
    }
    const fields = t ? t.items.filter((i) => i.ref.startsWith("f:")) : doc.fields.map((f) => ({ label: f.label, text: f.value }));
    for (const f of fields.slice(0, 5)) lines.push(`${f.label}: ${mask(f.text)}`);
    if (t?.background[0]) lines.push(`ℹ ${tx.general}（${t.background[0].title}）: ${t.background[0].text}`);
    return { lang, title: t?.title ?? doc.title, lines };
  });
  const sources = [
    ...doc.deadlines.filter((d) => d.source).map((d) => `${d.source!.location}${d.source!.quote ? `「${d.source!.quote}」` : ""}`),
    ...doc.fields.filter((f) => f.source?.quote).map((f) => `${f.source!.location}「${mask(f.source!.quote!)}」`),
  ].slice(0, 10);
  return { blocks, sources, holder: nameIn(self, "ja") };
}

/** 近い予定の「日付と件数」だけ（通知のために預ける。予定の名前は入れない） */
export function upcomingCounts(household: Household, today: Date, days = 14): Record<string, number> {
  const from = toYmd(today);
  const to = toYmd(addDays(today, days));
  const out: Record<string, number> = {};
  for (const doc of household.documents) {
    if (!doc.confirmedAt || doc.supersededBy || doc.notForFamily || !doc.sharedWith?.length) continue;
    for (const d of doc.deadlines) {
      if (d.date >= from && d.date <= to && !(household.done ?? {})[d.id]) out[d.date] = (out[d.date] ?? 0) + 1;
    }
  }
  return out;
}
