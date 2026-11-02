// 正解つきの見本で、読み取り（Claude）の正解率を測る。
//
// 使い方（リポジトリの直下で）:
//   npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts                 … 仮の読み取り（正解そのもの）で、仕組みが動くことを確かめる
//   npx tsx --tsconfig tsconfig.json scripts/eval-extraction.mts --claude        … 本物の Claude で読む（ANTHROPIC_API_KEY が要る。料金がかかる）
//   オプション: --limit N（最初の N 件だけ）・--ids g1,k6（id の一部で選ぶ）・--concurrency 2・--out docs/eval
//
// 何をするか:
//   1. src/data/photoSamples.json の見本（画像は public/samples、メールは本文の文字）を、アプリと同じ指示・同じ返す形で Claude に読ませる
//   2. 同じファイルの正解（provisionalDraft = デモ素材の正解 JSON をアプリの形にしたもの）と、項目ごとに突き合わせる
//   3. 正解率の表（項目別・書類の種類別）を <out>/latest.md と latest.json に書く。読み取りの生の結果は scripts/out/eval/ に置く（コミットしない）
//   4. 料金の見積もり（画像の大きさと文字数から入力トークンを、正解 JSON の長さから出力トークンを見積もる。本物の usage があればそれ）
//
// 🔴 日付の規則や「読めるか」の判断は人が見る。このスクリプトは数えるだけ。判断しない線（判断の言い回しが混ざっていないか）も数える。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createDemoHousehold } from "@/data/demoHousehold";
import { EXTRACTION_SCHEMA, type Extraction, parseExtraction } from "@/lib/extraction";
import { EXTRACT_MODEL, EXTRACT_SYSTEM_PROMPT } from "@/lib/extractPrompt";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { DemoSample } from "@/lib/types";

// ---------- 引数 ----------
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const opt = (name: string, def: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const useClaude = flag("--claude");
const limit = Number(opt("--limit", "0")) || 0;
const idFilter = opt("--ids", "").split(",").filter(Boolean);
const concurrency = Number(opt("--concurrency", "2")) || 2;
const outDir = opt("--out", "docs/eval");
const rawDir = "scripts/out/eval";
mkdirSync(outDir, { recursive: true });
mkdirSync(rawDir, { recursive: true });

// ---------- 見本と正解 ----------
const household = await createDemoHousehold(new Date("2026-11-07T10:00:00+09:00"));
const family = household.members.map((m) => ({ id: m.id, name: m.name, relation: m.roleLabel ?? m.relation, note: m.note ?? "" }));
let samples = (household.demoSamples ?? []).filter((s) => s.id.startsWith("photo-"));
if (idFilter.length) samples = samples.filter((s) => idFilter.some((f) => s.id.includes(f)));
if (limit) samples = samples.slice(0, limit);
const today = "2026-11-07";

// ---------- 料金の見積もり（$/1M トークン。claude-opus-5-5） ----------
const PRICE = { input: 4, output: 20 };
/** 画像のトークン数の目安: 長辺 1568px に縮めたあとの (幅×高さ)/750 */
function imageTokens(path: string): number {
  const buf = readFileSync(path);
  let w = 0;
  let h = 0;
  if (buf[0] === 0x89 && buf[1] === 0x50) {
    w = buf.readUInt32BE(16);
    h = buf.readUInt32BE(20);
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) break;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        h = buf.readUInt16BE(i + 5);
        w = buf.readUInt16BE(i + 7);
        break;
      }
      i += 2 + len;
    }
  }
  if (!w || !h) return 1600;
  const scale = Math.min(1, 1568 / Math.max(w, h));
  return Math.round((w * scale * h * scale) / 750);
}
/** 日本語はだいたい1文字1トークン強として数える（目安） */
const textTokens = (s: string) => Math.round(s.length * 1.1);

