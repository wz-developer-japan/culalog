// CULALOG のデータの形。
// 方針: 書類から取り出した値には必ず「原本のどこに書いてあったか」を付け、
// 本人が確認したものだけを「確定」として扱う。アプリは判断（補償される・解約してよい等）を持たない。

import type { AskRecord } from "./ask";
import type { ButlerSettings } from "./character";
import type { ConnectResult } from "./connect";
import type { Extraction } from "./extraction";
import type { InboxItem, Learned } from "./inbox";

export type Relation = "self" | "spouse" | "child" | "parent" | "sibling" | "other";

export interface FamilyMember {
  id: string;
  name: string;
  relation: Relation;
  /** 表示用の補足（例: 「小学3年」「遠方に住む」） */
  note?: string;
  /** 選択肢に添える短い続柄（例: 「祖父」「叔母」）。無ければ続柄から決める */
  roleLabel?: string;
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
 * 予定・やること（共通の形: いつ・誰の・何を・どこで・何が必要・原本のどこ）。
 * 期限の種類。
 * - expiry:        満了日・更新日（保険、賃貸、車検、免許）
 * - window:        受付期間（この期間しか手続きできない）
 * - notice:        解約・変更の申し出の締切（「○日前までに」）
 * - cancel_window: 解約できる時期が限られている（更新月だけ等）
 * - after_event:   出来事のあとに来る期限（事故の連絡、請求期限）。普段は出さない
 * - event:         期限ではない予定（行事・休み・健診）。自分以外の予定を含む
 * - due:           提出・申し込み・支払いの締切（問診票の提出、参加の申し込み）
 */
export type DeadlineKind = "expiry" | "window" | "notice" | "cancel_window" | "after_event" | "event" | "due";

export interface Deadline {
  id: string;
  kind: DeadlineKind;
  label: string;
  /** 対象日（window / cancel_window は開始日） YYYY-MM-DD */
  date: string;
  /** window / cancel_window の終了日 YYYY-MM-DD */
  endDate?: string;
  /** 時刻（例: 「8:40」「13:00〜13:30」） */
  time?: string;
  /** どこで */
  place?: string;
  /** 何が必要か（持ち物・書類・お金） */
  needs?: string[];
  /** 何か月ごとに繰り返すか（例: 自動更新の契約の「解約できる期間」が2年ごと → 24）。過ぎたら次の回を計算する */
  repeatMonths?: number;
  /** 何日前から動き始めるか（準備にかかる時間・自分の申請の締切などから決める） */
  leadDays: number;
  /** 動き始める理由（例: 「有給の申請は1週間前まで」） */
  leadReason?: string;
  /** 誰に関係するか */
  memberIds: string[];
  /** 本人の意向（例: 「次の更新月に解約したい」） */
  intent?: string;
  source?: SourceRef;
  /** この予定に当てはめる「わが家のきまり」の ID（例: 有給の申請）。締切はきまりから毎回計算する */
  applyRuleIds?: string[];
  /** 雨天・延期の予備日や振替日（本番の予定とつながっている） */
  reserve?: ReserveDay;
  /**
   * 知っておくだけ（自動で引き落とされる・自動で更新される など、本人が動かなくても困らないもの）。
   * ホームのひとこと・期限の知らせには出さず、すべての予定・書類の画面で見られるだけ
   */
  awareness?: boolean;
  /** 同じ予定を知らせる別の書類（初回・督促・前日通知のメールなど）と束ねるための印。同じ印の予定は、ホームでは1件にまとめる */
  bundleKey?: string;
}

/** 予備日・振替日。本番の予定にぶら下がり、きまりも別に当てはめられる */
export interface ReserveDay {
  /** YYYY-MM-DD */
  date: string;
  /** どんなときか（例: 「雨天の場合」） */
  condition?: string;
  source?: SourceRef;
  /** 予備日にも当てはめる「わが家のきまり」の ID（採用するのは本人） */
  applyRuleIds?: string[];
}

/**
 * わが家のきまり（書類には書いていない、その家の事情）。
 * 例: 勤務先のきまりで、有給の申請は遅くとも1週間前まで。
 * 予定に当てはめると、予定の日から逆算した締切が出る。
 */
export interface HouseRule {
  id: string;
  /** 例: 「有給の申請（勤務先）」 */
  label: string;
  /** 予定の何日前までか */
  daysBefore: number;
  /** 誰のきまりか */
  memberId: string;
  /** 例: 「勤務先のきまりで、遅くとも1週間前まで」 */
  note?: string;
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
}

/** デモ用: 読み取りを試すための架空の書類の見本 */
export interface DemoSample {
  id: string;
  title: string;
  text: string;
  /** 「来るはずの書類」に当たる見本なら、その ID */
  expectedId?: string;
  /** 読み取り機能の準備中に使う、この見本の仮の読み取り結果（Claude は使っていない） */
  provisionalDraft: Extraction;
  /** 写真の見本: 画像の場所（何枚かなら1つの書類のページ）。無ければ text をその場で画像にする */
  images?: string[];
  /** 写真の見本の日付の基準日（この日に撮った想定。開いた日に合わせて動かない） */
  baseDate?: string;
}

/**
 * 執事から本人への質問。推測できないことだけを、選択肢で聞く。
 * - members: 誰の書類か。答えは書類の「誰の」に入る
 * - other:   それ以外（例: 何班か）。答えは書類の項目に「本人の答え」として入る
 * - supersede: 同じ種類の新しい書類が来たので、古い方を「前のもの」にするか（答え: replace / keep）
 * - duplicate: 前に渡した書類と同じもの（写真違い）かもしれないので、今回の分を消すか（答え: same / different）
 * - close: 「納付完了」などのお知らせが来たので、つながる予定を済んだにするか（答え: done / keep）
 */
export interface ButlerQuestion {
  id: string;
  documentId: string;
  about: "members" | "other" | "supersede" | "duplicate" | "close";
  /** close: 済んだにするかを聞いている予定（targetDocumentId の書類の中） */
  targetDeadlineId?: string;
  text: string;
  /** members: いちばんありそうな人（大きく出す） */
  guess?: string[];
  /** supersede: 「前のもの」にするかを聞いている古い書類。duplicate: 同じかもしれない前の書類 */
  targetDocumentId?: string;
  /** なぜ聞くのか（例: 対象が生まれ月で書かれていて、誕生日が登録されていない） */
  reason?: string;
  options: { label: string; value: string }[];
  multiple: boolean;
  /** 答えると、どうなるか（1行。無ければ質問の種類から決まった文を出す） */
  effect?: string;
  /** 「あとで答える」を押したら、この日（YYYY-MM-DD）まではホームに出さない */
  laterUntil?: string;
  answer?: string[];
  answeredAt?: string;
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
  | "work"
  | "community"
  | "medical"
  | "other";

/** text: メールの本文などを文字のまま渡したもの（画像は無く、原本は文字だけ） */
export type DocumentOrigin = "manual" | "photo" | "pdf" | "text" | "conversation" | "demo";

export interface DocumentRecord {
  id: string;
  title: string;
  category: DocumentCategory;
  /** 書類の種類の名前（Claude が自由に付ける。例: 「歯科健診のお知らせ」） */
  docType?: string;
  /** 誰の書類か */
  memberIds: string[];
  /** いつの分か（例: 「2026年度」「2026年4月1日〜2027年3月31日」） */
  periodLabel?: string;
  /** 有効な期間の始まり・終わり YYYY-MM-DD（年度・保険期間・契約期間など） */
  validFrom?: string;
  validUntil?: string;
  /** 同じ種類の新しい書類が来て「前のもの」になった（新しい方の ID）。前のものは、ひとこと・予定・チャットの根拠に使わない */
  supersededBy?: string;
  origin: DocumentOrigin;
  /** 現物のしまい場所 */
  storageLocation?: string;
  /** 原本の文字起こし（デモの架空書類や、読み取った書類の本文） */
  originalText?: string;
  /** 読み取りに使った写真・PDF（端末の中にだけ置く。見比べるときに表示する） */
  originalFile?: { mediaType: string; dataUrl: string };
  /** 何ページかの写真を1つの書類として渡したときの、2ページ目から先 */
  originalPages?: { mediaType: string; dataUrl: string }[];
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
  /**
   * 読んだ直後の4行のうち、Claude が書く3行（いつまで？ は予定からコードで出す）。
   * ifIgnored（放置すると？）は、原本に書いてあるときだけ。場所と原文つき。書いていなければ無い
   */
  summary?: DocumentSummary;
  /** 本人が原本と見比べて確定した日時。未確定の書類はホームの計算に使わない */
  confirmedAt?: string;
  /** 読み取りに使ったファイルの指紋（同じ写真をもう一度渡したときに気づくため） */
  fileHash?: string;
  /** この家の書類ではないもの（記入例・見本など）の理由。家族の情報にせず、ひとこと・予定・聞く・つなぐ・大事な番号の根拠に使わない */
  notForFamily?: string;
  /** 本文には無く、リンク先にしか書いていないこと（例: 「金額」「満了日」）。アプリはリンクを開かず、本人に確かめてもらう */
  onlyInLink?: string[];
  /** 何かが済んだことを知らせる記載（納付完了・退会完了など） */
  completions?: { what: string; source: SourceRef; bundleKey?: string }[];
  /** 前に本人が答えたことを当てはめたとき、その説明（例: 「前に教えてもらったので、結衣さんの書類にしました」） */
  learnedNotes?: string[];
}

export interface DocumentSummary {
  /** これは何？（1文） */
  what: string;
  /** 何をする？（1文。書類が求めていること。判断・助言ではない） */
  todo: string;
  /** 放置すると？（原本に書いてある通りに） */
  ifIgnored?: { text: string; source: SourceRef };
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
  /** わが家のきまり（古い保存データには無いことがある） */
  rules?: HouseRule[];
  /** 執事から本人への質問 */
  questions?: ButlerQuestion[];
  /** デモ用の見本の書類 */
  demoSamples?: DemoSample[];
  /** 本人が「済んだ」にした予定・やること（ID → 日時）。きまりから作った締切も含む。済んだものは知らせない */
  done?: Record<string, string>;
  /** 済むまで追いかける: 予定・やることの ID → 何日前の念押しを、いつ最初に出したか（その日だけ、ひとことの上に出す） */
  followUps?: Record<string, { stage: number; shownOn: string }>;
  /** 執事のキャラと名前（無ければ最初のキャラ） */
  butler?: ButlerSettings;
  /** つなぐ＋ひとことの結果（書類を確定したとき・1日1回だけ作って端末に保存） */
  connect?: ConnectResult;
  /** 気づいたことへの本人の答え（鍵 → 採用・違う・分かった） */
  insightAnswers?: Record<string, "adopted" | "rejected" | "seen">;
  /** 執事に頼んだこと（新しい順・端末に保存）。答えが付くまでは「調べています」。頼んで画面を閉じても、次に開いたときに調べて報告に残る */
  asks?: AskRecord[];
  /** まとめて渡した写真・PDF の受け取り箱（ファイルの中身は別の場所に置く）。執事が1枚ずつ読む */
  inbox?: InboxItem[];
  /** 読み取りの上限に当たったとき、この時刻（ISO）までは次を読まない */
  inboxPausedUntil?: string;
  /** 本人が質問に答えて、執事が覚えたこと（同じ種類の書類で二度聞かないため） */
  learned?: Learned[];
  isDemo: boolean;
}
