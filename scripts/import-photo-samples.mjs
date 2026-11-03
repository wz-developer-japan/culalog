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
const prefixOk = (id) => (prefixes.length ? prefixes.some((p) => id.startsWith(p)) : /^([nkwhitmgpvrxjuzlyoq]\d|f-)/.test(id));

const baseDate = basename(dir);
const outDir = join("public", "samples", baseDate);
mkdirSync(outDir, { recursive: true });

const str = (x) => (typeof x === "string" ? x : "");
/**
 * 一緒に住んでいる家族（アプリの架空の家族と同じ id）。CULALOG が扱うのはこの家の人の書類だけなので、
 * 正解 JSON の scope に離れて暮らす親などの id があっても、その人は「誰の」に入れない。
 * その人だけの書類（親あての年金・介護・通院の書類など）は「この家の書類ではない」と同じ扱い（誰の欄にも出さず、予定にもしない）
 */
const RESIDENTS = new Set(["m-self", "m-spouse", "m-son", "m-daughter"]);
/** 知っておくだけ（"awareness" または false）か */
const isAwareness = (x) => x === "awareness" || x === false;
/** アプリの書類の分類（types.ts の DocumentCategory と同じ）。無い名前は近いものに寄せる */
const CATEGORIES = ["school", "childcare", "housing", "insurance", "vehicle", "medical_card", "care", "license", "subscription", "work", "community", "medical", "other"];
const CATEGORY_ALIASES = { utility: "housing" };
const categoryOf = (c) => (CATEGORIES.includes(c) ? c : (CATEGORY_ALIASES[c] ?? "other"));
/** bundleWith（文字・文字の配列・{docId} の配列）から、相手の書類 id を取り出す */
const bundleIds = (bundleWith) =>
  (Array.isArray(bundleWith) ? bundleWith : bundleWith ? [bundleWith] : [])
    .map((x) => (typeof x === "string" ? x : str(x?.docId ?? x?.id ?? x?.key)))
    .filter(Boolean)
    .map((x) => x.split(/[#:]/)[0]);
/**
 * 束ねる印: 正解 JSON の bundleWith（督促・2回目の案内・再送などが、最初のお知らせを指す）を、組ごとに同じ文字にする。
 * 最初のお知らせの側には bundleWith が無いので、全部の正解 JSON を見て組を作り、組の中でいちばん小さい id を印にする
 */
const bundleGroup = new Map();
function buildBundleGroups(truths) {
  const parent = new Map();
  const find = (x) => {
    while (parent.has(x) && parent.get(x) !== x) x = parent.get(x);
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  };
  for (const t of truths) {
    for (const other of bundleIds(t.bundleWith)) {
      parent.set(t.id, parent.get(t.id) ?? t.id);
      parent.set(other, parent.get(other) ?? other);
      union(t.id, other);
    }
  }
  for (const id of parent.keys()) bundleGroup.set(id, find(id));
}
/** 書類の束ねる印（組に入っていなければ空） */
const bundleKeyOf = (docId) => bundleGroup.get(docId) ?? "";
/** 文字・{label}・{what} のどれでも、文字の配列にする */
const texts = (x) => (Array.isArray(x) ? x : x ? [x] : []).map((y) => (typeof y === "string" ? y : str(y?.what ?? y?.label ?? y?.item))).filter(Boolean);
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

/**
 * 正解 JSON の文の中の、見本どうしの内部 ID（x1a・x14b など。アプリの画面に出てはいけない）を、普通の言い方にする。
 * 「あとで届く」のように、その書類だけでは分からないことも落とす
 */
function plain(s) {
  if (typeof s !== "string") return s;
  const ids = /x\d+[a-z]?(?:・x\d+[a-z]?)*/g;
  const out = s
    .replace(/(^|[。\s])[^。]*あとで届く[^。]*。/g, "$1")
    .replace(new RegExp(`${ids.source}（([^）]*)）の`, "g"), "前に届いた「$1」の")
    .replace(new RegExp(`${ids.source} ?と同じ`, "g"), "前に届いたのと同じ")
    .replace(new RegExp(`${ids.source} ?の`, "g"), "前に届いた")
    .replace(new RegExp(`${ids.source} ?で`, "g"), "前のお知らせで")
    .replace(/（x\d+[a-z]?(?:・x\d+[a-z]?)*）/g, "");
  return out.replace(/[^。]*\bx\d+[a-z]?\b[^。]*。?/g, "").trim();
}
function plainDeep(v) {
  if (typeof v === "string") return plain(v);
  if (Array.isArray(v)) return v.map(plainDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" || k === "docId" || k === "files" || k === "bundleWith" || k === "closes" || k === "relatedDocIds" || k === "duplicateOf" ? x : plainDeep(x)]));
  return v;
}

/** 正解の読み取り結果を、アプリの読み取りの形（Extraction）にする */
function toExtraction(raw, text) {
  const t = plainDeep(raw);
  const concernsAll = t.scope?.concerns ?? t.who?.memberIds ?? [];
  const concerns = concernsAll.filter((id) => RESIDENTS.has(id));
  // 同居していない人だけの書類（concerns に同居の人がおらず、家全体でもない）は、この家の書類ではない
  const outsideOnly = concernsAll.length > 0 && concerns.length === 0 && t.scope?.household !== true;
  const notForFamily =
    t.appliesToFamily === false
      ? { is: true, reason: str(t.notApplicableReason) || str(t.who?.reason) }
      : outsideOnly
        ? { is: true, reason: "一緒に住んでいない家族あての書類（この家の人の書類として扱わない）" }
        : { is: false, reason: "" };
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
    // 「誰の」は 2号の正解 scope を写す: concerns＝誰のことか（二人以上なら全員）、household＝家全体。
    // concerns が空で household でもないものは「誰のか分からない」（sure を false にして執事が聞く。推測で入れない）
    who: notForFamily.is
      ? { memberIds: [], sure: false, reason: notForFamily.reason, household: false }
      : t.scope
        ? {
            memberIds: concerns,
            sure: concerns.length > 0 || t.scope.household === true,
            reason:
              concerns.length === 0 && t.scope.household !== true
                ? (str(t.scope.note) || str(t.who?.reason)).replace(/（[^）]*\bwho\b[^）]*）/g, "").replace(/→\s*聞いて決める/g, "").trim()
                : str(t.who?.reason),
            household: t.scope.household === true,
          }
        : { memberIds: concerns, sure: t.who?.sure === true, reason: str(t.who?.reason), household: false },
    period: { label: str(t.period?.label), from: str(t.period?.from), until: str(t.period?.until) },
    fields: withNumbers(
      (t.fields ?? []).map((f) => ({ label: str(f.label), value: str(f.value), location: str(f.location), quote: str(f.quote) })),
      t.sensitiveNumbers ?? [],
    ),
    // この家の書類ではないものは予定にしない（読み取りの指示と同じ）
    deadlines: (notForFamily.is ? [] : (t.deadlines ?? []))
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
        // 正解 JSON は書類ごとに actionNeeded（"must"／"awareness"）。予定ごとにあればそちらを使う
        actionNeeded: !isAwareness(d.actionNeeded ?? t.actionNeeded),
        bundleKey: bundleKeyOf(t.id),
        reserve: {
          date: str(d.reserve?.date),
          condition: str(d.reserve?.condition),
          location: str(d.reserve?.location),
          quote: str(d.reserve?.quote),
        },
      })),
    contacts: (t.contacts ?? []).map((c) => ({ label: str(c.label), name: str(c.name), phone: str(c.phone), hours: str(c.hours), location: str(c.location) })),
    questions: [],
    // 原本だけでは決められないこと（別紙が無い・写真に写っていない・日付と曜日が合わない）は「読めなかった所」として、
    // まとめて確定から外し、本人に原本で確かめてもらう（推測で埋めない）
    unclear: [
      ...texts(t.missingAttachments).map((item) => `${item}は別紙にあるはずですが、別紙は渡されていません（持ち物などは推測していません）`),
      ...(Array.isArray(t.notVisible) ? t.notVisible : t.notVisible ? [t.notVisible] : []).map((n) => `${str(n.item)}は写真に写っていません（${str(n.reason)}）。撮り直すか、原本で確かめてください`),
      ...(t.dateWeekdayMismatch
        ? [
            `${str(t.dateWeekdayMismatch.location)}の「${str(t.dateWeekdayMismatch.written)}」は、日付と曜日が合いません（${str(t.dateWeekdayMismatch.dateAsWritten)} は${str(t.dateWeekdayMismatch.weekdayOfThatDate)}曜日。曜日どおりなら ${str(t.dateWeekdayMismatch.nearestDateWithWrittenWeekday)}）。どちらが正しいかは原本からは分からないので、確かめてください`,
          ]
        : []),
    ],
    // 済んだことのお知らせ（closes: { docId, deadlineLabel, date, reason }。つながる予定の名前と、相手の書類の束ねる印）。
    // 「期限の訂正」のように、済んだのではなく前の予定が置き換わるものは corrected
    completions: (Array.isArray(t.closes) ? t.closes : t.closes ? [t.closes] : [])
      .map((c) => ({
        what: typeof c === "string" ? c : str(c.what ?? c.deadlineLabel ?? c.label),
        location: typeof c === "string" ? "" : str(c.location) || "件名・本文",
        quote: typeof c === "string" ? "" : str(c.quote),
        bundleKey: typeof c === "string" ? "" : bundleKeyOf(str(c.docId ?? c.id ?? "")),
        kind: typeof c !== "string" && /訂正|置き換え|変更/.test(str(c.reason)) ? "corrected" : "done",
      }))
      .filter((c) => c.what),
    onlyInLink: texts(t.onlyInLink),
    // 書類ごと、この家の書類ではないもの（記入例・一緒に住んでいない家族あての書類）
    notForFamily,
  };
}

const truths = readdirSync(dir)
  .filter((f) => f.endsWith(".truth.json"))
  .sort()
  .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")));
buildBundleGroups(truths);

const samples = [];
for (const truth of truths) {
  if (!prefixOk(truth.id)) continue;
  const files = truth.files ?? {};
  // メールの見本: 画面の画像ではなく、貼り付けて渡す用の素の文字を「貼り付けたメール」として渡す（原本もその文字）
  if (truth.mail && files.mailText) {
    const text = readFileSync(join(dir, files.mailText), "utf8").replace(/\r\n?/g, "\n").trim();
    samples.push({
      id: `photo-${truth.id}`,
      title: `${truth.title}（架空）`,
      baseDate,
      origin: "text",
      text,
      provisionalDraft: toExtraction(truth, text),
    });
    console.log(`✓ ${truth.id}: メール（文字）`);
    continue;
  }
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