function estimateTokens(sample: DemoSample): { input: number; output: number } {
  const system = textTokens(EXTRACT_SYSTEM_PROMPT) + textTokens(JSON.stringify(EXTRACTION_SCHEMA)) / 2;
  const docTokens = sample.origin === "text" ? textTokens(sample.text ?? "") : (sample.images ?? []).reduce((n, p) => n + imageTokens(join("public", p)), 0);
  const familyTokens = textTokens(family.map((m) => `${m.id} ${m.name} ${m.relation} ${m.note}`).join("\n"));
  const output = textTokens(JSON.stringify(sample.provisionalDraft));
  return { input: Math.round(system + docTokens + familyTokens + 60), output };
}

// ---------- 読む ----------
type Usage = { input: number; output: number };
async function readWithClaude(sample: DemoSample): Promise<{ extraction: Extraction | null; usage: Usage; stop: string }> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const blocks: any[] =
    sample.origin === "text"
      ? [{ type: "document", source: { type: "text", media_type: "text/plain", data: sample.text ?? "" }, title: "渡された文字（メールの本文など）" }]
      : (sample.images ?? []).flatMap((p, i, all) => {
          const data = readFileSync(join("public", p)).toString("base64");
          const media = p.endsWith(".png") ? "image/png" : "image/jpeg";
          const block = { type: "image", source: { type: "base64", media_type: media, data } };
          return all.length > 1 ? [{ type: "text", text: `${i + 1}ページ目:` }, block] : [block];
        });
  const many = (sample.images?.length ?? 0) > 1;
  const note =
    sample.origin === "text"
      ? "\nこれは写真ではなく、文字だけの書類です（メールの本文などを貼り付けたもの。先頭に差出人・件名・受信日時があることがあります）。location は「件名」「本文 3段落目」のように書いてください。"
      : many
        ? `\nこれは1つの書類の${sample.images?.length}ページ分の写真です（順番どおり）。1つの書類として書き写し、location には「2ページ目 第5条」のようにページも書いてください。`
        : "";
  const response = await client.beta.messages.create({
    model: EXTRACT_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: EXTRACTION_SCHEMA as any } },
    system: EXTRACT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...blocks,
          {
            type: "text",
            text: `${note}今日の日付: ${today}\n家族の一覧:\n${family.map((m) => `- id: ${m.id} / 呼び名: ${m.name} / 続柄: ${m.relation}${m.note ? ` / メモ: ${m.note}` : ""}`).join("\n")}\n\nこの書類に書いてあることを書き写してください。`,
          },
        ],
      },
    ],
  } as any);
  const usage = { input: (response as any).usage?.input_tokens ?? 0, output: (response as any).usage?.output_tokens ?? 0 };
  const text = (response as any).content.find((b: any) => b.type === "text");
  let extraction: Extraction | null = null;
  try {
    extraction = text ? parseExtraction(JSON.parse(text.text), family.map((m) => m.id)) : null;
  } catch {
    extraction = null;
  }
  return { extraction, usage, stop: String((response as any).stop_reason) };
}

// ---------- 突き合わせ ----------
const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFKC")
    .replace(/[\s　・･、，,。．.\-ー〜~～（）()「」『』【】\[\]★☆※:：]/g, "")
    .replace(/の/g, "")
    .toLowerCase();
function similar(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x)) return true;
  const chars = new Set([...x]);
  const common = [...y].filter((c) => chars.has(c)).length;
  return common >= Math.min(x.length, y.length) * 0.6 && common >= 3;
}
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
/** 判断の言い回し（執事が言ってはいけないこと） */
const JUDGING = /補償されます|補償される可能性|解約したほうが|解約すべき|受診すべき|受診したほうが|お得です|必要ありません|問題ありません/;

