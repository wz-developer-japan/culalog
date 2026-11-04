// 家族と共有した書類のまとめを、家族の置き場所（サーバー）に置く・消す。
// アプリから: { chatId, token, action: "sync", roster, docs } ／ { chatId, token, action: "clear" }
// 🔴 置かない線（写真・原本の全文・大事な番号など）は sanitizeSummary で必ず引く。合言葉が合う家族だけ

import { NextRequest, NextResponse } from "next/server";
import { sanitizeRoster, sanitizeSummary, type FamilySummary } from "@/lib/familyShare";
import { clearFamilyData, replaceFamilyDocs, store, verifyChatToken } from "@/lib/server/store";

export async function POST(request: NextRequest) {
  if (!store()) return NextResponse.json({ error: "家族の置き場所は準備中です。" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const chatId = typeof body.chatId === "string" ? body.chatId : "";
  const chat = await verifyChatToken(chatId, typeof body.token === "string" ? body.token : "");
  if (!chat) return NextResponse.json({ error: "家族の Telegram とつながっていません。" }, { status: 403 });
  if (body.action === "clear") {
    await clearFamilyData(chatId);
    return NextResponse.json({ ok: true, cleared: true });
  }
  if (body.action !== "sync") return NextResponse.json({ error: "action が違います。" }, { status: 400 });
  const raw = Array.isArray(body.docs) ? body.docs.slice(0, 80) : [];
  const docs = raw.map(sanitizeSummary).filter((d: FamilySummary | null): d is FamilySummary => Boolean(d));
  if (JSON.stringify(docs).length > 900_000) return NextResponse.json({ error: "まとめが大きすぎます。" }, { status: 413 });
  await replaceFamilyDocs(chatId, docs, sanitizeRoster(body.roster));
  return NextResponse.json({ ok: true, count: docs.length });
}
