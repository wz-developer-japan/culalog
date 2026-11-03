// キー（ANTHROPIC_API_KEY）を Vercel に入れたあとに打つもの。本番の Claude を見本の家族で回して、結果を1つの表にする。
//
// 使い方（リポジトリの直下で。キーを入れて再デプロイが終わってから）:
//   npx tsx --tsconfig tsconfig.json scripts/after-key.mts
//   オプション: --base https://culalog.vercel.app（既定）・--runs 3（つなぐを何回回すか）・--eval 5（読み取りの採点を何件。0 で飛ばす）
//
// 何をするか（どれも見本の家族・時計は 2026-11-07。料金がかかる。つなぐ1回 + 訳す2回 + 聞く2回 + 読み取り5件 ≒ 数十円〜百円ほど）:
//   1. /api/connect を --runs 回: ひとこと・気づき・同じ日の気づきの文（Claude の文）を、アプリと同じ照らし合わせ（verifyConnect）にかけて、通った・外した を出す
//   2. /api/translate: 授業参観の案内・町内会の回覧をベトナム語に（項目がそろっているか・一般的な説明に nghỉ phép が無いか）。授業参観の案内をやさしい日本語に
//   3. /api/ask: 「授業参観の日の休みの申し出はいつまで？」ほか1問（原本の場所つきか・書いていないと言えるか）
//   4. 返信の答え（Telegram の「お知らせへの返信」）: 手元に ANTHROPIC_API_KEY があるときだけ、送る文を作って answerFromNotice に聞く（無ければ飛ばす。Telegram で手で確かめる）
//   5. 読み取りの採点: eval-extraction を --eval 件（手元にキーがあれば直接、無ければ本番の /api/extract で）
//   どれにも、🔴 預かっている大事な番号（数字）が答えに入っていないかを確かめる
//   結果は画面と scripts/out/after-key.md（コミットしない）に。report に貼るときは、そこから写す
// 🔴 1時間あたりの上限（RATE_LIMIT_PER_HOUR）を、少なくとも 20 にしてから回す（既定は 10。上限に当たると 429 で止まる）

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createDemoHousehold } from "@/data/demoHousehold";
import { provisionalTranslation } from "@/data/demoTranslations";
import { buildAskInput, verifyAsk } from "@/lib/ask";
import { buildCandidates } from "@/lib/butler";
import { conflictKey, findConflicts } from "@/lib/conflicts";
import { buildConnectInput, verifyConnect } from "@/lib/connect";
import { importantNumbers, maskKnownNumbers } from "@/lib/numbers";
import { composeTell } from "@/lib/tell";
import { buildTell } from "@/lib/tellBuild";
import { translationRequestOf } from "@/lib/translate";

const args = process.argv.slice(2);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = opt("--base", "https://culalog.vercel.app").replace(/\/$/, "");
const RUNS = Number(opt("--runs", "3")) || 0;
const EVAL = Number(opt("--eval", "5")) || 0;
const TODAY = "2026-11-07";
const today = new Date(2026, 10, 7, 10);

const out: string[] = [`# キーを入れたあとの確かめ（${BASE}・時計 ${TODAY}）`, ""];
const say = (line = "") => {
  console.log(line);
  out.push(line);
};
const results: [boolean, string][] = [];
const check = (ok: boolean, name: string) => {
  results.push([ok, name]);
  say(`${ok ? "ok" : "NG"}  ${name}`);
};

const h = await createDemoHousehold(today);
// 大事な番号（数字だけにして6桁以上のもの）が、答えの文字に入っていないか
const secrets = importantNumbers(h)
  .map((n) => n.value.replace(/\D/g, ""))
  .filter((v) => v.length >= 6);
const leaks = (text: string) => secrets.filter((v) => text.replace(/\D/g, "").includes(v)).length;

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  // 本番が返すトークン数（数だけ）を API ごとに足す
  if (json?.usage) (usageByPath[path] ??= []).push({ input: json.usage.input ?? 0, output: json.usage.output ?? 0 });
  return { status: res.status, json };
}
const usageByPath: Record<string, { input: number; output: number }[]> = {};
// 料金の見積もり（$/1M トークン。eval-extraction.mts と同じ値）
const PRICE = { input: 4, output: 20 };

