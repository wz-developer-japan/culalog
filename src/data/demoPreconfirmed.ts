// 「架空の家族で試す」で、最初から確定済みにしておく書類。
// 写真・メールの見本（photoSamples.json）のうち、この家でもう預かっている想定のものを、
// 用意しておいた仮の読み取り結果（中身を確かめた架空の書類）のまま、確定した書類にする。
// 見本の日付は撮影日を基準にしていて開いた日に合わせて動かないので、開いた日より前の予定は「済んだ」にしておく。

import { extractionToDocument } from "@/lib/extraction";
import { toYmd } from "@/lib/deadlines";
import type { DemoSample, DocumentRecord, FamilyMember } from "@/lib/types";
import type { Extraction } from "@/lib/extraction";
import savedReadingsJson from "./savedReadings.json";

/**
 * 看板の書類は、仮の読み取り結果ではなく、11/6 に本物の Claude（本番の /api/extract）が読んだ結果を保存したものを使う。
 * 中身は読み取りのまま（正解と違う所も手で直さない）。読み直しはしない（開くたびに Claude を呼ばない）
 */
const SAVED_READINGS = savedReadingsJson as unknown as Record<string, { readAt: string; model: string; reading: Extraction }>;
/**
 * 保存した読み取りを使う見本（savedReadings.json にあっても、ここに無いものは仮の読み取り結果のまま）。
 * 勤務カレンダー（photo-w12）は入れない: 本物の読み取りには「出勤日（土曜）11/21」の予定が無く、
 * 土曜の出勤日・休日の候補日の気づき（同じ日の結果）が変わるため。読み取りは savedReadings.json に残してある
 */
export const SAVED_READING_IDS = new Set(["photo-o9-sankan-annai"]);

/** 最初から預かっている見本と、現物のしまい場所 */
const PRECONFIRMED: Record<string, string> = {
  // タオ（旧姓が書いてある年金手帳・雇用保険・免許のはがきは、名前が合わないので入れない）
  "photo-w12-misaki-calendar": "冷蔵庫の横（壁）",
  "photo-j2-genkyo": "本棚の保育園のファイル",
  // 翔太
  "photo-p1-kyuyo-meisai": "書斎の机の引き出し",
  "photo-t5-gensen": "書斎の机の引き出し（税金のファイル）",
  "photo-t1-juminzei": "書斎の机の引き出し（税金のファイル）",
  "photo-t6-furusato": "書斎の机の引き出し（税金のファイル）",
  "photo-o5-seiho-kojo": "書斎の机の引き出し（税金のファイル）",
  "photo-r2-nenkin-shota": "寝室の引き出し（大事な書類のファイル）",
  "photo-m3-byoin-yoyaku": "財布の中",
  // 家族みんな（住まい・車）
  "photo-h7-electric": "本棚の住まいのファイル",
  "photo-h8-internet": "本棚の住まいのファイル",
  "photo-g1-aircon-hosho": "本棚の取扱説明書の箱",
  "photo-g2-kyutoki-hosho": "本棚の取扱説明書の箱",
  "photo-l1-shobo-tenken": "（マンションの掲示板。写真だけ）",
  "photo-v2-shakensho": "車のダッシュボード",
  "photo-v3-jidosha-hoken": "本棚の保険のファイル",
  // ごみの収集日は毎週のきまりとして項目に入っているので、日ごとの予定にはしない（年末年始の収集休みだけ予定に）
  "photo-h9-garbage": "冷蔵庫の扉（磁石）",
  // 蓮
  "photo-j1-gakudo": "冷蔵庫の扉（磁石）",
  "photo-j3-swimming": "冷蔵庫の扉（磁石）",
  "photo-k6-dental": "ランドセルの連絡袋",
  "photo-m2-shika-yoyaku": "母子手帳ケースの中（玄関の棚）",
  // 結衣
  "photo-i10-kodomo-insurance": "本棚の保険のファイル",
  "photo-n4-photo-sale": "保育園のお便り袋",
  "photo-n3-kondate": "冷蔵庫の扉（磁石）",
  // 授業参観（11/27 金・平日）。タオさんの出勤日（勤務カレンダー）と同じ日 → 同じ日のぶつかりの気づきが最初からトップに出る
  "photo-o9-sankan-annai": "ランドセルの連絡袋",
  // 保育園のうんどうかい（11/21 土）。家族みんなで行く行事なので、ぶつかりの気づきは出さない（書類としては預かっている）
  "photo-n5-undokai": "冷蔵庫の扉（磁石）",
  "photo-o7-risu-dayori": "本棚の保育園のファイル",
  // 保育園の連絡アプリのお知らせ（11/19 木・親子で登園）。保護者が行くが「保育参加」なので、同じ日のぶつかりの気づきは出さない
  "photo-n1-app-notice": "（保育園の連絡アプリ。スクショだけ）",
  // 家族みんな（地域）: 町内会の回覧（一斉清掃 11/29 日・12月のごみ集積所の当番）
  "photo-f-community-cleanup": "（回覧板。次の家へ回した。写真だけ）",
};

export const PRECONFIRMED_SAMPLE_IDS = new Set(Object.keys(PRECONFIRMED));

/** 書類が少ない状態（/?demo=few）でも最初から預かっている見本: タオさんの勤務カレンダーだけ（授業参観の案内を渡すと、同じ日の出勤日に気づける） */
export const FEW_PRECONFIRMED_IDS = new Set(["photo-w12-misaki-calendar"]);

export function preconfirmedDocuments(
  samples: DemoSample[],
  members: FamilyMember[],
  today: Date,
  ids: Set<string> = PRECONFIRMED_SAMPLE_IDS,
): { documents: DocumentRecord[]; done: Record<string, string> } {
  const createdAt = today.toISOString();
  const todayYmd = toYmd(today);
  const done: Record<string, string> = {};
  const documents = samples
    .filter((s) => ids.has(s.id))
    .map((s) => {
      let n = 0;
      const newId = (prefix: string) => `${prefix}-${s.id.replace(/^photo-/, "")}-${++n}`;
      const isMail = s.origin === "text" || !s.images?.length;
      const saved = SAVED_READING_IDS.has(s.id) ? SAVED_READINGS[s.id] : undefined;
      const { document } = extractionToDocument(saved?.reading ?? s.provisionalDraft, {
        id: `doc-${s.id.replace(/^photo-/, "")}`,
        origin: isMail ? "text" : "photo",
        draftSource: saved ? "saved" : "provisional",
        members,
        originalText: s.text,
        originalFile: isMail ? undefined : { mediaType: "image/png", dataUrl: s.images![0] },
        newId,
      });
      if (s.id === "photo-h9-garbage") document.deadlines = document.deadlines.filter((d) => /年末年始/.test(d.label));
      const pages = isMail ? [] : s.images!.slice(1).map((dataUrl) => ({ mediaType: "image/png", dataUrl }));
      // 開いた日より前の予定は、もう済んだ（終わった）ものとして扱う
      for (const d of document.deadlines) if ((d.endDate ?? d.date) < todayYmd) done[d.id] = createdAt;
      return {
        ...document,
        storageLocation: PRECONFIRMED[s.id],
        savedReading: saved ? { readAt: saved.readAt, model: saved.model } : undefined,
        originalPages: pages.length ? pages : undefined,
        fields: document.fields.map((f) => ({ ...f, status: "confirmed" as const })),
        createdAt,
        confirmedAt: createdAt,
      };
    });
  return { documents, done };
}
