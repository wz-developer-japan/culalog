// 書類の読み取り結果の形（サーバーとブラウザで共通）。
// Claude には「原本に書いてあること」と「原本のどこか」を、共通の形
// （いつ・誰の・何を・どこで・何が必要・原本のどこ）で返させる。
// 判断（補償される・解約してよい・受診すべき等）を書く欄はそもそも用意しない。

import { DEFAULT_LEAD_DAYS, RELATION_LABELS } from "./labels";
import type {
  ButlerQuestion,
  DeadlineKind,
  DocumentCategory,
  DocumentOrigin,
  DocumentRecord,
  FamilyMember,
} from "./types";

export interface ExtractedField {
  label: string;
  value: string;
  location: string;
  quote: string;
}

export interface ExtractedDeadline {
  kind: DeadlineKind;
  label: string;
  /** YYYY-MM-DD */
  date: string;
  /** 期間の終わり YYYY-MM-DD（無ければ空） */
  endDate: string;
  /** 時刻（無ければ空） */
  time: string;
  /** どこで（無ければ空） */
  place: string;
  /** 何が必要か */
  needs: string[];
  /** 何か月ごとに繰り返すか（無ければ 0） */
  repeatMonths: number;
  location: string;
  quote: string;
  /** 雨天・延期の予備日や振替日（無ければすべて空） */
  reserve: { date: string; condition: string; location: string; quote: string };
  /**
   * 本人が動かないと困るか（must）。false は「自動で引き落とされる・自動で更新される」など、知っておくだけのもの（awareness）。
   * 知っておくだけのものは、ホームのひとことや期限の知らせには出さない
   */
  actionNeeded?: boolean;
  /** 束ねる印（見本の取り込みでだけ入る。Claude には返させない） */
  bundleKey?: string;
}

/** 「納付完了」「退会完了」「継続手続き完了」など、何かが済んだことを知らせる記載 */
export interface ExtractedCompletion {
  /** 何が済んだか（例: 「令和8年度 住民税 第3期の納付」） */
  what: string;
  location: string;
  quote: string;
  /** つながる予定の束ねる印（見本の取り込みでだけ入る） */
  bundleKey?: string;
}

/** いつの分の書類か（年度・保険期間・契約期間など） */
export interface ExtractedPeriod {
  label: string;
  /** YYYY-MM-DD（無ければ空） */
  from: string;
  until: string;
}

export interface ExtractedContact {
  label: string;
  name: string;
  phone: string;
  hours: string;
  location: string;
}

/** 誰の書類かの推測 */
export interface ExtractedWho {
  memberIds: string[];
  /** 原本と家族の情報から言い切れるとき true。迷ったら false（執事が本人に聞く） */
  sure: boolean;
  /** なぜそう考えたか・なぜ迷ったか */
  reason: string;
}

/** 誰の書類か以外で、本人に聞かないと分からないこと */
export interface ExtractedQuestion {
  text: string;
  reason: string;
  options: string[];
  multiple: boolean;
}

/** 読んだ直後の4行のうち3行（いつまで？ は予定からコードで出す） */
export interface ExtractedSummary {
  what: string;
  todo: string;
  /** 放置すると？ 原本に書いてあるときだけ。無ければ text・location・quote をすべて空に */
  ifIgnored: { text: string; location: string; quote: string };
}

export interface Extraction {
  title: string;
  /** 原本の文字起こし（書いてある通り。蛍光ペンで、読み取った場所に印を付けるため） */
  transcript: string;
  summary: ExtractedSummary;
  /** 書類の種類の名前（自由。例: 「歯科健診のお知らせ」） */
  docType: string;
  category: DocumentCategory;
  who: ExtractedWho;
  period: ExtractedPeriod;
  fields: ExtractedField[];
  deadlines: ExtractedDeadline[];
  contacts: ExtractedContact[];
  questions: ExtractedQuestion[];
  /** 読めなかった・はっきりしなかった箇所（本人に原本で確かめてもらう） */
  unclear: string[];
  /**
   * この家の書類ではないもの（記入例・見本・別の人あての書類など）。is が true なら、
   * 家族の情報にしない（誰の書類か聞かない・予定に入れない・聞く／つなぐの根拠にしない）
   */
  notForFamily?: { is: boolean; reason: string };
  /** 何かが済んだことを知らせる記載（納付完了・退会完了など）。つながる予定を「済んだにしますか？」と本人に聞く */
  completions?: ExtractedCompletion[];
  /** 本文には無く、リンク先にしか書いていないこと（例: 「金額」「満了日」）。推測で埋めない */
  onlyInLink?: string[];
}

