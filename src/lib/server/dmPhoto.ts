// 1対1に届いた書類の写真（決定版 5）。
// 執事が読んで、送った人の言葉で要約を返し、共有したまとめとして家族の置き場所に置き、書類を預かる人のアプリに「預かる？」を届ける。
// 🔴 写真は Claude に渡すだけで残さない。置くのは、原本の全文・引用・番号の類を落とした読み取りの結果だけ。

import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import { EXTRACTION_FORMAT_NOTE, jsonFromText, parseExtraction, type Extraction } from "@/lib/extraction";
import { EXTRACT_MODEL as MODEL, EXTRACT_SYSTEM_PROMPT } from "@/lib/extractPrompt";
import { sanitizeExtraction, sanitizeSummary, type RosterMember } from "@/lib/familyShare";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import { dmOf } from "./dm";
import { store, useClaudeInChat, type ChatDoc } from "./store";
import { sendMessage, tg } from "./telegram";

const MAX_BYTES = 5 * 1024 * 1024;
const nameIn = (m: RosterMember | undefined, lang: LanguageCode) => (m ? (m.names[lang] ?? m.names.ja ?? "") : "");
const langName = (c: LanguageCode) => LANGUAGES.find((l) => l.code === c)?.label ?? c;

const SAY = {
  reading: { ja: "📄 読んでいます…（少し時間がかかります）", "ja-easy": "📄 よんで います…（すこし まってね）", vi: "📄 Đang đọc giấy tờ… (chờ một chút nhé)" } as Record<LanguageCode, string>,
  failed: {
    ja: "読み取れませんでした。明るい所で、書類全体が入るように撮り直してください。",
    "ja-easy": "よめません でした。あかるい ところで、かみ ぜんぶが はいるように とりなおしてね。",
    vi: "Không đọc được. Hãy chụp lại ở nơi sáng, sao cho thấy toàn bộ tờ giấy.",
  } as Record<LanguageCode, string>,
  tooBig: { ja: "写真が大きすぎます（5MB まで）。", "ja-easy": "しゃしんが おおきすぎます。", vi: "Ảnh quá lớn (tối đa 5MB)." } as Record<LanguageCode, string>,
  preparing: { ja: "（執事の準備中です）", "ja-easy": "（しつじ は じゅんびちゅう です）", vi: "(Quản gia đang được chuẩn bị.)" } as Record<LanguageCode, string>,
  over: { ja: "今日の執事の回数の上限に達しました。", "ja-easy": "きょうは もう つかえません。", vi: "Hôm nay đã dùng hết số lần." } as Record<LanguageCode, string>,
  sentTo: {
    ja: (n: string) => `${n}さんのアプリに「預かる？」を送りました。写真は残していません（原本はお手元に）。`,
    "ja-easy": (n: string) => `${n}さんの アプリに「あずかる？」を おくりました。しゃしんは のこして いません。`,
    vi: (n: string) => `Đã gửi “Giữ giấy tờ này?” đến ứng dụng của ${n}. Ảnh không được lưu lại (hãy giữ bản gốc).`,
  } as Record<LanguageCode, (n: string) => string>,
  toHolder: {
    ja: (n: string, t: string) => `📄 ${n}さんが書類の写真を送りました：${t}\nアプリを開くと「預かる？」が出ます。`,
    "ja-easy": (n: string, t: string) => `📄 ${n}さんが かみの しゃしんを おくりました：${t}\nアプリを ひらくと「あずかる？」が でます。`,
    vi: (n: string, t: string) => `📄 ${n} đã gửi ảnh giấy tờ: ${t}\nMở ứng dụng sẽ thấy “Giữ giấy tờ này?”.`,
  } as Record<LanguageCode, (n: string, t: string) => string>,
};

/** Telegram から写真を受け取る（試験のときは、用意した小さな画像） */
async function download(fileId: string): Promise<{ data: string; bytes: number } | null> {
  const fake = (globalThis as { __culalogFakeFile?: string }).__culalogFakeFile;
  if (process.env.CULALOG_FAKE_TELEGRAM === "1" && process.env.VERCEL_ENV !== "production") return fake ? { data: fake, bytes: fake.length } : null;
  const file = await tg<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  if (!file?.file_path) return null;
  const res = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return { data: buf.toString("base64"), bytes: buf.length };
}

async function read(data: string, mediaType: string, roster: RosterMember[], today: string): Promise<Extraction | null> {
  const block: Anthropic.Beta.BetaContentBlockParam =
    mediaType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: (["image/png", "image/webp", "image/gif"].includes(mediaType) ? mediaType : "image/jpeg") as "image/jpeg", data } };
  const res = await new Anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: EXTRACT_SYSTEM_PROMPT + EXTRACTION_FORMAT_NOTE,
    messages: [
      {
        role: "user",
        content: [
          block,
          {
            type: "text",
            text: `今日の日付: ${today}\n家族の一覧:\n${roster.map((m) => `- id: ${m.id} / 呼び名: ${m.names.ja} / 続柄: ${m.holder ? "本人" : m.adult ? "大人の家族" : "子ども"}`).join("\n")}\n\nこの書類に書いてあることを書き写してください。`,
          },
        ],
      },
    ],
  });
  if (res.stop_reason !== "end_turn") return null;
  const text = res.content.find((b) => b.type === "text");
  try {
    return text && text.type === "text" ? parseExtraction(jsonFromText(text.text), roster.map((m) => m.id)) : null;
  } catch {
    return null;
  }
}