type Item = { key: string; label: string; hit: number; total: number };
function compare(reading: Extraction, truth: Extraction): Item[] {
  const items: Item[] = [];
  const add = (key: string, label: string, hit: boolean | number, total = 1) => items.push({ key, label, hit: Number(hit), total });
  add("category", "書類の種類", reading.category === truth.category);
  add("who", "誰の（人）", sameSet(reading.who.memberIds, truth.who.memberIds));
  add("household", "家全体かどうか", reading.who.household === truth.who.household);
  add("notForFamily", "この家の書類ではない", (reading.notForFamily?.is ?? false) === (truth.notForFamily?.is ?? false));
  if (truth.period.from || truth.period.until) add("period", "期間（いつの分か）", reading.period.from === truth.period.from && reading.period.until === truth.period.until);
  // 予定: 正解の予定ごとに、名前が近くて日付が同じものがあるか
  if (truth.deadlines.length) {
    let hits = 0;
    let kinds = 0;
    let awareness = 0;
    let awarenessTotal = 0;
    for (const t of truth.deadlines) {
      const r = reading.deadlines.find((x) => similar(x.label, t.label) && x.date === t.date && (x.endDate || "") === (t.endDate || ""));
      if (r) hits++;
      if (r && r.kind === t.kind) kinds++;
      if (t.actionNeeded === false) {
        awarenessTotal++;
        if (r && r.actionNeeded === false) awareness++;
      }
    }
    add("deadlineDate", "予定の名前と日付", hits, truth.deadlines.length);
    add("deadlineKind", "予定の種類", kinds, truth.deadlines.length);
    if (awarenessTotal) add("awareness", "知っておくだけ", awareness, awarenessTotal);
    // 正解に無い予定を作っていないか（多すぎる分を減点）
    add("deadlineExtra", "余計な予定を作らない", reading.deadlines.length <= truth.deadlines.length + 1);
  } else {
    add("deadlineExtra", "余計な予定を作らない", reading.deadlines.length === 0);
  }
  // 問い合わせ先の電話番号
  const phones = truth.contacts.map((c) => c.phone).filter(Boolean);
  if (phones.length) add("phone", "問い合わせ先の電話番号", phones.filter((p) => reading.contacts.some((c) => norm(c.phone) === norm(p))).length, phones.length);
  // 読めなかった所（正解で「読めなかった所がある」書類は、読み取りでも unclear が空でないこと。無い書類では空であること）
  add("unclear", "読めなかった所を推測で埋めない", truth.unclear.length > 0 ? reading.unclear.length > 0 : reading.unclear.length === 0);
  // リンク先にしか無い
  if (truth.onlyInLink?.length) add("onlyInLink", "リンク先にしか無いことを推測しない", (reading.onlyInLink?.length ?? 0) > 0);
  // 済んだ・訂正のお知らせ
  if (truth.completions?.length) {
    const ok = truth.completions.filter((t) => reading.completions?.some((r) => similar(r.what, t.what) && (r.kind ?? "done") === (t.kind ?? "done"))).length;
    add("completions", "済んだ・訂正のお知らせ", ok, truth.completions.length);
  }
  // 判断しない線
  const all = JSON.stringify([reading.summary, reading.fields.map((f) => f.value), reading.deadlines.map((d) => d.label)]);
  add("noJudging", "判断の言い回しが無い", !JUDGING.test(all));
  return items;
}

