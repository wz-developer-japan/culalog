// 「架空の家族で試す」で、最初から確定済みにしておく書類。
// 写真・メールの見本（photoSamples.json）のうち、この家でもう預かっている想定のものを、
// 用意しておいた仮の読み取り結果（中身を確かめた架空の書類）のまま、確定した書類にする。
// 見本の日付は撮影日を基準にしていて開いた日に合わせて動かないので、開いた日より前の予定は「済んだ」にしておく。

import { extractionToDocument } from "@/lib/extraction";
import { toYmd } from "@/lib/deadlines";
import type { DemoSample, DocumentRecord, FamilyMember } from "@/lib/types";

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
  // 保育園のうんどうかい（11/21 土）。タオさんの勤務カレンダーの出勤日と同じ日（同じ日のぶつかりの気づきが出る）
  "photo-n5-undokai": "冷蔵庫の扉（磁石）",
  "photo-o7-risu-dayori": "本棚の保育園のファイル",
};

export const PRECONFIRMED_SAMPLE_IDS = new Set(Object.keys(PRECONFIRMED));

export function preconfirmedDocuments(
  samples: DemoSample[],
  members: FamilyMember[],
  today: Date,
): { documents: DocumentRecord[]; done: Record<string, string> } {
  const createdAt = today.toISOString();
  const todayYmd = toYmd(today);
  const done: Record<string, string> = {};
  const documents = samples
    .filter((s) => PRECONFIRMED_SAMPLE_IDS.has(s.id))
    .map((s) => {
      let n = 0;
      const newId = (prefix: string) => `${prefix}-${s.id.replace(/^photo-/, "")}-${++n}`;
      const isMail = s.origin === "text" || !s.images?.length;
      const { document } = extractionToDocument(s.provisionalDraft, {
        id: `doc-${s.id.replace(/^photo-/, "")}`,
        origin: isMail ? "text" : "photo",
        draftSource: "provisional",
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
        originalPages: pages.length ? pages : undefined,
        fields: document.fields.map((f) => ({ ...f, status: "confirmed" as const })),
        createdAt,
        confirmedAt: createdAt,
      };
    });
  return { documents, done };
}
