// Telegram の通訳の執事（webhook）。
// - グループの会話を、ほかの人の読みたい言葉にして同じグループへ（全部訳すモード。/pause で止める）
// - アプリから送った「家族へのお知らせ」への返信の質問には、そのお知らせに書いてある範囲でだけ答える
// - お知らせの「私がやる」ボタンで、担当をそれぞれの言葉で知らせる
// 🔴 書類には触らない（書類は端末の中）。会話の文は保存しない。置くのはグループと人の読みたい言葉だけ。

import { NextRequest, NextResponse } from "next/server";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { answerFromNotice, langMark, translateChat } from "@/lib/server/interpret";
import { createLinkCode, getChat, setUserLang, store, updateChat } from "@/lib/server/store";
import { sendMessage, telegramReady, tg } from "@/lib/server/telegram";
import { afterTake, TAKE_TEXT, takerNames, TELL_HEAD, titlesOf } from "@/lib/tell";

export const maxDuration = 60;

interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
}
interface TgMessage {
  message_id: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  reply_to_message?: TgMessage;
  reply_markup?: { inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] };
}

const HELP = `CULALOG の通訳の執事です。
・このグループの会話を、ほかの人の読みたい言葉にして出します（会話は訳すために Claude へ送ります。保存はしません）
・読みたい言葉を決める: /lang ja（日本語）・/lang vi（Tiếng Việt）・/lang easy（やさしい にほんご）
・止める /pause ・再開 /resume
・アプリとつなぐ: /link（出てきた6文字をアプリの設定に入れる）
🔴 番号（保険証・口座など）は、ここに書かないでください。

【Tiếng Việt】
Mình là quản gia phiên dịch của CULALOG.
・Mình dịch tin nhắn trong nhóm sang ngôn ngữ mà mỗi người muốn đọc (tin nhắn được gửi tới Claude để dịch, không lưu lại).
・Chọn ngôn ngữ muốn đọc: /lang vi (Tiếng Việt)・/lang ja (日本語)・/lang easy (やさしい にほんご)
・Tạm dừng /pause ・Tiếp tục /resume
🔴 Đừng viết các con số quan trọng (thẻ bảo hiểm, tài khoản ngân hàng…) ở đây.`;

/** 決まった短い知らせ（日本語とベトナム語を並べる。グループの誰が読んでも分かるように） */
const SAY = {
  preparing: "（執事の準備中です。キーが届いたら答えられるようになります）\n(Quản gia đang được chuẩn bị, hiện chưa trả lời được.)",
  paused: "通訳を止めました（/resume で再開）\nĐã tạm dừng phiên dịch (/resume để tiếp tục).",
  resumed: "通訳を再開しました\nĐã tiếp tục phiên dịch.",
};

const LANG_ALIASES: Record<string, LanguageCode> = { ja: "ja", jp: "ja", vi: "vi", vn: "vi", easy: "ja-easy", "ja-easy": "ja-easy" };

const ok = () => NextResponse.json({ ok: true });

export async function POST(request: NextRequest) {
  if (!telegramReady()) return NextResponse.json({ error: "not ready" }, { status: 503 });
  if (request.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const update = await request.json().catch(() => null);
  if (!update) return ok();
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message?.text) await onMessage(update.message as TgMessage);
  } catch (e) {
    console.error("telegram webhook:", e instanceof Error ? e.message : "failed");
  }
  // Telegram には常に 200 を返す（失敗で同じ更新が何度も届かないように）
  return ok();
}

