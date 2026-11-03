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

export const languageLabel = (code: LanguageCode) => {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? (l.native === l.label ? l.label : `${l.label}（${l.native}）`) : code;
};
