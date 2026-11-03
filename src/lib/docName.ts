// 書類の短い呼び名（カード・一覧で使う）。正式な題名は書類の画面に出す。
// 例: 「2026年度 年間勤務カレンダー（あさぎ食品工業…）」→「タオさんの勤務カレンダー」、
//     「2学期 授業参観・学級懇談会のご案内」→「2学期 授業参観のご案内」

import type { DocumentRecord, FamilyMember } from "./types";

const WORK_KINDS = ["勤務カレンダー", "シフト表", "給与明細", "源泉徴収票", "雇用契約", "就業規則", "勤務表"];

export function shortDocName(doc: DocumentRecord, members: FamilyMember[] = []): string {
  if (doc.category === "work" && doc.memberIds.length === 1) {
    const kind = WORK_KINDS.find((k) => `${doc.title} ${doc.docType ?? ""}`.includes(k));
    const m = members.find((x) => x.id === doc.memberIds[0]);
    if (kind && m) return `${m.name.split(/\s+/).pop()}さんの${kind}`;
  }
  let t = doc.title.split("＋")[0];
  // かっこの中（会社名・発行月・「お願い」など）を外す。入れ子も
  for (let i = 0; i < 3; i++) t = t.replace(/[（(][^（()）]*[）)]/g, "");
  t = t
    .replace(/・[^・\s]*?の(ご案内|お知らせ|おしらせ)$/, "の$1")
    .replace(/について$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 22 ? `${t.slice(0, 21)}…` : t;
}
