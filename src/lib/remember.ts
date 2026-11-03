// 「話しただけの予定」: 書類が無くても、執事に話したこと（例:「写真編集ソフトのサブスク、年に1回しか解約できない。
// 次は来年の3月。その前に教えて」）から、覚えておく予定の案を作る。
// 🔴 登録するかは、あなたが確定ボタンで決める（書類の確定と同じ線）。原本の場所は「あなたが話したこと（日時）」。
// 質問か覚えてほしいことかは Claude が分け（/api/ask の intent）、日付の確かめと「いつから知らせるか」はコードが決める。

import { addDays, formatYmd, parseDate, toYmd } from "./deadlines";
import type { Deadline, DeadlineKind, DocumentCategory, DocumentRecord, Household } from "./types";

export interface RememberDraft {
  /** 予定の名前（例:「写真編集ソフトのサブスクの解約」） */
  label: string;
  /** YYYY-MM-DD（期間なら始まりの日） */
  date: string;
  /** 期間の終わりの日（無ければ空） */
  endDate: string;
  kind: DeadlineKind;
  /** 何日前から知らせるか（コードが決める。話の中に「1週間前に」などがあればその日数） */
  leadDays: number;
  memberIds: string[];
  category: DocumentCategory;
  /** コードが確かめて気になったこと（例: 話した月と日付の月が違う）。確定の前に、あなたに見てもらう */
  check?: string;
}

const KINDS: DeadlineKind[] = ["expiry", "window", "notice", "cancel_window", "after_event", "event", "due"];
const CATEGORIES: DocumentCategory[] = ["school", "childcare", "housing", "insurance", "vehicle", "medical_card", "care", "license", "subscription", "work", "community", "medical", "other"];

/** 種類ごとの、いつから知らせるかの決まり（日数）。話の中に指定が無いときに使う */
export function defaultLeadDays(kind: DeadlineKind): number {
  if (kind === "cancel_window" || kind === "notice" || kind === "expiry") return 30;
  if (kind === "window") return 14;
  return 7;
}

/** 30 →「1か月前」、7 →「1週間前」、それ以外は「○日前」 */
export function leadPhrase(days: number): string {
  if (days === 30 || days === 31) return "1か月前";
  if (days === 14) return "2週間前";
  if (days === 7) return "1週間前";
  if (days === 0) return "当日";
  return `${days}日前`;
}

const isYmd = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(parseDate(x).getTime()) && toYmd(parseDate(x)) === x;

/** 話した文の中の「○月」（月だけ・月日どちらも） */
function monthsIn(text: string): number[] {
  return [...text.matchAll(/(\d{1,2})\s*月/g)].map((m) => Number(m[1])).filter((m) => m >= 1 && m <= 12);
}

/** 話した言葉に、何日前に知らせてほしいかが書いてあれば、その日数（コードで読む） */
export function leadDaysSpoken(text: string): number | null {
  const t = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = t.match(/(\d+|一|二|三)\s*(日|週間|か月|ヶ月|カ月)\s*前/);
  if (!m) return null;
  const n = m[1] === "一" ? 1 : m[1] === "二" ? 2 : m[1] === "三" ? 3 : Number(m[1]);
  return m[2] === "日" ? n : m[2] === "週間" ? n * 7 : n * 30;
}

/** Claude の案（remember）を確かめる。使えなければ null */
export function verifyRemember(raw: unknown, household: Household, question: string, today: Date): RememberDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const label = s(v.label).slice(0, 60);
  const date = s(v.date);
  let endDate = s(v.endDate);
  if (!label || !isYmd(date)) return null;
  if (endDate && (!isYmd(endDate) || endDate < date)) endDate = "";
  const kind = KINDS.includes(v.kind as DeadlineKind) ? (v.kind as DeadlineKind) : "due";
  const category = CATEGORIES.includes(v.category as DocumentCategory) ? (v.category as DocumentCategory) : "other";
  const known = new Set(household.members.map((m) => m.id));
  const memberIds = (Array.isArray(v.memberIds) ? v.memberIds : []).map(s).filter((id) => known.has(id));
  // いつから知らせるかはコードが決める（話の中に日数があればそれ）
  const leadDays = leadDaysSpoken(question) ?? defaultLeadDays(kind);
  return withChecks({ label, date, endDate, kind, leadDays, memberIds, category }, question, today);
}

/** 日付を確かめて、気になることがあれば check に書く（確定の前に、あなたに見てもらう） */
export function withChecks(draft: RememberDraft, question: string, today: Date): RememberDraft {
  const checks: string[] = [];
  const months = monthsIn(question);
  const month = parseDate(draft.date).getMonth() + 1;
  if (months.length && !months.includes(month)) checks.push(`話した月（${months.join("・")}月）と、日付（${month}月）が違います`);
  if ((draft.endDate || draft.date) < toYmd(today)) checks.push("日付が今日より前になっています");
  return { ...draft, check: checks.length ? `${checks.join("。")}。日付を直してから確定してください。` : undefined };
}

