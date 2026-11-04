// 家族と共有した書類の「まとめ」（サーバーの家族の置き場所に置く形）と、置かない線。
// 🔴 置くのは、共有した書類の題・やること・予定・項目（番号の類を除く）・訳・問い合わせ先の電話だけ。
//    置かない: 写真・原本の全文・原本の引用・大事な番号（保険証・口座・カード・マイナンバー・パスワードなど）。
//    アプリが作るときと、サーバーが受け取るとき（sanitizeSummary）の両方で同じ線を引く。

import { languageOf, LANGUAGES, type LanguageCode } from "./languages";
import { maskKnownNumbers } from "./numbers";
import type { DocumentRecord, Household } from "./types";

export interface SummaryEvent {
  kind: string;
  label: string;
  date: string;
  endDate?: string;
  time?: string;
  place?: string;
  needs?: string[];
  /** 誰の予定か（呼び名・日本語） */
  whose?: string[];
  /** 済んだ（アプリで「済んだ」にした）。朝の通知に出さない */
  done?: boolean;
}

export interface SummaryLang {
  title: string;
  what: string;
  todo: string;
  items: { label: string; text: string }[];
  checks: string[];
}

export interface FamilySummary {
  id: string;
  title: string;
  category: string;
  docType?: string;
  /** 誰の書類か（呼び名・日本語） */
  whose: string[];
  periodLabel?: string;
  /** 現物のしまい場所（家の中の場所） */
  storageLocation?: string;
  /** 書類を預かる人（呼び名・日本語） */
  holder: string;
  /** この書類を共有した家族（名簿の id）。朝の通知は、その人と共有した書類だけ */
  sharedWith?: string[];
  events: SummaryEvent[];
  fields: { label: string; value: string }[];
  contacts: { name: string; phone?: string; hours?: string }[];
  /** 訳（言葉ごと）。日本語は題・項目そのもの */
  langs: Partial<Record<LanguageCode, SummaryLang>>;
  updatedAt: string;
}

/** 家族の名簿（1対1で「あなたは誰？」と聞くため・伝言の相手のため）。呼び名と読みたい言葉だけ */
export interface RosterMember {
  id: string;
  names: Partial<Record<LanguageCode, string>>;
  lang: LanguageCode;
  adult: boolean;
  /** ふだん使うカレンダー（お知らせのカレンダーのボタンの形） */
  calendarApp?: "google" | "apple";
  /** 書類を預かる人（アプリを使っている人） */
  holder?: boolean;
  /** 日本語の名前（姓つき。回覧や名簿の「日向さん」を、うちの家族だと見分けるため） */
  fullName?: string;
}

/** 項目の名前がこれなら、値ごと置かない（番号・お金の出入りの口・ログインの類） */
export const SECRET_LABEL =
  /番号|ナンバー|No\.?|ＮＯ|口座|カード|暗証|パスワード|PIN|ID|ＩＤ|記号|証券|保険証|被保険者|免許|在留|マイナ|個人番号|セキュリティ|CVV|CVC|ログイン|アカウント|認証|コード/i;

/** 値の中の番号の形（電話の形は残す。それ以外の6桁以上の数字の並びは伏せる） */
const PHONE = /^0\d{1,4}[-‐－ー]\d{1,4}[-‐－ー]\d{3,4}$/;
export function maskNumberLike(text: string): string {
  return text.normalize("NFKC").replace(/[0-9][0-9\s\-‐－ー./]{4,}[0-9]/g, (m) => {
    const digits = m.replace(/\D/g, "");
    if (PHONE.test(m.trim())) return m;
    // 日付・時刻（2026-11-27・10:45 など）はそのまま
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(m.trim())) return m;
    return digits.length >= 6 ? "（伏せた）" : m;
  });
}

const cut = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const clean = (x: unknown, max: number) => maskNumberLike(cut(x, max));
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const ymd = (x: unknown) => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : "");

