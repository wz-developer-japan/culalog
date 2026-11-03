// 書類の説明を、家族の読みたい言葉にする（Claude API）。
// 送るのは、本人が確かめた書類の中身（題名・説明・項目・予定の名前）だけ。日付は送らず、アプリがその言葉で入れる。
// 訳した内容はサーバーに保存しない（返したら終わり）。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { EXTRACT_MODEL as MODEL } from "@/lib/extractPrompt";
import { LANGUAGES } from "@/lib/languages";
import { checkRateLimit } from "@/lib/rateLimit";
import { parseTranslation, TRANSLATE_SYSTEM_PROMPT, TRANSLATION_SCHEMA } from "@/lib/translate";
import { usageOf } from "@/lib/server/usage";

export const maxDuration = 60;
const MAX_BODY_BYTES = 200 * 1024;

const fail = (status: number, error: string, headers?: Record<string, string>) => NextResponse.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(503, "訳す機能は準備中です。");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > MAX_BODY_BYTES) return fail(413, "書類の中身が長すぎます。");
  let body: { lang?: unknown; doc?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "送られてきた内容を読めませんでした。");
  }
  const lang = LANGUAGES.find((l) => l.code === body.lang);
  const doc = body.doc as { fields?: { ref?: unknown }[]; deadlines?: { ref?: unknown }[] } | undefined;
  if (!lang || lang.code === "ja" || !doc || !Array.isArray(doc.fields) || !Array.isArray(doc.deadlines)) return fail(400, "形が正しくありません。");
  const refs = [...doc.fields, ...doc.deadlines].map((x) => String(x?.ref ?? ""));

  const forwarded = request.headers.get("x-forwarded-for");
  const limit = checkRateLimit(forwarded?.split(",")[0]?.trim() || "unknown");
  if (!limit.ok) return fail(429, "短い時間に続いたため、少し時間をおいてからお試しください。", { "Retry-After": String(limit.retryAfterSeconds) });

  try {
    const response = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: TRANSLATION_SCHEMA } },
      system: TRANSLATE_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `読みたい言葉: ${lang.label}（${lang.code}）\n書類の中身:\n${JSON.stringify(doc)}\n\nこの書類を、読みたい言葉で伝えてください。`,
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text");
    let parsed = null;
    try {
      parsed = text && text.type === "text" ? parseTranslation(JSON.parse(text.text), refs) : null;
    } catch {
      parsed = null;
    }
    if (!parsed) return fail(502, "うまく受け取れませんでした。もう一度お試しください。");
    return NextResponse.json({ translation: parsed, usage: usageOf(response) });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, "混み合っています。少し時間をおいてからお試しください。");
    console.error("translate: failed", error instanceof Anthropic.APIError ? error.status : error);
    return fail(502, "訳すのに失敗しました。少し時間をおいてからお試しください。");
  }
}
