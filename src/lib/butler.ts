// 執事のひとことの材料と、取りこぼしを防ぐ安全網。
// 候補（期日の逆算・来ていないもの）を作るのはコード。何を言うかを選ぶのは Claude（11/4 から）。
// Claude が選ばなかったものでも、締切が近いもの・過ぎたものはコードの側で必ず出す。

import { type ActionItem, buildHome, formatYmd } from "./deadlines";
import type { ButlerQuestion, DocumentRecord, Household } from "./types";

/** 締切が何日以内なら、Claude が選ばなくても必ず出すか */
export const URGENT_DAYS = 3;

export interface Candidate {
  /** 予定・やることの ID、または `missing:来るはずの書類の ID` */
  id: string;
  type: "deadline" | "missing";
  /** 予定・行事か（済んだにする必要がない） */
  isEvent?: boolean;
  daysLeft: number;
  /** 締切が近い・過ぎた（安全網の対象） */
  urgent: boolean;
  overdue: boolean;
  title: string;
  /** 時刻・場所・必要なもの */
  detail?: string;
  /** なぜ大事か（書類やきまりに書いてある理由） */
  why?: string;
  documentId?: string;
  documentTitle?: string;
  /** 原本のどこか */
  location?: string;
}

function titleOf({ deadline, daysLeft }: ActionItem, overdue: boolean): string {
  if (overdue) return `${deadline.label}の締切（${formatYmd(deadline.date)}）を${-daysLeft}日過ぎています`;
  const isWindow = deadline.kind === "window" || deadline.kind === "cancel_window";
  if (isWindow && daysLeft > 0 && deadline.endDate) {
    return `${deadline.label}が あと${daysLeft}日で始まります（${formatYmd(deadline.date)}〜${formatYmd(deadline.endDate)}）`;
  }
  if (daysLeft < 0) return `${deadline.label}（受付中・${formatYmd(deadline.endDate ?? deadline.date)}まで）`;
  if (daysLeft === 0) return `今日: ${deadline.label}`;
  if (daysLeft === 1) return `明日: ${deadline.label}`;
  return `${deadline.label}まで あと${daysLeft}日（${formatYmd(deadline.date)}）`;
}