/** 受け取ったまとめに、置かない線を引く（サーバーでも必ず通す）。形が合わなければ null */
export function sanitizeSummary(x: unknown): FamilySummary | null {
  if (!x || typeof x !== "object") return null;
  const v = x as Record<string, unknown>;
  const id = cut(v.id, 80);
  const title = clean(v.title, 200);
  if (!/^[\w-]{1,80}$/.test(id) || !title) return null;
  const langs: FamilySummary["langs"] = {};
  const rawLangs = (v.langs ?? {}) as Record<string, unknown>;
  for (const l of LANGUAGES) {
    const t = rawLangs[l.code] as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") continue;
    langs[l.code] = {
      title: clean(t.title, 200),
      what: clean(t.what, 1000),
      todo: clean(t.todo, 1000),
      items: arr(t.items)
        .slice(0, 30)
        .map((i) => i as Record<string, unknown>)
        .map((i) => ({ label: clean(i?.label, 200), text: clean(i?.text, 600) }))
        .filter((i) => i.label && !SECRET_LABEL.test(i.label)),
      checks: arr(t.checks).slice(0, 5).map((c) => clean(c, 300)).filter(Boolean),
    };
  }
  return {
    id,
    title,
    category: cut(v.category, 40),
    docType: clean(v.docType, 80) || undefined,
    whose: arr(v.whose).slice(0, 8).map((w) => cut(w, 40)).filter(Boolean),
    periodLabel: clean(v.periodLabel, 80) || undefined,
    storageLocation: clean(v.storageLocation, 120) || undefined,
    holder: cut(v.holder, 40),
    sharedWith: arr(v.sharedWith).slice(0, 8).map((w) => cut(w, 60)).filter((w) => /^[\w-]{1,60}$/.test(w)),
    events: arr(v.events)
      .slice(0, 40)
      .map((e) => e as Record<string, unknown>)
      .map((e) => ({
        kind: cut(e?.kind, 20),
        label: clean(e?.label, 200),
        date: ymd(e?.date),
        endDate: ymd(e?.endDate) || undefined,
        time: clean(e?.time, 60) || undefined,
        place: clean(e?.place, 120) || undefined,
        needs: arr(e?.needs).slice(0, 12).map((n) => clean(n, 80)).filter(Boolean),
        whose: arr(e?.whose).slice(0, 8).map((w) => cut(w, 40)).filter(Boolean),
        ...(e?.done === true ? { done: true } : {}),
      }))
      .filter((e) => e.label && e.date),
    fields: arr(v.fields)
      .slice(0, 30)
      .map((f) => f as Record<string, unknown>)
      .map((f) => ({ label: clean(f?.label, 120), value: clean(f?.value, 600) }))
      .filter((f) => f.label && f.value && !SECRET_LABEL.test(f.label)),
    contacts: arr(v.contacts)
      .slice(0, 6)
      .map((c) => c as Record<string, unknown>)
      .map((c) => {
        const phone = cut(c?.phone, 30).normalize("NFKC").trim();
        return { name: clean(c?.name, 80), phone: PHONE.test(phone) ? phone : undefined, hours: clean(c?.hours, 80) || undefined };
      })
      .filter((c) => c.name),
    langs,
    updatedAt: cut(v.updatedAt, 40) || new Date().toISOString(),
  };
}

export function sanitizeRoster(x: unknown): RosterMember[] {
  return arr(x)
    .slice(0, 12)
    .map((m) => m as Record<string, unknown>)
    .map((m) => {
      const names = Object.fromEntries(LANGUAGES.map((l) => [l.code, cut((m?.names as Record<string, unknown> | undefined)?.[l.code], 30)]).filter(([, n]) => n));
      const lang = LANGUAGES.find((l) => l.code === m?.lang)?.code ?? "ja";
      return { id: cut(m?.id, 60), names, lang, adult: m?.adult === true, calendarApp: m?.calendarApp === "apple" ? "apple" : "google", holder: m?.holder === true, fullName: cut(m?.fullName, 40) || undefined } as RosterMember;
    })
    .filter((m) => /^[\w-]{1,60}$/.test(m.id) && m.names.ja);
}

