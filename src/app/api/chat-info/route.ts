// つないだ Telegram グループの、人数と読みたい言葉だけを返す（「家族に伝える」で、グループの全員の言葉を入れるため）

import { NextRequest, NextResponse } from "next/server";
import { verifyChatToken } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const chat = await verifyChatToken(typeof body.chatId === "string" ? body.chatId : "", typeof body.token === "string" ? body.token : "");
  if (!chat) return NextResponse.json({ error: "つながっていません。" }, { status: 403 });
  const users = Object.values(chat.users ?? {});
  return NextResponse.json({ count: users.length, langs: [...new Set(users.map((u) => u.lang))] });
}
