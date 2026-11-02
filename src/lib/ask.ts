// 執事に聞く（チャット）。サーバーとブラウザで共通。
// 根拠にするのは「今年度の確定した書類」だけ（前のものは使わない）。
// Claude には書類の中身（番号は伏せる・電話番号は送らない）と質問を渡し、
//   答え・引用（書類の ID・原本の場所・原文の抜き書き）・書いていないときはそのこと
// を決まった形で返させる。引用はコードで原本と照らし合わせ、見つからないものは外す。
// 答えに判断の言い回し（補償される・解約した方がよい等）があれば、その答えは出さない。
// 書類に書いていないことは「書いていません」と色の違うカードで出し、問い合わせ先だけを添える。

import { maskNumbers } from "./connect";
import { parseDate, toYmd } from "./deadlines";
import { findQuote } from "./highlight";
import { maskKnownNumbers, type NumberAnswer } from "./numbers";
import type { Contact, DocumentRecord, Household } from "./types";

export interface AskInput {
  today: string;
  /** 架空の家族か（Claude には送らない） */
  demo: boolean;
  style: string;
  family: { id: string; name: string; relation: string; note: string }[];
  documents: {
    id: string;
    title: string;
    docType: string;
    category: string;
    period: string;
    memberIds: string[];
    storageLocation: string;
    fields: { label: string; value: string; location: string; quote: string }[];
    deadlines: { kind: string; label: string; date: string; endDate: string; time: string; place: string; needs: string[]; location: string; quote: string }[];
    /** 問い合わせ先の名前と場所だけ（電話番号は送らない。画面ではコードが端末のデータから出す） */
    contacts: { label: string; name: string; hours: string; location: string }[];
    /** 原本の文字（番号は伏せる・長すぎる分は切る） */
    text: string;
  }[];
  question: string;
}

export const QUESTION_MAX = 200;
const TEXT_MAX = 6000;

const str = { type: "string" } as const;

/** Claude の構造化出力に渡す JSON Schema */
export const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "answer", "citations", "relatedDocumentIds"],
  properties: {
    /** 書類に答えが書いてあるか。書いていなければ false（answer には、何が書いていないかだけ） */
    found: { type: "boolean" },
    answer: str,
    citations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["documentId", "location", "quote"],
        properties: { documentId: str, location: str, quote: str },
      },
    },
    /** 質問に関係する書類（書いていないとき、問い合わせ先を出すため） */
    relatedDocumentIds: { type: "array", items: str },
  },
} as const;

/** 根拠にする書類: 確定済みで、前のものになっていない（「前のものにしますか？」と聞いている最中のものも除く） */
export function documentsForAsk(household: Household): DocumentRecord[] {
  const asking = new Set(
    (household.questions ?? []).filter((q) => q.about === "supersede" && !q.answeredAt).map((q) => q.targetDocumentId),
  );
  return household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !asking.has(d.id));
}

/** 文字の中の長い番号を伏せる（証券番号・受給者番号・電話番号など） */
export function maskText(text: string): string {
  return text.replace(/[0-9０-９][0-9０-９\-－ ]{7,}[0-9０-９]/g, "（伏せています）");
}

export function buildAskInput(household: Household, question: string, today: string, style: string): AskInput {
  return {
    today,
    demo: household.isDemo,
    style,
    family: household.members.map((m) => ({ id: m.id, name: m.name, relation: m.roleLabel ?? m.relation, note: m.note ?? "" })),
    documents: documentsForAsk(household).map((doc) => ({
      id: doc.id,
      title: doc.title,
      docType: doc.docType ?? "",
      category: doc.category,
      period: doc.periodLabel ?? "",
      memberIds: doc.memberIds,
      storageLocation: doc.storageLocation ?? "",
      fields: doc.fields.map((f) => ({
        label: f.label,
        value: maskNumbers(f.label, f.value),
        location: f.source?.location ?? "",
        quote: maskKnownNumbers(doc, maskText(f.source?.quote ?? "")),
      })),
      deadlines: doc.deadlines.map((d) => ({
        kind: d.kind,
        label: d.label,
        date: d.date,
        endDate: d.endDate ?? "",
        time: d.time ?? "",
        place: d.place ?? "",
        needs: d.needs ?? [],
        location: d.source?.location ?? "",
        quote: maskKnownNumbers(doc, maskText(d.source?.quote ?? "")),
      })),
      contacts: doc.contacts.map((c) => ({ label: c.label, name: c.name, hours: c.hours ?? "", location: c.source?.location ?? "" })),
      text: maskKnownNumbers(doc, maskText(doc.originalText ?? "")).slice(0, TEXT_MAX),
    })),
    question: question.trim().slice(0, QUESTION_MAX),
  };
}

