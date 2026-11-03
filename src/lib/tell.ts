// 「家族に伝える」: 共有した書類のまとめを、家族それぞれの言葉で Telegram のグループに送る文。
// アプリ（端末）で中身を作り、送る前に画面で全部見せる。サーバーは形を整えて送るだけ（保存しない）。

import { LANGUAGES, type LanguageCode } from "./languages";

export const TELL_HEAD = "📄 CULALOG｜家族へのお知らせ";

export interface TellBlock {
  lang: LanguageCode;
  title: string;
  lines: string[];
}

export interface TellPayload {
  blocks: TellBlock[];
  /** 原本の場所と引用（日本語のまま）。執事が返信の質問に答えるときの根拠 */
  sources: string[];
  /** 書類を持っている人の呼び名（「書類は○○さんの端末の中」） */
  holder: string;
}

const mark = (c: LanguageCode) => `【${LANGUAGES.find((l) => l.code === c)?.native ?? c}】`;

export function composeTell(p: TellPayload): string {
  const parts = [TELL_HEAD];
  for (const b of p.blocks) parts.push("", mark(b.lang), b.title, ...b.lines.map((l) => `・${l}`));
  if (p.sources.length) parts.push("", `— 原本（書類は${p.holder}さんの端末の中）`, ...p.sources.map((s) => `・${s}`));
  parts.push("", "質問は、このメッセージに返信してください。担当を決めたら下のボタンを。");
  return parts.join("\n");
}

/** 送ったお知らせの文から、言葉ごとの題名を取り出す（担当が決まったときの文に使う） */
export function titlesOf(text: string): Partial<Record<LanguageCode, string>> {
  const lines = text.split("\n");
  const out: Partial<Record<LanguageCode, string>> = {};
  for (const l of LANGUAGES) {
    const i = lines.indexOf(mark(l.code));
    if (i >= 0 && lines[i + 1]) out[l.code] = lines[i + 1];
  }
  return out;
}

export const TAKE_TEXT: Record<LanguageCode, (name: string, title: string) => string> = {
  ja: (name, title) => `${name}さんが担当します：${title}`,
  "ja-easy": (name, title) => `${name}さんが します：${title}`,
  vi: (name, title) => `${name} sẽ phụ trách: ${title}`,
};

export const TAKE_BUTTON = "私がやる / Tôi sẽ lo";