export const CATEGORY_VALUES: DocumentCategory[] = [
  "school",
  "childcare",
  "housing",
  "insurance",
  "vehicle",
  "medical_card",
  "medical",
  "care",
  "license",
  "subscription",
  "work",
  "community",
  "other",
];

export const DEADLINE_KIND_VALUES: DeadlineKind[] = [
  "expiry",
  "window",
  "notice",
  "cancel_window",
  "after_event",
  "event",
  "due",
];

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;

/** Claude の構造化出力に渡す JSON Schema */
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "transcript", "summary", "docType", "category", "who", "period", "fields", "deadlines", "contacts", "questions", "unclear", "notForFamily", "completions", "onlyInLink"],
  properties: {
    notForFamily: {
      type: "object",
      additionalProperties: false,
      required: ["is", "reason"],
      properties: { is: { type: "boolean" }, reason: str },
    },
    title: str,
    transcript: str,
    summary: {
      type: "object",
      additionalProperties: false,
      required: ["what", "todo", "ifIgnored"],
      properties: {
        what: str,
        todo: str,
        ifIgnored: {
          type: "object",
          additionalProperties: false,
          required: ["text", "location", "quote"],
          properties: { text: str, location: str, quote: str },
        },
      },
    },
    docType: str,
    category: { type: "string", enum: CATEGORY_VALUES },
    who: {
      type: "object",
      additionalProperties: false,
      required: ["memberIds", "sure", "reason"],
      properties: { memberIds: strList, sure: { type: "boolean" }, reason: str },
    },
    period: {
      type: "object",
      additionalProperties: false,
      required: ["label", "from", "until"],
      properties: { label: str, from: str, until: str },
    },
    fields: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value", "location", "quote"],
        properties: { label: str, value: str, location: str, quote: str },
      },
    },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "label", "date", "endDate", "time", "place", "needs", "repeatMonths", "location", "quote", "reserve", "actionNeeded"],
        properties: {
          kind: { type: "string", enum: DEADLINE_KIND_VALUES },
          label: str,
          date: { type: "string", format: "date" },
          endDate: str,
          time: str,
          place: str,
          needs: strList,
          repeatMonths: { type: "integer" },
          location: str,
          quote: str,
          reserve: {
            type: "object",
            additionalProperties: false,
            required: ["date", "condition", "location", "quote"],
            properties: { date: str, condition: str, location: str, quote: str },
          },
          actionNeeded: { type: "boolean" },
        },
      },
    },
    completions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["what", "location", "quote"],
        properties: { what: str, location: str, quote: str },
      },
    },
    onlyInLink: strList,
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "name", "phone", "hours", "location"],
        properties: { label: str, name: str, phone: str, hours: str, location: str },
      },
    },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "reason", "options", "multiple"],
        properties: { text: str, reason: str, options: strList, multiple: { type: "boolean" } },
      },
    },
    unclear: strList,
  },
} as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 返ってきた JSON を最低限確かめる（形が違えば null）。家族にいない ID は捨てる */
export function parseExtraction(value: unknown, memberIds: string[]): Extraction | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const isStr = (x: unknown): x is string => typeof x === "string";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (x: unknown): any[] | null => (Array.isArray(x) ? x : null);
  const s = (x: unknown) => (isStr(x) ? x.trim() : "");
  const list = (x: unknown) => (arr(x) ?? []).map(s).filter(Boolean);
  const fields = arr(v.fields);
  const deadlines = arr(v.deadlines);
  const contacts = arr(v.contacts);
  if (!isStr(v.title) || !fields || !deadlines || !contacts) return null;
  const category = CATEGORY_VALUES.includes(v.category as DocumentCategory) ? (v.category as DocumentCategory) : "other";
  const who = (v.who ?? {}) as Record<string, unknown>;
  const whoIds = list(who.memberIds).filter((id) => memberIds.includes(id));
  const period = (v.period ?? {}) as Record<string, unknown>;
  const ymdOrEmpty = (x: unknown) => (YMD.test(s(x)) ? s(x) : "");
  const summary = (v.summary ?? {}) as Record<string, unknown>;
  const ignored = (summary.ifIgnored ?? {}) as Record<string, unknown>;
  // 放置すると？ は、原本の場所と原文がそろっているときだけ残す（推測で埋めさせない）
  const hasIgnored = Boolean(s(ignored.text) && s(ignored.location) && s(ignored.quote));
  const nff = (v.notForFamily ?? {}) as Record<string, unknown>;
  return {
    notForFamily: { is: nff.is === true, reason: s(nff.reason) },
    title: v.title.trim(),
    transcript: isStr(v.transcript) ? v.transcript : "",
    summary: {
      what: s(summary.what),
      todo: s(summary.todo),
      ifIgnored: hasIgnored
        ? { text: s(ignored.text), location: s(ignored.location), quote: s(ignored.quote) }
        : { text: "", location: "", quote: "" },
    },
    docType: s(v.docType),
    category,
    who: { memberIds: whoIds, sure: who.sure === true && whoIds.length > 0, reason: s(who.reason) },
    period: { label: s(period.label), from: ymdOrEmpty(period.from), until: ymdOrEmpty(period.until) },
    fields: fields
      .map((f) => ({ label: s(f?.label), value: s(f?.value), location: s(f?.location), quote: s(f?.quote) }))
      .filter((f) => f.label && f.value),
    deadlines: deadlines
      .map((d) => ({
        kind: DEADLINE_KIND_VALUES.includes(d?.kind) ? (d.kind as DeadlineKind) : "event",
        label: s(d?.label),
        date: s(d?.date),
        endDate: YMD.test(s(d?.endDate)) ? s(d?.endDate) : "",
        time: s(d?.time),
        place: s(d?.place),
        needs: list(d?.needs),
        repeatMonths: [1, 3, 6, 12, 24, 36].includes(Number(d?.repeatMonths)) ? Number(d.repeatMonths) : 0,
        location: s(d?.location),
        quote: s(d?.quote),
        reserve: YMD.test(s(d?.reserve?.date))
          ? { date: s(d.reserve.date), condition: s(d.reserve.condition), location: s(d.reserve.location), quote: s(d.reserve.quote) }
          : { date: "", condition: "", location: "", quote: "" },
        actionNeeded: d?.actionNeeded !== false,
      }))
      .filter((d) => d.label && YMD.test(d.date)),
    contacts: contacts
      .map((c) => ({ label: s(c?.label), name: s(c?.name), phone: s(c?.phone), hours: s(c?.hours), location: s(c?.location) }))
      .filter((c) => c.name),
    questions: (arr(v.questions) ?? [])
      .map((q) => ({ text: s(q?.text), reason: s(q?.reason), options: list(q?.options).slice(0, 6), multiple: q?.multiple === true }))
      .filter((q) => q.text && q.options.length >= 2)
      .slice(0, 2),
    unclear: list(v.unclear),
    completions: (arr(v.completions) ?? [])
      .map((c) => ({ what: s(c?.what), location: s(c?.location), quote: s(c?.quote) }))
      .filter((c) => c.what)
      .slice(0, 3),
    onlyInLink: list(v.onlyInLink).slice(0, 6),
  };
}