// ---- 答えの形（確かめたあと） ----

export interface Citation {
  documentId: string;
  documentTitle: string;
  location: string;
  quote: string;
}

/**
 * 頼んだこと1件。頼んだ瞬間に端末に保存し、答え（result）はあとから付く。
 * 画面を閉じても残り、次に開いたときに答えが無ければ調べ直す（「頼んで、あとで報告」）
 */
export interface AskRecord {
  id: string;
  question: string;
  askedAt: string;
  result?: AskResult;
  /** 番号の質問に端末の中だけで答えたもの（Claude には送っていない。番号そのものは残さず、書類と番号の名前だけ） */
  numberAnswer?: NumberAnswer;
  /** 報告をホームで「見た」にした日時 */
  seenAt?: string;
}

export interface AskResult {
  source: "claude" | "provisional";
  question: string;
  /** 書類に書いてあった */
  found: boolean;
  answer: string;
  citations: Citation[];
  /** 問い合わせ先（書いていないとき・関係する書類のもの。電話番号は端末のデータから） */
  contacts: { documentId: string; documentTitle: string; contact: Contact }[];
  /** コードの確かめで外した引用の数 */
  dropped: number;
  /** 答え自体を出さなかった理由（判断の言い回し・日付が合わないなど） */
  withheld?: string;
  /** 仮の答え（検索）になった理由。Claude の準備中のときは無し */
  fallbackReason?: string;
  createdAt: string;
}

/** 判断・当てはめの言い回し（出さない。connect.ts と同じ線） */
const JUDGMENT = /(補償され|保険(金)?が(使え|おり|下り|出)|お金が(出|戻)|受診(すべき|してください|した方)|解約(すべき|した方)|お得|損です|違法|訴え|おすすめし|した方がよい|すべきです)/;

/** 文の中の「○月○日」が、根拠の書類のどこかに出てくる日付か */
function datesAreInDocuments(text: string, docs: DocumentRecord[]): boolean {
  const known = new Set<string>();
  for (const d of docs) {
    for (const x of d.deadlines) {
      for (const ymd of [x.date, x.endDate, x.reserve?.date]) {
        if (ymd) {
          const p = parseDate(ymd);
          known.add(`${p.getMonth() + 1}/${p.getDate()}`);
        }
      }
    }
    const haystack = `${d.originalText ?? ""} ${d.fields.map((f) => f.value).join(" ")} ${d.periodLabel ?? ""}`;
    for (const m of haystack.matchAll(/(\d{1,2})月(\d{1,2})日/g)) known.add(`${Number(m[1])}/${Number(m[2])}`);
    for (const m of haystack.matchAll(/\d{4}[/\-年](\d{1,2})[/\-月](\d{1,2})/g)) known.add(`${Number(m[1])}/${Number(m[2])}`);
  }
  for (const m of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    if (!known.has(`${Number(m[1])}/${Number(m[2])}`)) return false;
  }
  return true;
}

function contactsOf(docs: DocumentRecord[]): AskResult["contacts"] {
  return docs.flatMap((d) => d.contacts.map((contact) => ({ documentId: d.id, documentTitle: d.title, contact })));
}

