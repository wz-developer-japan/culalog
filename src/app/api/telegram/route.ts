// Telegram の執事（webhook）。
// - 家族のグループ: 会話を、ほかの人の読みたい言葉にして同じグループへ（通訳だけ。/pause で止める）
// - 大人それぞれとの1対1: お知らせ（家族に伝える・朝の通知）がその人の言葉で届く。担当のボタン。質問・写真・伝言（src/lib/server/dm.ts）
// 🔴 家族の名簿とつながっていない人の1対1には何もしない。会話の文は保存しない。

import { after, NextRequest, NextResponse } from "next/server";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { answerFromNotice, langMark, translateChat } from "@/lib/server/interpret";
import { onDmMessage, onDmStart, onWhoCallback, setDmLang, takeTell } from "@/lib/server/dm";
import { createLinkCode, familyOfUser, firstTime, getChat, indexUser, setUserLang, store, updateChat, useClaudeInChat } from "@/lib/server/store";
import { sendMessage, telegramReady, tg } from "@/lib/server/telegram";
import { afterTake, TAKE_TEXT, takerNames, TELL_HEAD, titlesOf } from "@/lib/tell";

// 写真の読み取り（Claude）は数十秒かかる。返事（200）は先に返し、読み取りは after で続ける
export const maxDuration = 300;

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
  caption?: string;
  photo?: { file_id: string; file_unique_id?: string; width: number; height: number; file_size?: number }[];
  document?: { file_id: string; file_unique_id?: string; mime_type?: string; file_size?: number };
  reply_to_message?: TgMessage;
  reply_markup?: { inline_keyboard?: { text: string; url?: string; callback_data?: string }[][] };
}

const HELP = `CULALOG の執事です。
・家族のグループ: 会話を、ほかの人の読みたい言葉にして出します（訳すために Claude へ送ります。保存はしません）
・読みたい言葉を決める: /lang ja（日本語）・/lang vi（Tiếng Việt）・/lang easy（やさしい にほんご）
・止める /pause ・再開 /resume ・アプリとつなぐ /link
・大人は、執事との1対1で /start → お知らせがその人の言葉で届きます。共有した書類のことを聞く・書類の写真を送る・「○○に伝えて」もここで
🔴 番号（保険証・口座など）は書かないでください。

【Tiếng Việt】
Mình là quản gia của CULALOG.
・Trong nhóm gia đình: mình dịch tin nhắn sang ngôn ngữ mà mỗi người muốn đọc (gửi tới Claude để dịch, không lưu lại).
・Chọn ngôn ngữ: /lang vi (Tiếng Việt)・/lang ja (日本語)・/lang easy (やさしい にほんご)
・Tạm dừng /pause ・Tiếp tục /resume
・Người lớn hãy gửi /start trong cuộc trò chuyện riêng với quản gia → thông báo sẽ đến bằng ngôn ngữ của mình. Có thể hỏi về giấy tờ đã chia sẻ, gửi ảnh giấy tờ, hoặc nhờ chuyển lời ở đó.
🔴 Đừng viết các con số quan trọng (thẻ bảo hiểm, tài khoản ngân hàng…).`;

/** 決まった短い知らせ（日本語とベトナム語を並べる。グループの誰が読んでも分かるように） */
const SAY = {
  preparing: "（執事の準備中です。キーが届いたら答えられるようになります）\n(Quản gia đang được chuẩn bị, hiện chưa trả lời được.)",
  paused: "通訳を止めました（/resume で再開）\nĐã tạm dừng phiên dịch (/resume để tiếp tục).",
  resumed: "通訳を再開しました\nĐã tiếp tục phiên dịch.",
  over: "今日の通訳の回数の上限に達しました。日本時間の0時に戻ります。\nHôm nay đã dùng hết số lần phiên dịch. Sẽ dùng lại được từ 0 giờ (giờ Nhật Bản).",
};

/** Claude を呼ぶ前に、このグループの今日の回数を数える（上限なら、その日1回だけ知らせて黙る） */
async function withinLimit(chatId: string, replyTo: number): Promise<boolean> {
  const use = await useClaudeInChat(chatId).catch(() => "over" as const);
  if (use === "over-first") await sendMessage(chatId, SAY.over, { replyTo });
  return use === "ok";
}