const source = (location: string, quote: string) =>
  location || quote ? { location: location || "（場所の記載なし）", quote: quote || undefined } : undefined;

/** 家族の情報のうち、読み取りに送るもの（誰の書類かを推測するため） */
export interface FamilyForReading {
  id: string;
  name: string;
  relation: string;
  note: string;
}

/** 誰の書類か迷ったときに、執事が本人に聞く質問を作る（決まった形。Claude は使わない） */
export function membersQuestion(
  documentId: string,
  members: FamilyMember[],
  guess: string[],
  reason: string,
  newId: (prefix: string) => string,
): ButlerQuestion {
  const ordered = [...members].sort((a, b) => Number(guess.includes(b.id)) - Number(guess.includes(a.id)));
  return {
    id: newId("q"),
    documentId,
    about: "members",
    text: "誰の書類ですか？",
    reason: reason || undefined,
    guess: guess.length ? guess : undefined,
    options: [
      // 短い続柄（祖父・叔母など）と、短いメモ（「2歳・保育園」など）だけ添える
      ...ordered.map((m) => {
        const extra = [m.roleLabel ?? RELATION_LABELS[m.relation], m.note && m.note.length <= 8 ? m.note : undefined]
          .filter(Boolean)
          .join("・");
        return { label: `${m.name}（${extra}）`, value: m.id };
      }),
      { label: "家族みんな", value: "all" },
    ],
    multiple: true,
  };
}