/** Claude の答えを確かめて、画面に出せる形にする（形が違えば null） */
export function verifyAsk(raw: unknown, household: Household, question: string): AskResult | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { found?: unknown; answer?: unknown; citations?: unknown; relatedDocumentIds?: unknown };
  if (typeof v.answer !== "string" || !Array.isArray(v.citations)) return null;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const docs = documentsForAsk(household);
  const byId = new Map(docs.map((d) => [d.id, d]));
  let dropped = 0;

  // 引用: 根拠にしてよい書類のもので、抜き書きが原本の文字（か、確定した項目・予定の抜き書き）の中にあるものだけ
  const citations: Citation[] = [];
  for (const c of v.citations.slice(0, 8)) {
    const doc = byId.get(s(c?.documentId));
    const location = s(c?.location);
    const quote = s(c?.quote);
    if (!doc || (!location && !quote)) {
      dropped++;
      continue;
    }
    if (quote) {
      const inText = doc.originalText ? Boolean(findQuote(doc.originalText, quote)) : false;
      const inItems = [...doc.fields.map((f) => f.source?.quote), ...doc.deadlines.map((d) => d.source?.quote)]
        .filter((q): q is string => Boolean(q))
        .some((q) => Boolean(findQuote(q, quote)) || Boolean(findQuote(quote, q)));
      if (!inText && !inItems) {
        dropped++;
        continue;
      }
    }
    if (citations.some((x) => x.documentId === doc.id && x.location === location && x.quote === quote)) continue;
    citations.push({ documentId: doc.id, documentTitle: doc.title, location, quote });
  }

  const related = (Array.isArray(v.relatedDocumentIds) ? v.relatedDocumentIds : [])
    .map(s)
    .map((id) => byId.get(id))
    .filter((d): d is DocumentRecord => Boolean(d));
  const citedDocs = [...new Set(citations.map((c) => byId.get(c.documentId)!))];
  const contactDocs = [...new Set([...citedDocs, ...related])];

  const answer = v.answer.trim().slice(0, 600);
  const base = { source: "claude" as const, question, citations, contacts: contactsOf(contactDocs), dropped, createdAt: new Date().toISOString() };

  if (JUDGMENT.test(answer)) {
    return { ...base, found: false, answer: "", withheld: "執事の答えに、保険・医療・法律の判断にあたる言い回しが入っていたため、出していません。原本と窓口でご確認ください。" };
  }
  if (!datesAreInDocuments(answer, citedDocs.length ? citedDocs : docs)) {
    return { ...base, found: false, answer: "", withheld: "執事の答えの中の日付が、書類のどこにも見つからなかったため、出していません。" };
  }
  // 書いてあると言うのに引用が1つも残らなかったら、「書いてある」とは言えない
  if (v.found === true && citations.length === 0) {
    return { ...base, found: false, answer: "", withheld: "執事の答えの根拠（原本の場所）が、書類と照らし合わせて合わなかったため、出していません。" };
  }
  return { ...base, found: v.found === true, answer };
}

// ---- Claude の準備中（キーが無いとき）に使う、仮の答え（検索） ----

/** ひらがなだけでも探す語（ふだんの言葉で書類にもよく出るもの） */
const HIRAGANA_WORDS = ["けが"];
/** ひらがなをまたぐ語（「持ち物」が「持ち」で切れないように） */
const COMPOUND_WORDS = ["持ち物", "お弁当", "申し込み", "引き落とし", "払い戻し"];
/** 1文字でも探す語 */
const SHORT_WORDS = ["犬", "猫"];

/**
 * ふだんの言葉 → 書類で使われやすい言葉。仮の検索で、質問の言葉が書類にそのまま無いときの手がかりにする。
 * 意味を判断するためではなく、探す場所を広げるためだけ（当たった所は原文のまま見せる）
 */
const RELATED_WORDS: Record<string, string[]> = {
  けが: ["事故", "傷害", "負傷"],
  怪我: ["事故", "傷害", "負傷"],
  保険: ["補償", "保険金", "給付"],
  条件: ["対象", "範囲", "基準"],
  連絡先: ["連絡", "問い合わせ", "受付", "窓口"],
  連絡: ["問い合わせ", "受付", "窓口"],
  期限: ["以内", "締切"],
  締切: ["以内", "期限"],
  飼え: ["ペット", "動物", "飼育"],
  犬: ["ペット", "動物", "飼育"],
  猫: ["ペット", "動物", "飼育"],
  ペット: ["動物", "飼育"],
  解約: ["解除", "退去"],
  持ち物: ["持参", "準備"],
  印鑑証明: ["印鑑登録証明書", "印鑑登録証"],
  要る: ["必要", "持って", "出して"],
  必要: ["持って", "出して"],
};
/** 言い換えでも、元の言葉と同じ重さで探す語（「条件」は書類では「対象」「範囲」と書かれることが多い） */
const STRONG_RELATED = new Set(["対象", "範囲"]);