/**
 * グループで言葉を決めた人へ: 1対1でも話せる。
 * やさしい日本語を選ぶのは子ども（見本の蓮）なので、/start の案内は出さない（子どもには知らせを送らない決め）
 */
const DM_HINT: Record<LanguageCode, string> = {
  ja: "お知らせは執事との1対1に届きます。執事の名前を押して、1対1で /start を送ってください。",
  "ja-easy": "みんなの かいわは、この グループで つうやく するね。",
  vi: "Thông báo sẽ đến trong cuộc trò chuyện riêng với quản gia. Hãy bấm vào tên quản gia và gửi /start.",
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
  // 🔴 Telegram は、返事が遅いと同じ update を送り直す。同じ update_id は一度だけ処理する
  if (typeof update.update_id === "number" && store() && !(await firstTime(`u${update.update_id}`).catch(() => true))) return ok();
  const handle = async () => {
    try {
      if (update.callback_query) await onCallback(update.callback_query);
      else if (update.message?.chat?.type === "private") await onPrivate(update.message as TgMessage);
      else if (update.message?.text) await onMessage(update.message as TgMessage);
    } catch (e) {
      console.error("telegram webhook:", e instanceof Error ? e.message : "failed");
    }
  };
  // 返事（200）を先に返し、処理（Claude を待つもの）はそのあとで。試験のときはその場で
  if (process.env.CULALOG_FAKE_TELEGRAM === "1" && process.env.VERCEL_ENV !== "production") await handle();
  else after(handle);
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
    if (!(await withinLimit(chatId, m.message_id))) return;
    const out = await answerFromNotice(text, notice, langs);
    if (!out) return sendMessage(chatId, SAY.preparing, { replyTo: m.message_id });
    return sendMessage(chatId, out.texts.map((t) => `${langMark(t.lang)}\n${t.text}`).join("\n\n"), { replyTo: m.message_id });
  }

  // ふつうの会話: 送った人と違う言葉の人がいれば訳す
  const targets = chatLangs.filter((l) => l !== senderLang);
  if (targets.length === 0) return;
  if (!(await withinLimit(chatId, m.message_id))) return;
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
    // この人がどの家族かを覚える（1対1で /start したときに、家族の名簿から「あなたはだれ？」を出すため）。つないだグループだけ
    const chat = await getChat(chatId);
    if (chat?.tokenHash) await indexUser(String(m.from!.id), chatId);
    // 返事は送った人のメッセージへの返信にして、表示名（本名のこともある）は文に入れない
    return sendMessage(chatId, `✓ ${label}${chat?.tokenHash ? `\n${DM_HINT[lang]}` : ""}`, { replyTo: m.message_id });
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
  if (q.data?.startsWith("w:") && store()) return onWhoCallback({ ...q, data: q.data });
  if (q.data?.startsWith("k:") && store()) {
    const [, tellId, idx] = q.data.split(":");
    const family = await familyOfUser(String(q.from.id));
    if (family) return takeTell(family, tellId, Number(idx), q.id);
    return tg("answerCallbackQuery", { callback_query_id: q.id });
  }
  // 前の形（グループに送っていたお知らせ）の担当のボタン
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

/** 1対1。家族の名簿とつながっていない人（家族のグループで言葉を決めていない人）には何もしない */
async function onPrivate(m: TgMessage) {
  if (!m.from || m.from.is_bot || !store()) return;
  const userId = String(m.from.id);
  if (!(await familyOfUser(userId))) return;
  const text = (m.text ?? "").trim();
  const cmd = text.match(/^\/(\w+)(?:@\w+)?\s*(.*)$/);
  if (cmd?.[1].toLowerCase() === "start") return onDmStart(userId);
  if (cmd?.[1].toLowerCase() === "lang") {
    const lang = LANG_ALIASES[cmd[2].trim().toLowerCase()];
    return lang ? setDmLang(userId, lang) : sendMessage(userId, "/lang ja ・ /lang vi ・ /lang easy");
  }
  if (cmd?.[1].toLowerCase() === "help") return sendMessage(userId, HELP);
  return onDmMessage(userId, m);
}
