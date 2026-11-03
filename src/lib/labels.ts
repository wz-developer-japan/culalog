import type { DeadlineKind, DocumentCategory } from "./types";

export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  school: "学校",
  childcare: "保育園・幼稚園",
  housing: "住まい",
  insurance: "保険",
  vehicle: "車・自転車",
  medical_card: "医療証・保険証",
  care: "介護",
  license: "免許・資格",
  subscription: "契約・サブスク",
  work: "勤務先",
  community: "地域・町内会",
  medical: "病院・健診",
  other: "そのほか",
};

export const DEADLINE_KIND_LABELS: Record<DeadlineKind, string> = {
  expiry: "満了日・更新日",
  window: "受付期間",
  notice: "申し出の締切",
  cancel_window: "解約できる時期",
  after_event: "何か起きたあとの期限",
  event: "予定・行事",
  due: "提出・申込・支払いの締切",
};

/** 期限の種類ごとの、動き始める日の目安（日数）。登録時の初期値に使う */
export const DEFAULT_LEAD_DAYS: Record<DeadlineKind, number> = {
  expiry: 60,
  window: 7,
  notice: 30,
  cancel_window: 14,
  after_event: 0,
  event: 21,
  due: 7,
};

/** 期間（開始日と終了日）を持つ種類 */
export const RANGE_KINDS: DeadlineKind[] = ["window", "cancel_window"];

export const RELATION_LABELS: Record<import("./types").Relation, string> = {
  self: "あなた",
  spouse: "配偶者",
  child: "子",
  parent: "親",
  sibling: "きょうだい",
  other: "そのほか",
};

/**
 * 画面に出す分類の言葉（アプリ全体で1系統・6語）。読み取りの種類（13種・DocumentCategory）はそのまま残し、
 * 見せるときにこの6語へ写す。1つの書類が2つの分類に出ることがある（賃貸は「暮らし」と「契約」など）。
 * 書類の中身を判断するものではなく、一覧で探しやすくするための並べ方。
 */
export const GROUPS = ["暮らし", "お金", "子どもと学校", "けがと病院", "契約", "手続き"] as const;
export type Group = (typeof GROUPS)[number];

/** 13種 → 6語の写し（先頭がカードに出す分類） */
export const CATEGORY_GROUPS: Record<DocumentCategory, Group[]> = {
  school: ["子どもと学校"],
  childcare: ["子どもと学校"],
  housing: ["暮らし", "契約"],
  insurance: ["契約", "お金", "けがと病院"],
  vehicle: ["手続き", "暮らし"],
  medical_card: ["けがと病院", "手続き"],
  care: ["手続き", "けがと病院"],
  license: ["手続き"],
  subscription: ["契約", "お金"],
  work: ["手続き", "お金"],
  community: ["暮らし"],
  medical: ["けがと病院"],
  other: ["暮らし"],
};

/** 書類の分類（先頭が主）。題名・種類に お金の言葉（税・納付・請求・料金・給付・手当・年金・口座）があれば「お金」も足す */
export function groupsOf(doc: { category: DocumentCategory; title?: string; docType?: string }): Group[] {
  const groups = [...CATEGORY_GROUPS[doc.category]];
  if (!groups.includes("お金") && /税|納付|請求|料金|給付|手当|年金|口座|支払/.test(`${doc.title ?? ""} ${doc.docType ?? ""}`)) groups.push("お金");
  return groups;
}
