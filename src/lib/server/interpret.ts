// Telegram の通訳の執事が、Claude に頼むこと。
// ① 家族の会話を、ほかの人の読みたい言葉にする ② 家族に伝えた書類のお知らせへの質問に、そのお知らせに書いてある範囲でだけ答える。
// 🔴 書類の中身はサーバーに無い。② で使えるのは、返信先のお知らせ（アプリから送った文・原本の引用と場所つき）だけ。
// 会話の文は保存しない。

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACT_MODEL as MODEL } from "@/lib/extractPrompt";
import { LANGUAGES, VI_DATE_RULE, VI_VOICE_RULE, type LanguageCode } from "@/lib/languages";

const LANG_CODES = LANGUAGES.map((l) => l.code);
const langName = (c: LanguageCode) => LANGUAGES.find((l) => l.code === c)?.label ?? c;
export const langMark = (c: LanguageCode) => `【${LANGUAGES.find((l) => l.code === c)?.native ?? c}】`;

const OUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["sourceLang", "texts"],
  properties: {
    sourceLang: { type: "string", enum: LANG_CODES },
    texts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lang", "text"],
        properties: { lang: { type: "string", enum: LANG_CODES }, text: { type: "string" } },
      },
    },
  },
} as const;

type Out = { sourceLang: LanguageCode; texts: { lang: LanguageCode; text: string }[] };

async function call(system: string, user: string): Promise<Out | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const res = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 3000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: OUT_SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? (JSON.parse(text.text) as Out) : null;
  } catch (e) {
    console.error("interpret:", e instanceof Anthropic.APIError ? e.status : "failed");
    return null;
  }
}

const TRANSLATE_SYSTEM = `あなたは、言葉の違う家族の会話をつなぐ通訳の執事です。
家族のグループに書かれた1つのメッセージを、指定された言葉に訳します。
- 意味を変えない・足さない・省かない。くだけた言い方はくだけたまま、家族の会話らしく自然に。
- 名前・日付・時刻・数字はそのまま（日付の順だけは次のきまりで）。
- ${VI_DATE_RULE}
- sourceLang には元のメッセージの言葉を入れる（候補にない言葉なら、いちばん近いもの）。
- texts には、指定された言葉ごとの訳を入れる。元の言葉と同じ言葉の訳は入れない。
- やさしい日本語（ja-easy）は、短い文・ひらがな多め。`;

export async function translateChat(text: string, targets: LanguageCode[]): Promise<Out | null> {
  return call(TRANSLATE_SYSTEM, `訳す先の言葉: ${targets.map((t) => `${langName(t)}（${t}）`).join("、")}\n\nメッセージ:\n${text}`);
}

const ANSWER_SYSTEM = `あなたは、家族の書類を預かる執事です。家族のグループで、執事が送った「家族へのお知らせ」への返信で質問されました。
- 🔴 答えに使えるのは、そのお知らせに書いてあることだけです（お知らせには、原本の書類の引用と場所が入っています）。書いていないことは推測せず「お知らせ（原本）には書いていません」と言い、どこに確かめればよいか（お知らせにある問い合わせ先・園・学校など）を添えてください。
- 答えには、根拠にした原本の場所（例:「原本 3．」）を入れてください。
- 誰が行くか・休むかなど、家族が決めることは決めない（決めるための材料だけ）。保険・医療・法律・在留の手続きの判断はしない。
- 短く。家族の会話らしく、やわらかく。
- ${VI_DATE_RULE}
- ${VI_VOICE_RULE}
- sourceLang には質問の言葉。texts には、質問した人の言葉の答えを最初に、つづけてほかの指定された言葉の「質問の訳＋答え」を入れる（形:「Q: …\\nA: …」）。`;

export async function answerFromNotice(question: string, notice: string, langs: LanguageCode[]): Promise<Out | null> {
  return call(
    ANSWER_SYSTEM,
    `家族の言葉: ${langs.map((t) => `${langName(t)}（${t}）`).join("、")}\n\nお知らせ（返信先）:\n${notice}\n\n質問:\n${question}`,
  );
}

const LINES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: { lines: { type: "array", items: { type: "string" } } },
} as const;

/**
 * 朝の通知の予定の名前を、その言葉に訳す（1行ずつ・同じ数・同じ順）。訳せなければ null（件数だけの文に戻す）。
 * 名前だけを送る（日付・書類の中身は送らない）
 */
export async function translateLines(lines: string[], lang: LanguageCode): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY || !lines.length) return null;
  try {
    const res = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 1500,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: LINES_SCHEMA } },
      system: `家族の書類の予定の名前（日本語）を、${langName(lang)}に短く訳します。1行に1つ。行の数と順番を変えない。名前・数字・時刻はそのまま。意味を足さない。やさしい日本語（ja-easy）は、ひらがな多めの短い言い方。${VI_DATE_RULE}`,
      messages: [{ role: "user", content: lines.map((l, i) => `${i + 1}. ${l}`).join("\n") }],
    });
    const text = res.content.find((b) => b.type === "text");
    const out = text && text.type === "text" ? (JSON.parse(text.text) as { lines: string[] }).lines : null;
    return out && out.length === lines.length && out.every((x) => typeof x === "string" && x.trim()) ? out.map((x) => x.replace(/^\d+\.\s*/, "").trim()) : null;
  } catch (e) {
    console.error("translateLines:", e instanceof Anthropic.APIError ? e.status : "failed");
    return null;
  }
}