async function onMessage(m: TgMessage) {
  if (!m.from || m.from.is_bot || !m.text) return;
  const chatId = String(m.chat.id);
  const text = m.text.trim();
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/);
  if (cmd) return onCommand(chatId, m, cmd[1].toLowerCase(), cmd[2].trim());
  if (!store()) return;
  const chat = await getChat(chatId);
  if (!chat || chat.paused) return;
  const users = chat.users ?? {};
  const senderLang = users[String(m.from.id)]?.lang;
  const chatLangs = [...new Set(Object.values(users).map((u) => u.lang))];

  // アプリから送ったお知らせへの返信は、お知らせに書いてある範囲で答える
  const notice = m.reply_to_message?.from?.is_bot && m.reply_to_message.text?.startsWith(TELL_HEAD) ? m.reply_to_message.text : undefined;
  if (notice) {
    const langs = [...new Set([senderLang ?? "ja", ...chatLangs])] as LanguageCode[];
    const out = await answerFromNotice(text, notice, langs);
    if (!out) return sendMessage(chatId, SAY.preparing, { replyTo: m.message_id });
    return sendMessage(chatId, out.texts.map((t) => `${langMark(t.lang)}\n${t.text}`).join("\n\n"), { replyTo: m.message_id });
  }

  // ふつうの会話: 送った人と違う言葉の人がいれば訳す
  const targets = chatLangs.filter((l) => l !== senderLang);
  if (targets.length === 0) return;
  const out = await translateChat(text, targets);
  if (!out) return;
  const lines = out.texts.filter((t) => t.lang !== out.sourceLang && t.text.trim());
  if (lines.length) await sendMessage(chatId, lines.map((t) => `${langMark(t.lang)} ${t.text}`).join("\n"), { replyTo: m.message_id });
}

async function onCommand(chatId: string, m: TgMessage, cmd: string, arg: string) {
  if (cmd === "start" || cmd === "help") return sendMessage(chatId, HELP);
  if (!store()) return sendMessage(chatId, "（準備中です。もう少し待ってください）");
  if (cmd === "lang") {
    const lang = LANG_ALIASES[arg.toLowerCase()];
    if (!lang) return sendMessage(chatId, "使える言葉: /lang ja ・ /lang vi ・ /lang easy");
    await setUserLang(chatId, String(m.from!.id), { lang, name: m.from!.first_name ?? "" });
    const label = LANGUAGES.find((l) => l.code === lang)!.native;
    // 返事は送った人のメッセージへの返信にして、表示名（本名のこともある）は文に入れない
    return sendMessage(chatId, `✓ ${label}`, { replyTo: m.message_id });
  }
  if (cmd === "pause" || cmd === "resume") {
    await updateChat(chatId, { paused: cmd === "pause" });
    return sendMessage(chatId, cmd === "pause" ? SAY.paused : SAY.resumed);
  }
  if (cmd === "link") {
    const code = await createLinkCode(chatId);
    return sendMessage(chatId, code ? `アプリの設定「家族の Telegram」に、この6文字を入れてください（10分有効）:\n${code}` : "（準備中です）");
  }
}

async function onCallback(q: { id: string; from: TgUser; data?: string; message?: TgMessage }) {
  if (!q.data?.startsWith("t:") || !q.message) return tg("answerCallbackQuery", { callback_query_id: q.id });
  const chatId = String(q.message.chat.id);
  // 担当の名前は、押した人の Telegram の表示名ではなく、ボタンに入れた家族の呼び名（言葉ごと）
  const names = takerNames(q.data);
  const name = names.ja ?? q.from.first_name ?? "";
  const titles = titlesOf(q.message.text ?? "");
  const lines = (Object.keys(titles) as LanguageCode[]).map((l) => `${langMark(l)} ${TAKE_TEXT[l](names[l] ?? name, titles[l]!)}`);
  // お知らせに付いていた「カレンダーに追加」（言葉ごと）は担当が決まっても残し、担当になった人には、その人の言葉のボタンを返す
  const { calendarRow: calRow, mine } = afterTake(q.message.reply_markup?.inline_keyboard, q.data);
  await tg("answerCallbackQuery", { callback_query_id: q.id, text: "OK" });
  await tg("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: q.message.message_id,
    reply_markup: { inline_keyboard: [[{ text: `✓ ${name}`, callback_data: "noop" }], ...(calRow.length ? [calRow] : [])] },
  });
  const done = `✅ ${lines.join("\n")}`;
  const sent = await sendMessage(chatId, done, { replyTo: q.message.message_id, buttons: mine ? [[mine]] : undefined });
  if (!sent && mine) await sendMessage(chatId, done, { replyTo: q.message.message_id });
}
