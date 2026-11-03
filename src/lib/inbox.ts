// まとめて渡す（受け取り箱）。
// 人は写真・スクショ・PDF を何枚でも一度に渡すだけ。執事は1枚ずつ順番に読み、下書き（確認待ち）にして溜める。
// 分からないことは「執事から聞きたいこと」に並べ、本人の答えは「覚えたこと」として残して、同じ種類の書類で二度聞かない。
// 確定は本人（まとめて確認でも、原本と見比べる工程は残す）。

import { answerQuestion, closeQuestions, kindKey } from "./butler";
import { type Extraction, extractionToDocument } from "./extraction";
import type { ButlerQuestion, DocumentRecord, Household } from "./types";

export type InboxStatus =
  /** 読む順番を待っている */
  | "waiting"
  /** 読んで下書きにした（documentId） */
  | "done"
  /** 読めなかった（error） */
  | "failed"
  /** 同じファイル・同じ書類がもうある（duplicateOf）。読まない・送らない */
  | "duplicate"
  /** 執事（Claude）の準備ができていないので、読めるようになるまで待つ */
  | "needsKey";

export interface InboxItem {
  id: string;
  name: string;
  mediaType: string;
  origin: "photo" | "pdf" | "text";
  addedAt: string;
  /** ファイルの指紋 */
  hash: string;
  status: InboxStatus;
  documentId?: string;
  error?: string;
  /** デモの見本から入れたもの（読み取りの準備中は、用意しておいた仮の結果を使う） */
  sampleId?: string;
  /** 「来るはずの書類」に当たる見本なら、その ID */
  expectedId?: string;
  /** 同じだった書類の ID（または同じファイルの受け取り箱の ID） */
  duplicateOf?: string;
  /** 1つの書類の2ページ目から先の写真（ファイルは別の場所に、この ID で置く） */
  pageIds?: string[];
}

/** 本人が質問に答えて、執事が覚えたこと */
export interface Learned {
  id: string;
  /** members: この種類の書類は誰の書類か ／ answer: この種類の書類のこの質問の答え */
  kind: "members" | "answer";
  /** 書類の種類（年度・かっこ書きを除いたもの） */
  kindKey: string;
  /** 表示用の書類の種類の名前 */
  docType: string;
  question?: string;
  values: string[];
  /** 表示用の答え（名前・選択肢の文字） */
  labels: string[];
  learnedAt: string;
}

export function inboxItems(household: Household): InboxItem[] {
  return household.inbox ?? [];
}

export function inboxProgress(household: Household) {
  const items = inboxItems(household);
  const count = (s: InboxStatus) => items.filter((i) => i.status === s).length;
  const pausedUntil = household.inboxPausedUntil && Date.parse(household.inboxPausedUntil) > Date.now() ? household.inboxPausedUntil : undefined;
  return {
    total: items.length,
    waiting: count("waiting"),
    done: count("done"),
    failed: count("failed"),
    duplicate: count("duplicate"),
    needsKey: count("needsKey"),
    pausedUntil,
  };
}

export interface NewInboxEntry {
  id: string;
  name: string;
  mediaType: string;
  origin: "photo" | "pdf" | "text";
  hash: string;
  sampleId?: string;
  expectedId?: string;
  pageIds?: string[];
}

/**
 * 受け取り箱に入れる。同じファイル（指紋が同じ）がもう受け取り箱か書類にあれば、読まずに「同じもの」にする（送らない・数えない）
 */
export function enqueue(household: Household, entries: NewInboxEntry[]): { household: Household; added: number; duplicates: number } {
  const items = [...inboxItems(household)];
  let added = 0;
  let duplicates = 0;
  const now = new Date().toISOString();
  for (const e of entries) {
    const sameDoc = household.documents.find((d) => d.fileHash === e.hash);
    const sameItem = items.find((i) => i.hash === e.hash && i.status !== "failed" && i.status !== "duplicate");
    const dup = sameDoc?.id ?? (sameItem?.documentId || sameItem?.id);
    if (dup) {
      duplicates++;
      items.push({ ...e, addedAt: now, status: "duplicate", duplicateOf: dup });
    } else {
      added++;
      items.push({ ...e, addedAt: now, status: "waiting" });
    }
  }
  return { household: { ...household, inbox: items }, added, duplicates };
}

