// 「家族に伝える」: 共有した書類のまとめを、家族それぞれの言葉で、大人それぞれと執事の1対1に送る文。
// アプリ（端末）で中身を作り、送る前に画面で全部見せる。サーバーは形を整えて送り、担当を決めるための控え（題・送った先）だけを置く。

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
  /** 書類を持っている人の、言葉ごとの呼び名（1対1の見出しを、その人の言葉で書くため） */
  holderNames?: Partial<Record<LanguageCode, string>>;
  /** 担当の候補（大人の家族）。言葉ごとの呼び名。「○○がやる」のボタンになる */
  takers: Partial<Record<LanguageCode, string>>[];
  /** 担当の候補それぞれの読みたい言葉（takers と同じ順）。担当が決まったら、その人の言葉の「カレンダーに追加」を返す */
  takerLangs?: (LanguageCode | undefined)[];
  /** 担当の候補それぞれの、家族のだれか（takers と同じ順）。1対1に送る相手を決める */
  takerIds?: string[];
  /**
   * 段の言葉ごとの「カレンダーに追加」（Google カレンダーの予定を作る画面のリンク。題・メモはその言葉）。
   * 端末で作る。CULALOG のサーバーには置かない（お知らせと一緒に Telegram へ渡すだけ）
   */
  calendar?: Partial<Record<LanguageCode, string>>;
  /** 段の言葉ごとの iPhone のカレンダー（.ics の中身）。1対1で「iPhone のカレンダー」の人には、合言葉つきのリンクにして渡す */
  ics?: Partial<Record<LanguageCode, string>>;
}

/** 「カレンダーに追加」のボタンの文（言葉ごと） */
export const CAL_BUTTON: Record<LanguageCode, string> = {
  ja: "📅 カレンダーに追加",
  "ja-easy": "📅 カレンダーに いれる",
  vi: "📅 Thêm vào lịch",
};

/** Google カレンダーの予定を作る画面のリンクだけを通す（ほかの URL はボタンにしない） */
export function isCalendarUrl(url: unknown): url is string {
  return typeof url === "string" && url.length <= 1800 && url.startsWith("https://calendar.google.com/calendar/render?");
}

/** お知らせの下に付ける「カレンダーに追加」のボタン（段の言葉の順） */
export function calendarButtons(calendar: TellPayload["calendar"], langs: LanguageCode[]): { text: string; url: string }[] {
  return langs.filter((l) => isCalendarUrl(calendar?.[l])).map((l) => ({ text: CAL_BUTTON[l], url: calendar![l]! }));
}

/**
 * 担当のボタンの印（Telegram の callback_data は 64 バイトまで）: "t:" + 言葉ごとの呼び名を | でつなぐ。
 * 最後に、その人の読みたい言葉を1つ足す（前の形の印も読めるように、呼び名の後ろに置く）
 */
export function takerData(names: Partial<Record<LanguageCode, string>>, lang?: LanguageCode): string {
  const parts = LANGUAGES.map((l) => (names[l.code] ?? "").replace(/[|:]/g, ""));
  const tail = lang ? `|${lang}` : "";
  const bytes = (x: string) => new TextEncoder().encode(x).length;
  const build = () => `t:${parts.join("|")}${tail}`;
  while (bytes(build()) > 64) {
    // いちばん長い呼び名から1文字ずつ削る（区切りの数は変えない＝言葉の並びがずれない）
    let i = 0;
    parts.forEach((p, j) => {
      if (bytes(p) > bytes(parts[i])) i = j;
    });
    if (!parts[i]) break;
    parts[i] = [...parts[i]].slice(0, -1).join("");
  }
  return build();
}

/** 担当のボタンの印から、その人の読みたい言葉（前の形の印なら無し） */
export function takerLang(data: string): LanguageCode | undefined {
  const last = data.replace(/^t:/, "").split("|")[LANGUAGES.length];
  return LANGUAGES.find((l) => l.code === last)?.code;
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
  return `${ja}がやる / ${vi} sẽ lo việc này`;
}

/** お知らせに付けるボタン: 担当の候補ごとに1行（押した印に、その人の読みたい言葉）＋「カレンダーに追加」の1行（段の言葉ごと） */
export function tellKeyboard(p: TellPayload): { takerRows: { text: string; callback_data: string }[][]; calendarRow: { text: string; url: string }[] } {
  return {
    takerRows: p.takers.map((t, i) => [{ text: takerButton(t), callback_data: takerData(t, p.takerLangs?.[i]) }]),
    calendarRow: calendarButtons(p.calendar, p.blocks.map((b) => b.lang)),
  };
}

type Keyboard = { text: string; url?: string; callback_data?: string }[][] | undefined;

/** 担当が決まったとき: お知らせに残す「カレンダーに追加」の行と、担当になった人の言葉のボタン（前の形の印なら無し） */
export function afterTake(keyboard: Keyboard, data: string): { calendarRow: { text: string; url: string }[]; mine?: { text: string; url: string } } {
  const calendarRow = (keyboard ?? []).flat().filter((b): b is { text: string; url: string } => isCalendarUrl(b.url));
  const lang = takerLang(data);
  return { calendarRow, mine: lang ? calendarRow.find((b) => b.text === CAL_BUTTON[lang]) : undefined };
}

