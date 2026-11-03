// 通知: アプリを開いたときに「近い予定の日付と件数」だけを預かり、その日の朝に家族の Telegram へ
// 「近い予定が○件あります。CULALOG を見てね」とそれぞれの言葉で送る。🔴 予定の名前・書類の中身は預からない・送らない。
// POST（アプリから）: { chatId, token, upcoming: { "YYYY-MM-DD": 件数 }, sendNow? }
// GET（毎朝の定時実行。Vercel Cron が Authorization: Bearer <CRON_SECRET> を付ける）

import { NextRequest, NextResponse } from "next/server";
import { type LanguageCode } from "@/lib/languages";
import { langMark } from "@/lib/server/interpret";
import { chatsToNotify, type ChatDoc, updateChat, verifyChatToken } from "@/lib/server/store";
import { sendMessage, telegramReady } from "@/lib/server/telegram";

const NOTICE: Record<LanguageCode, (today: number, soon: number) => string> = {
  ja: (a, b) => `近い予定が${a + b}件あります（今日 ${a}件・あした ${b}件）。CULALOG を見てね`,
  "ja-easy": (a, b) => `ちかい よていが ${a + b}こ あります（きょう ${a}・あした ${b}）。CULALOG を みてね`,
  vi: (a, b) => `Có ${a + b} việc sắp tới (hôm nay ${a}, ngày mai ${b}). Hãy mở CULALOG để xem nhé.`,
};

const jstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

async function notifyChat(id: string, chat: ChatDoc, force = false): Promise<boolean> {
  const today = jstYmd();
  if (!force && chat.notifiedOn === today) return false;
  const a = chat.upcoming?.[today] ?? 0;
  const b = chat.upcoming?.[jstYmd(1)] ?? 0;
  if (a + b === 0) return false;
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