const namesOf = (household: Household, ids: string[]) =>
  ids.map((id) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "").filter(Boolean);

/**
 * 前に読んだ書類と、同じ書類の写真違いかもしれないか（同じ種類で、予定の名前と日付がすべて同じ）。
 * 同じ種類でも、予定の日付が1つでも違うもの・改訂版や訂正のお知らせは「新しい版」なので、ここでは聞かず、
 * 確定したときに「前のものにしますか？」で聞く
 */
export function similarDocument(household: Household, doc: DocumentRecord): DocumentRecord | undefined {
  if (/改訂|訂正|変更|差し替え|更新版/.test(`${doc.title} ${doc.docType ?? ""}`)) return undefined;
  const key = kindKey(doc);
  const sig = (d: DocumentRecord) => [...new Set(d.deadlines.map((x) => `${x.label}|${x.date}|${x.endDate ?? ""}`))].sort().join("/");
  const mine = sig(doc);
  return household.documents.find((old) => {
    if (old.id === doc.id || old.supersededBy || kindKey(old) !== key) return false;
    if (mine) return sig(old) === mine;
    // 予定の無い書類（証券・契約書など）は、題名と期間が同じなら
    return old.title === doc.title && (old.periodLabel ?? "") === (doc.periodLabel ?? "") && !sig(old);
  });
}

/** 覚えたことを、新しい書類の質問に当てはめる（当てはめた質問は聞かない） */
function applyLearned(
  household: Household,
  doc: DocumentRecord,
  questions: ButlerQuestion[],
): { doc: DocumentRecord; questions: ButlerQuestion[] } {
  // 記入例など、この家の書類ではないものには、覚えたことを当てはめない
  if (doc.notForFamily) return { doc, questions };
  const key = kindKey(doc);
  const learned = (household.learned ?? []).filter((l) => l.kindKey === key);
  if (learned.length === 0) return { doc, questions };
  let next = doc;
  const notes: string[] = [];
  const keep: ButlerQuestion[] = [];
  for (const q of questions) {
    const hit =
      q.about === "members"
        ? learned.find((l) => l.kind === "members")
        : q.about === "other"
          ? learned.find((l) => l.kind === "answer" && l.question === q.text && l.values.every((v) => q.options.some((o) => o.value === v)))
          : undefined;
    if (!hit) {
      keep.push(q);
      continue;
    }
    if (q.about === "members") {
      const all = hit.values.includes("all");
      const ids = all ? [] : hit.values.filter((id) => household.members.some((m) => m.id === id));
      if (ids.length === 0 && !all) {
        keep.push(q);
        continue;
      }
      const old = next.memberIds.join(",");
      next = {
        ...next,
        memberIds: ids,
        householdWide: all || undefined,
        deadlines: next.deadlines.map((d) => (d.memberIds.join(",") === old ? { ...d, memberIds: ids } : d)),
      };
      notes.push(`前に「${hit.docType}」は${namesOf(household, ids).join("・")}さんの書類と教えてもらったので、そうしました。`);
    } else {
      next = {
        ...next,
        fields: [
          ...next.fields,
          {
            key: `answer-${q.id}`,
            label: q.text,
            value: hit.labels.join("、"),
            source: { location: "あなたの答え（前に教えてもらったこと）" },
            status: "confirmed" as const,
          },
        ],
      };
      notes.push(`「${q.text}」は前に「${hit.labels.join("、")}」と教えてもらったので、聞かずに入れました。`);
    }
  }
  if (notes.length) next = { ...next, learnedNotes: [...(next.learnedNotes ?? []), ...notes] };
  return { doc: next, questions: keep };
}

