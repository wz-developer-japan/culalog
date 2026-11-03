// 「家族に伝える」: アプリで作って画面で確かめた文を、家族の Telegram グループに送る（保存しない）

import { NextRequest, NextResponse } from "next/server";
import { LANGUAGES } from "@/lib/languages";
import { verifyChatToken } from "@/lib/server/store";
import { sendMessage, telegramReady } from "@/lib/server/telegram";
import { composeTell, takerButton, takerData, type TellPayload } from "@/lib/tell";

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");

export async function POST(request: NextRequest) {
  if (!telegramReady()) return NextResponse.json({ error: "Telegram の執事は準備中です。" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const chat = await verifyChatToken(str(body.chatId, 40), str(body.token, 100));
  if (!chat) return NextResponse.json({ error: "家族の Telegram とつながっていません。設定からつないでください。" }, { status: 403 });
  const p = body.payload as TellPayload | undefined;
  const blocks = Array.isArray(p?.blocks) ? p!.blocks : [];
  const takers = (Array.isArray(p?.takers) ? p!.takers : [])
    .slice(0, 4)
    .map((t) => Object.fromEntries(LANGUAGES.map((l) => [l.code, str(t?.[l.code], 20)]).filter(([, v]) => v)) as TellPayload["takers"][number])
    .filter((t) => t.ja);
  const payload: TellPayload = {
    holder: str(p?.holder, 20),
    takers,
    sources: (Array.isArray(p?.sources) ? p!.sources : []).map((s) => str(s, 200)).slice(0, 12),
    blocks: blocks
      .filter((b) => LANGUAGES.some((l) => l.code === b?.lang))
      .slice(0, 3)
      .map((b) => ({ lang: b.lang, title: str(b.title, 200), lines: (Array.isArray(b.lines) ? b.lines : []).map((l) => str(l, 400)).slice(0, 16) })),
  };
  if (!payload.blocks.length) return NextResponse.json({ error: "送る中身がありません。" }, { status: 400 });
  const sent = await sendMessage(body.chatId, composeTell(payload), {
    buttons: takers.length ? takers.map((t) => [{ text: takerButton(t), callback_data: takerData(t) }]) : undefined,
  });
  return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "送れませんでした。bot がグループに入っているか確かめてください。" }, { status: 502 });
}
