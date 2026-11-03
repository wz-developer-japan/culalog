// 「つなぐ」＋「ひとこと」（Claude API）の入口。
// 確定した書類・わが家のきまり・コードが作った候補を受け取り、
// ひとことに選ぶ候補と言い回し、書類同士・きまりをつないだ気づきを決まった形で返す。
// 返したものは端末の側でコードが確かめる（ID・日付・判断の言い回し）。サーバーには何も残さない。

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { CONNECT_SCHEMA } from "@/lib/connect";
import { checkRateLimit } from "@/lib/rateLimit";

/** 受け付ける本文の上限。家の書類の要点だけなので小さい */
const MAX_BODY_BYTES = 300 * 1024;

const MODEL = "claude-opus-5-5";

export const maxDuration = 60;

const SYSTEM_PROMPT = `あなたは、ある家族の「執事」です。家に届いた書類と、その家のきまり（例: 勤務先のきまりで有給の申請は1週間前まで）を見て、今日伝えるべきことを選び、書類同士・きまりをつないで本人が見落としていそうなことに気づく係です。

渡されるもの（JSON）:
- today: 今日の日付
- style: 話し方
- family: 家族（id・呼び名・続柄・メモ）。メモには勤務の事情など、その家の事情が書いてある
- rules: わが家のきまり（id・名前・予定の何日前までか・誰のきまりか・メモ）
- documents: 本人が原本と見比べて確定した書類。予定（deadlines）には id・種類・日付・時刻・場所・必要なもの・原本の場所・当てはめ済みのきまり（appliedRuleIds）・予備日（reserve）がある。olderVersionOf が空でない書類は「前のもの」（その id の書類の、前の版）
- candidates: コードが期日から作った、ひとことの候補（id・見出し・詳しく・理由・urgent＝締切が3日以内か過ぎた・followUp＝まだ済んでいない締切の念押し）
- rejected: 本人が「違う」と答えた気づき（kind|deadlineId|ruleId|oldDeadlineId の形）

返すもの:
1. briefing: candidates の中から、今日いちばん伝えるべきものを多くても3つ選び、candidateId と、ひとこと（text・1〜2文）を書く。
   - followUp と urgent があるものを優先する。
   - text は、その候補の見出し・詳しく・理由に書いてあることだけで書く。日付を書くときは、候補に書いてある日付をそのまま使う（計算し直さない・曜日を足さない）。
2. insights: 書類同士・きまりをつないで気づいたこと。多くても3つ。当てはまるものが無ければ空にする（無理に作らない）。
   - apply_rule: 行事・予定（kind が event）に、まだ当てはめていないきまりが関わりそうなとき（例: 授業参観が平日で、きまりに「有給の申請は1週間前まで」がある）。deadlineId に予定の id、ruleId にきまりの id。
   - apply_rule_to_reserve: 予定の予備日（reserve）に、まだ当てはめていないきまりが関わりそうなとき（例: 本番の土曜には有給の申請を当てはめたが、雨天の予備日の日曜には当てはめていない）。deadlineId に予定の id、ruleId にきまりの id。
   - date_changed: 前のもの（olderVersionOf がある書類）と新しい書類で、同じ行事の日付が違うとき。deadlineId に新しい書類の予定の id、oldDeadlineId に前の書類の予定の id。
   - other: 上のどれでもないつながり（例: 火災保険の満期が、賃貸の契約の満了より先に来る）。
   - 使わない id は空文字にする。evidence には、根拠の書類の id と原本の場所（location）を書く。
   - rejected にあるものと同じ気づきは出さない。

守ること:
- 渡されたデータに書いてあることだけを根拠にする。書いていないことは補わない。
- 言い切らない。「〜かもしれません」「〜が要るかもしれません」の形で提案する。採用するか決めるのは本人。
- 判断や助言をしない。「補償される」「保険が使える」「受診すべき」「解約したほうがよい」「お得」などは書かない。保険・医療・法律について結論を出さない。
- 前のもの（olderVersionOf が空でない書類）は、新旧を比べるためだけに使う。ひとことや、ほかの気づきの根拠にしない。
- 話し方は style に合わせる。ただし、日付・どの書類か・注意の中身は、話し方で変えない。自分の名前は書かない。
- すべて日本語で書く。`;

function clientIdOf(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

const fail = (status: number, error: string, headers?: Record<string, string>) =>
  NextResponse.json({ error }, { status, headers });

/** 形を最低限確かめる（中身の確かめは端末の側のコードで行う） */
function looksLikeInput(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.today === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x.today) &&
    typeof x.style === "string" &&
    ["family", "rules", "documents", "candidates", "rejected"].every((k) => Array.isArray(x[k])) &&
    (x.documents as unknown[]).length <= 60 &&
    (x.candidates as unknown[]).length <= 80
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
  // 架空の家族では呼ばない設定（CONNECT_DEMO=off）。画面は仮のものに切り替わる
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
      output_config: { effort: "medium", format: { type: "json_schema", schema: CONNECT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `この家のデータです。今日のひとことと、気づいたことを返してください。\n\n${JSON.stringify(forClaude)}`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return fail(422, "今日のひとことを作れませんでした。");
    if (response.stop_reason === "max_tokens") return fail(422, "今日のひとことを作りきれませんでした。");
    const text = response.content.find((b) => b.type === "text");
    let result: unknown = null;
    try {
      result = text && text.type === "text" ? JSON.parse(text.text) : null;
    } catch {
      result = null;
    }
    if (!result) return fail(502, "執事の答えをうまく受け取れませんでした。");
    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return fail(429, "混み合っています。少し時間をおいてからお試しください。");
    if (error instanceof Anthropic.BadRequestError) {
      console.error("connect: bad request", error.message);
      return fail(422, "今日のひとことを作れませんでした。");
    }
    if (error instanceof Anthropic.APIError) {
      console.error("connect: api error", error.status);
      return fail(502, "今日のひとことを作れませんでした。少し時間をおいてからお試しください。");
    }
    console.error("connect: unexpected", error);
    return fail(500, "今日のひとことを作れませんでした。");
  }
}