/** 読み取り結果を「確認待ち」の書類と、執事の質問にする。確定は本人が原本と見比べてから */
export function extractionToDocument(
  extraction: Extraction,
  options: {
    id: string;
    origin: DocumentOrigin;
    draftSource: "claude" | "provisional";
    members: FamilyMember[];
    expectedId?: string;
    originalText?: string;
    originalFile?: { mediaType: string; dataUrl: string };
    newId: (prefix: string) => string;
  },
): { document: DocumentRecord; questions: ButlerQuestion[] } {
  const self = options.members.find((m) => m.relation === "self")?.id;
  // 記入例・見本など、この家の書類ではないもの: 誰のものにもせず、予定・質問も作らない（書き方の見本として残すだけ）
  const notFamily = extraction.notForFamily?.is === true;
  const memberIds = notFamily ? [] : extraction.who.memberIds.length ? extraction.who.memberIds : self ? [self] : [];
  const { what, todo, ifIgnored } = extraction.summary;
  // 文字起こしがあるときは、放置すると？ の原文が本当に原本にあるかをコードで確かめる
  const squash = (x: string) => x.replace(/\s/g, "");
  const quoteOk = !options.originalText || squash(options.originalText).includes(squash(ifIgnored.quote));
  const document: DocumentRecord = {
    id: options.id,
    title: extraction.title || "読み取った書類",
    category: extraction.category,
    docType: extraction.docType || undefined,
    memberIds,
    periodLabel: extraction.period.label || undefined,
    validFrom: extraction.period.from || undefined,
    validUntil: extraction.period.until || undefined,
    origin: options.origin,
    draftSource: options.draftSource,
    expectedId: options.expectedId,
    originalText: options.originalText,
    originalFile: options.originalFile,
    unclear: extraction.unclear.length ? extraction.unclear : undefined,
    notForFamily: notFamily ? extraction.notForFamily?.reason || "この家の書類ではありません" : undefined,
    onlyInLink: extraction.onlyInLink?.length ? extraction.onlyInLink : undefined,
    completions: extraction.completions?.length
      ? extraction.completions.map((c) => ({ what: c.what, source: source(c.location, c.quote) ?? { location: c.location }, bundleKey: c.bundleKey || undefined }))
      : undefined,
    summary:
      what || todo || ifIgnored.text
        ? {
            what,
            todo,
            ifIgnored:
              ifIgnored.text && quoteOk
                ? { text: ifIgnored.text, source: { location: ifIgnored.location, quote: ifIgnored.quote } }
                : undefined,
          }
        : undefined,
    fields: extraction.fields.map((f) => ({
      key: options.newId("f"),
      label: f.label,
      value: f.value,
      source: source(f.location, f.quote),
      status: "draft",
    })),
    deadlines: (notFamily ? [] : extraction.deadlines).map((d) => ({
      id: options.newId("dl"),
      kind: d.kind,
      label: d.label,
      date: d.date,
      endDate: d.endDate || undefined,
      time: d.time || undefined,
      place: d.place || undefined,
      needs: d.needs.length ? d.needs : undefined,
      repeatMonths: d.repeatMonths || undefined,
      reserve: d.reserve.date
        ? { date: d.reserve.date, condition: d.reserve.condition || undefined, source: source(d.reserve.location, d.reserve.quote) }
        : undefined,
      leadDays: DEFAULT_LEAD_DAYS[d.kind],
      awareness: d.actionNeeded === false ? true : undefined,
      bundleKey: d.bundleKey || undefined,
      memberIds,
      source: source(d.location, d.quote),
    })),
    contacts: extraction.contacts.map((c) => ({
      label: c.label || "問い合わせ先",
      name: c.name,
      phone: c.phone || undefined,
      hours: c.hours || undefined,
      source: c.location ? { location: c.location } : undefined,
    })),
    createdAt: new Date().toISOString(),
  };

  const questions: ButlerQuestion[] = [];
  if (notFamily) return { document, questions };
  if (!extraction.who.sure && options.members.length > 1) {
    questions.push(
      membersQuestion(document.id, options.members, extraction.who.memberIds, extraction.who.reason, options.newId),
    );
  }
  for (const q of extraction.questions) {
    questions.push({
      id: options.newId("q"),
      documentId: document.id,
      about: "other",
      text: q.text,
      reason: q.reason || undefined,
      options: q.options.map((o) => ({ label: o, value: o })),
      multiple: q.multiple,
    });
  }
  return { document, questions };
}
