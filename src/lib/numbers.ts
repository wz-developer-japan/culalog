// 大事な番号（年金番号・雇用保険の番号・印鑑登録番号・証券番号など）。
// めったに見ないのに、手続きで急に聞かれる番号を、確定した書類からコードで探して出す。
// 🔴 番号は Claude に送らない。「○○の番号は？」「○○持ってる？」は、この端末の中だけで答える。
//    聞いた記録にも番号そのものは残さず、書類と場所だけを覚えておき、見せるたびに書類から引く。
// 判断はしない（「この番号で手続きできます」などは言わない）。出すのは番号と、原本のどこに書いてあるかだけ。

import { documentsForAsk, keywordsOf } from "./ask";
import type { DocumentRecord, Household } from "./types";

export interface ImportantNumber {
  documentId: string;
  documentTitle: string;
  memberIds: string[];
  /** 例: 「基礎年金番号」「証券番号」 */
  label: string;
  value: string;
  /** 原本のどこか（例: 「表面」「原本の文字」） */
  location: string;
  /** 現物のしまい場所（登録してあれば） */
  storageLocation?: string;
}

/** 番号の名前に見えるもの */
const NUMBER_LABEL = /番号|記号|ナンバー|No\.?$|ID$/;
/** 大事な番号から外すもの（電話・郵便番号・学校の文書番号など。電話番号は問い合わせ先として別に出す） */
const NOT_IMPORTANT = /電話|TEL|FAX|ファクス|郵便|文書|整理番号|受付番号|お客様番号の照会|部屋|号室|クラス|出席/;

/** 番号の値に見えるか（数字が3つ以上あって、日付や金額ではない） */
function looksLikeNumber(value: string): boolean {
  const digits = (value.match(/[0-9０-９]/g) ?? []).length;
  if (digits < 3) return false;
  if (/[年月日円時分]/.test(value)) return false;
  return true;
}

const LINE_NUMBER = /([^\s　、。：:「」（）()]{0,16}?(?:番号|記号|ナンバー))[\s　]*[:：]?[\s　]*([A-Za-z0-9０-９][A-Za-z0-9０-９\-－‐ ]{2,}[A-Za-z0-9０-９])/g;

/** 1つの書類の大事な番号（項目と、原本の文字の「○○番号　値」の行から） */
export function numbersOf(doc: DocumentRecord): ImportantNumber[] {
  const out: ImportantNumber[] = [];
  const base = { documentId: doc.id, documentTitle: doc.title, memberIds: doc.memberIds, storageLocation: doc.storageLocation };
  const seen = new Set<string>();
  const key = (v: string) => v.replace(/[\s　\-－‐]/g, "");
  for (const f of doc.fields) {
    const value = f.value.trim();
    if (!NUMBER_LABEL.test(f.label) || NOT_IMPORTANT.test(f.label) || !looksLikeNumber(value)) continue;
    if (seen.has(key(value))) continue;
    seen.add(key(value));
    out.push({ ...base, label: f.label, value, location: f.source?.location || f.label });
  }
  for (const line of (doc.originalText ?? "").split("\n")) {
    for (const m of line.matchAll(LINE_NUMBER)) {
      const label = m[1];
      const value = m[2].trim();
      if (NOT_IMPORTANT.test(label) || NOT_IMPORTANT.test(line.slice(0, m.index ?? 0)) || !looksLikeNumber(value)) continue;
      if (seen.has(key(value))) continue;
      seen.add(key(value));
      out.push({ ...base, label, value, location: "原本の文字" });
    }
  }
  return out;
}

/** 確定した今年度の書類にある大事な番号（前のものは使わない） */
export function importantNumbers(household: Household): ImportantNumber[] {
  return documentsForAsk(household).flatMap(numbersOf);
}

/** 番号を伏せて見せる（最後の2桁だけ残す）。タップで見えるまではこちら */
export function maskedValue(value: string): string {
  let keep = 2;
  const chars = [...value];
  for (let i = chars.length - 1; i >= 0; i--) {
    if (/[A-Za-z0-9０-９]/.test(chars[i])) {
      if (keep > 0) keep--;
      else chars[i] = "●";
    }
  }
  return chars.join("");
}

// ---- 聞かれたとき ----

/** 聞いた記録に残すのは、どの書類のどの番号かだけ（番号そのものは残さない） */
export interface NumberAnswer {
  refs: { documentId: string; label: string }[];
  /** 当てはまる書類はあったが番号が書いていなかったもの（「持ってる？」への答え） */
  documentIds: string[];
  /** 探した言葉 */
  terms: string[];
  createdAt: string;
}

