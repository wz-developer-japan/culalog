// 「誰の」で分けて見るための決まった計算（Claude は使わない）。
// 🔴 判断しない線: 誰のか書類から分からないものは勝手に誰かに入れず「家族みんな・誰のか分からない」として、
// 「みんな」のページにだけ出す。二人に関係する書類は両方の人に出す。
// この家の書類ではないもの（記入例・見本など）は誰の欄にも出さず、「みんな」でも「この家の書類ではない」と添える。

import type { Deadline, DocumentRecord, FamilyMember } from "./types";

/** "all" = みんな／それ以外 = 家族の ID */
export type Whose = "all" | string;

/** 誰の予定か。予定に「誰の」が付いていればそれ、無ければ書類の「誰の」 */
export function ownersOf(deadline: Pick<Deadline, "memberIds"> | undefined, document: Pick<DocumentRecord, "memberIds">): string[] {
  return deadline?.memberIds.length ? deadline.memberIds : document.memberIds;
}

/** その人のページに出すか */
export function isFor(whose: Whose, owners: string[], notForFamily?: string): boolean {
  if (whose === "all") return true;
  if (notForFamily) return false;
  return owners.includes(whose);
}

/** 「日向 翔太」→「翔太」 */
export function givenName(name: string): string {
  return name.split(/\s+/).pop() ?? name;
}

/** 書類の「誰の」を言葉に。空なら、家全体のものは「家全体」、そうでなければ「誰のか分からない」（勝手に誰かに入れない） */
export function ownersLabel(members: FamilyMember[], doc: Pick<DocumentRecord, "memberIds" | "householdWide">): string {
  const names = doc.memberIds.map((id) => members.find((m) => m.id === id)).filter(Boolean).map((m) => givenName((m as FamilyMember).name));
  if (doc.householdWide) return names.length ? `家全体・${names.join("・")}` : "家全体";
  return names.length ? names.join("・") : "誰のか分からない";
}
