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
  /** 担当の候補（大人の家族）。言葉ごとの呼び名。「○○がやる」のボタンになる */
  takers: Partial<Record<LanguageCode, string>>[];
}

/** 担当のボタンの印（Telegram の callback_data は 64 バイトまで）: "t:" + 言葉ごとの呼び名を | でつなぐ */
export function takerData(names: Partial<Record<LanguageCode, string>>): string {
  const parts = LANGUAGES.map((l) => (names[l.code] ?? "").replace(/[|:]/g, ""));
  let out = `t:${parts.join("|")}`;
  while (new TextEncoder().encode(out).length > 64) out = out.slice(0, -1);
  return out;
}

export function takerNames(data: string): Partial<Record<LanguageCode, string>> {
  const parts = data.replace(/^t:/, "").split("|");
  const out: Partial<Record<LanguageCode, string>> = {};
  LANGUAGES.forEach((l, i) => {
    if (parts[i]) out[l.code] = parts[i];
  });
  return out;
}

export function takerButton(names: Partial<Record<LanguageCode, string>>): string {
  const ja = names.ja ?? "";
  const vi = names.vi ?? ja;
  return `${ja}がやる / ${vi} sẽ lo`;
}

const mark = (c: LanguageCode) => `【${LANGUAGES.find((l) => l.code === c)?.native ?? c}】`;

export function composeTell(p: TellPayload): string {
  const parts = [TELL_HEAD];
  // 受け取る家族の言葉（日本語以外）を先に: スマホの通知の最初の数行に、その人の言葉で要点が入る
  const blocks = [...p.blocks].sort((a, b) => (a.lang === "ja" ? 1 : 0) - (b.lang === "ja" ? 1 : 0));
  blocks.forEach((b, i) => parts.push(...(i ? [""] : []), mark(b.lang), b.title, ...b.lines.map((l) => `・${l}`)));
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