// ---- 1. つなぐ ----
say("## 1. つなぐ（/api/connect）");
const candidates = buildCandidates(h, today);
const input = buildConnectInput(h, candidates, TODAY, "");
const conflicts = findConflicts(h, today);
say(`同じ日の候補: ${input.sameDay.map((x) => `${x.date} ${x.event.label}（${x.adults.length}人が仕事）`).join("、") || "なし"}`);
for (let run = 1; run <= RUNS; run++) {
  const { status, json } = await post("/api/connect", input);
  say("");
  say(`### ${run}回目（${status}）`);
  if (status === 503) {
    check(false, "本番にキーが入っている（503 準備中が返った。キーを入れて再デプロイしたか確かめる）");
    break;
  }
  if (status !== 200 || !json.result) {
    check(false, `つなぐの答えを受け取れた（${status} ${json.error ?? ""}）`);
    continue;
  }
  const raw = JSON.stringify(json.result);
  const verified = verifyConnect(json.result, h, candidates, { source: "claude", createdOn: TODAY, basis: "" });
  check(Boolean(verified), "つなぐの答えが決まった形で、照らし合わせにかけられた");
  if (!verified) continue;
  for (const b of verified.briefing) say(`- ひとこと: ${b.text}`);
  for (const i of verified.insights) say(`- 気づき（${i.kind}）: ${i.text}`);
  const rawSameDay = Array.isArray(json.result.sameDay) ? json.result.sameDay : [];
  for (const n of rawSameDay) {
    const passed = verified.sameDay?.some((x) => x.key === n.conflictId && x.text === String(n.text ?? "").trim());
    say(`- 同じ日の気づき【${passed ? "通った" : "外した（画面はコードの文）"}】: ${n.text}`);
    if (passed) say(`  原本: ${verified.sameDay!.find((x) => x.key === n.conflictId)!.evidence.map((e) => `${e.documentId}（${e.location}）`).join(" ／ ")}`);
  }
  check(conflicts.every((c) => c.options || rawSameDay.some((n: { conflictId?: string }) => n.conflictId === conflictKey(c))), "同じ日の候補それぞれに文が返った");
  check((verified.sameDay?.length ?? 0) > 0, "同じ日の気づきの文が、照らし合わせに1つ以上通った");
  check(!/有給|有休|年休|欠勤/.test(verified.sameDay?.map((x) => x.text).join("") ?? ""), "通った文に「有給」などが無い");
  say(`照らし合わせで外したもの: ${verified.dropped}件`);
  check(leaks(raw) === 0, "答えに大事な番号が入っていない");
}

// ---- 2. 訳す ----
say("");
say("## 2. 訳す（/api/translate・ベトナム語）");
for (const doc of h.documents.filter((d) => /授業参観.*ご案内|町内会/.test(d.title)).slice(0, 2)) {
  const req = translationRequestOf(doc, (t) => maskKnownNumbers(doc, t));
  const { status, json } = await post("/api/translate", { lang: "vi", doc: req });
  const t = json.translation;
  check(status === 200 && Boolean(t), `「${doc.title}」を訳せた（${status}${json.error ? ` ${json.error}` : ""}）`);
  if (!t) continue;
  say(`- 題: ${t.title}`);
  say(`- やること: ${t.todo ?? ""}`);
  for (const item of (t.items ?? []).slice(0, 4)) say(`- ${item.label}: ${item.text}`);
  const refs = [...req.fields, ...req.deadlines].map((x: { ref: string }) => x.ref);
  check(refs.every((r) => (t.items ?? []).some((i: { ref: string }) => i.ref === r)), "項目・予定がすべて訳にある");
  check(leaks(JSON.stringify(t)) === 0, "訳に大事な番号が入っていない");
  for (const bg of t.background ?? []) say(`- ℹ ${bg.title}: ${bg.text}`);
  check(!(t.background ?? []).some((bg: { text: string }) => /nghỉ\s*phép|有給|有休/i.test(bg.text)), "一般的な説明で休み方を決めつけていない（nghỉ phép・有給なし）");
}

// やさしい日本語（子どもにも読める形）: 授業参観の案内だけ
say("");
say("## 2b. 訳す（/api/translate・やさしい日本語）");
for (const doc of h.documents.filter((d) => /授業参観.*ご案内/.test(d.title)).slice(0, 1)) {
  const req = translationRequestOf(doc, (t) => maskKnownNumbers(doc, t));
  const { status, json } = await post("/api/translate", { lang: "ja-easy", doc: req });
  const t = json.translation;
  check(status === 200 && Boolean(t), `「${doc.title}」をやさしい日本語にできた（${status}${json.error ? ` ${json.error}` : ""}）`);
  if (!t) continue;
  say(`- 題: ${t.title}`);
  say(`- これは なに？: ${t.what ?? ""}`);
  for (const item of (t.items ?? []).slice(0, 4)) say(`- ${item.label}: ${item.text}`);
  // 漢字がどのくらい残っているか（固有名詞・原本の名前は残ってよい。目安として出すだけ）
  const kanji = (JSON.stringify([t.title, t.what, t.todo, ...(t.items ?? []).map((i: { label: string; text: string }) => i.label + i.text)]).match(/[\u4e00-\u9fff]/g) ?? []).length;
  say(`- 漢字の数（目安）: ${kanji}`);
}

