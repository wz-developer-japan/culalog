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
