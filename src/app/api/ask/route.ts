// 「執事に聞く」（Claude API）の入口。
// 今年度の確定した書類の中身（番号は伏せてある・電話番号は入っていない）と質問を受け取り、
// 答えと引用（書類の ID・原本の場所・原文の抜き書き）を決まった形で返す。
// 引用は端末の側でコードが原本と照らし合わせる。サーバーには何も残さない。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { ASK_SCHEMA, QUESTION_MAX } from "@/lib/ask";
import { checkRateLimit } from "@/lib/rateLimit";
import { usageOf } from "@/lib/server/usage";

const MAX_BODY_BYTES = 600 * 1024;

const MODEL = "claude-opus-5-5";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは、ある家族の「執事」です。本人が原本と見比べて確定した、今年度の書類だけを根拠に、本人の質問に答える係です。本人が「覚えておいて」「その前に教えて」と話したときは、覚えておく予定の案を作る係でもあります。

渡されるもの（JSON）:
- today: 今日の日付
- style: 話し方
- family: 家族（id・呼び名・続柄・メモ）
- documents: 確定した書類。それぞれに項目（fields）・予定（deadlines）・問い合わせ先（contacts）・原本の文字（text）・しまい場所（storageLocation）がある。項目・予定には原本の場所（location）と原文の抜き書き（quote）が付いている
- question: 本人の質問

返すもの:
- intent: 本人の言葉が、書類について聞いている・調べてほしいことなら "question"。書類が無くても、予定・締切を覚えておいてほしい・その前に知らせてほしいこと（例:「写真編集ソフトのサブスク、年に1回しか解約できない。次は来年の3月。その前に教えて」）なら "remember"。
- remember: intent が "remember" のときだけ書く（"question" のときは、文字は空・memberIds は空・kind と category は空文字）。
  - label: 予定の短い名前（例:「写真編集ソフトのサブスクの解約」）。本人の言葉にあることだけで書く。
  - date: 本人の言葉にある日付を YYYY-MM-DD で。年が無ければ today から見て最も近い将来。「来年」は today の次の年。月だけなら、その月の1日を date、末日を endDate にする。日付が言葉に無ければ空にする（推測で作らない）。
  - endDate: 期間の終わり（無ければ空）。
  - kind: 解約できる時期が限られている → cancel_window、「○日までに申し出」→ notice、受付期間 → window、行事・予定 → event、提出・支払いの締切 → due、満了・更新 → expiry。
  - memberIds: 誰のことか言葉から分かれば family の id。分からなければ空（推測で入れない）。
  - category: 大きな分類。
  - 「何日前から知らせるか」は書かない（コードが決める）。intent が "remember" のときは answer・citations・relatedDocumentIds を空にし、found は true にする。
- found: 質問の答えが書類に書いてあれば true。書いていなければ false。
- answer: 答え（2〜4文）。found が true のときは、書いてあることを、どの書類のどこに書いてあるかと一緒に伝える。しまい場所が分かれば添える。found が false のときは「登録されている書類には書いていません」と、何が書いていないかだけを書き、関係しそうな書類があれば、その問い合わせ先を案内する（判断や一般的な知識で補わない）。
- citations: 答えの根拠。documentId・location（原本の場所）・quote（原本の文字 text の中の、短い抜き書き。そのまま抜き出す。言い換えない）。found が true なら1つ以上。
- relatedDocumentIds: 質問に関係する書類の id（found が false のとき、問い合わせ先を出すために使う）。

守ること:
- 渡された書類に書いてあることだけを根拠にする。書いていないことは補わない。一般的な知識・推測で答えない。
- 日付を書くときは、書類に書いてある日付をそのまま使う（計算し直さない・曜日を足さない）。「あと何日」などの計算もしない。
- 判断や助言をしない。「補償される」「保険が使える」「お金が出る」「受診すべき」「解約したほうがよい」「お得」などは書かない。保険・医療・法律について結論を出さない。当てはめ（「うちの場合は〜できる可能性があります」）も書かない。出すのは「条件がどこに書いてあるか」と「問い合わせ先」まで。最終の確認は原本と窓口に任せる。
- 「○○は入っていますか」「○○は対象ですか」のような質問にも、対象・条件が書いてある場所（原本の場所と原文）を示すだけにし、当てはまるかどうかは言わない。
- 伏せられている番号（「（伏せています）」）は、そのまま「伏せられています」と伝える。
- 話し方は style に合わせる。ただし、日付・どの書類か・注意の中身は、話し方で変えない。自分の名前は書かない。
- 画面に出る文で、このアプリを使っている人（書類を渡した人）を指すときは「あなた」と書く。「本人」とは書かない（原文の抜き書きはそのまま）。
- すべて日本語で書く。`;

function clientIdOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const fail = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers });

function looksLikeInput(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.today) &&
    typeof x.style === "string" &&
    typeof x.question === "string" &&
    x.question.trim().length > 0 &&
    x.question.length <= QUESTION_MAX &&
    Array.isArray(x.family) &&
    Array.isArray(x.documents) &&
    (x.documents as unknown[]).length <= 60
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(503, "執事（Claude）は準備中です。");
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (!length || length > MAX_BODY_BYTES) return fail(413, "送られてきた内容が大きすぎるか、空です。");

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return fail(400, "送られてきた内容を読めませんでした。");
  }
  if (!looksLikeInput(input)) return fail(400, "送られてきた内容の形が正しくありません。");
  const { demo, ...forClaude } = input as Record<string, unknown> & { demo?: unknown };
  if (demo === true && process.env.CONNECT_DEMO === "off") return fail(503, "デモでは執事（Claude）を呼ばない設定です。");

  const limit = checkRateLimit(clientIdOf(request));
  if (!limit.ok) {
    return fail(429, "少し時間をおいてからお試しください。", { "Retry-After": String(limit.retryAfterSeconds) });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: ASK_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          // 家の書類と家族（同じ家なら何度聞いても同じ）を先に置いてキャッシュし、質問と今日の日付はその後ろに
          content: [
            { type: "text", text: `この家の書類と家族です。\n\n${JSON.stringify({ family: forClaude.family, documents: forClaude.documents })}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: `本人の質問です。書類に書いてあることだけで答えてください。\n\n${JSON.stringify(Object.fromEntries(Object.entries(forClaude).filter(([k]) => k !== "family" && k !== "documents")))}` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return fail(422, "この質問には答えられませんでした。");
    if (response.stop_reason === "max_tokens") return fail(422, "答えを作りきれませんでした。");
    const text = response.content.find((b) => b.type === "text");
    let result: unknown = null;
    try {
      result = text && text.type === "text" ? JSON.parse(text.text) : null;
    } catch {
      result = null;
    }
    if (!result) return fail(502, "執事の答えをうまく受け取れませんでした。");
    return NextResponse.json({ result, usage: usageOf(response) });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, "混み合っています。少し時間をおいてからお試しください。");
    if (error instanceof Anthropic.BadRequestError) {
      console.error("ask: bad request", error.message);
      return fail(422, "この質問には答えられませんでした。");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("ask: api error", error.status);
      return fail(502, "答えを作れませんでした。少し時間をおいてからお試しください。");
    }
    console.error("ask: unexpected", error);
    return fail(500, "答えを作れませんでした。");
  }
}
