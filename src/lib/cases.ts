// 「こんなとき、こうしてくれる」の3つの場面。何と何が関係するかは、ここでコードが決める（Claude は使わない）。
// ① 困ったときに調べる（子どもがけがをした → 学校・園の給付、保険、医療証、連絡先）
// ② 1つの出来事から、関係する書類を洗い出す（引っ越す → 住所が書いてある書類・住まいに結びつく契約）
// ③ 書類同士を見比べて気づく（同じ種類の補償が2つ以上の書類にある → 両方の原本の場所と、対象・金額の行を並べる）
// 🔴 判断しない線: 「お金が出ます」「対象になります」「どちらかを解約しましょう」「払いすぎです」とは言わない。
// 書類のどこに何と書いてあるかと、問い合わせ先まで。最終の確認は原本と窓口へ。

import { documentsForAsk, maskText } from "./ask";
import { CATEGORY_LABELS } from "./labels";
import type { Contact, DocumentCategory, DocumentRecord, FamilyMember, Household } from "./types";
import { givenName } from "./whose";

export type SceneId = "injury" | "move" | "overlap";

export const SCENES: { id: SceneId; title: string; lead: string; does: string }[] = [
  { id: "injury", title: "子どもがけがをした", lead: "困ったときに調べる", does: "学校・園の給付、入っている保険、医療証の使い方と連絡先を、まとめて出します" },
  { id: "move", title: "引っ越すことになった", lead: "1つの出来事から洗い出す", does: "住所が書いてある書類と、住まいに結びつく契約を、家じゅうの書類から一覧にします" },
  { id: "overlap", title: "保険の補償、重なってない？", lead: "書類同士を見比べる", does: "同じ種類の補償が2つ以上の書類にあれば、両方の原本の場所と、対象の人・金額の行を並べます" },
];

/** 原本の1行（どこに何と書いてあるか） */
export interface CaseLine {
  location: string;
  text: string;
}

export interface CaseDoc {
  doc: DocumentRecord;
  lines: CaseLine[];
  contacts: Contact[];
}

export interface CaseGroup {
  title: string;
  /** グループの説明（コードが作る決まった文） */
  note?: string;
  docs: CaseDoc[];
}

export interface CaseResult {
  scene: SceneId;
  /** 何を集めたか（コードが作る決まった文。判断は書かない） */
  summary: string;
  groups: CaseGroup[];
}

/** 書類の中の行（項目と原本の文字）。項目は「名前: 中身」、原本の文字は1行ずつ */
function linesOf(doc: DocumentRecord): (CaseLine & { label?: string })[] {
  // 番号（証券番号・加入者番号・宛名番号など）は伏せる。番号の項目そのものは出さない（大事な番号は端末の中の「大事な番号」で）
  const fields = doc.fields
    .filter((f) => !/番号|ID$/.test(f.label))
    .map((f) => ({ location: f.source?.location ?? f.label, text: maskText(`${f.label}: ${f.value}`), label: f.label }));
  const original = (doc.originalText ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && l !== doc.title)
    .map((l) => maskText(l))
    .map((l) => ({ location: "原本の文字", text: l.length > 90 ? `${l.slice(0, 90)}…` : l }));
  return [...fields, ...original];
}

/** 同じ中身の行を1つに（項目と原本の文字の両方に同じことが書いてあるとき） */
function uniqueLines(lines: CaseLine[], max: number): CaseLine[] {
  const out: CaseLine[] = [];
  const norm = (t: string) => t.replace(/[\s　・、。:：（）()]/g, "");
  for (const l of lines) {
    const n = norm(l.text);
    // 同じことを言っている行（10文字以上同じ並びがある）は、先に出した方だけ（項目と原本の文字の二重を避ける）
    const shares = (a: string, b: string) => {
      for (let i = 0; i + 10 <= a.length; i++) if (b.includes(a.slice(i, i + 10))) return true;
      return false;
    };
    if (out.some((o) => norm(o.text).includes(n) || n.includes(norm(o.text)) || shares(n, norm(o.text)))) continue;
    out.push(l);
    if (out.length >= max) break;
  }
  return out;
}

const contactsOf = (doc: DocumentRecord) => doc.contacts.filter((c) => c.name);

// ---- ① 子どもがけがをした ----

