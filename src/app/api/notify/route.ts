// 通知: アプリを開いたときに「近い予定の日付と件数」だけを預かり、その日の朝に家族の Telegram へ
// 「近い予定が○件あります。くわしくは CULALOG か、このグループで聞いてね」とそれぞれの言葉で送る。🔴 予定の名前・書類の中身は預からない・送らない。
// POST（アプリから）: { chatId, token, upcoming: { "YYYY-MM-DD": 件数 }, sendNow? }
// GET（毎朝の定時実行。Vercel Cron が Authorization: Bearer <CRON_SECRET> を付ける）

import { NextRequest, NextResponse } from "next/server";
import { type LanguageCode } from "@/lib/languages";
import { langMark } from "@/lib/server/interpret";
import { chatsToNotify, type ChatDoc, updateChat, verifyChatToken } from "@/lib/server/store";
import { sendMessage, telegramReady } from "@/lib/server/telegram";

// a = 今日の件数、b = 今日から7日以内の件数。
// アプリのデータは書類を預かる人の端末にしかないので、ほかの家族に「アプリを開いて」とは言わない（このグループで聞けば、通訳つきで届く）
const NOTICE: Record<LanguageCode, (today: number, week: number) => string> = {
  ja: (a, b) => (b ? `近い予定が${b}件あります（今日 ${a}件・7日以内 ${b}件）。くわしくは CULALOG か、このグループで聞いてね` : "7日以内に、共有している予定はありません。"),
  "ja-easy": (a, b) => (b ? `ちかい よていが ${b}こ あります（きょう ${a}・7にち いない ${b}）。きに なったら、この グループで きいてね` : "7にち いない に よていは ありません。"),
  vi: (a, b) => (b ? `Có ${b} việc sắp tới (hôm nay ${a}, trong 7 ngày ${b}). Muốn biết thêm thì hỏi trong nhóm này nhé.` : "Trong 7 ngày tới không có việc nào được chia sẻ."),
};

const jstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

async function notifyChat(id: string, chat: ChatDoc, force = false): Promise<boolean> {
  const today = jstYmd();
  if (!force && chat.notifiedOn === today) return false;
  const a = chat.upcoming?.[today] ?? 0;
  let b = 0;
  for (let i = 0; i < 7; i++) b += chat.upcoming?.[jstYmd(i)] ?? 0;
  // 毎朝の通知は、予定があるときだけ。「いま送ってみる」は、0件でも「ありません」を送る
  if (b === 0 && !force) return false;
  const langs = [...new Set(Object.values(chat.users ?? {}).map((u) => u.lang))];
  const list = (langs.length ? langs : ["ja"]) as LanguageCode[];
  await sendMessage(id, `🔔 ${list.map((l) => `${langMark(l)} ${NOTICE[l](a, b)}`).join("\n")}`);
  await updateChat(id, { notifiedOn: today });
  return true;
}

export async function POST(request: NextRequest) {
  if (!telegramReady()) return NextResponse.json({ error: "準備中です。" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const chat = await verifyChatToken(chatId, typeof body.token === "string" ? body.token : "");
  if (!chat) return NextResponse.json({ error: "つながっていません。" }, { status: 403 });
  const upcoming: Record<string, number> = {};
  for (const [k, v] of Object.entries(body.upcoming ?? {})) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isInteger(v) && (v as number) > 0 && (v as number) < 100) upcoming[k] = v as number;
    if (Object.keys(upcoming).length >= 31) break;
  }
  await updateChat(chatId, { upcoming });
  const sent = body.sendNow ? await notifyChat(chatId, { ...chat, upcoming }, true) : false;
  return NextResponse.json({ ok: true, sent });
}

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!telegramReady()) return NextResponse.json({ ok: false });
  let sent = 0;
  for (const { id, chat } of await chatsToNotify()) if (await notifyChat(id, chat)) sent++;
  return NextResponse.json({ ok: true, sent });
}
