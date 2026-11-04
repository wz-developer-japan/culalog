// Telegram の Bot API を呼ぶ（サーバー側だけ。トークンは環境変数）

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export const telegramReady = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);

/** ボタン: 押すと執事に知らせるもの（callback_data）か、リンクを開くもの（url） */
export type InlineButton = { text: string; callback_data: string } | { text: string; url: string };

/** 試験のときだけ: Telegram に送らず、送ろうとしたものを記録する（本番では使わない） */
const fake = () => process.env.CULALOG_FAKE_TELEGRAM === "1" && process.env.VERCEL_ENV !== "production";
const g = globalThis as unknown as { __culalogTgSent?: { method: string; body: Record<string, unknown> }[]; __culalogTgFail?: (m: string, b: Record<string, unknown>) => boolean };
export const fakeTelegramSent = () => (g.__culalogTgSent ??= []);
export const setFakeTelegramFail = (f?: (m: string, b: Record<string, unknown>) => boolean) => void (g.__culalogTgFail = f);

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (fake()) {
    if (g.__culalogTgFail?.(method, body)) return null;
    const sent = fakeTelegramSent();
    sent.push({ method, body: JSON.parse(JSON.stringify(body)) });
    return { message_id: 1000 + sent.length, ok: true } as T;
  }
  try {
    const res = await fetch(api(method), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok) console.error("telegram:", method, json.description);
    return json.ok ? (json.result ?? null) : null;
  } catch (e) {
    console.error("telegram:", method, e instanceof Error ? e.message : "");
    return null;
  }
}

export function sendMessage(chatId: string | number, text: string, options: { replyTo?: number; buttons?: InlineButton[][] } = {}) {
  return tg("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    ...(options.replyTo ? { reply_parameters: { message_id: options.replyTo, allow_sending_without_reply: true } } : {}),
    ...(options.buttons ? { reply_markup: { inline_keyboard: options.buttons } } : {}),
    link_preview_options: { is_disabled: true },
  });
}
