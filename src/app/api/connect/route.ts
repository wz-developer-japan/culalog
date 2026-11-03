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

const SYSTEM_PROMPT = `あなたは、ある家族の「執事」です。家に届いた書類と、その家のきまり（例: 勤務先のきまりで休みの申請は1週間前まで）を見て、今日伝えるべきことを選び、書類同士・きまりをつないで本人が見落としていそうなことに気づく係です。

渡されるもの（JSON）:
- today: 今日の日付
- style: 話し方
- family: 家族（id・呼び名・続柄・メモ）。メモには勤務の事情など、その家の事情が書いてある
- rules: わが家のきまり（id・名前・予定の何日前までか・誰のきまりか・メモ）
- documents: 本人が原本と見比べて確定した書類。予定（deadlines）には id・種類・日付・時刻・場所・必要なもの・原本の場所・当てはめ済みのきまり（appliedRuleIds）・予備日（reserve）がある。olderVersionOf が空でない書類は「前のもの」（その id の書類の、前の版）
- candidates: コードが期日から作った、ひとことの候補（id・見出し・詳しく・理由・urgent＝締切が3日以内か過ぎた・followUp＝まだ済んでいない締切の念押し）
- rejected: 本人が「違う」と答えた気づき（kind|deadlineId|ruleId|oldDeadlineId の形）
- sameDay: コードが書類の日付から見つけた「同じ日」の候補。保護者が行く子どもの行事（event.kind が child）か、町内会・自治会の清掃・当番など家から誰かが出る行事（community）の日に、大人の家族が仕事になっている。id・日付・行事（どの書類のどの予定か）・仕事の大人ごとに、どの勤務の書類のどの行で仕事と読めるか（work）と、その勤務の書類そのものに書いてある休みの申し出の期限（limit。書いていなければ null）

返すもの:
1. briefing: candidates の中から、今日いちばん伝えるべきものを多くても3つ選び、candidateId と、ひとこと（text・1〜2文）を書く。
   - followUp と urgent があるものを優先する。
   - text は、その候補の見出し・詳しく・理由に書いてあることだけで書く。日付を書くときは、候補に書いてある日付をそのまま使う（計算し直さない・曜日を足さない）。
2. insights: 書類同士・きまりをつないで気づいたこと。多くても3つ。当てはまるものが無ければ空にする（無理に作らない）。
   - apply_rule: 行事・予定（kind が event）に、まだ当てはめていないきまりが関わりそうなとき（例: 授業参観が平日で、きまりに「休みの申請は1週間前まで」がある）。deadlineId に予定の id、ruleId にきまりの id。行事に行くかどうかで決まるときは、行くと決めつけず「〇〇さんは見に行きますか？ 行くなら〜」と聞く文にする（画面には「行く」「行かない」のボタンが出る）。
   - apply_rule_to_reserve: 予定の予備日（reserve）に、まだ当てはめていないきまりが関わりそうなとき（例: 本番の土曜には休みの申請を当てはめたが、雨天の予備日の日曜には当てはめていない）。deadlineId に予定の id、ruleId にきまりの id。
   - date_changed: 前のもの（olderVersionOf がある書類）と新しい書類で、同じ行事の日付が違うとき。deadlineId に新しい書類の予定の id、oldDeadlineId に前の書類の予定の id。
   - other: 上のどれでもないつながり（例: 火災保険の満期が、賃貸の契約の満了より先に来る）。
   - 使わない id は空文字にする。evidence には、根拠の書類の id と原本の場所（location）を書く。
   - rejected にあるものと同じ気づきは出さない。
3. sameDay: 渡された sameDay の候補それぞれについて、家族への気づきの文（text・3〜4文）を書き、conflictId に候補の id をそのまま入れる。
   - 1文目: 何月何日（曜日）が、何の日か（child なら「蓮さんの授業参観の日」、community なら「町内会の一斉清掃の日」のように）。
   - 2文目: その日、誰がお仕事のようか（勤務の書類から読めることだけ）。
   - 3文目: 誰が行くか（community なら出るか）、行かないかも含めて家族で決めること。行く・出ると決まったら勤務先への連絡も、と添えてよい。執事は決めない。
   - 4文目（limit があるときだけ）: その勤務の書類の名前と、書いてある申し出の期限（例: 「翔太さんのシフト表では、休みの希望は11月20日（金）までです。」）。limit が null の人の期限は書かない・作らない。
   - 休み方を決めつけない。「有給」「欠勤」「休暇を取る」などの言葉は書かない（有給が残っていない・交代・行かない、もある。決めるのはその家）。
   - 日付は「11月27日（金）」の形で、候補に書いてある日付（行事の日と limit の日）だけを使う。計算し直さない。ほかの日付・「○日前」は書かない。
   - 名前は family の呼び名の下の名前に「さん」を付ける（例: 「日向 蓮」→「蓮さん」）。候補に出てくる子どもと、仕事の大人の名前を全部書く。候補にいない大人の名前は書かない。家族みんなが見る文なので、この文だけは、あなた（アプリを使っている人）のことも名前で書く。
   - 誰が行くか・誰が休むかを決めたり勧めたりしない（「〜さんが行くとよい」「休みを取ってください」は書かない）。
   - evidence には、行事の書類と、それぞれの勤務の書類の id と、原本の場所（その書類の項目・予定の location のとおり）を書く。
   - 候補が空なら空にする。候補に無い「同じ日」を自分で作らない。

守ること:
- 渡されたデータに書いてあることだけを根拠にする。書いていないことは補わない。
- 言い切らない。「〜かもしれません」「〜が要るかもしれません」の形で提案する。採用するか決めるのは本人。
- 判断や助言をしない。「補償される」「保険が使える」「受診すべき」「解約したほうがよい」「お得」などは書かない。保険・医療・法律について結論を出さない。
- 前のもの（olderVersionOf が空でない書類）は、新旧を比べるためだけに使う。ひとことや、ほかの気づきの根拠にしない。
- 話し方は style に合わせる。ただし、日付・どの書類か・注意の中身は、話し方で変えない。自分の名前は書かない。
- 画面に出る文で、このアプリを使っている人（書類を渡した人）を指すときは「あなた」と書く。「本人」とは書かない（原文の抜き書きはそのまま）。
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
    ["family", "rules", "documents", "candidates", "rejected", "sameDay"].every((k) => Array.isArray(x[k])) &&
    (x.sameDay as unknown[]).length <= 10 &&
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
              text: `この家のデータです。今日のひとことと、気づいたことと、同じ日の気づきの文を返してください。\n\n${JSON.stringify(forClaude)}`,
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
