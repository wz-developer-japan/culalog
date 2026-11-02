// 執事に聞く（チャット）。サーバーとブラウザで共通。
// 根拠にするのは「今年度の確定した書類」だけ（前のものは使わない）。
// Claude には書類の中身（番号は伏せる・電話番号は送らない）と質問を渡し、
//   答え・引用（書類の ID・原本の場所・原文の抜き書き）・書いていないときはそのこと
// を決まった形で返させる。引用はコードで原本と照らし合わせ、見つからないものは外す。
// 答えに判断の言い回し（補償される・解約した方がよい等）があれば、その答えは出さない。
// 書類に書いていないことは「書いていません」と色の違うカードで出し、問い合わせ先だけを添える。

import { maskNumbers } from "./connect";
import { parseDate } from "./deadlines";
import { findQuote } from "./highlight";
import type { Contact, DocumentRecord, Household } from "./types";

export interface AskInput {
  today: string;
  /** 架空の家族か（Claude には送らない） */
  demo: boolean;
  style: string;
  family: { id: string; name: string; relation: string; note: string }[];
  documents: {
    id: string;
    title: string;
    docType: string;
    category: string;
    period: string;
    memberIds: string[];
    storageLocation: string;
    fields: { label: string; value: string; location: string; quote: string }[];
    deadlines: { kind: string; label: string; date: string; endDate: string; time: string; place: string; needs: string[]; location: string; quote: string }[];
    /** 問い合わせ先の名前と場所だけ（電話番号は送らない。画面ではコードが端末のデータから出す） */
    contacts: { label: string; name: string; hours: string; location: string }[];
    /** 原本の文字（番号は伏せる・長すぎる分は切る） */
    text: string;
  }[];
  question: string;
}

export const QUESTION_MAX = 200;
const TEXT_MAX = 6000;

const str = { type: "string" } as const;

/** Claude の構造化出力に渡す JSON Schema */
export const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "answer", "citations", "relatedDocumentIds"],
  properties: {
    /** 書類に答えが書いてあるか。書いていなければ false（answer には、何が書いていないかだけ） */
    found: { type: "boolean" },
    answer: str,
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["documentId", "location", "quote"],
        properties: { documentId: str, location: str, quote: str },
      },
    },
    /** 質問に関係する書類（書いていないとき、問い合わせ先を出すため） */
    relatedDocumentIds: { type: "array", items: str },
  },
} as const;

/** 根拠にする書類: 確定済みで、前のものになっていない（「前のものにしますか？」と聞いている最中のものも除く） */
export function documentsForAsk(household: Household): DocumentRecord[] {
  const asking = new Set(
    (household.questions ?? []).filter((q) => q.about === "supersede" && !q.answeredAt).map((q) => q.targetDocumentId),
  );
  return household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !asking.has(d.id));
}

/** 文字の中の長い番号を伏せる（証券番号・受給者番号・電話番号など） */
export function maskText(text: string): string {
  return text.replace(/[0-9０-９][0-9０-９\-－ ]{7,}[0-9０-９]/g, "（伏せています）");
}

export function buildAskInput(household: Household, question: string, today: string, style: string): AskInput {
  return {
    today,
    demo: household.isDemo,
    style,
    family: household.members.map((m) => ({ id: m.id, name: m.name, relation: m.roleLabel ?? m.relation, note: m.note ?? "" })),
    documents: documentsForAsk(household).map((doc) => ({
      id: doc.id,
      title: doc.title,
      docType: doc.docType ?? "",
      category: doc.category,
      period: doc.periodLabel ?? "",
      memberIds: doc.memberIds,
      storageLocation: doc.storageLocation ?? "",
      fields: doc.fields.map((f) => ({
        label: f.label,
        value: maskNumbers(f.label, f.value),
        location: f.source?.location ?? "",
        quote: maskText(f.source?.quote ?? ""),
      })),
      deadlines: doc.deadlines.map((d) => ({
        kind: d.kind,
        label: d.label,
        date: d.date,
        endDate: d.endDate ?? "",
        time: d.time ?? "",
        place: d.place ?? "",
        needs: d.needs ?? [],
        location: d.source?.location ?? "",
        quote: maskText(d.source?.quote ?? ""),
      })),
      contacts: doc.contacts.map((c) => ({ label: c.label, name: c.name, hours: c.hours ?? "", location: c.source?.location ?? "" })),
      text: maskText(doc.originalText ?? "").slice(0, TEXT_MAX),
    })),
    question: question.trim().slice(0, QUESTION_MAX),
  };
}

