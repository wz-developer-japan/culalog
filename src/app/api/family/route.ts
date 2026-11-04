// 家族と共有した書類のまとめを、家族の置き場所（サーバー）に置く・消す。
// アプリから: { chatId, token, action: "sync", roster, docs } ／ "clear" ／ "inbox"（1対1に届いた写真の「預かる？」）／ "inboxDone", ids
// 🔴 置かない線（写真・原本の全文・大事な番号など）は sanitizeSummary で必ず引く。合言葉が合う家族だけ

import { NextRequest, NextResponse } from "next/server";
import { sanitizeRoster, sanitizeSummary, type FamilySummary } from "@/lib/familyShare";
import { clearFamilyData, familyInbox, familyInboxDone, replaceFamilyDocs, store, verifyChatToken } from "@/lib/server/store";

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
  if (body.action === "inbox") return NextResponse.json({ items: await familyInbox(chatId) });
  if (body.action === "inboxDone") {
    await familyInboxDone(chatId, Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string").slice(0, 20) : []);
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "sync") return NextResponse.json({ error: "action が違います。" }, { status: 400 });
  const raw = Array.isArray(body.docs) ? body.docs.slice(0, 80) : [];
  const docs = raw.map(sanitizeSummary).filter((d: FamilySummary | null): d is FamilySummary => Boolean(d));
  if (JSON.stringify(docs).length > 900_000) return NextResponse.json({ error: "まとめが大きすぎます。" }, { status: 413 });
  await replaceFamilyDocs(chatId, docs, sanitizeRoster(body.roster));
  return NextResponse.json({ ok: true, count: docs.length });
}
