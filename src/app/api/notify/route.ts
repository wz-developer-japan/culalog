// 通知: アプリを開いたときに「近い予定の日付と件数」を預かり、その日の朝に、執事と1対1を始めた大人それぞれへ
// 「近い予定が○件あります。くわしくは、ここで聞いてね」をその人の言葉だけで送る（家族のグループには送らない）。
// POST（アプリから）: { chatId, token, upcoming: { "YYYY-MM-DD": 件数 }, sendNow? }
// GET（毎朝の定時実行。Vercel Cron が Authorization: Bearer <CRON_SECRET> を付ける）

import { NextRequest, NextResponse } from "next/server";
import { notifyDms } from "@/lib/server/dm";
import { chatsToNotify, familyDocs, type ChatDoc, updateChat, verifyChatToken } from "@/lib/server/store";
import { telegramReady } from "@/lib/server/telegram";

const jstYmd = (offsetDays = 0) => new Date(Date.now() + 9 * 3600 * 1000 + offsetDays * 86400 * 1000).toISOString().slice(0, 10);

async function notifyChat(id: string, chat: ChatDoc, force = false): Promise<boolean> {
  const today = jstYmd();
  if (!force && chat.notifiedOn === today) return false;
  const a = chat.upcoming?.[today] ?? 0;
  let b = 0;
  for (let i = 0; i < 7; i++) b += chat.upcoming?.[jstYmd(i)] ?? 0;
  // 共有したまとめがあれば、その人と共有した書類の予定の名前と日付で。無ければ（前の形）件数だけ
  const docs = await familyDocs(id).catch(() => []);
  // 毎朝の通知は、予定があるときだけ。「いま送ってみる」は、0件でも「ありません」を送る
  if (b === 0 && !docs.length && !force) return false;
  const sent = await notifyDms(chat, a, b, { docs, todayYmd: today, force, chatId: id });
  if (!sent) return false;
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
