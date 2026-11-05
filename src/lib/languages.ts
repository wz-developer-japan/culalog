// 家族ひとりずつの「読みたい言葉」。国籍ではなく、その人が読みたい言葉を選ぶ。
// 訳すのは、共有した書類の説明・締切・持ち物・やること・執事のひとこと（画面の飾りまでは訳さない）。

import type { FamilyMember } from "./types";

export type LanguageCode = "ja" | "vi" | "ja-easy";

export const LANGUAGES: { code: LanguageCode; label: string; native: string }[] = [
  { code: "ja", label: "日本語", native: "日本語" },
  { code: "vi", label: "ベトナム語", native: "Tiếng Việt" },
  { code: "ja-easy", label: "やさしい日本語", native: "やさしい にほんご" },
];

export const languageOf = (m: FamilyMember | undefined): LanguageCode => m?.language ?? "ja";

/**
 * ベトナム語の文の日付の書き方（Claude に頼む指示文に入れる）。ベトナム語は日/月、日本語は月/日。
 * 同じ家族の中で「9/11」が11月9日にも9月11日にも読めないように、そろえる
 */
export const VI_DATE_RULE =
  "ベトナム語の文の日付は、必ず日/月の順（ベトナム式）で書く。例: 11月9日 → 9/11、11月27日 → 27/11、12月1日 → 1/12。曜日はベトナム語で後ろに（例: 27/11 (thứ Sáu)）。日本語の曜日（金）は付けない。原文が「11/27」のような月/日でも、ベトナム語では 27/11 に直す。日本語・やさしい日本語の文の日付は月/日のまま（11/27（金））。";

/**
 * 執事がベトナム語で話すときの呼び方（よしふみの決め 11/05）。自分は「tôi」、相手は「bạn」に固定。
 * 相手の呼び方（anh/chị/em）に合わせて変えない。家族の言葉を訳すとき（グループの通訳・伝言の本文）は元の言い方のまま
 */
export const VI_VOICE_RULE =
  "ベトナム語で執事として話すときは、自分を必ず「tôi」、相手を必ず「bạn」と呼ぶ（例: Tôi đã xem giấy tờ. Bạn cần gì cứ nhắn tôi nhé.）。相手が自分を anh・chị・em などで呼んでも合わせない。em・anh・chị・cô・chú・mình・con で自分や相手を呼ばない。「Dạ」「ạ」も付けない。";

export const languageLabel = (code: LanguageCode) => {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? (l.native === l.label ? l.label : `${l.label}（${l.native}）`) : code;
};