/** 覚えてほしいこと、らしい言い方か（キーが無いときの仮の見分け。決まった言い回しだけ） */
export function looksLikeRemember(text: string): boolean {
  return /(覚えて|おぼえて|忘れないで|わすれないで|リマインド|登録して|前に(教えて|知らせて|声をかけて)|になったら(教えて|知らせて)|までに(教えて|知らせて))/.test(text);
}

/**
 * キーが無いときの仮の案（Claude は使っていない）。話した文の「（来年の）○月（○日）」だけを読む。
 * 月だけなら、その月の1日〜末日の期間にする。読めなければ null（質問として扱う）
 */
export function provisionalRemember(household: Household, question: string, today: Date): RememberDraft | null {
  if (!looksLikeRemember(question)) return null;
  const t = question.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const m = t.match(/(再来年|来年|今年)?の?\s*(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/);
  if (!m) return null;
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : 0;
  if (month < 1 || month > 12) return null;
  let year = today.getFullYear() + (m[1] === "来年" ? 1 : m[1] === "再来年" ? 2 : 0);
  const start = new Date(year, month - 1, day || 1);
  if (!m[1] && toYmd(day ? start : new Date(year, month, 0)) < toYmd(today)) year += 1;
  const from = new Date(year, month - 1, day || 1);
  const to = day ? null : new Date(year, month, 0);
  const cancel = /解約|やめ|退会/.test(question);
  const kind: DeadlineKind = cancel ? (to ? "cancel_window" : "notice") : to ? "window" : "due";
  const subject = question.split(/[、。,.\n]/)[0].trim().slice(0, 30) || "話したこと";
  const label = cancel && !/解約/.test(subject) ? `${subject}の解約` : subject;
  const category: DocumentCategory = /サブスク|契約|プラン|会員|アプリ/.test(question) ? "subscription" : "other";
  return withChecks(
    { label, date: toYmd(from), endDate: to ? toYmd(to) : "", kind, leadDays: leadDaysSpoken(question) ?? defaultLeadDays(kind), memberIds: [], category },
    question,
    today,
  );
}

const stamp = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** 確定: 話したことを「話しただけの予定」の書類にする。原本は話した文、原本の場所は「あなたが話したこと（日時）」 */
export function rememberedDocument(household: Household, draft: RememberDraft, spoken: string, spokenAt: string, newId: (prefix: string) => string): DocumentRecord {
  const at = new Date(spokenAt);
  const self = household.members.find((m) => m.relation === "self")?.id;
  // 誰のか話に出てこなければ、話した人（あなた）のものにする
  const memberIds = draft.memberIds.length ? draft.memberIds : self ? [self] : [];
  const location = `あなたが話したこと（${stamp(at)}）`;
  const deadline: Deadline = {
    id: newId("dl"),
    kind: draft.kind,
    label: draft.label,
    date: draft.date,
    endDate: draft.endDate || undefined,
    leadDays: draft.leadDays,
    leadReason: `あなたが「${spoken.length > 40 ? `${spoken.slice(0, 40)}…` : spoken}」と話したため`,
    memberIds,
    source: { location, quote: spoken },
  };
  const confirmedAt = new Date().toISOString();
  return {
    id: newId("doc"),
    title: draft.label,
    category: draft.category,
    docType: "話して覚えたこと",
    memberIds,
    origin: "conversation",
    originalText: `${location}\n${spoken}`,
    fields: [],
    contacts: [],
    deadlines: [deadline],
    createdAt: confirmedAt,
    confirmedAt,
  };
}

/** いつから知らせるか（日付の計算はコード） */
export function noticeStartOf(draft: Pick<RememberDraft, "date" | "leadDays">): string {
  return toYmd(addDays(parseDate(draft.date), -draft.leadDays));
}

/** 確認の一言（コードが作る。日付・いつから知らせるかもコードの計算） */
export function rememberMessage(draft: RememberDraft, today: Date = new Date()): string {
  const when = draft.endDate ? `${dateText(draft.date, today)}〜${dateText(draft.endDate, today)}` : dateText(draft.date, today);
  return `「${draft.label}」（${when}）ですね。確定すると、${leadPhrase(draft.leadDays)}の ${dateText(noticeStartOf(draft), today)} からお知らせします。`;
}

/** 今年なら「3月1日（月）」、ほかの年なら「2027年3月1日（月）」 */
export function dateText(ymd: string, today: Date = new Date()): string {
  const year = parseDate(ymd).getFullYear();
  return year === today.getFullYear() ? formatYmd(ymd) : `${year}年${formatYmd(ymd)}`;
}