/**
 * 読み取り結果を受け取り箱の1枚に結び付けて、確認待ちの書類にする。
 * 覚えたことを当てはめ、写真違いの同じ書類かもしれなければ「同じ書類ですか？」と聞く
 */
export function applyExtraction(
  household: Household,
  item: InboxItem,
  extraction: Extraction,
  options: {
    draftSource: "claude" | "provisional";
    dataUrl: string;
    /** 2ページ目から先の写真 */
    pages?: string[];
    originalText?: string;
    newId: (prefix: string) => string;
  },
): Household {
  // 読んでいるあいだに受け取り箱から消された・もう読んだものは、何もしない
  const current = inboxItems(household).find((i) => i.id === item.id);
  if (!current || current.status !== "waiting") return household;
  const made = extractionToDocument(extraction, {
    id: options.newId("doc"),
    origin: item.origin,
    draftSource: options.draftSource,
    members: household.members,
    expectedId: item.expectedId,
    originalText: options.originalText,
    // 文字で渡したもの（メールの本文など）は、原本の文字だけを持つ（写真・PDF は無い）
    originalFile: item.mediaType === "text/plain" ? undefined : { mediaType: item.mediaType, dataUrl: options.dataUrl },
    newId: options.newId,
  });
  const pages = (options.pages ?? []).map((dataUrl) => ({ mediaType: item.mediaType, dataUrl }));
  const { doc, questions } = applyLearned(
    household,
    { ...made.document, fileHash: item.hash, originalPages: pages.length ? pages : undefined },
    made.questions,
  );
  const similar = doc.notForFamily ? undefined : similarDocument(household, doc);
  if (similar) {
    questions.unshift({
      id: options.newId("q"),
      documentId: doc.id,
      about: "duplicate",
      targetDocumentId: similar.id,
      text: `前に渡した「${similar.title}」と同じ書類ですか？`,
      reason: "種類が同じで、同じ予定が書いてあります。同じ書類を別の写真で撮ったのかもしれません。",
      options: [
        { label: "同じ書類（今回の分は消す）", value: "same" },
        { label: "別の書類（両方残す）", value: "different" },
      ],
      multiple: false,
    });
  }
  return {
    ...household,
    documents: [...household.documents, doc],
    questions: [...(household.questions ?? []), ...questions],
    inbox: inboxItems(household).map((i) => (i.id === item.id ? { ...i, status: "done" as const, documentId: doc.id, error: undefined } : i)),
  };
}

export function markItem(household: Household, id: string, change: Partial<InboxItem>): Household {
  return { ...household, inbox: inboxItems(household).map((i) => (i.id === id ? { ...i, ...change } : i)) };
}

/** 執事の準備ができていなかった・読めなかったものを、もう一度読む順番に戻す */
export function retryInbox(household: Household, statuses: InboxStatus[] = ["needsKey", "failed"]): Household {
  return {
    ...household,
    inboxPausedUntil: undefined,
    inbox: inboxItems(household).map((i) => (statuses.includes(i.status) ? { ...i, status: "waiting" as const, error: undefined } : i)),
  };
}

/** 読み終わった・同じだったものを受け取り箱から片付ける（書類はそのまま残る） */
export function tidyInbox(household: Household): Household {
  return { ...household, inbox: inboxItems(household).filter((i) => i.status === "waiting" || i.status === "needsKey" || i.status === "failed") };
}

/**
 * 質問に答えて、覚える。同じ種類の書類で同じことを聞いている質問にも、その場で当てはめる。
 * 返す applied は、ほかに当てはめた質問の数
 */
