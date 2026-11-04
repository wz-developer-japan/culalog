// 書類の読み取り（Claude API）の入口。
// 写真・PDF を受け取り、原本に書いてあることと「原本のどこか」だけを決まった形で返す。
// 読み取った内容はサーバーに保存しない（返したら終わり）。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { EXTRACTION_SCHEMA, type FamilyForReading, parseExtraction } from "@/lib/extraction";
import { EXTRACT_MODEL as MODEL, EXTRACT_SYSTEM_PROMPT as SYSTEM_PROMPT } from "@/lib/extractPrompt";
import { checkRateLimit } from "@/lib/rateLimit";
import { usageOf } from "@/lib/server/usage";

/** 受け付ける本文の上限（画像を含む）。これを超えたら Claude を呼ばずに断る */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];


/** 文字で渡す書類（メールの本文など）の長さの上限 */
const MAX_TEXT = 20000;

/** 1つの書類として一緒に読む写真の枚数の上限（何ページもある契約書・郵便一式など） */
const MAX_PAGES = 6;

/** 読み取りは数十秒かかることがあるので、関数の実行時間を長めにとる */
export const maxDuration = 60;


function clientIdOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const fail = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers });

/** 家族の一覧を確かめる（誰の書類かを推測するためだけに使い、保存しない） */
function parseFamily(value: unknown): FamilyForReading[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  const short = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const family = value.map((m) => ({
    id: short(m?.id, 40),
    name: short(m?.name, 40),
    relation: short(m?.relation, 20),
    note: short(m?.note, 80),
  }));
  return family.every((m) => m.id && m.name) ? family : null;
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(503, "読み取り機能は準備中です。手入力での登録はご利用いただけます。");
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > MAX_BODY_BYTES) {
    return fail(413, "ファイルが大きすぎるか、空です。5MB 以下の画像か PDF を選んでください。");
  }

  let body: { mediaType?: unknown; data?: unknown; pages?: unknown; today?: unknown; family?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "送られてきた内容を読めませんでした。");
  }
  const { today } = body;
  // 1枚（画像か PDF）か、1つの書類の何ページかの写真（pages）
  const files = Array.isArray(body.pages) ? (body.pages as { mediaType?: unknown; data?: unknown }[]) : [{ mediaType: body.mediaType, data: body.data }];
  if (files.length === 0 || files.length > MAX_PAGES) return fail(400, `1つの書類として読めるのは${MAX_PAGES}ページまでです。`);
  const many = Array.isArray(body.pages);
  // 文字で渡したもの（メールの本文など）。UTF-8 の base64 で受け取り、文字の文書として読む
  const isText = !many && files[0]?.mediaType === "text/plain";
  let plain = "";
  if (isText) {
    const data = files[0].data;
    if (typeof data !== "string" || !data || /[^A-Za-z0-9+/=]/.test(data)) return fail(400, "文字を読めませんでした。");
    plain = Buffer.from(data, "base64").toString("utf8").trim();
    if (!plain || plain.length > MAX_TEXT) return fail(400, `文字は${MAX_TEXT.toLocaleString()}文字までです。`);
  }
  for (const f of isText ? [] : files) {
    const isPdf = f?.mediaType === "application/pdf";
    const isImage = IMAGE_TYPES.includes(f?.mediaType as ImageType);
    if ((!isPdf && !isImage) || (many && isPdf) || typeof f.data !== "string" || !f.data || /[^A-Za-z0-9+/=]/.test(f.data)) {
      return fail(400, many ? "ページの写真は画像（JPEG・PNG・WebP）で送ってください。" : "画像（JPEG・PNG・WebP）か PDF を選んでください。");
    }
  }
  const todayText = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : null;
  if (!todayText) return fail(400, "今日の日付が送られてきませんでした。");
  const family = parseFamily(body.family);
  if (!family) return fail(400, "家族の情報の形が正しくありません。");

  // 使いすぎ対策は、形の確認が済んでから数える（壊れた送信で回数を使わない）
  const limit = checkRateLimit(clientIdOf(request));
  if (!limit.ok) {
    const message =
      limit.reason === "client"
        ? "短い時間に読み取りが続いたため、少し時間をおいてからお試しください。"
        : "本日の読み取りの上限に達しました。手入力での登録はご利用いただけます。";
    return fail(429, message, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const blocks: Anthropic.Beta.BetaContentBlockParam[] = isText
    ? [{ type: "document", source: { type: "text", media_type: "text/plain", data: plain }, title: "渡された文字（メールの本文など）" }]
    : files.flatMap((f, i) => {
    const block: Anthropic.Beta.BetaContentBlockParam =
      f.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data as string } }
        : { type: "image", source: { type: "base64", media_type: f.mediaType as ImageType, data: f.data as string } };
    return many ? [{ type: "text" as const, text: `${i + 1}ページ目:` }, block] : [block];
  });
  const textNote = isText
    ? "\nこれは写真ではなく、文字だけの書類です（メールの本文などを貼り付けたもの。先頭に差出人・件名・受信日時があることがあります）。location は「件名」「本文 2段落目」「本文『お支払いについて』の段落」のように、行や段落で示してください。transcript には渡された文字をそのまま書き、quote はその中の文字をそのまま抜き出してください。メールの宣伝・おすすめ・「今だけ」の案内は、本人の手続きの締切として扱わないでください。受信日時があれば、年の書いていない日付はそれを基準にしてください。\n"
    : "";
  const pagesNote = many
    ? `\nこれは1つの書類の${files.length}ページ分の写真です（順番どおり）。1つの書類として書き写し、location には「2ページ目 第5条」のようにページも書いてください。\n`
    : "";

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...blocks,
            {
              type: "text",
              text: `${textNote}${pagesNote}今日の日付: ${todayText}\n家族の一覧:\n${family
                .map((m) => `- id: ${m.id} / 呼び名: ${m.name} / 続柄: ${m.relation}${m.note ? ` / メモ: ${m.note}` : ""}`)
                .join("\n")}\n\nこの書類に書いてあることを書き写してください。`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return fail(422, "この書類は読み取れませんでした。手入力で登録してください。");
    }
    if (response.stop_reason === "max_tokens") {
      return fail(422, "書類が長すぎて読み取りきれませんでした。ページを分けるか、手入力で登録してください。");
    }
    const text = response.content.find((b) => b.type === "text");
    let extraction = null;
    try {
      extraction =
        text && text.type === "text"
          ? parseExtraction(
              JSON.parse(text.text),
              family.map((m) => m.id),
            )
          : null;
    } catch {
      extraction = null;
    }
    if (!extraction) return fail(502, "読み取りの結果をうまく受け取れませんでした。もう一度お試しください。");

    return NextResponse.json({ extraction, usage: usageOf(response) });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, "読み取りが混み合っています。少し時間をおいてからお試しください。");
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("extract: bad request", error.message);
      // 断られた理由（API の説明文。キーや書類の中身は入らない）を添える。原因を本番で確かめられるように
      return NextResponse.json(
        { error: "このファイルは読み取れませんでした。別の写真か、手入力でお試しください。", detail: String(error.message).slice(0, 300) },
        { status: 422 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      console.error("extract: api error", error.status);
      return fail(502, "読み取りに失敗しました。少し時間をおいてからお試しください。");
    }
    console.error("extract: unexpected", error);
    return fail(500, "読み取りに失敗しました。");
  }
}