const SUMMARY_SYSTEM = `あなたは、家族の書類を預かる執事です。読み取った書類の中身（JSON）を、指定された言葉で、家族に短く伝えます。
- 何の書類か（1行）・いつ何があるか（日付は「11/27（金）」の形）・やること（締切・持ち物）を、箇条書き3〜6行で。
- 書いていないことは足さない。保険・医療・法律・在留の判断はしない。休み方（有給など）を決めつけない。
- 最後に、日本語の原本の題を（ ）で添える。前置きや見出しは付けない。`;

async function summarize(extraction: Extraction, lang: LanguageCode): Promise<string> {
  const res = await new Anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: SUMMARY_SYSTEM,
    messages: [{ role: "user", content: `伝える言葉: ${langName(lang)}（${lang}）\n\n書類:\n${JSON.stringify({ ...extraction, transcript: "" })}` }],
  });
  const text = res.content.find((b) => b.type === "text");
  return text && text.type === "text" ? text.text.trim() : extraction.title;
}

export async function onDmPhoto(x: { userId: string; chatId: string; chat: ChatDoc; member: RosterMember; lang: LanguageCode; fileId: string; mediaType: string; replyTo: number; caption?: string }) {
  const { userId, lang } = x;
  if (!process.env.ANTHROPIC_API_KEY) return sendMessage(userId, SAY.preparing[lang], { replyTo: x.replyTo });
  const use = await useClaudeInChat(x.chatId).catch(() => "over" as const);
  if (use !== "ok") return use === "over-first" ? sendMessage(userId, SAY.over[lang], { replyTo: x.replyTo }) : undefined;
  await sendMessage(userId, SAY.reading[lang], { replyTo: x.replyTo });
  const file = await download(x.fileId);
  if (!file) return sendMessage(userId, SAY.failed[lang], { replyTo: x.replyTo });
  if (file.bytes > MAX_BYTES) return sendMessage(userId, SAY.tooBig[lang], { replyTo: x.replyTo });
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const roster = x.chat.roster ?? [];
  let extraction: Extraction | null = null;
  try {
    extraction = await read(file.data, x.mediaType, roster, today);
  } catch (e) {
    console.error("dmPhoto: read", e instanceof Anthropic.APIError ? e.status : "failed");
  }
  if (!extraction || extraction.notForFamily?.is) return sendMessage(userId, SAY.failed[lang], { replyTo: x.replyTo });
  const clean = sanitizeExtraction(extraction);
  let summary = clean.title;
  try {
    summary = await summarize(clean, lang);
  } catch {
    /* 題だけ返す */
  }
  // 家族の置き場所へ: 共有したまとめ（1対1の質問の根拠になる）と、預かる人のアプリへの「預かる？」
  const id = `tg-${randomBytes(6).toString("hex")}`;
  const holder = roster.find((m) => m.holder);
  const nameOf = (mid: string) => roster.find((m) => m.id === mid)?.names.ja ?? "";
  const shared = sanitizeSummary({
    id,
    title: clean.title,
    category: clean.category,
    docType: clean.docType,
    whose: clean.who.memberIds.map(nameOf).filter(Boolean),
    holder: nameIn(x.member, "ja"),
    events: clean.deadlines.map((d) => ({ kind: d.kind, label: d.label, date: d.date, endDate: d.endDate, time: d.time, place: d.place, needs: d.needs })),
    fields: clean.fields.map((f) => ({ label: f.label, value: f.value })),
    contacts: clean.contacts.map((c) => ({ name: c.name || c.label, phone: c.phone, hours: c.hours })),
    langs: {},
    updatedAt: new Date().toISOString(),
  });
  const s = store()!;
  const family = s.collection("chats").doc(x.chatId);
  if (shared) await family.collection("docs").doc(id).set(JSON.parse(JSON.stringify(shared)));
  await family.collection("inbox").doc(id).set(JSON.parse(JSON.stringify({ id, from: x.member.id, receivedAt: new Date().toISOString(), extraction: clean })));
  await sendMessage(userId, `${summary}\n\n${holder && holder.id !== x.member.id ? SAY.sentTo[lang](nameIn(holder, lang)) : ""}`.trim(), { replyTo: x.replyTo });
  // 預かる人にも、その人の1対1で知らせる（送った人と別のとき）
  const hdm = holder && holder.id !== x.member.id ? dmOf(x.chat, holder.id) : null;
  if (hdm) await sendMessage(hdm.userId, SAY.toHolder[hdm.lang](nameIn(x.member, hdm.lang), clean.title));
}