// ---- 3. 聞く ----
say("");
say("## 3. 聞く（/api/ask）");
for (const question of ["授業参観の日、休みの申し出はいつまで？", "結衣の保育園の運動会に、お弁当は要る？"]) {
  const { status, json } = await post("/api/ask", buildAskInput(h, question, TODAY, ""));
  const r = json.result ? verifyAsk(json.result, h, question) : null;
  check(status === 200 && Boolean(r), `「${question}」に答えた（${status}${json.error ? ` ${json.error}` : ""}）`);
  if (!r) continue;
  say(`- 答え（${r.found ? "書いてあった" : "書いていない"}）: ${r.withheld ? `出さなかった（${r.withheld}）` : r.answer}`);
  for (const c of r.citations) say(`  - 原本: ${c.documentTitle}（${c.location}）「${c.quote}」`);
  check(leaks(JSON.stringify(json.result)) === 0, "答えに大事な番号が入っていない");
}

// ---- 4. 返信の答え ----
say("");
say("## 4. 返信の答え（Telegram のお知らせへの返信）");
if (!process.env.ANTHROPIC_API_KEY) {
  say("手元に ANTHROPIC_API_KEY が無いので飛ばした（Telegram で手で確かめる: report 11/03 19:14 の手順）");
} else {
  const { answerFromNotice } = await import("@/lib/server/interpret");
  const doc = h.documents.find((d) => /授業参観.*ご案内/.test(d.title))!;
  const vi = provisionalTranslation(doc, "vi");
  const payload = buildTell(h, doc, vi ? { vi: { ...vi, lang: "vi", basis: [], translatedAt: "", draftSource: "provisional" } } : {}, () => undefined, ["ja", "vi"]);
  const notice = composeTell(payload);
  for (const question of ["休みの申し出はいつまで？", "Hạn xin nghỉ của em là khi nào?"]) {
    const a = await answerFromNotice(question, notice, ["ja", "vi"]);
    check(Boolean(a), `返信「${question}」に答えた`);
    for (const t of a?.texts ?? []) say(`- ${t.lang}: ${t.text.replace(/\n/g, " ／ ")}`);
  }
}

// ---- 5. 読み取りの採点 ----
say("");
say("## 5. 読み取りの採点（eval-extraction）");
if (!EVAL) say("飛ばした（--eval 0）");
else {
  const how = process.env.ANTHROPIC_API_KEY ? ["--claude"] : ["--via", BASE];
  const r = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/eval-extraction.mts", ...how, "--limit", String(EVAL), "--concurrency", "1", "--out", "scripts/out/eval-check"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  check(r.status === 0, `読み取りの採点が終わった（${how.join(" ")}・${EVAL}件。表は scripts/out/eval-check/latest.md）`);
}

say("");
say("## 6. 本物のトークン数（本番が返した数・1回あたりの平均）");
for (const [path, list] of Object.entries(usageByPath)) {
  const avg = (k: "input" | "output") => Math.round(list.reduce((n, u) => n + u[k], 0) / list.length);
  const usd = (avg("input") * PRICE.input + avg("output") * PRICE.output) / 1e6;
  say(`- ${path}: ${list.length}回・入力 ${avg("input")}・出力 ${avg("output")} トークン ≒ $${usd.toFixed(4)}/回`);
}
if (!Object.keys(usageByPath).length) say("（本番がトークン数を返さなかった）");
say("読み取りの1件あたりは scripts/out/eval-check/latest.md（本番の /api/extract が返した数）");

say("");
const ng = results.filter(([ok]) => !ok);
say(ng.length ? `NG が ${ng.length} 件: ${ng.map(([, n]) => n).join(" ／ ")}` : `${results.length}項目 ok`);
mkdirSync("scripts/out", { recursive: true });
writeFileSync("scripts/out/after-key.md", out.join("\n") + "\n");
process.exit(ng.length ? 1 : 0);
