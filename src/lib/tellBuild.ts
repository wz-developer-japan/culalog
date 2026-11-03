// 「家族に伝える」の中身を、端末の中で作る（共有した書類 → 家族それぞれの言葉のまとめ）。
// 日付はコードが元の予定から、その言葉の形で入れる。同じ日の家族の予定（例: 勤務カレンダーの出勤日）も添える。
// 🔴 大事な番号は入れない（伏せる）。送る前に画面で全部見せる。

import { adultWorkOn, conflictFor, leaveLimits, sameEvent } from "./conflicts";
import { addDays, readableDates, toYmd } from "./deadlines";
import { maskKnownNumbers } from "./numbers";
import { languageOf, type LanguageCode } from "./languages";
import type { TellBlock, TellPayload } from "./tell";
import { deadlineDateIn, formatDateIn, type DocTranslation } from "./translate";
import type { Deadline, DocumentRecord, FamilyMember, Household } from "./types";

const TEXT: Record<LanguageCode, { needs: string; sameDay: string; todo: string; general: string; leave: (date: string) => string }> = {
  ja: { needs: "持ち物", sameDay: "同じ日", todo: "やること", general: "一般的な説明", leave: (d) => `休みの申し出は${d}まで` },
  "ja-easy": { needs: "もちもの", sameDay: "おなじ ひ", todo: "すること", general: "せつめい", leave: (d) => `やすみの もうしでは ${d}まで` },
  vi: { needs: "Mang theo", sameDay: "Cùng ngày", todo: "Cần làm", general: "Giải thích chung", leave: (d) => `hạn xin nghỉ: ${d}` },
};

/** 書類のまとめを送る相手の言葉（共有した人の言葉と、あなたの言葉）。日本語は必ず入れる */
export function tellLanguages(household: Household, doc: DocumentRecord, groupLangs: LanguageCode[] = []): LanguageCode[] {
  const ids = doc.sharedWith ?? [];
  const langs = household.members.filter((m) => ids.includes(m.id) || m.relation === "self").map(languageOf);
  // グループに送ると、グループの全員が読む。だからグループの人の読みたい言葉も入れる
  return [...new Set<LanguageCode>(["ja", ...langs, ...groupLangs])];
}

export const nameIn = (m: FamilyMember | undefined, lang: LanguageCode) => (m ? (m.names?.[lang] ?? m.name.split(/\s+/).pop() ?? m.name) : "");

/** 同じ日の、ほかの書類の家族の予定（行事・出勤日など）。勤務カレンダーのある人の平日の出勤日も添える */
function sameDayEvents(household: Household, doc: DocumentRecord, d: Deadline): { doc: DocumentRecord; deadline: Deadline }[] {
  const out: { doc: DocumentRecord; deadline: Deadline }[] = [];
  // 行事の日にだけ添える（提出・支払いの締切の日には要らない）
  if (d.kind !== "event") return out;
  for (const other of household.documents) {
    if (other.id === doc.id || !other.confirmedAt || other.supersededBy || other.notForFamily) continue;
    for (const x of other.deadlines) {
      // 同じ行事が別の書類にも書いてあるもの（学年だよりの授業参観）は、同じ日の「ほかの予定」ではない
      if (x.kind === "event" && x.date === d.date && !(household.done ?? {})[x.id] && !sameEvent(x, d)) out.push({ doc: other, deadline: x });
    }
  }
  for (const w of adultWorkOn(household, d.date, doc.id)) if (w.synthetic) out.push({ doc: w.doc, deadline: w.deadline });
  return out;
}

