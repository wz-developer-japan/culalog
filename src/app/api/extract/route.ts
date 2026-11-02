// 書類の読み取り（Claude API）の入口。
// 現時点では使いすぎ対策と入力チェックだけを実装し、読み取りの本体は次の段階で入れる。

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

/** 受け付ける本文の上限（画像を含む）。これを超えたら Claude を呼ばずに断る */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function clientIdOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "読み取り機能は準備中です。手入力での登録はご利用いただけます。" },
      { status: 503 },
    );
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "ファイルが大きすぎるか、空です。5MB 以下の画像か PDF を選んでください。" },
      { status: 413 },
    );
  }

  const limit = checkRateLimit(clientIdOf(request));
  if (!limit.ok) {
    const message =
      limit.reason === "client"
        ? "短い時間に読み取りが続いたため、少し時間をおいてからお試しください。"
        : "本日の読み取りの上限に達しました。手入力での登録はご利用いただけます。";
    return NextResponse.json(
      { error: message },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  return NextResponse.json({ error: "読み取りの本体はまだ実装されていません。" }, { status: 501 });
}
