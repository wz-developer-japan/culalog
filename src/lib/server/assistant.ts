// 1対1の執事: 家族と共有した書類のまとめから、その人の言葉で答える／「○○に伝えて」を相手の言葉で伝える。
// 🔴 答えに使えるのは、家族の置き場所にある「共有したまとめ」だけ。書いていないことは推測しない。
//    保険・医療・法律・在留の判断はしない。誰が行く・休むなど家族が決めることは決めない。会話の文は置かない。

import Anthropic from "@anthropic-ai/sdk";
import { EXTRACT_MODEL as MODEL } from "@/lib/extractPrompt";
import type { FamilySummary, RosterMember } from "@/lib/familyShare";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

const langName = (c: LanguageCode) => LANGUAGES.find((l) => l.code === c)?.label ?? c;

export interface AssistantOut {
  kind: "answer" | "relay";
  /** 聞いた人の言葉の答え（relay のときは「伝えました」の確かめ） */
  answer: string;
  /** relay のとき: 伝える相手（家族の名簿の id）と、相手の言葉の文 */
  relayTo?: string;
  relayText?: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "answer", "relayTo", "relayText"],
  properties: {
    kind: { type: "string", enum: ["answer", "relay"] },
    answer: { type: "string" },
    relayTo: { type: "string" },
    relayText: { type: "string" },
  },
} as const;

export const ASSISTANT_SYSTEM = `あなたは、家族に1体の執事です。家族の大人の一人と、Telegram の1対1で話しています。
次のどちらかをしてください。
1. 質問や相談（kind: "answer"）: 家族と共有した書類のまとめ（下の JSON）だけを根拠に、聞いた人の言葉で短く答える。
   - 🔴 まとめに書いていないことは推測しない。「共有した書類には書いていません」と言い、確かめ先（まとめにある問い合わせ先・学校・園・会社など）と「原本で確かめて」を添える。
   - 根拠にした書類の題（原本の題・日本語のまま）を答えに入れる。日付は「11/27（金）」の形で。
   - 誰が行く・休む・払うなど、家族が決めることは決めない（決めるための材料だけ）。休み方（有給など）も決めつけない。
   - 保険・医療・法律・在留資格は、対象になるか・どうすべきかを判断しない。書いてあることと問い合わせ先だけ。
   - 書類と関係ない雑談には、短く自然に返す。
2. 伝言（kind: "relay"）: 「○○に伝えて」「Nhắn cho … rằng …」など、家族のだれかへの伝言を頼まれたとき。
   - relayTo に相手の id（家族の名簿から。大人だけ）、relayText に相手の読みたい言葉で伝える文（意味を変えない・足さない。家族の会話らしく自然に。誰からかは書かなくてよい）。
   - answer には、聞いた人の言葉で「○○さんに伝えます」と短く。
   - 相手が分からない・名簿にいないときは kind: "answer" にして、だれに伝えるか聞き返す。
使わない欄は空の文字列にする。`;

/** まとめを、聞いた人の言葉の訳だけに絞って小さくする */
function compact(docs: FamilySummary[], lang: LanguageCode) {
  return docs.slice(0, 40).map((d) => ({
    title: d.title,
    whose: d.whose,
    period: d.periodLabel,
    stored: d.storageLocation,
    holder: d.holder,
    events: d.events.map((e) => ({ label: e.label, date: e.date, endDate: e.endDate, time: e.time, place: e.place, needs: e.needs, whose: e.whose })),
    fields: d.fields,
    contacts: d.contacts,
    ...(lang !== "ja" && d.langs[lang] ? { translation: d.langs[lang] } : {}),
  }));
}

export async function askAssistant(input: {
  message: string;
  asker: RosterMember;
  lang: LanguageCode;
  roster: RosterMember[];
  docs: FamilySummary[];
  today: string;
}): Promise<AssistantOut | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  // 家族の名簿と共有したまとめ（同じ家・同じ言葉なら同じ）を先に置いてキャッシュし、聞いた人とメッセージはその後ろに
  const family = JSON.stringify({
    family: input.roster.map((m) => ({ id: m.id, names: m.names, lang: m.lang, adult: m.adult })),
    sharedDocuments: compact(input.docs, input.lang),
  });
  const ask = JSON.stringify({
    today: input.today,
    asker: { id: input.asker.id, name: input.asker.names.ja, lang: `${langName(input.lang)}（${input.lang}）` },
    message: input.message,
  });
  try {
    const res = await new Anthropic().beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: ASSISTANT_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `家族と、共有した書類のまとめです。\n${family}`, cache_control: { type: "ephemeral" } },
            { type: "text", text: ask },
          ],
        },
      ],
    });
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return null;
    const out = JSON.parse(text.text) as AssistantOut;
    return out.kind === "relay" && out.relayTo && out.relayText ? out : { kind: "answer", answer: out.answer };
  } catch (e) {
    console.error("assistant:", e instanceof Anthropic.APIError ? e.status : "failed");
    return null;
  }
}
