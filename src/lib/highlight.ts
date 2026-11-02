// 蛍光ペン: 読み取った項目の「原文の抜き書き」を、原本の文字の中からコードで探して印を付ける。
// 空白・改行の違いは無視して探す。見つからなかった抜き書きは「見つかりませんでした」と正直に出す。

export interface Mark {
  /** 印の ID（項目の側から、ここへ飛ぶため） */
  id: string;
  start: number;
  end: number;
}

export interface Segment {
  text: string;
  markIds: string[];
}

const isSpace = (ch: string) => /\s/.test(ch);

/** text の中で quote がある範囲（空白は無視）。無ければ undefined */
export function findQuote(text: string, quote: string): { start: number; end: number } | undefined {
  const q = [...quote].filter((c) => !isSpace(c)).join("");
  if (!q) return undefined;
  // 空白を除いた文字と、元の位置の対応
  const chars: string[] = [];
  const pos: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (!isSpace(text[i])) {
      chars.push(text[i]);
      pos.push(i);
    }
  }
  const at = chars.join("").indexOf(q);
  if (at < 0) return undefined;
  return { start: pos[at], end: pos[at + q.length - 1] + 1 };
}

/** 原本の文字を、印の付いた区切りに分ける */
export function segments(text: string, marks: Mark[]): Segment[] {
  const cuts = new Set([0, text.length]);
  for (const m of marks) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  const points = [...cuts].sort((a, b) => a - b);
  const out: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [s, e] = [points[i], points[i + 1]];
    out.push({ text: text.slice(s, e), markIds: marks.filter((m) => m.start <= s && m.end >= e).map((m) => m.id) });
  }
  return out;
}