export function buildTell(
  household: Household,
  doc: DocumentRecord,
  translations: Partial<Record<LanguageCode, DocTranslation>>,
  /** ほかの書類の予定の名前の訳（無ければ日本語のまま） */
  labelIn: (other: DocumentRecord, deadline: Deadline, lang: LanguageCode) => string | undefined,
  langs: LanguageCode[] = tellLanguages(household, doc),
): TellPayload {
  const mask = (t: string) => maskKnownNumbers(doc, t);
  const self = household.members.find((m) => m.relation === "self");
  const events = doc.deadlines.filter((d) => d.kind === "event" || d.kind === "due" || d.kind === "notice");
  const blocks: TellBlock[] = langs.map((lang) => {
    const t = lang === "ja" ? undefined : translations[lang];
    const tx = TEXT[lang];
    const itemOf = (ref: string) => t?.items.find((i) => i.ref === ref);
    const lines: string[] = [];
    // スマホの通知の最初の数行に要点が入るように: 日付のある予定 → 同じ日の家族の予定（1行）→ やること → 項目
    for (const d of events) {
      const item = itemOf(`d:${d.id}`);
      const label = item?.label ?? d.label;
      const needs = lang === "ja" ? d.needs?.join("、") : item?.text;
      lines.push(`${deadlineDateIn(d, lang)} ${label}${needs ? ` — ${lang === "ja" ? `${tx.needs}: ` : ""}${needs}` : ""}`);
      const same = sameDayEvents(household, doc, d).map((x) => {
        const who = x.deadline.memberIds.map((id) => nameIn(household.members.find((m) => m.id === id), lang)).filter(Boolean).join("・");
        const other = (lang === "ja" ? x.deadline.label : labelIn(x.doc, x.deadline, lang)) ?? `「${x.deadline.label}」`;
        return `${who ? `${who} ` : ""}${other}`;
      });
      if (same.length) {
        // 同じ日のぶつかり（大人が仕事）なら、休みの申し出の締切も同じ行に（返信で「いつまで？」と聞かれても、送った範囲で答えられる）
        const conflict = conflictFor(household, d);
        const limits = conflict ? leaveLimits(conflict) : [];
        const allSame = limits.every((x) => x.date === limits[0]?.date);
        const leave = !limits.length
          ? ""
          : allSame
            ? tx.leave(formatDateIn(limits[0].date, lang))
            : limits.map((x) => `${x.memberIds.map((id) => nameIn(household.members.find((m) => m.id === id), lang)).join("・")} ${tx.leave(formatDateIn(x.date, lang))}`).join("、");
        lines.push(`⚠ ${tx.sameDay}: ${same.join(" ／ ")}${leave ? ` — ${leave}` : ""}`);
      }
    }
    const todo = t ? t.todo : doc.summary?.todo && readableDates(doc.summary.todo);
    if (todo) lines.push(`${tx.todo}: ${todo}`);
    // 予定の行と同じこと（時間・日時・持ち物）は、項目から外す
    const repeated = new Set(doc.fields.filter((f) => /時間|日時|持ち物|持参|場所/.test(f.label) && events.some((d) => d.time || d.place || d.needs?.length)).map((f) => `f:${f.key}`));
    const fields = (t ? t.items.filter((i) => i.ref.startsWith("f:")) : doc.fields.map((f) => ({ ref: `f:${f.key}`, label: f.label, text: f.value }))).filter((f) => !repeated.has(f.ref));
    for (const f of fields.slice(0, 3)) lines.push(`${f.label}: ${mask(f.text)}`);
    if (t?.background[0]) lines.push(`ℹ ${tx.general}（${t.background[0].title}）: ${t.background[0].text}`);
    return { lang, title: t?.title ?? doc.title, lines };
  });
  // 原本の場所は、紙の上から順に（原本の文字の中で引用が出てくる順）
  const squash = (x: string) => x.replace(/\s/g, "");
  const body = squash(doc.originalText ?? "");
  const posOf = (quote?: string) => {
    const i = quote ? body.indexOf(squash(quote)) : -1;
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const sources = [
    ...doc.deadlines.filter((d) => d.source).map((d) => ({ pos: posOf(d.source!.quote), text: `${d.source!.location}${d.source!.quote ? `「${d.source!.quote}」` : ""}` })),
    ...doc.fields.filter((f) => f.source?.quote).map((f) => ({ pos: posOf(f.source!.quote), text: `${f.source!.location}「${mask(f.source!.quote!)}」` })),
  ]
    .sort((a, b) => a.pos - b.pos)
    .map((x) => x.text)
    .filter((x, i, all) => all.indexOf(x) === i)
    .slice(0, 10);
  // 担当の候補: あなたと、共有した大人の家族
  const takers = household.members
    .filter((m) => m.relation !== "child" && (m.relation === "self" || (doc.sharedWith ?? []).includes(m.id)))
    .map((m) => Object.fromEntries((["ja", "ja-easy", "vi"] as LanguageCode[]).map((l) => [l, nameIn(m, l)])) as Partial<Record<LanguageCode, string>>);
  return { blocks, sources, holder: nameIn(self, "ja"), takers };
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
