// アプリと家族の Telegram グループをつなぐ（グループで /link → 出た6文字をアプリに入れる）

import { NextRequest, NextResponse } from "next/server";
import { consumeLinkCode, store } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!store()) return NextResponse.json({ error: "つなぐ機能は準備中です。" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^[A-Za-z0-9]{6}$/.test(code)) return NextResponse.json({ error: "6文字の英数字を入れてください。" }, { status: 400 });
  const linked = await consumeLinkCode(code);
  if (!linked) return NextResponse.json({ error: "合言葉が違うか、時間が過ぎています。グループでもう一度 /link を送ってください。" }, { status: 400 });
  return NextResponse.json(linked);
}
