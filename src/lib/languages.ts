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

export const languageLabel = (code: LanguageCode) => {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? (l.native === l.label ? l.label : `${l.label}（${l.native}）`) : code;
};