export function answerAndLearn(
  household: Household,
  questionId: string,
  values: string[],
  newId: (prefix: string) => string,
): { household: Household; applied: number; learned?: Learned } {
  const question = household.questions?.find((q) => q.id === questionId);
  const doc = household.documents.find((d) => d.id === question?.documentId);
  let next = answerQuestion(household, questionId, values);
  if (!question || !doc || (question.about !== "members" && question.about !== "other")) return { household: next, applied: 0 };

  const key = kindKey(doc);
  const labels =
    question.about === "members"
      ? values.includes("all")
        ? ["家族みんな"]
        : namesOf(household, values)
      : question.options.filter((o) => values.includes(o.value)).map((o) => o.label);
  const learned: Learned = {
    id: newId("l"),
    kind: question.about === "members" ? "members" : "answer",
    kindKey: key,
    docType: doc.docType || doc.title,
    question: question.about === "other" ? question.text : undefined,
    values,
    labels,
    learnedAt: new Date().toISOString(),
  };
  const same = (l: Learned) => l.kindKey === key && l.kind === learned.kind && l.question === learned.question;
  next = { ...next, learned: [...(next.learned ?? []).filter((l) => !same(l)), learned] };

  // ほかの同じ種類の書類で、同じことをまだ聞いている質問にも当てはめる
  let applied = 0;
  for (const q of next.questions ?? []) {
    if (q.answeredAt || q.id === questionId || q.about !== question.about) continue;
    if (q.about === "other" && q.text !== question.text) continue;
    const other = next.documents.find((d) => d.id === q.documentId);
    if (!other || kindKey(other) !== key) continue;
    if (q.about === "other" && !values.every((v) => q.options.some((o) => o.value === v))) continue;
    next = answerQuestion(next, q.id, values);
    next = {
      ...next,
      documents: next.documents.map((d) =>
        d.id === other.id ? { ...d, learnedNotes: [...(d.learnedNotes ?? []), `同じ種類の「${doc.title}」への答えを当てはめました。`] } : d,
      ),
    };
    applied++;
  }
  return { household: next, applied, learned };
}

/** 覚えたことを忘れる（次からはまた聞く） */
export function forget(household: Household, id: string): Household {
  return { ...household, learned: (household.learned ?? []).filter((l) => l.id !== id) };
}

/**
 * まとめて確定してよさそうか。迷う理由があれば、その理由（チェックを外した状態で出す）
 */
export function bulkConfirmBlocker(household: Household, doc: DocumentRecord): string | undefined {
  const open = (household.questions ?? []).filter((q) => q.documentId === doc.id && !q.answeredAt);
  if (open.some((q) => q.about === "duplicate")) return "前の書類と同じかもしれません（聞きたいことに答えてから）";
  if (open.some((q) => q.about === "members")) return "誰の書類か、まだ答えてもらっていません（聞きたいことで答えられます）";
  if (doc.unclear && doc.unclear.length > 0) return "読めなかった所があります";
  if (doc.deadlines.length === 0 && doc.fields.length === 0) return "書いてあることを読み取れていません";
  return undefined;
}

/** まとめて確定する（中の項目も確定にする）。確定のたびに「前のものにしますか？」も足される */
export function confirmMany(
  household: Household,
  ids: string[],
  confirmOne: (h: Household, id: string) => Household,
  newId?: (prefix: string) => string,
): Household {
  let next = household;
  for (const id of ids) {
    next = {
      ...next,
      documents: next.documents.map((d) => (d.id === id ? { ...d, fields: d.fields.map((f) => ({ ...f, status: "confirmed" as const })) } : d)),
    };
    next = confirmOne(next, id);
  }
  // 完了で閉じる: 一緒に確定した書類どうし（「納付完了」のメールと、その納付書など）も、もう一度つないで聞く
  for (const id of ids) {
    const doc = next.documents.find((d) => d.id === id);
    if (newId && doc?.completions?.length) next = { ...next, questions: [...(next.questions ?? []), ...closeQuestions(next, doc, newId)] };
  }
  return next;
}