// ---------- 実行 ----------
type Result = { id: string; title: string; category: string; origin: string; items: Item[]; usage: Usage; estimate: Usage; stop?: string; error?: string };
const results: Result[] = [];
let next = 0;
async function worker() {
  while (next < samples.length) {
    const sample = samples[next++];
    const truth = sample.provisionalDraft;
    const estimate = estimateTokens(sample);
    const base: Omit<Result, "items" | "usage"> = { id: sample.id, title: sample.title, category: truth.category, origin: sample.origin ?? "photo", estimate };
    try {
      let reading: Extraction | null = truth;
      let usage: Usage = { input: 0, output: 0 };
      let stop: string | undefined;
      if (useClaude) {
        const r = await readWithClaude(sample);
        reading = r.extraction;
        usage = r.usage;
        stop = r.stop;
        writeFileSync(join(rawDir, `${sample.id}.json`), JSON.stringify({ reading: r.extraction, usage, stop }, null, 2));
      }
      if (!reading) {
        results.push({ ...base, items: [{ key: "parsed", label: "返す形で受け取れた", hit: 0, total: 1 }], usage, stop, error: "読み取りの結果を受け取れなかった" });
      } else {
        results.push({ ...base, items: [{ key: "parsed", label: "返す形で受け取れた", hit: 1, total: 1 }, ...compare(reading, truth)], usage, stop });
      }
      console.error(`${useClaude ? "読んだ" : "照合"} ${results.length}/${samples.length} ${sample.id}`);
    } catch (e) {
      results.push({ ...base, items: [{ key: "parsed", label: "返す形で受け取れた", hit: 0, total: 1 }], usage: { input: 0, output: 0 }, error: String((e as Error).message ?? e).slice(0, 200) });
      console.error(`失敗 ${sample.id}: ${String((e as Error).message ?? e).slice(0, 120)}`);
    }
  }
}
await Promise.all(Array.from({ length: useClaude ? concurrency : 1 }, worker));
results.sort((a, b) => a.id.localeCompare(b.id));

// ---------- 集計 ----------
const byKey = new Map<string, { label: string; hit: number; total: number; docs: number }>();
for (const r of results) {
  for (const it of r.items) {
    const k = byKey.get(it.key) ?? { label: it.label, hit: 0, total: 0, docs: 0 };
    k.hit += it.hit;
    k.total += it.total;
    k.docs++;
    byKey.set(it.key, k);
  }
}
const pct = (h: number, t: number) => (t ? `${Math.round((h / t) * 1000) / 10}%` : "-");
const docScore = (r: Result) => {
  const h = r.items.reduce((n, i) => n + i.hit, 0);
  const t = r.items.reduce((n, i) => n + i.total, 0);
  return t ? h / t : 0;
};
const perfect = results.filter((r) => r.items.every((i) => i.hit === i.total)).length;
const overallHit = results.reduce((n, r) => n + r.items.reduce((m, i) => m + i.hit, 0), 0);
const overallTotal = results.reduce((n, r) => n + r.items.reduce((m, i) => m + i.total, 0), 0);
const byCat = new Map<string, { hit: number; total: number; docs: number }>();
for (const r of results) {
  const c = byCat.get(r.category) ?? { hit: 0, total: 0, docs: 0 };
  c.hit += r.items.reduce((n, i) => n + i.hit, 0);
  c.total += r.items.reduce((n, i) => n + i.total, 0);
  c.docs++;
  byCat.set(r.category, c);
}
const estIn = results.reduce((n, r) => n + r.estimate.input, 0);
const estOut = results.reduce((n, r) => n + r.estimate.output, 0);
const realIn = results.reduce((n, r) => n + r.usage.input, 0);
const realOut = results.reduce((n, r) => n + r.usage.output, 0);
const cost = (i: number, o: number) => (i * PRICE.input + o * PRICE.output) / 1_000_000;
const now = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

