// 「家族に伝える」: アプリで作って画面で確かめた文を、家族の Telegram グループに送る（保存しない）

import { NextRequest, NextResponse } from "next/server";
import { LANGUAGES } from "@/lib/languages";
import { verifyChatToken } from "@/lib/server/store";
import { sendMessage, telegramReady } from "@/lib/server/telegram";
import { composeTell, isCalendarUrl, tellKeyboard, type TellPayload } from "@/lib/tell";

const str = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");

export async function POST(request: NextRequest) {
  if (!telegramReady()) return NextResponse.json({ error: "Telegram の執事は準備中です。" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const chat = await verifyChatToken(str(body.chatId, 40), str(body.token, 100));
  if (!chat) return NextResponse.json({ error: "家族の Telegram とつながっていません。設定からつないでください。" }, { status: 403 });
  const p = body.payload as TellPayload | undefined;
  const blocks = Array.isArray(p?.blocks) ? p!.blocks : [];
  const langOk = (x: unknown) => LANGUAGES.find((l) => l.code === x)?.code;
  const rawLangs = Array.isArray(p?.takerLangs) ? p!.takerLangs : [];
  // 担当の候補と、その人の読みたい言葉（同じ順のまま組にしてから絞る）
  const pairs = (Array.isArray(p?.takers) ? p!.takers : [])
    .slice(0, 4)
    .map((t, i) => ({
      names: Object.fromEntries(LANGUAGES.map((l) => [l.code, str(t?.[l.code], 20)]).filter(([, v]) => v)) as TellPayload["takers"][number],
      lang: langOk(rawLangs[i]),
    }))
    .filter((x) => x.names.ja);
  const calendar = Object.fromEntries(
    LANGUAGES.map((l) => [l.code, p?.calendar?.[l.code]]).filter(([, url]) => isCalendarUrl(url)),
  ) as TellPayload["calendar"];
  const payload: TellPayload = {
    holder: str(p?.holder, 20),
    takers: pairs.map((x) => x.names),
    takerLangs: pairs.map((x) => x.lang),
    calendar,
    sources: (Array.isArray(p?.sources) ? p!.sources : []).map((s) => str(s, 200)).slice(0, 12),
    blocks: blocks
      .filter((b) => LANGUAGES.some((l) => l.code === b?.lang))
      .slice(0, 3)
      .map((b) => ({ lang: b.lang, title: str(b.title, 200), lines: (Array.isArray(b.lines) ? b.lines : []).map((l) => str(l, 400)).slice(0, 16) })),
  };
  if (!payload.blocks.length) return NextResponse.json({ error: "送る中身がありません。" }, { status: 400 });
  const text = composeTell(payload);
  // 担当のボタン（候補ごとに1行）の下に、段の言葉ごとの「カレンダーに追加」（Google カレンダーの予定を作る画面）を1行
  const { takerRows, calendarRow } = tellKeyboard(payload);
  const rows = [...takerRows, ...(calendarRow.length ? [calendarRow] : [])];
  let sent = await sendMessage(body.chatId, text, { buttons: rows.length ? rows : undefined });
  // カレンダーのボタンで断られたときは、カレンダーのボタン無しでお知らせだけは届ける
  if (!sent && calendarRow.length) sent = await sendMessage(body.chatId, text, { buttons: takerRows.length ? takerRows : undefined });
  return sent ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "送れませんでした。bot がグループに入っているか確かめてください。" }, { status: 502 });
}