/**
 * 質問から、探す言葉を取り出す（漢字のかたまり＋送りがな、カタカナ、英数）。
 * 「冬休みは」→「冬休み」のように、終わりの助詞は落とす。ひらがなだけの語は探さない（「いつから」などは当たりすぎるため）
 */
export function keywordsOf(question: string): string[] {
  const stop = new Set(["息子", "娘", "うち", "教え", "今年", "今度", "来月", "今月", "書類", "調べ", "知り", "確認", "探し"]);
  const raw = question.match(/[\p{Script=Han}]+[\p{Script=Hiragana}]{0,2}|[\p{Script=Katakana}ー]{2,}|[A-Za-z0-9]{2,}/gu) ?? [];
  const particles = "はがをにでとものかへやもね";
  const words = raw
    .map((w) => {
      // 漢字のあとのひらがなに助詞が出てきたら、そこで切る（「学校でけ」→「学校」「冬休みは」→「冬休み」）
      const m = w.match(/^([\p{Script=Han}]+)([\p{Script=Hiragana}]*)$/u);
      if (!m) return w;
      const tail = [...m[2]];
      const cut = tail.findIndex((c) => particles.includes(c));
      return cut < 0 ? w : m[1] + tail.slice(0, cut).join("");
    })
    .map((w) => (w.length >= 3 && /[\p{Script=Hiragana}]{2}$/u.test(w) ? w.slice(0, -1) : w)) // 「飼える」→「飼え」「調べて」→「調べ」程度に
    .filter((w) => w.length >= 2 && !stop.has(w));
  const extra = [...COMPOUND_WORDS, ...HIRAGANA_WORDS, ...SHORT_WORDS].filter((w) => question.includes(w));
  // 「持ち物」があれば、その切れ端の「持ち」は探さない
  return [...new Set([...words.filter((w) => !COMPOUND_WORDS.some((c) => question.includes(c) && c !== w && c.includes(w))), ...extra])];
}

/** タイトル・学校名や会社名・宛名・あいさつ・見出しだけの行（引用にしても中身が無い） */
function isEmptyLine(line: string, title: string): boolean {
  if (line === title || title.includes(line)) return true;
  if (/(様|各位|殿|御中)$/.test(line)) return true;
  if (/^(記|以上|拝啓|敬具)$/.test(line)) return true;
  if (/^第\d+条（[^）]*）$/.test(line)) return true;
  // 短くて、文になっていない行（「くろうど第一小学校」「こもれび損害保険（架空）」など）
  if (line.length <= 20 && !/[、。，：:はをがにで\d]/.test(line.replace(/[（(][^）)]*[）)]/g, ""))) return true;
  // 届け出の手続きのきまり文句（どの書類にもあり、聞かれたことの答えにならない）
  if (/変わった(とき|場合)|変更(の)?届/.test(line)) return true;
  return false;
}

/**
 * 仮の答え: 質問の言葉を、確定した書類の項目・予定・原本の文字からコードで探して、当たった所を並べる（Claude は使っていない）。
 * 文章の答えは作らない。見つからなければ「書いていません」。
 * - タイトル・学校名などの名前・宛名・見出しだけの行は引用にしない
 * - 見るのは関係しそうな書類の上位3つまで（いちばんの書類の半分以上当たっているもの）。質問に名前が出た人の書類を先に見る。名前の出た子とは別の子だけの書類は外す
 * - 1つの書類から出すのは2件まで（書類が1つしか当たらないときは4件まで）。関係しそうな書類から順に1件ずつ取り、
 *   2件目からは、すでに出した所と違う言葉に当たっている所を選ぶ
 * - 抜き書きが短すぎる（「冬休み」だけなど）ときは、原本のそれを含む行を見せる
 */
