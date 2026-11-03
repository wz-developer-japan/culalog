// Telegram の Bot API を呼ぶ（サーバー側だけ。トークンは環境変数）

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

export const telegramReady = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET);

export interface InlineButton {
  text: string;
  callback_data: string;
}

export async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
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
