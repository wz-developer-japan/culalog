// CULALOG のデータの形。
// 方針: 書類から取り出した値には必ず「原本のどこに書いてあったか」を付け、
// 本人が確認したものだけを「確定」として扱う。アプリは判断（補償される・解約してよい等）を持たない。

export type Relation = "self" | "spouse" | "child" | "parent" | "sibling" | "other";

export interface FamilyMember {
  id: string;
  name: string;
  relation: Relation;
  /** 表示用の補足（例: 「小学3年」「遠方に住む」） */
  note?: string;
}

/** 原本のどこに書いてあったか */
export interface SourceRef {
  /** 例: 「第5条」「裏面」「2ページ目 上段」 */
  location: string;
  /** 原文の抜き書き（短く） */
  quote?: string;
}

export type FieldStatus = "draft" | "confirmed";

export interface Field {
  key: string;
  label: string;
  value: string;
  source?: SourceRef;
  status: FieldStatus;
}

export interface Contact {
  label: string;
  name: string;
  phone?: string;
  hours?: string;
  source?: SourceRef;
}

/**
 * 期限の種類。
 * - expiry:        満了日・更新日（保険、賃貸、車検、免許）
 * - window:        受付期間（この期間しか手続きできない）
 * - notice:        解約・変更の申し出の締切（「○日前までに」）
 * - cancel_window: 解約できる時期が限られている（更新月だけ等）
 * - after_event:   出来事のあとに来る期限（事故の連絡、請求期限）。普段は出さない
 * - event:         期限ではない予定（行事・休み）。自分以外の予定を含む
 */
export type DeadlineKind = "expiry" | "window" | "notice" | "cancel_window" | "after_event" | "event";

export interface Deadline {
  id: string;
  kind: DeadlineKind;
  label: string;
  /** 対象日（window / cancel_window は開始日） YYYY-MM-DD */
  date: string;
  /** window / cancel_window の終了日 YYYY-MM-DD */
  endDate?: string;
  /** 何日前から動き始めるか（準備にかかる時間・自分の申請の締切などから決める） */
  leadDays: number;
  /** 動き始める理由（例: 「有給の申請は1週間前まで」） */
  leadReason?: string;
  /** 誰に関係するか */
  memberIds: string[];
  /** 本人の意向（例: 「次の更新月に解約したい」） */
  intent?: string;
  source?: SourceRef;
}

/** 来るはずの書類（例: 年間行事予定に運動会がある → 案内プリントが来るはず） */
export interface ExpectedDocument {
  id: string;
  label: string;
  /** この日までに届いていなければ声をかける YYYY-MM-DD */
  expectedBy: string;
  /** 届いたら登録される書類の ID */
  receivedDocumentId?: string;
  /** どの予定から期待しているか */
  relatedDeadlineId?: string;
  hint?: string;
  /** デモ用: まだ届いていない書類の架空の見本（読み取りを試すため） */
  sample?: {
    title: string;
    text: string;
    /** 読み取り機能の準備中に使う、この見本の仮の読み取り結果（Claude は使っていない） */
    provisionalDraft?: import("./extraction").Extraction;
  };
}

export type DocumentCategory =
  | "school"
  | "childcare"
  | "housing"
  | "insurance"
  | "vehicle"
  | "medical_card"
  | "care"
  | "license"
  | "subscription"
  | "other";

export type DocumentOrigin = "manual" | "photo" | "pdf" | "conversation" | "demo";

export interface DocumentRecord {
  id: string;
  title: string;
  category: DocumentCategory;
  /** 誰の書類か */
  memberIds: string[];
  origin: DocumentOrigin;
  /** 現物のしまい場所 */
  storageLocation?: string;
  /** 原本の文字起こし（デモの架空書類や、読み取った書類の本文） */
  originalText?: string;
  /** 読み取りに使った写真・PDF（端末の中にだけ置く。見比べるときに表示する） */
  originalFile?: { mediaType: string; dataUrl: string };
  /**
   * 下書きの出どころ。
   * - claude:      Claude が原本から読み取った
   * - provisional: 読み取り機能の準備中に使う、決め打ちの仮の結果（Claude は使っていない）
   */
  draftSource?: "claude" | "provisional";
  /** 読み取りで、読めなかった・はっきりしなかった箇所 */
  unclear?: string[];
  /** この書類が「来るはずの書類」のどれに当たるか。確定すると「来ていないもの」から消える */
  expectedId?: string;
  fields: Field[];
  contacts: Contact[];
  deadlines: Deadline[];
  createdAt: string;
  /** 本人が原本と見比べて確定した日時。未確定の書類はホームの計算に使わない */
  confirmedAt?: string;
}

/** 曜日ごとの授業（③今日の時間割） 0=日 … 6=土 */
export interface SchoolDaySchedule {
  memberId: string;
  weekday: number;
  periods: number;
  /** 下校のおおよその時刻 HH:MM */
  dismissal: string;
}

export interface Household {
  members: FamilyMember[];
  documents: DocumentRecord[];
  expected: ExpectedDocument[];
  timetable: SchoolDaySchedule[];
  isDemo: boolean;
}