export function provisionalAsk(household: Household, question: string): AskResult {
  const docs = documentsForAsk(household);
  const words = keywordsOf(question);
  // 書類のどこにも無い言葉（「条件」など）は、言い換えの言葉（「対象」「範囲」）を同じ重さで探す
  const allText = docs.map((d) => `${d.title} ${d.fields.map((f) => `${f.label} ${f.value}`).join(" ")} ${d.originalText ?? ""}`).join(" ");
  const related = new Map<string, number>();
  for (const w of words) {
    for (const r of RELATED_WORDS[w] ?? []) {
      if (!words.includes(r)) related.set(r, Math.max(related.get(r) ?? 0, allText.includes(w) && !STRONG_RELATED.has(r) ? 1 : 2));
    }
  }
  const terms = [...words.map((w) => ({ w, weight: 2 })), ...[...related].map(([w, weight]) => ({ w, weight }))];
  const asksWhen = /いつ|何日|期限|締切|まで/.test(question);
  const named = household.members.filter((m) => {
    const first = m.name.split(/\s+/).pop() ?? "";
    return first.length >= 1 && question.includes(first);
  });
  const namedIds = new Set(named.map((m) => m.id));
  const otherChildOnly = (doc: DocumentRecord) =>
    named.length > 0 &&
    doc.memberIds.length > 0 &&
    doc.memberIds.every((id) => !namedIds.has(id) && household.members.find((m) => m.id === id)?.relation === "child");

  const scored = docs
    .filter((doc) => !otherChildOnly(doc))
    .map((doc) => {
      const all = `${doc.title} ${doc.docType ?? ""} ${doc.fields.map((f) => `${f.label} ${f.value}`).join(" ")} ${doc.deadlines.map((d) => d.label).join(" ")} ${doc.originalText ?? ""}`;
      const hit = terms.filter((t) => all.includes(t.w));
      const mine = doc.memberIds.some((id) => namedIds.has(id)) ? 6 : 0;
      return { doc, score: hit.reduce((n, t) => n + t.weight, 0) + mine, hits: hit.length };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.score - a.score);
  const top = scored.length ? scored[0].score : 0;
  const near = scored.filter((x) => x.score * 2 >= top).slice(0, 3);

  type Cand = { c: Citation; hit: { w: string; weight: number }[]; extra: number; order: number };
  const scoreOf = (x: Cand, covered: Set<string>) => x.hit.filter((t) => !covered.has(t.w)).reduce((n, t) => n + t.weight, 0) + x.extra;
  const jpDate = (ymd: string) => {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : ymd;
  };
  const perDoc: Cand[][] = [];
  let order = 0;
  for (const { doc } of near) {
    const cands: Cand[] = [];
    // タイトル・書類の種類にも出てくる言葉（「家族傷害保険の…」の「傷害」など）は、行の中では半分に数える
    const head = `${doc.title} ${doc.docType ?? ""}`;
    const lines = (doc.originalText ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const push = (location: string, quote: string, text: string, extra: number) => {
      if (!quote) return;
      if (quote.length < 10) {
        const longer = lines.find((l) => l.includes(quote) && l.length > quote.length && l.length <= 80);
        if (longer) quote = longer;
      }
      if (isEmptyLine(quote, doc.title)) return;
      const hit = terms
        .filter((t) => text.includes(t.w) || quote.includes(t.w))
        .map((t) => (head.includes(t.w) ? { w: t.w, weight: t.weight / 2 } : t));
      if (hit.reduce((n, t) => n + t.weight, 0) < 1) return;
      // 原本の文字の行は、タイトルにも出てくる言葉だけの一致なら引用にしない（見出し・学校名・園名の行が並ばないように）
      if (location === "原本の文字" && hit.every((t) => head.includes(t.w))) return;
      if (cands.some((x) => x.c.quote === quote || x.c.quote.includes(quote) || quote.includes(x.c.quote))) return;
      cands.push({ c: { documentId: doc.id, documentTitle: doc.title, location, quote }, hit, extra, order: order++ });
    };
    // 項目・予定は、当たったときに原本の文字の行より少し先に（問い合わせ先は別に並べるので、ここには入れない）
    for (const f of doc.fields) push(f.source?.location ?? f.label, f.source?.quote || `${f.label}: ${f.value}`, `${f.label} ${f.value}`, 1);
    for (const d of doc.deadlines) {
      const when = `${d.label}: ${jpDate(d.date)}${d.endDate ? `〜${jpDate(d.endDate)}` : ""}`;
      push(d.source?.location || d.label, d.source?.quote && d.source.quote.length >= 10 ? d.source.quote : when, d.label, asksWhen ? 3 : 1);
    }
    for (const t of lines) push("原本の文字", t.length > 80 ? `${t.slice(0, 80)}…` : t, t, 0);
    // この書類そのものの期間（「火災保険はいつまで？」のように、書類の名前で聞かれたとき）
    if (asksWhen && doc.periodLabel && terms.some((t) => doc.title.includes(t.w))) {
      cands.push({ c: { documentId: doc.id, documentTitle: doc.title, location: "期間", quote: doc.periodLabel }, hit: [], extra: 5, order: order++ });
    }
    if (cands.length) perDoc.push(cands);
  }

  const cap = perDoc.length === 1 ? 4 : 2;
  const picked: Cand[] = [];
  for (let round = 0; round < cap && picked.length < 6; round++) {
    for (const cands of perDoc) {
      if (picked.length >= 6) break;
      const mine = picked.filter((p) => cands.includes(p));
      if (mine.length < round) continue;
      const covered = new Set(mine.flatMap((p) => p.hit.map((t) => t.w)));
      const rest = cands.filter((x) => !picked.includes(x)).sort((a, b) => scoreOf(b, covered) - scoreOf(a, covered) || a.order - b.order);
      const best = rest[0];
      // 2件目からは、まだ出していない言葉に十分当たっている所だけ（弱い一致で枠を埋めない）
      if (best && (round === 0 || scoreOf(best, covered) >= (perDoc.length === 1 ? 1 : 2))) picked.push(best);
    }
  }
  const citations = picked.sort((a, b) => a.order - b.order).map((x) => x.c);
  const citedDocs = [...new Set(citations.map((c) => docs.find((d) => d.id === c.documentId)!))];
  return {
    source: "provisional",
    question,
    found: citations.length > 0,
    answer: citations.length > 0 ? `「${words.join("」「")}」に関係しそうな所を、書類から探しました（仮）。` : "",
    citations,
    contacts: contactsOf(citedDocs.length ? citedDocs : []),
    dropped: 0,
    createdAt: new Date().toISOString(),
  };
}

// ---- 頼む・調べる（ブラウザ側） ----

/** 端末に保存してある頼みごと（古い形のものは除く） */
export function askRecords(household: Household): AskRecord[] {
  return (household.asks ?? []).filter((a) => a && typeof a.id === "string" && typeof a.question === "string");
}

/**
 * 執事に聞いて、確かめた答えを返す。Claude の準備中（503）・上限・つながらないときは検索の仮の答え。
 * 答えの出どころ（Claude か仮か）と、仮になった理由は result に残す。
 */
export async function runAsk(household: Household, question: string, style: string, signal?: AbortSignal): Promise<AskResult> {
  const input = buildAskInput(household, question, toYmd(new Date()), style);
  const provisional = (reason?: string) => {
    const r = provisionalAsk(household, question);
    return reason ? { ...r, withheld: undefined, fallbackReason: reason } : r;
  };
  try {
    const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal });
    if (res.status === 503) return provisional();
    const body = await res.json().catch(() => null);
    if (res.ok && body?.result) {
      const verified = verifyAsk(body.result, household, question);
      if (verified) return verified;
      return provisional("執事の答えをうまく受け取れなかったため");
    }
    return provisional(body?.error ? `執事につながらなかったため（${body.error}）` : "執事につながらなかったため");
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return provisional("通信できなかったため");
  }
}
