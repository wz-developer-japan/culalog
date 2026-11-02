// 書類の読み取り（Claude API）の入口。
// 写真・PDF を受け取り、原本に書いてあることと「原本のどこか」だけを決まった形で返す。
// 読み取った内容はサーバーに保存しない（返したら終わり）。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { EXTRACTION_SCHEMA, type FamilyForReading, parseExtraction } from "@/lib/extraction";
import { checkRateLimit } from "@/lib/rateLimit";

/** 受け付ける本文の上限（画像を含む）。これを超えたら Claude を呼ばずに断る */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

const MODEL = "claude-opus-5-5";

/** 読み取りは数十秒かかることがあるので、関数の実行時間を長めにとる */
export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは、家族の「執事」として、家に届く書類（学校・保育園のお知らせ、賃貸・保険の契約書、病院・健診の案内、勤務先や町内会の通知など、種類は問わない）の写真や PDF から、書いてあることを共通の形に書き写す係です。

守ること:
- 書類に書いてあることだけを書き写す。書いていないことを補わない・推測で埋めない。
- 判断や助言をしない。「補償される」「解約したほうがよい」「受診すべき」「お得」などは書かない。保険・医療・法律について結論を出さない。
- 項目・予定・問い合わせ先には、原本のどこに書いてあったか（例:「第5条」「2. 日時」「裏面 下段」）を location に書く。quote には原文の短い抜き書きを書く。
- 予定・やること（deadlines）は「いつ・何を・どこで・何が必要」の形にする。date は YYYY-MM-DD。年が書かれていないときは、今日の日付から見て最も近い将来の日付とし、quote に原文の書き方をそのまま残す。time は書いてあれば「8:40」「13:00〜13:30」の形、place は場所、needs は持ち物・提出物・費用などを1つずつ。書いていなければ空にする。
- kind: 満了日・更新日は expiry、受付期間は window、「○日前までに申し出」は notice、解約できる時期が限られているものは cancel_window、事故や入院など何か起きたあとの期限は after_event、行事・予定・健診は event、提出・申し込み・支払いの締切は due。
- 期間のあるもの（window・cancel_window）は endDate に終わりの日を書く。それ以外は endDate を空にする。
- 誰の書類か（who）: 送られてくる家族の一覧（id・呼び名・続柄・メモ）と原本を見比べ、当てはまる人の id を memberIds に入れる。宛名や学年・園名・対象年齢などから言い切れるときだけ sure を true にする。迷うとき・候補が複数あるときは sure を false にし、いちばんありそうな人を memberIds に入れ、reason に「原本のどこを見て、なぜ迷ったか」を書く（例: 対象が生まれ月で書かれていて、家族の誕生日が分からない）。
- questions: 誰の書類か以外で、本人に聞かないとこの家の予定が決まらないことがあれば、選択肢で聞く（例: 班ごとに当番の日が違い、この家が何班か分からない）。選択肢は原本に書いてあるものから作り、短くする。迷いが無ければ空にする。多くても2つまで。
- 読めない・かすれている・はっきりしない箇所は、値を作らずに unclear に「どこが」読めなかったかを書く。
- 電話番号は書いてある通りに書き写す。
- title は書類の題名を短く。docType は書類の種類を短い日本語で（例:「歯科健診のお知らせ」「賃貸借契約書」）。category は大きな分類。
- すべて日本語で書く。`;

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

  let body: { mediaType?: unknown; data?: unknown; today?: unknown; family?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "送られてきた内容を読めませんでした。");
  }
  const { mediaType, data, today } = body;
  const isPdf = mediaType === "application/pdf";
  const isImage = IMAGE_TYPES.includes(mediaType as ImageType);
  if ((!isPdf && !isImage) || typeof data !== "string" || !data || /[^A-Za-z0-9+/=]/.test(data)) {
    return fail(400, "画像（JPEG・PNG・WebP）か PDF を選んでください。");
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

  const file: Anthropic.Beta.BetaContentBlockParam = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
    : { type: "image", source: { type: "base64", media_type: mediaType as ImageType, data } };

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
            file,
            {
              type: "text",
              text: `今日の日付: ${todayText}\n家族の一覧:\n${family
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

    return NextResponse.json({ extraction });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail(429, "読み取りが混み合っています。少し時間をおいてからお試しください。");
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("extract: bad request", error.message);
      return fail(422, "このファイルは読み取れませんでした。別の写真か、手入力でお試しください。");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("extract: api error", error.status);
      return fail(502, "読み取りに失敗しました。少し時間をおいてからお試しください。");
    }
    console.error("extract: unexpected", error);
    return fail(500, "読み取りに失敗しました。");
  }
}