const INJURY = /けが|ケガ|怪我|傷害|通院|入院|見舞金|災害共済|受診|事故/;
/** その書類が、けがのことを書いている印（「事故のご連絡は証券へ」だけの案内・歯科健診の受診報告書は入れない） */
const INJURY_CORE: Partial<Record<DocumentCategory, RegExp>> = {
  school: /けが|ケガ|怪我|災害共済|見舞金/,
  childcare: /けが|ケガ|怪我|災害共済|見舞金/,
  insurance: /けが|ケガ|怪我|傷害|通院|入院/,
};
/** けがのときに見たい中身（条件・期限・手続き・必要なもの・連絡・対象） */
const INJURY_DETAIL = /対象|範囲|条件|期限|以内|まで|手続|順番|必要|持|連絡|請求|判断|使い方|窓口|負担/;
/** 補償を受けられる人の行（保険の書類で、けがの行と一緒に出す） */
const COVERED_PEOPLE = /補償を受けられる|被保険者の範囲|補償の対象|加入者/;

export function injuryCase(household: Household, memberId: string): CaseResult {
  const member = household.members.find((m) => m.id === memberId);
  const docs = documentsForAsk(household).filter((d) => d.memberIds.includes(memberId) || (d.householdWide && d.memberIds.length === 0));
  const found: CaseDoc[] = [];
  for (const doc of docs) {
    const lines = linesOf(doc);
    if (doc.category === "medical_card") {
      // 医療証は、けがの言葉が無くても使い方の行を出す（受診するときに持っていくもの）
      const use = lines.filter((l) => /使い方|負担|窓口|払い戻/.test(l.text));
      if (use.length) found.push({ doc, lines: uniqueLines(use, 3), contacts: contactsOf(doc) });
      continue;
    }
    const core = INJURY_CORE[doc.category];
    if (!core || !lines.some((l) => core.test(l.text))) continue;
    const hits = lines.filter((l) => INJURY.test(l.text));
    // 条件・期限・手続きの行を先に。項目を原本の文字より先に
    const ranked = [...hits].sort((a, b) => Number(INJURY_DETAIL.test(b.text)) - Number(INJURY_DETAIL.test(a.text)) || Number(Boolean(b.label)) - Number(Boolean(a.label)));
    // 保険は、補償を受けられる人の行を最初に
    const people = doc.category === "insurance" ? lines.filter((l) => COVERED_PEOPLE.test(l.label ?? l.text.slice(0, 14)) && !/賠償/.test(l.text)).slice(0, 1) : [];
    found.push({ doc, lines: uniqueLines([...people, ...ranked], people.length ? 5 : 4), contacts: contactsOf(doc) });
  }
  const name = member ? givenName(member.name) : "";
  const group = (title: string, cats: DocumentCategory[], note?: string): CaseGroup => ({ title, note, docs: found.filter((f) => cats.includes(f.doc.category)) });
  const groups = [
    group("学校・園のけがの給付・お知らせ", ["school", "childcare"], "給付があるか・額は、それぞれの窓口が決めます。"),
    group("入っている保険", ["insurance"], "補償を受けられる人・期限・必要なものの行です。対象になるかは保険会社が決めます。"),
    group("受診するとき", ["medical_card"]),
  ].filter((g) => g.docs.length);
  const count = groups.reduce((n, g) => n + g.docs.length, 0);
  return {
    scene: "injury",
    summary: count
      ? `${name}さんの書類と家全体の書類から、けがのときに見る所を${count}通分集めました（条件・期限・手続き・連絡先）。`
      : `${name}さんの書類に、けがのときに見る所は見つかりませんでした。`,
    groups,
  };
}

/** けがの場面で、最初に選んでおく人（いちばん上の子。いなければ最初の人） */
export function defaultInjuryMember(members: FamilyMember[]): string {
  return (members.find((m) => m.relation === "child") ?? members[0])?.id ?? "";
}

// ---- ② 引っ越すことになった ----

/** 住所が書いてある項目・行（家の住所を指すもの）。勤め先・学校・病院などの所在地は除く。中身が住所の形をしているものだけ（「宛先: 名前」は入れない） */
const ADDRESS_VALUE = /[都道府県市区町村]|丁目|番地|号室|〒|\d+-\d+-\d+|\*\*\*/;
/** 住所が変わったときの決まりが書いてある行（「住所が変わったときは14日以内に届け出」など） */
const ADDRESS_CHANGE = /住所.{0,25}(変わ|変更)|(変更|変わ).{0,12}住所/;
const ADDRESS_LABEL = /住所|送付先|設置場所|お届け先|宛先|使用の本拠|お住まい|居住地|物件の所在地|物件所在地/;
const NOT_HOME = /勤務先|事業所|会社の|学校の|病院の|医院の|店舗|窓口の|会場|集合場所/;
/** 住まいに結びつく契約になりやすい種類（住所の行が見つからなくても、ここに入れる） */
const HOME_CATEGORIES: DocumentCategory[] = ["housing", "vehicle", "license"];
/** 一覧に出す順（手続きが多くなりやすい契約から） */
const MOVE_ORDER: DocumentCategory[] = ["housing", "subscription", "insurance", "vehicle", "license", "childcare", "school", "medical_card", "medical", "work", "community", "care", "other"];