/** 原本の見出し（日本語のほかの段の言葉で。原本の引用は日本語のまま） */
const SOURCE_HEAD: Record<LanguageCode, string> = {
  ja: "原本",
  "ja-easy": "もとの かみ（にほんご）",
  vi: "Bản gốc (tiếng Nhật)",
};

/** お知らせの終わりの一言（返信で聞ける・担当はボタンで） */
const FOOTER: Record<LanguageCode, string> = {
  ja: "質問は、このメッセージに返信してください。担当を決めたら下のボタンを。",
  "ja-easy": "しつもんは、この メッセージに へんしん してね。だれが するか きまったら、したの ボタンを おしてね。",
  vi: "Muốn hỏi gì thì trả lời (reply) tin nhắn này. Khi đã quyết định ai lo, hãy bấm nút bên dưới.",
};

/** コピーしてほかのアプリに貼るときの終わりの一言（ボタンが無いので、ボタンの話はしない） */
const FOOTER_PLAIN: Record<LanguageCode, string> = {
  ja: "質問があれば、このメッセージに返信してください。",
  "ja-easy": "しつもんが あったら、へんしん してね。",
  vi: "Có gì muốn hỏi thì trả lời tin nhắn này nhé.",
};

const mark = (c: LanguageCode) => `【${LANGUAGES.find((l) => l.code === c)?.native ?? c}】`;

/** 1対1に送るときの終わりの一言（その人の言葉だけ） */
const FOOTER_DM: Record<LanguageCode, string> = {
  ja: "質問は、ここに書いてください。担当を決めたら下のボタンを。",
  "ja-easy": "しつもんは、ここに かいてね。だれが するか きまったら、したの ボタンを おしてね。",
  vi: "Có gì muốn hỏi thì cứ nhắn ở đây nhé. Khi cả nhà đã thống nhất ai sẽ lo việc này, hãy bấm nút bên dưới.",
};

/** 1対1の見出し（その人の言葉だけ。返信の引用にもこの1行が出る） */
export const TELL_HEAD_DM: Record<LanguageCode, string> = {
  ja: TELL_HEAD,
  "ja-easy": "📄 CULALOG｜かぞくへの おしらせ",
  vi: "📄 CULALOG｜Thông báo cho gia đình",
};

/** 1対1の原本の見出し（その人の言葉で。原本の引用は日本語のまま＝原本へ戻る道） */
const SOURCE_HEAD_DM: Record<LanguageCode, (holder: string) => string> = {
  ja: (h) => `— 原本（書類は${h}さんの端末の中）`,
  "ja-easy": (h) => `— もとの かみ（にほんご。かみは ${h}さんの スマホの なか）`,
  vi: (h) => `— Bản gốc (tiếng Nhật; giấy tờ nằm trong điện thoại của ${h})`,
};

/** 1対1に送る文: その人の言葉の段だけ（無ければ日本語の段）。見出し・原本の見出し・終わりの一言も、その段の言葉だけ */
export function composeTellFor(p: TellPayload, lang: LanguageCode): { text: string; lang: LanguageCode } {
  const block = p.blocks.find((b) => b.lang === lang) ?? p.blocks.find((b) => b.lang === "ja") ?? p.blocks[0];
  const l = block.lang;
  const parts = [TELL_HEAD_DM[l], mark(l), block.title, ...block.lines.map((x) => `・${x}`)];
  if (p.sources.length) parts.push("", SOURCE_HEAD_DM[l](p.holderNames?.[l] || p.holder), ...p.sources.map((s) => `・${s}`));
  parts.push("", FOOTER_DM[l]);
  return { text: parts.join("\n"), lang: l };
}

/** plain: コピーしてほかのアプリに貼る文（Telegram のボタンが付かないので、終わりの一言からボタンの話を外す） */
export function composeTell(p: TellPayload, plain = false): string {
  const parts = [TELL_HEAD];
  // 受け取る家族の言葉（日本語以外）を先に: スマホの通知の最初の数行に、その人の言葉で要点が入る
  const blocks = [...p.blocks].sort((a, b) => (a.lang === "ja" ? 1 : 0) - (b.lang === "ja" ? 1 : 0));
  blocks.forEach((b, i) => parts.push(...(i ? [""] : []), mark(b.lang), b.title, ...b.lines.map((l) => `・${l}`)));
  // 末尾の決まった文も、送る段の言葉ごとに（段と同じ順。原本の引用は日本語のまま＝原本へ戻る道）
  const langs = blocks.map((b) => b.lang);
  if (p.sources.length) {
    const heads = langs.filter((l) => l !== "ja").map((l) => SOURCE_HEAD[l]);
    parts.push("", [`— 原本（書類は${p.holder}さんの端末の中）`, ...heads].join(" ／ "), ...p.sources.map((s) => `・${s}`));
  }
  parts.push("", ...langs.map((l) => (plain ? FOOTER_PLAIN : FOOTER)[l]));
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