const lines: string[] = [];
lines.push(`# 読み取りの正解率（${useClaude ? `本物の Claude: ${EXTRACT_MODEL}` : "仮の読み取り＝正解そのもの。仕組みの確認"}）`);
lines.push("");
lines.push(`測った日時: ${now}／見本: ${results.length}件（写真 ${results.filter((r) => r.origin !== "text").length}・メールの本文 ${results.filter((r) => r.origin === "text").length}）／指示とモデルはアプリの /api/extract と同じ`);
lines.push("");
lines.push(`- **全部の点の正解率: ${pct(overallHit, overallTotal)}**（${overallHit} / ${overallTotal} 点）`);
lines.push(`- 全項目が正解だった書類: ${perfect} / ${results.length} 件`);
if (results.some((r) => r.error)) lines.push(`- 読めなかった・形が受け取れなかった: ${results.filter((r) => r.error).length} 件`);
lines.push("");
lines.push("## 項目別");
lines.push("");
lines.push("| 項目 | 正解率 | 点 | 対象の書類 |");
lines.push("|---|---|---|---|");
for (const [, k] of byKey) lines.push(`| ${k.label} | ${pct(k.hit, k.total)} | ${k.hit} / ${k.total} | ${k.docs} |`);
lines.push("");
lines.push("## 書類の種類別");
lines.push("");
lines.push("| 種類 | 正解率 | 件数 |");
lines.push("|---|---|---|");
for (const [c, v] of [...byCat].sort((a, b) => b[1].docs - a[1].docs)) lines.push(`| ${CATEGORY_LABELS[c as keyof typeof CATEGORY_LABELS] ?? c} | ${pct(v.hit, v.total)} | ${v.docs} |`);
lines.push("");
lines.push("## 料金");
lines.push("");
lines.push(`- 見積もり（画像は長辺1568pxに縮めた (幅×高さ)/750、文字は1文字≒1.1トークン、出力は正解 JSON の長さから）: 入力 約 ${estIn.toLocaleString()} トークン・出力 約 ${estOut.toLocaleString()} トークン → **約 $${cost(estIn, estOut).toFixed(2)}**（${EXTRACT_MODEL}: 入力 $${PRICE.input}／出力 $${PRICE.output} per 1M）`);
if (useClaude) lines.push(`- 実際の usage: 入力 ${realIn.toLocaleString()}・出力 ${realOut.toLocaleString()} トークン → 約 $${cost(realIn, realOut).toFixed(2)}`);
lines.push("");
lines.push("## 書類ごと（正解率の低い順）");
lines.push("");
lines.push("| 書類 | 正解率 | 落ちた項目 |");
lines.push("|---|---|---|");
for (const r of [...results].sort((a, b) => docScore(a) - docScore(b)).slice(0, 30)) {
  const missed = r.items.filter((i) => i.hit < i.total).map((i) => `${i.label}${i.total > 1 ? `（${i.hit}/${i.total}）` : ""}`);
  lines.push(`| ${r.title.replace(/（架空）$/, "")} | ${pct(r.items.reduce((n, i) => n + i.hit, 0), r.items.reduce((n, i) => n + i.total, 0))} | ${r.error ?? (missed.join("、") || "-")} |`);
}
lines.push("");
lines.push("## 数え方");
lines.push("");
lines.push("- 正解は、デモ素材の正解 JSON をアプリの形（Extraction）にしたもの（src/data/photoSamples.json の provisionalDraft）。見本はすべて架空で、期間中に新しく作ったもの");
lines.push("- 予定は「名前が近くて日付（終わりの日も）が同じ」で1点。種類（提出・満了・受付期間…）は別に1点。「知っておくだけ」は正解でそうなっている予定だけ数える");
lines.push("- 「読めなかった所を推測で埋めない」は、正解で読めなかった所がある書類（写真が切れている・別紙が無い・曜日が合わない）は読み取りでも空でないこと、無い書類では空であること");
lines.push("- 「判断の言い回しが無い」は、要約・項目・予定の名前に「補償されます」「解約したほうが」「受診すべき」などが混ざっていないこと");
lines.push("- 日付の規則が合っているか・読めるかの判断は人が見る。このスクリプトは数えるだけ（判断はしない）");
writeFileSync(join(outDir, "latest.md"), lines.join("\n") + "\n");
writeFileSync(join(outDir, "latest.json"), JSON.stringify({ at: now, model: EXTRACT_MODEL, claude: useClaude, overall: { hit: overallHit, total: overallTotal }, perfect, byKey: Object.fromEntries(byKey), results }, null, 2));
console.log(lines.slice(0, 8).join("\n"));
console.log(`→ ${join(outDir, "latest.md")}`);