export function moveCase(household: Household): CaseResult {
  // メールの本文（請求・案内の1通ずつ）は数が多いので、住所の行があるときだけ
  const docs = documentsForAsk(household);
  const found: CaseDoc[] = [];
  for (const doc of docs) {
    const all = linesOf(doc);
    const address = all.filter((l) => {
      const head = l.label ?? l.text.slice(0, 12);
      return ADDRESS_LABEL.test(head) && !NOT_HOME.test(head) && ADDRESS_VALUE.test(l.text);
    });
    const change = all.filter((l) => ADDRESS_CHANGE.test(l.text) && !address.includes(l));
    const lines = [...address, ...change];
    if (lines.length) {
      found.push({ doc, lines: uniqueLines(lines, 3), contacts: contactsOf(doc) });
    } else if (doc.origin !== "text" && (HOME_CATEGORIES.includes(doc.category) || (doc.householdWide && doc.category === "insurance"))) {
      found.push({ doc, lines: [], contacts: contactsOf(doc) });
    }
  }
  const groups = MOVE_ORDER.map((cat) => ({
    title: CATEGORY_LABELS[cat],
    docs: found.filter((f) => f.doc.category === cat).sort((a, b) => b.lines.length - a.lines.length),
  })).filter((g) => g.docs.length);
  const withLines = found.filter((f) => f.lines.length).length;
  return {
    scene: "move",
    summary: `家じゅうの書類から、住所や「住所が変わったとき」が書いてある書類を${withLines}通、住まい・車・免許などに結びつく書類を${found.length - withLines}通集めました。届け出が要るか・やり方は、それぞれの問い合わせ先で確かめてください。`,
    groups,
  };
}

// ---- ③ 同じ種類の補償が2つ以上の書類にある ----

/** 見比べる補償の種類（名前の決まり）。名前が同じでも、範囲・金額・条件は書類ごとに違う */
export const COVERAGES: { name: string; re: RegExp }[] = [
  { name: "個人賠償責任", re: /個人賠償/ },
  { name: "携行品の補償", re: /携行品/ },
  { name: "弁護士費用", re: /弁護士費用/ },
  { name: "救援者費用", re: /救援者費用/ },
];
/** 補償を受けられる人・金額・条件の行 */
const SCOPE = /対象|範囲|補償を受けられる|被保険者|同居|加入者|限る|示談/;
/** 保険の書類として見比べる種類（車の保険は vehicle に入ることがある） */
const OVERLAP_CATEGORIES: DocumentCategory[] = ["insurance", "vehicle", "subscription", "other"];

export function overlapCase(household: Household): CaseResult {
  const docs = documentsForAsk(household).filter((d) => OVERLAP_CATEGORIES.includes(d.category));
  const groups: CaseGroup[] = [];
  for (const coverage of COVERAGES) {
    const found: CaseDoc[] = [];
    for (const doc of docs) {
      const lines = linesOf(doc);
      const hits = lines.filter((l) => coverage.re.test(l.text));
      if (!hits.length) continue;
      // その補償の行（金額・条件）と、補償を受けられる人の行
      const scope = lines.filter((l) => !coverage.re.test(l.text) && SCOPE.test(l.label ?? l.text) && /同居|家族|配偶者|親族|本人|子/.test(l.text));
      found.push({ doc, lines: uniqueLines([...hits, ...scope], 4), contacts: contactsOf(doc) });
    }
    if (found.length >= 2) {
      groups.push({
        title: `「${coverage.name}」が${found.length}つの書類にあります`,
        note: "名前が同じでも、補償を受けられる人・金額・条件は書類ごとに違います。重なっているか、どうするかは、それぞれの問い合わせ先で確かめてください。",
        docs: found,
      });
    }
  }
  return {
    scene: "overlap",
    summary: groups.length
      ? `確定した書類を見比べて、同じ種類の補償が2つ以上の書類にあるものを${groups.length}つ見つけました。`
      : "確定した書類の中に、同じ種類の補償が2つ以上の書類にあるものは見つかりませんでした。",
    groups,
  };
}

export function runCase(household: Household, scene: SceneId, memberId?: string): CaseResult {
  if (scene === "injury") return injuryCase(household, memberId || defaultInjuryMember(household.members));
  if (scene === "move") return moveCase(household);
  return overlapCase(household);
}