// ---- 答えの形（確かめたあと） ----

export interface Citation {
  documentId: string;
  documentTitle: string;
  location: string;
  quote: string;
}

export interface AskResult {
  source: "claude" | "provisional";
  question: string;
  /** 書類に書いてあった */
  found: boolean;
  answer: string;
  citations: Citation[];
  /** 問い合わせ先（書いていないとき・関係する書類のもの。電話番号は端末のデータから） */
  contacts: { documentId: string; documentTitle: string; contact: Contact }[];
  /** コードの確かめで外した引用の数 */
  dropped: number;
  /** 答え自体を出さなかった理由（判断の言い回し・日付が合わないなど） */
  withheld?: string;
  createdAt: string;
}

/** 判断・当てはめの言い回し（出さない。connect.ts と同じ線） */
const JUDGMENT = /(補償され|保険(金)?が(使え|おり|下り|出)|お金が(出|戻)|受診(すべき|してください|した方)|解約(すべき|した方)|お得|損です|違法|訴え|おすすめし|した方がよい|すべきです)/;

/** 文の中の「○月○日」が、根拠の書類のどこかに出てくる日付か */
function datesAreInDocuments(text: string, docs: DocumentRecord[]): boolean {
  const known = new Set<string>();
  for (const d of docs) {
    for (const x of d.deadlines) {
      for (const ymd of [x.date, x.endDate, x.reserve?.date]) {
        if (ymd) {
          const p = parseDate(ymd);
          known.add(`${p.getMonth() + 1}/${p.getDate()}`);
        }
      }
    }
    const haystack = `${d.originalText ?? ""} ${d.fields.map((f) => f.value).join(" ")} ${d.periodLabel ?? ""}`;
    for (const m of haystack.matchAll(/(\d{1,2})月(\d{1,2})日/g)) known.add(`${Number(m[1])}/${Number(m[2])}`);
    for (const m of haystack.matchAll(/\d{4}[/\-年](\d{1,2})[/\-月](\d{1,2})/g)) known.add(`${Number(m[1])}/${Number(m[2])}`);
  }
  for (const m of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    if (!known.has(`${Number(m[1])}/${Number(m[2])}`)) return false;
  }
  return true;
}

function contactsOf(docs: DocumentRecord[]): AskResult["contacts"] {
  return docs.flatMap((d) => d.contacts.map((contact) => ({ documentId: d.id, documentTitle: d.title, contact })));
}

/** Claude の答えを確かめて、画面に出せる形にする（形が違えば null） */
export function verifyAsk(raw: unknown, household: Household, question: string): AskResult | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { found?: unknown; answer?: unknown; citations?: unknown; relatedDocumentIds?: unknown };
  if (typeof v.answer !== "string" || !Array.isArray(v.citations)) return null;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const docs = documentsForAsk(household);
  const byId = new Map(docs.map((d) => [d.id, d]));
  let dropped = 0;

  // 引用: 根拠にしてよい書類のもので、抜き書きが原本の文字（か、確定した項目・予定の抜き書き）の中にあるものだけ
  const citations: Citation[] = [];
  for (const c of v.citations.slice(0, 8)) {
    const doc = byId.get(s(c?.documentId));
    const location = s(c?.location);
    const quote = s(c?.quote);
    if (!doc || (!location && !quote)) {
      dropped++;
      continue;
    }
    if (quote) {
      const inText = doc.originalText ? Boolean(findQuote(doc.originalText, quote)) : false;
      const inItems = [...doc.fields.map((f) => f.source?.quote), ...doc.deadlines.map((d) => d.source?.quote)]
        .filter((q): q is string => Boolean(q))
        .some((q) => Boolean(findQuote(q, quote)) || Boolean(findQuote(quote, q)));
      if (!inText && !inItems) {
        dropped++;
        continue;
      }
    }
    if (citations.some((x) => x.documentId === doc.id && x.location === location && x.quote === quote)) continue;
    citations.push({ documentId: doc.id, documentTitle: doc.title, location, quote });
  }

  const related = (Array.isArray(v.relatedDocumentIds) ? v.relatedDocumentIds : [])
    .map(s)
    .map((id) => byId.get(id))
    .filter((d): d is DocumentRecord => Boolean(d));
  const citedDocs = [...new Set(citations.map((c) => byId.get(c.documentId)!))];
  const contactDocs = [...new Set([...citedDocs, ...related])];

  const answer = v.answer.trim().slice(0, 600);
  const base = { source: "claude" as const, question, citations, contacts: contactsOf(contactDocs), dropped, createdAt: new Date().toISOString() };

  if (JUDGMENT.test(answer)) {
    return { ...base, found: false, answer: "", withheld: "執事の答えに、保険・医療・法律の判断にあたる言い回しが入っていたため、出していません。原本と窓口でご確認ください。" };
  }
  if (!datesAreInDocuments(answer, citedDocs.length ? citedDocs : docs)) {
    return { ...base, found: false, answer: "", withheld: "執事の答えの中の日付が、書類のどこにも見つからなかったため、出していません。" };
  }
  // 書いてあると言うのに引用が1つも残らなかったら、「書いてある」とは言えない
  if (v.found === true && citations.length === 0) {
    return { ...base, found: false, answer: "", withheld: "執事の答えの根拠（原本の場所）が、書類と照らし合わせて合わなかったため、出していません。" };
  }
  return { ...base, found: v.found === true, answer };
}