/** 番号を聞いている言い方 */
const ASKS_NUMBER = /番号|記号|ナンバー/;
/** 持っているか・どこにあるかを聞いている言い方 */
const ASKS_HAVE = /持って(る|い)|ある[？?か]?$|あります|あった|どこ(にある|だっけ|にしまっ|に置い)|ありか/;
/** 電話番号・郵便番号を聞いているときは、今までどおりの「聞く」で（問い合わせ先として答える） */
const ASKS_PHONE = /電話|TEL|FAX|ファクス|郵便|連絡先/;

/** 探す言葉。「年金番号」→「年金」のように、番号・証・手帳などの終わりも落とした形でも探す */
function termsOf(question: string): string[] {
  const generic = /^(番号|記号|ナンバー|持っ.*|どこ.*|あり.*|ある|手続き|教え.*)$/;
  // 「年金番号って」→「年金番号」（漢字のあとのひらがなは落とす）
  const words = keywordsOf(question)
    .map((w) => (/^[\p{Script=Han}]/u.test(w) ? w.replace(/[\p{Script=Hiragana}]+$/u, "") : w))
    .filter((w) => w.length >= 2 && !generic.test(w));
  const stems = words.map((w) => w.replace(/(の)?(番号|記号|ナンバー|被保険者証|保険者証|証書|証明書|登録証|手帳|証|カード|通知書?|書類)$/, "")).filter((w) => w.length >= 2);
  return [...new Set([...words, ...stems])];
}

/**
 * 「○○の番号は？」「○○持ってる？」に、端末の中だけで答える。答えない（今までどおり「聞く」に回す）ときは null。
 * - 番号を聞いている → 当たった書類の番号（無ければ「見つかりませんでした」と答え、Claude には送らない）
 * - 持っているか・どこかを聞いている → 番号のある書類に当たったときだけ答える（「冬休みはある？」などは「聞く」へ）
 */
export function answerNumberQuestion(household: Household, question: string): NumberAnswer | null {
  if (ASKS_PHONE.test(question)) return null;
  const asksNumber = ASKS_NUMBER.test(question);
  const asksHave = ASKS_HAVE.test(question);
  if (!asksNumber && !asksHave) return null;
  const terms = termsOf(question);
  const named = household.members.filter((m) => {
    const first = m.name.split(/\s+/).pop() ?? "";
    return first.length >= 1 && question.includes(first);
  });
  const docs = documentsForAsk(household).filter((d) => named.length === 0 || d.memberIds.length === 0 || d.memberIds.some((id) => named.some((m) => m.id === id)));
  const head = (d: DocumentRecord) => `${d.title} ${d.docType ?? ""}`;
  const refs: NumberAnswer["refs"] = [];
  const documentIds: string[] = [];
  const labelHit = (n: ImportantNumber) => terms.some((t) => n.label.includes(t));
  // 書類の名前に当たったら、その書類だけ（「火災保険の証券番号」で傷害保険の証券番号まで出さない）
  // いちばん長い言葉で当たった書類を選ぶ（「火災保険」と「証券」なら「火災保険」の方）
  const nameScore = (d: DocumentRecord) => Math.max(0, ...terms.filter((t) => head(d).includes(t)).map((t) => t.length));
  const best = Math.max(0, ...docs.map(nameScore));
  const byName = best > 0 ? docs.filter((d) => nameScore(d) === best) : [];
  if (byName.length) {
    for (const d of byName) {
      const numbers = numbersOf(d);
      const hits = numbers.some(labelHit) ? numbers.filter(labelHit) : numbers;
      if (hits.length) refs.push(...hits.map((n) => ({ documentId: d.id, label: n.label })));
      else if (asksHave) documentIds.push(d.id);
    }
  } else {
    // 書類の名前に無ければ、番号の名前で（「受給者番号は？」）
    for (const d of docs) refs.push(...numbersOf(d).filter(labelHit).map((n) => ({ documentId: d.id, label: n.label })));
  }
  // 「持ってる？」は、番号のある書類に当たったときだけここで答える
  // 番号は聞いていないが、手帳・証・カードのような「物」を聞いているときは、無くても端末の中で「見つかりません」と答える
  const asksThing = terms.some((t) => /(手帳|証|カード|証書|通知書?)$/.test(t));
  if (!asksNumber && refs.length === 0 && documentIds.length === 0 && !asksThing) return null;
  // 何も言葉が無い（「番号は？」だけ）ときは、全部の番号を並べずに「聞く」へ
  if (terms.length === 0) return null;
  return { refs: refs.slice(0, 8), documentIds: documentIds.slice(0, 4), terms, createdAt: new Date().toISOString() };
}

/** 聞いた記録の参照から、いまの書類の番号を引く（書類が消えていたら出さない） */
export function resolveNumbers(household: Household, answer: NumberAnswer): ImportantNumber[] {
  const out: ImportantNumber[] = [];
  for (const r of answer.refs) {
    const doc = household.documents.find((d) => d.id === r.documentId);
    const n = doc && numbersOf(doc).find((x) => x.label === r.label);
    if (n) out.push(n);
  }
  return out;
}