const nameOf = (household: Household, id: string) => {
  const m = household.members.find((x) => x.id === id);
  return m ? (m.names?.ja ?? m.name.split(/\s+/).pop() ?? m.name) : "";
};

/** 共有した書類か（家族のだれかと共有している） */
export const isShared = (doc: DocumentRecord) => (doc.sharedWith ?? []).length > 0 && !doc.supersededBy;

/** アプリで作る、共有した書類のまとめ（大事な番号は先に伏せる。サーバーでも線を引く） */
export function summaryOf(household: Household, doc: DocumentRecord): FamilySummary | null {
  const mask = (t: string) => maskKnownNumbers(doc, t);
  const self = household.members.find((m) => m.relation === "self");
  const langs: Record<string, unknown> = {};
  for (const [lang, t] of Object.entries(doc.translations ?? {})) {
    if (!t) continue;
    langs[lang] = {
      title: mask(t.title),
      what: mask(t.what),
      todo: mask(t.todo),
      items: t.items.map((i) => {
        const ref = i.ref;
        const field = ref.startsWith("f:") ? doc.fields.find((f) => `f:${f.key}` === ref) : undefined;
        // 元の項目が番号の類なら、訳でも入れない
        return field && SECRET_LABEL.test(field.label) ? null : { label: mask(i.label), text: mask(i.text) };
      }).filter(Boolean),
      checks: t.checks.map(mask),
    };
  }
  return sanitizeSummary({
    id: doc.id,
    title: mask(doc.title),
    category: doc.category,
    docType: doc.docType,
    whose: doc.memberIds.map((id) => nameOf(household, id)).filter(Boolean),
    periodLabel: doc.periodLabel,
    storageLocation: doc.storageLocation,
    holder: self ? nameOf(household, self.id) : "",
    sharedWith: doc.sharedWith ?? [],
    events: doc.deadlines
      .filter((d) => d.date && d.kind !== "after_event")
      .map((d) => ({ kind: d.kind, label: mask(d.label), date: d.date, endDate: d.endDate, time: d.time, place: d.place, needs: d.needs, whose: d.memberIds.map((id) => nameOf(household, id)).filter(Boolean), done: Boolean((household.done ?? {})[d.id]) })),
    fields: doc.fields.map((f) => ({ label: f.label, value: mask(f.value) })),
    contacts: doc.contacts.map((c) => ({ name: c.name || c.label, phone: c.phone, hours: c.hours })),
    langs,
    updatedAt: new Date().toISOString(),
  });
}

/** 家族の名簿（呼び名と読みたい言葉だけ） */
export function rosterOf(household: Household): RosterMember[] {
  return sanitizeRoster(
    household.members.map((m) => ({
      id: m.id,
      names: Object.fromEntries(LANGUAGES.map((l) => [l.code, m.names?.[l.code] ?? (l.code === "vi" ? undefined : m.name.split(/\s+/).pop() ?? m.name)]).filter(([, n]) => n)),
      lang: languageOf(m),
      adult: m.relation !== "child",
      calendarApp: m.calendarApp ?? "google",
      holder: m.relation === "self",
      fullName: m.name,
    })),
  );
}

/** 置く前に、読み取った結果から原本の全文・引用・番号の類を落とす（1対1に届いた写真の読み取り） */
export function sanitizeExtraction<T>(x: T): T {
  const walk = (v: unknown, key = ""): unknown => {
    if (key === "transcript" || key === "quote") return "";
    if (typeof v === "string") return maskNumberLike(v).slice(0, 2000);
    if (Array.isArray(v)) {
      return v
        .filter((i) => !(i && typeof i === "object" && typeof (i as { label?: unknown }).label === "string" && key === "fields" && SECRET_LABEL.test((i as { label: string }).label)))
        .slice(0, 60)
        .map((i) => walk(i));
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, walk(val, k)]));
    return v;
  };
  return walk(x) as T;
}
