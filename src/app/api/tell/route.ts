// 「家族に伝える」: アプリで作って画面で確かめた文を、大人それぞれと執事の1対1へ、その人の言葉の段だけで送る。
// 家族のグループには流さない（グループは通訳だけ）。1対1を始めていない人は notStarted で返し、アプリでその人の分は文のコピーで渡す。
// 担当を決めるために、お知らせの控え（言葉ごとの題・送った先）だけを家族の置き場所に置く

import { NextRequest, NextResponse } from "next/server";
import { LANGUAGES } from "@/lib/languages";
import { verifyChatToken } from "@/lib/server/store";
import { deliverTell } from "@/lib/server/dm";
import { telegramReady } from "@/lib/server/telegram";
import { isCalendarUrl, type TellPayload } from "@/lib/tell";

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
  const rawIds = Array.isArray(p?.takerIds) ? p!.takerIds : [];
  const pairs = (Array.isArray(p?.takers) ? p!.takers : [])
    .slice(0, 4)
    .map((t, i) => ({
      names: Object.fromEntries(LANGUAGES.map((l) => [l.code, str(t?.[l.code], 20)]).filter(([, v]) => v)) as TellPayload["takers"][number],
      lang: langOk(rawLangs[i]),
      id: str(rawIds[i], 60),
    }))
    .filter((x) => x.names.ja);
  const calendar = Object.fromEntries(
    LANGUAGES.map((l) => [l.code, p?.calendar?.[l.code]]).filter(([, url]) => isCalendarUrl(url)),
  ) as TellPayload["calendar"];
  const payload: TellPayload = {
    holder: str(p?.holder, 20),
    holderNames: Object.fromEntries(LANGUAGES.map((l) => [l.code, str(p?.holderNames?.[l.code], 20)]).filter(([, v]) => v)) as TellPayload["holderNames"],
    takers: pairs.map((x) => x.names),
    takerLangs: pairs.map((x) => x.lang),
    takerIds: pairs.map((x) => x.id),
    calendar,
    ics: Object.fromEntries(
      LANGUAGES.map((l) => [l.code, p?.ics?.[l.code]]).filter(([, x]) => typeof x === "string" && x.length < 8000 && x.startsWith("BEGIN:VCALENDAR") && x.trimEnd().endsWith("END:VCALENDAR")),
    ) as TellPayload["ics"],
    sources: (Array.isArray(p?.sources) ? p!.sources : []).map((s) => str(s, 200)).slice(0, 12),
    blocks: blocks
      .filter((b) => LANGUAGES.some((l) => l.code === b?.lang))
      .slice(0, 3)
      .map((b) => ({ lang: b.lang, title: str(b.title, 200), lines: (Array.isArray(b.lines) ? b.lines : []).map((l) => str(l, 400)).slice(0, 16) })),
  };
  if (!payload.blocks.length) return NextResponse.json({ error: "送る中身がありません。" }, { status: 400 });
  const out = await deliverTell(body.chatId, chat, payload, process.env.PUBLIC_BASE_URL ?? request.nextUrl.origin);
  if (!out.sent.length && !out.notStarted.length) return NextResponse.json({ error: "送れませんでした。もう一度お試しください。" }, { status: 502 });
  return NextResponse.json({ ok: true, ...out });
}
