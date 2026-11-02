// 書類の読み取り結果の形（サーバーとブラウザで共通）。
// Claude には「原本に書いてあること」と「原本のどこか」だけを、決まった形で返させる。
// 判断（補償される・解約してよい・受診すべき等）を書く欄はそもそも用意しない。

import { DEFAULT_LEAD_DAYS } from "./labels";
import type { DeadlineKind, DocumentCategory, DocumentOrigin, DocumentRecord } from "./types";

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
  location: string;
  quote: string;
}

export interface ExtractedContact {
  label: string;
  name: string;
  phone: string;
  hours: string;
  location: string;
}

export interface Extraction {
  title: string;
  category: DocumentCategory;
  fields: ExtractedField[];
  deadlines: ExtractedDeadline[];
  contacts: ExtractedContact[];
  /** 読めなかった・はっきりしなかった箇所（本人に原本で確かめてもらう） */
  unclear: string[];
}

export const CATEGORY_VALUES: DocumentCategory[] = [
  "school",
  "childcare",
  "housing",
  "insurance",
  "vehicle",
  "medical_card",
  "care",
  "license",
  "subscription",
  "other",
];

export const DEADLINE_KIND_VALUES: DeadlineKind[] = [
  "expiry",
  "window",
  "notice",
  "cancel_window",
  "after_event",
  "event",
];

const str = { type: "string" } as const;

/** Claude の構造化出力に渡す JSON Schema */
export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "category", "fields", "deadlines", "contacts", "unclear"],
  properties: {
    title: str,
    category: { type: "string", enum: CATEGORY_VALUES },
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
        required: ["kind", "label", "date", "endDate", "location", "quote"],
        properties: {
          kind: { type: "string", enum: DEADLINE_KIND_VALUES },
          label: str,
          date: { type: "string", format: "date" },
          endDate: str,
          location: str,
          quote: str,
        },
      },
    },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "name", "phone", "hours", "location"],
        properties: { label: str, name: str, phone: str, hours: str, location: str },
      },
    },
    unclear: { type: "array", items: str },
  },
} as const;

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** 返ってきた JSON を最低限確かめる（形が違えば null） */
export function parseExtraction(value: unknown): Extraction | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const isStr = (x: unknown): x is string => typeof x === "string";
  const arr = (x: unknown) => (Array.isArray(x) ? x : null);
  const fields = arr(v.fields);
  const deadlines = arr(v.deadlines);
  const contacts = arr(v.contacts);
  const unclear = arr(v.unclear);
  if (!isStr(v.title) || !fields || !deadlines || !contacts || !unclear) return null;
  const category = CATEGORY_VALUES.includes(v.category as DocumentCategory) ? (v.category as DocumentCategory) : "other";
  const s = (x: unknown) => (isStr(x) ? x.trim() : "");
  return {
    title: v.title.trim(),
    category,
    fields: fields
      .map((f) => ({ label: s(f?.label), value: s(f?.value), location: s(f?.location), quote: s(f?.quote) }))
      .filter((f) => f.label && f.value),
    deadlines: deadlines
      .map((d) => ({
        kind: DEADLINE_KIND_VALUES.includes(d?.kind) ? (d.kind as DeadlineKind) : "event",
        label: s(d?.label),
        date: s(d?.date),
        endDate: YMD.test(s(d?.endDate)) ? s(d?.endDate) : "",
        location: s(d?.location),
        quote: s(d?.quote),
      }))
      .filter((d) => d.label && YMD.test(d.date)),
    contacts: contacts
      .map((c) => ({ label: s(c?.label), name: s(c?.name), phone: s(c?.phone), hours: s(c?.hours), location: s(c?.location) }))
      .filter((c) => c.name),
    unclear: unclear.map(s).filter(Boolean),
  };
}

const source = (location: string, quote: string) =>
  location || quote ? { location: location || "（場所の記載なし）", quote: quote || undefined } : undefined;

/** 読み取り結果を「確認待ち」の書類にする。確定は本人が原本と見比べてから */
export function extractionToDocument(
  extraction: Extraction,
  options: {
    id: string;
    origin: DocumentOrigin;
    draftSource: "claude" | "provisional";
    memberIds: string[];
    expectedId?: string;
    originalText?: string;
    originalFile?: { mediaType: string; dataUrl: string };
    newId: (prefix: string) => string;
  },
): DocumentRecord {
  return {
    id: options.id,
    title: extraction.title || "読み取った書類",
    category: extraction.category,
    memberIds: options.memberIds,
    origin: options.origin,
    draftSource: options.draftSource,
    expectedId: options.expectedId,
    originalText: options.originalText,
    originalFile: options.originalFile,
    unclear: extraction.unclear.length ? extraction.unclear : undefined,
    fields: extraction.fields.map((f) => ({
      key: options.newId("f"),
      label: f.label,
      value: f.value,
      source: source(f.location, f.quote),
      status: "draft",
    })),
    deadlines: extraction.deadlines.map((d) => ({
      id: options.newId("dl"),
      kind: d.kind,
      label: d.label,
      date: d.date,
      endDate: d.endDate || undefined,
      leadDays: DEFAULT_LEAD_DAYS[d.kind],
      memberIds: options.memberIds,
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
}
