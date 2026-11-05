// webhook を Telegram に登録する（作者が一度だけブラウザで開く）。/api/telegram/setup?key=<TELEGRAM_WEBHOOK_SECRET>

import { NextRequest, NextResponse } from "next/server";
import { telegramReady, tg } from "@/lib/server/telegram";

export async function GET(request: NextRequest) {
  if (!telegramReady()) return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN と TELEGRAM_WEBHOOK_SECRET を入れてください" }, { status: 503 });
  if (request.nextUrl.searchParams.get("key") !== process.env.TELEGRAM_WEBHOOK_SECRET) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const url = `${request.nextUrl.origin}/api/telegram`;
  const result = await tg("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  await tg("setMyCommands", {
    commands: [
      { command: "lang", description: "読みたい言葉 / Ngôn ngữ (ja・vi・easy)" },
      { command: "pause", description: "通訳を止める / Tạm dừng" },
      { command: "resume", description: "通訳を再開 / Tiếp tục" },
      { command: "link", description: "アプリとつなぐ / Kết nối ứng dụng" },
      { command: "help", description: "使い方 / Hướng dẫn" },
    ],
  });
  return NextResponse.json({ ok: result === true, url });
}