// ---- Claude の準備中（キーが無いとき）に使う、仮の答え（検索） ----

/**
 * 質問から、探す言葉を取り出す（漢字のかたまり＋送りがな、カタカナ、英数）。
 * 「冬休みは」→「冬休み」のように、終わりの助詞は落とす。ひらがなだけの語は探さない（「いつから」などは当たりすぎるため）
 */
export function keywordsOf(question: string): string[] {
  const stop = new Set(["息子", "娘", "うち", "教え", "今年", "今度", "来月", "今月", "書類"]);
  const raw = question.match(/[\p{Script=Han}]+[\p{Script=Hiragana}]{0,2}|[\p{Script=Katakana}ー]{2,}|[A-Za-z0-9]{2,}/gu) ?? [];
  const words = raw
    .map((w) => w.replace(/[はがをにでとものかへやもね]+$/u, ""))
    .map((w) => (w.length >= 3 && /[\p{Script=Hiragana}]{2}$/u.test(w) ? w.slice(0, -1) : w)) // 「払う」の「う」などは残し、「飼える」→「飼え」程度に
    .filter((w) => w.length >= 2 || /^[\p{Script=Han}]$/u.test(w) === false)
    .filter((w) => w.length >= 2 && !stop.has(w));
  return [...new Set(words)];
}

/**
 * 仮の答え: 質問の言葉を、確定した書類の項目・予定・原本の文字からコードで探して、当たった所を並べる（Claude は使っていない）。
 * 文章の答えは作らない。見つからなければ「書いていません」。
 */
export function provisionalAsk(household: Household, question: string): AskResult {
  const docs = documentsForAsk(household);
  const words = keywordsOf(question);
  const citations: Citation[] = [];
  const hit = (text: string) => words.some((w) => text.includes(w));
  for (const doc of docs) {
    for (const f of doc.fields) {
      if (hit(`${f.label} ${f.value}`)) citations.push({ documentId: doc.id, documentTitle: doc.title, location: f.source?.location ?? f.label, quote: f.source?.quote || `${f.label}: ${f.value}` });
    }
    for (const d of doc.deadlines) {
      if (hit(d.label)) citations.push({ documentId: doc.id, documentTitle: doc.title, location: d.source?.location ?? "", quote: d.source?.quote || d.label });
    }
    if (doc.originalText) {
      for (const line of doc.originalText.split("\n")) {
        const t = line.trim();
        if (t && hit(t) && !citations.some((c) => c.documentId === doc.id && c.quote === t)) {
          citations.push({ documentId: doc.id, documentTitle: doc.title, location: "原本の文字", quote: t.slice(0, 80) });
        }
      }
    }
  }
  const picked = citations.slice(0, 6);
  const citedDocs = [...new Set(picked.map((c) => docs.find((d) => d.id === c.documentId)!))];
  return {
    source: "provisional",
    question,
    found: picked.length > 0,
    answer: picked.length > 0 ? `「${words.join("」「")}」が書いてある所を、書類から探しました（仮）。` : "",
    citations: picked,
    contacts: contactsOf(citedDocs.length ? citedDocs : []),
    dropped: 0,
    createdAt: new Date().toISOString(),
  };
}
