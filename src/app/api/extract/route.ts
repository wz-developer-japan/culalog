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

/** 文字で渡す書類（メールの本文など）の長さの上限 */
const MAX_TEXT = 20000;

/** 1つの書類として一緒に読む写真の枚数の上限（何ページもある契約書・郵便一式など） */
const MAX_PAGES = 6;

/** 読み取りは数十秒かかることがあるので、関数の実行時間を長めにとる */
export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは、家族の「執事」として、家に届く書類（学校・保育園のお知らせ、賃貸・保険の契約書、病院・健診の案内、勤務先や町内会の通知など、種類は問わない）の写真や PDF から、書いてあることを共通の形に書き写す係です。

守ること:
- 書類に書いてあることだけを書き写す。書いていないことを補わない・推測で埋めない。
- 判断や助言をしない。「補償される」「解約したほうがよい」「受診すべき」「お得」などは書かない。保険・医療・法律について結論を出さない。
- 項目・予定・問い合わせ先には、原本のどこに書いてあったか（例:「第5条」「2. 日時」「裏面 下段」）を location に書く。quote には原文の短い抜き書きを書く。
- 予定・やること（deadlines）は「いつ・何を・どこで・何が必要」の形にする。date は YYYY-MM-DD。年が書かれていないときは、今日の日付から見て最も近い将来の日付とし、quote に原文の書き方をそのまま残す。time は書いてあれば「8:40」「13:00〜13:30」の形、place は場所、needs は持ち物・提出物・費用などを1つずつ。書いていなければ空にする。
- kind: 満了日・更新日は expiry、受付期間は window、「○日前までに申し出」は notice、解約できる時期が限られているものは cancel_window、事故や入院など何か起きたあとの期限は after_event、行事・予定・健診は event、提出・申し込み・支払いの締切は due。
- 雨天・延期の予備日や振替日（例:「雨天の場合は 11月15日（日）に順延します」）は、別の予定にせず、本番の予定の reserve に入れる。date は YYYY-MM-DD、condition はどんなときか（例:「雨天の場合」）、location と quote は予備日が書いてある所。予備日が無ければ reserve の中をすべて空にする。
- 期間のあるもの（window・cancel_window）は endDate に終わりの日を書く。それ以外は endDate を空にする。
- 自動で更新される契約などで、同じ期限・期間が決まった間隔でくり返すと書いてあるときは、repeatMonths にその月数（12・24 など）を書く。くり返さないときは 0。
- 年間行事予定などで、全体にまとめて書いてある持ち物・準備の決まり（例:「遠足の日はお弁当と水筒が必要です」）は、当てはまる予定それぞれの needs に入れ、quote に元の文を残す。
- period: この書類がいつの分か（年度・保険期間・契約期間・有効期限など）。label は原本の書き方（例:「2026年度」「保険期間 2025年4月1日〜2026年4月1日」）、from・until は YYYY-MM-DD。書いていなければ空にする。
- 誰の書類か（who）: 送られてくる家族の一覧（id・呼び名・続柄・メモ）と原本を見比べ、当てはまる人の id を memberIds に入れる。宛名や学年・園名・対象年齢などから言い切れるときだけ sure を true にする。迷うとき・候補が複数あるときは sure を false にし、いちばんありそうな人を memberIds に入れ、reason に、なぜそう考えたかを、ふつうの言葉で短く書く（例:「対象は2024年5月〜10月生まれの子。うちだと結衣さんが当てはまりそう」）。条文の番号や「登録されていない」のような言い方は避ける。
- questions: 誰の書類か以外で、本人に聞かないとこの家の予定が決まらないことがあれば、選択肢で聞く（例: 班ごとに当番の日が違い、この家が何班か分からない）。選択肢は原本に書いてあるものから作り、短くする。迷いが無ければ空にする。多くても2つまで。
- 読めない・かすれている・はっきりしない箇所は、値を作らずに unclear に「どこが」読めなかったかを書く。
- 電話番号は書いてある通りに書き写す。
- summary: 読んだ直後に本人が一目で分かる3行。what は「これは何の書類か」を1文で。todo は「書類が本人に求めていること」を1文で（例:「問診票に記入して、当日持っていく」）。求めていることが無ければ「特にありません（お知らせのみ）」。判断・助言・おすすめは書かない。
- summary.ifIgnored: 「手続きをしないとどうなるか」が原本にはっきり書いてあるときだけ、その内容を text に書き、location に原本の場所、quote に原文をそのまま書く（例: 「更新の手続きをされない場合、満期日をもって契約は終了します」）。書いていなければ text・location・quote をすべて空にする。一般的な知識や推測で埋めない。
- transcript: 原本の文字を、上から順に書いてある通りに書き写す（改行もなるべく原本どおり）。読めない所は「（読めません）」とする。各項目の quote は、この transcript の中の文字をそのまま抜き出す（言い換えない）。
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
