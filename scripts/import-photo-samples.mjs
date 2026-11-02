// デモ用の「写真の見本」を取り込む。
// 架空の書類の画像（撮影日を基準日にして書き出したもの）と、その書類の正解の読み取り結果（.truth.json）・文字（.txt）から、
//   public/samples/<基準日>/ に画像を置き、src/data/photoSamples.json に見本の一覧を書く。
// 正解の読み取り結果は、Claude の準備中に使う「仮の結果」になる（画面には「仮の結果」と出る）。
//
// 使い方: node scripts/import-photo-samples.mjs <書き出したフォルダ（…/2026-11-07）> [id の頭 …]

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const dir = process.argv[2];
if (!dir || !existsSync(dir)) {
  console.error("使い方: node scripts/import-photo-samples.mjs <書き出したフォルダ> [id の頭 …]");
  process.exit(1);
}
const prefixes = process.argv.slice(3);
const prefixOk = (id) => (prefixes.length ? prefixes.some((p) => id.startsWith(p)) : /^[nkwhitmgpvr]\d/.test(id));

const baseDate = basename(dir);
const outDir = join("public", "samples", baseDate);
mkdirSync(outDir, { recursive: true });

const str = (x) => (typeof x === "string" ? x : "");
/** アプリの書類の分類（types.ts の DocumentCategory と同じ）。無い名前は近いものに寄せる */
const CATEGORIES = ["school", "childcare", "housing", "insurance", "vehicle", "medical_card", "care", "license", "subscription", "work", "community", "medical", "other"];
const CATEGORY_ALIASES = { utility: "housing" };
const categoryOf = (c) => (CATEGORIES.includes(c) ? c : (CATEGORY_ALIASES[c] ?? "other"));
const KINDS = ["expiry", "window", "notice", "cancel_window", "after_event", "event", "due"];

/**
 * 番号もの（sensitiveNumbers: answerOnDevice・sendToClaude: false）を、項目の番号として入れる。
 * 正解 JSON の項目では番号が伏せ字（＊）になっているので、同じ名前の項目があれば値を入れ替え、無ければ足す。
 * 番号は端末の中だけで答える（アプリは聞く・つなぐで Claude に送るとき、番号の名前の項目と、見つけた番号を伏せる）
 */
function withNumbers(fields, numbers) {
  const out = [...fields];
  for (const n of numbers) {
    if (n.answerOnDevice === false) continue;
    const label = str(n.label);
    const i = out.findIndex((f) => f.label === label || ((label.includes(f.label) || f.label.includes(label)) && /[＊*]/.test(f.value)));
    const field = { label, value: str(n.value), location: str(n.location), quote: "" };
    if (i >= 0) out[i] = { ...out[i], ...field, location: field.location || out[i].location };
    else out.push(field);
  }
  return out;
}

/** 正解の読み取り結果を、アプリの読み取りの形（Extraction）にする */
function toExtraction(t, text) {
  return {
    title: str(t.title),
    transcript: text,
    summary: {
      what: str(t.summary?.what),
      todo: str(t.summary?.todo),
      ifIgnored: { text: str(t.summary?.ifIgnored?.text), location: str(t.summary?.ifIgnored?.location), quote: str(t.summary?.ifIgnored?.quote) },
    },
    docType: str(t.docType),
    category: categoryOf(str(t.category)),
    who: { memberIds: t.who?.memberIds ?? [], sure: t.who?.sure === true, reason: str(t.who?.reason) },
    period: { label: str(t.period?.label), from: str(t.period?.from), until: str(t.period?.until) },
    fields: withNumbers(
      (t.fields ?? []).map((f) => ({ label: str(f.label), value: str(f.value), location: str(f.location), quote: str(f.quote) })),
      t.sensitiveNumbers ?? [],
    ),
    deadlines: (t.deadlines ?? [])
      .filter((d) => KINDS.includes(d.kind) && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
      // 比べる用に入っている「この家には当てはまらない」予定（例: ほかのクラスだけの取り消し）は、仮の結果に入れない
      .filter((d) => d.appliesToFamily !== false && !/当てはまらない/.test(str(d.label)))
      .map((d) => ({
        kind: d.kind,
        label: str(d.label),
        date: d.date,
        endDate: str(d.endDate),
        time: str(d.time),
        place: str(d.place),
        needs: Array.isArray(d.needs) ? d.needs.map(str) : [],
        repeatMonths: Number(d.repeatMonths) || 0,
        location: str(d.location),
        quote: str(d.quote),
        reserve: {
          date: str(d.reserve?.date),
          condition: str(d.reserve?.condition),
          location: str(d.reserve?.location),
          quote: str(d.reserve?.quote),
        },
      })),
    contacts: (t.contacts ?? []).map((c) => ({ label: str(c.label), name: str(c.name), phone: str(c.phone), hours: str(c.hours), location: str(c.location) })),
    questions: [],
    unclear: [],
    // 書類ごと、この家の書類ではないもの（記入例など）
    notForFamily: t.appliesToFamily === false ? { is: true, reason: str(t.notApplicableReason) || str(t.who?.reason) } : { is: false, reason: "" },
  };
}

const samples = [];
for (const name of readdirSync(dir).filter((f) => f.endsWith(".truth.json")).sort()) {
  const truth = JSON.parse(readFileSync(join(dir, name), "utf8"));
  if (!prefixOk(truth.id)) continue;
  const files = truth.files ?? {};
  // 本物らしさの強い順: 回したスキャン → 何ページか → 写真風 → そのままの画像
  const picked = files.scan ? [files.scan] : files.pages ? files.pages : files.photo ? [files.photo] : files.png ? [files.png] : [];
  if (picked.length === 0) continue;
  const text = readFileSync(join(dir, files.text ?? `${truth.id}.txt`), "utf8").trim();
  const images = picked.map((f) => {
    copyFileSync(join(dir, f), join(outDir, f));
    return `/samples/${baseDate}/${f}`;
  });
  samples.push({
    id: `photo-${truth.id}`,
    title: `${truth.title}（架空）`,
    baseDate,
    images,
    text,
    provisionalDraft: toExtraction(truth, text),
  });
  console.log(`✓ ${truth.id}: ${images.length}枚`);
}
writeFileSync(join("src", "data", "photoSamples.json"), JSON.stringify(samples, null, 1) + "\n");
console.log(`${samples.length}件を src/data/photoSamples.json に書きました（画像は ${outDir}）`);