function detailOf({ deadline }: ActionItem): string | undefined {
  const parts = [
    deadline.time,
    deadline.place,
    deadline.needs?.length ? `必要なもの: ${deadline.needs.join("、")}` : undefined,
    deadline.intent ? `そのときしたいこと: ${deadline.intent}` : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join("・") : undefined;
}

function fromItem(item: ActionItem, overdue: boolean): Candidate {
  return {
    id: item.deadline.id,
    type: "deadline",
    isEvent: item.deadline.kind === "event",
    daysLeft: item.daysLeft,
    urgent: overdue || item.daysLeft <= URGENT_DAYS,
    overdue,
    title: titleOf(item, overdue),
    detail: detailOf(item),
    why: item.deadline.leadReason,
    documentId: item.document.id,
    documentTitle: item.document.title,
    location: item.deadline.source?.location,
  };
}

/** ひとことの候補をすべて作る（決まった計算） */
export function buildCandidates(household: Household, today: Date): Candidate[] {
  const { soon, overdue, missing } = buildHome(household, today);
  return [
    ...overdue.map((i) => fromItem(i, true)),
    ...soon.map((i) => fromItem(i, false)),
    ...missing.map((e) => ({
      id: `missing:${e.id}`,
      type: "missing" as const,
      daysLeft: 0,
      urgent: false,
      overdue: false,
      title: `${e.label}がまだ届いていません`,
      why: e.hint,
    })),
  ];
}

export interface BriefingItem {
  candidateId: string;
  isEvent?: boolean;
  text: string;
  detail?: string;
  why?: string;
  documentId?: string;
  documentTitle?: string;
  location?: string;
}

export interface Briefing {
  /** claude: Claude が選んで言葉にした ／ provisional: Claude の準備中に、コードで期日の近い順に並べた仮のもの */
  source: "claude" | "provisional";
  items: BriefingItem[];
}

const priority = (c: Candidate) => (c.overdue ? 0 : c.urgent ? 1 : c.type === "missing" ? 2 : 3);

/** Claude の準備中に使う、仮のひとこと（期日の近い順に3件。Claude は使っていない） */
export function provisionalBriefing(candidates: Candidate[], limit = 3): Briefing {
  const items = [...candidates]
    .sort((a, b) => priority(a) - priority(b) || a.daysLeft - b.daysLeft)
    .slice(0, limit)
    .map((c) => ({
      candidateId: c.id,
      isEvent: c.isEvent,
      text: c.title,
      detail: c.detail,
      why: c.why,
      documentId: c.documentId,
      documentTitle: c.documentTitle,
      location: c.location,
    }));
  return { source: "provisional", items };
}

/** 安全網: 締切が近い・過ぎたのに、ひとことに入っていないもの */
export function safetyNet(candidates: Candidate[], briefing: Briefing): Candidate[] {
  const said = new Set(briefing.items.map((i) => i.candidateId));
  return candidates.filter((c) => c.urgent && !said.has(c.id));
}

/** まだ答えていない質問 */
export function openQuestions(household: Household): ButlerQuestion[] {
  const ids = new Set(household.documents.map((d) => d.id));
  return (household.questions ?? []).filter(
    (q) => !q.answeredAt && ids.has(q.documentId) && (!q.targetDocumentId || ids.has(q.targetDocumentId)),
  );
}

/** 同じ種類かどうかを見るために、年・年度・空白・かっこ書きを取り除く */
const kindKey = (doc: DocumentRecord) =>
  (doc.docType || doc.title)
    .replace(/[（(].*?[)）]/g, "")
    .replace(/(令和|平成)?[0-9０-９]+年度?/g, "")
    .replace(/\s|表$/g, "");

const startOf = (doc: DocumentRecord) => doc.validFrom ?? doc.createdAt.slice(0, 10);

/**
 * 新しい書類を確定したとき、同じ種類・同じ人の古い書類があれば「前のものにしますか？」と聞く（決まった形）。
 * 去年の年間行事予定を見てしまう、といった年度の取り違えを防ぐため。決めるのは本人。
 */
export function supersedeQuestions(household: Household, doc: DocumentRecord, newId: (p: string) => string): ButlerQuestion[] {
  const asked = new Set(
    (household.questions ?? []).filter((q) => q.about === "supersede" && q.documentId === doc.id).map((q) => q.targetDocumentId),
  );
  const overlap = (a: string[], b: string[]) => (a.length === 0 && b.length === 0) || a.some((id) => b.includes(id));
  return household.documents
    .filter(
      (old) =>
        old.id !== doc.id &&
        old.confirmedAt &&
        !old.supersededBy &&
        !asked.has(old.id) &&
        kindKey(old) === kindKey(doc) &&
        overlap(old.memberIds, doc.memberIds) &&
        startOf(old) <= startOf(doc),
    )
    .map((old) => ({
      id: newId("q"),
      documentId: doc.id,
      about: "supersede" as const,
      targetDocumentId: old.id,
      text: `前の「${old.title}${old.periodLabel ? `（${old.periodLabel}）` : ""}」は、前のものにしますか？`,
      reason: `同じ種類の「${doc.title}${doc.periodLabel ? `（${doc.periodLabel}）` : ""}」が新しく届いたためです。前のものにすると、ひとこと・予定の根拠に使わなくなります（書類は残ります）。`,
      options: [
        { label: "前のものにする", value: "replace" },
        { label: "別の書類なので両方使う", value: "keep" },
      ],
      multiple: false,
    }));
}

/** 書類を確定する。同じ種類の古い書類があれば、前のものにするかを聞く */
export function confirmDocument(household: Household, docId: string, newId: (p: string) => string): Household {
  const doc = household.documents.find((d) => d.id === docId);
  if (!doc) return household;
  const confirmed = { ...doc, confirmedAt: new Date().toISOString() };
  return {
    ...household,
    documents: household.documents.map((d) => (d.id === docId ? confirmed : d)),
    questions: [...(household.questions ?? []), ...supersedeQuestions(household, confirmed, newId)],
  };
}

/** 質問に答える。答えは書類に入れる（誰の書類か・本人の答え） */
export function answerQuestion(household: Household, questionId: string, values: string[]): Household {
  const question = household.questions?.find((q) => q.id === questionId);
  if (!question || values.length === 0) return household;
  const now = new Date().toISOString();
  const documents = household.documents.map((doc) => {
    if (question.about === "supersede") {
      return doc.id === question.targetDocumentId && values.includes("replace")
        ? { ...doc, supersededBy: question.documentId }
        : doc;
    }
    if (doc.id !== question.documentId) return doc;
    if (question.about === "members") {
      const ids = values.includes("all") ? household.members.map((m) => m.id) : values;
      const old = doc.memberIds.join(",");
      return {
        ...doc,
        memberIds: ids,
        // 書類と同じ人になっていた予定は、一緒に直す（きまりで別の人にしたものはそのまま）
        deadlines: doc.deadlines.map((d) => (d.memberIds.join(",") === old ? { ...d, memberIds: ids } : d)),
      };
    }
    const labels = question.options.filter((o) => values.includes(o.value)).map((o) => o.label);
    return {
      ...doc,
      fields: [
        ...doc.fields,
        {
          key: `answer-${question.id}`,
          label: question.text,
          value: labels.join("、"),
          source: { location: "本人の答え（執事の質問）" },
          status: "confirmed" as const,
        },
      ],
    };
  });
  return {
    ...household,
    documents,
    questions: (household.questions ?? []).map((q) =>
      q.id === questionId ? { ...q, answer: values, answeredAt: now } : q,
    ),
  };
}

/** 予定・やることを「済んだ」にする／戻す */
export function toggleDone(household: Household, id: string): Household {
  const done = { ...(household.done ?? {}) };
  if (done[id]) delete done[id];
  else done[id] = new Date().toISOString();
  return { ...household, done };
}
