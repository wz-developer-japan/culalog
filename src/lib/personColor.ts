// 色は「誰のことか」だけに使う（パステル6色）。入口・書類の分類には使わない（グレーの面＋黒のアイコン）。
// みんな（家族全体）=ライム／執事=ラベンダー／家族は並び順に スカイ・ピーチ・ミント・バター（5人目からは繰り返す）。
// 色だけに頼らない: 色を塗る所には、名前か丸のアイコンを必ず一緒に出す。
// 値は CSS 変数（globals.css の :root と theme-b.css）。ここでは変数の名前だけを返す。

import type { FamilyMember } from "./types";

const MEMBER_COLORS = ["sky", "peach", "mint", "butter"] as const;

export const FAMILY_COLOR = "var(--p-lime)";
export const BUTLER_COLOR = "var(--p-lavender)";

/** その人の色（"all"・見つからない人は みんなの色） */
export function personColor(members: Pick<FamilyMember, "id">[], id: string | undefined): string {
  const index = id ? members.findIndex((m) => m.id === id) : -1;
  return index < 0 ? FAMILY_COLOR : `var(--p-${MEMBER_COLORS[index % MEMBER_COLORS.length]})`;
}

/** 予定・書類の色: 1人のことならその人の色、2人以上・家全体・誰のか分からないものは みんなの色 */
export function colorOf(members: Pick<FamilyMember, "id">[], ids: string[] | undefined): string {
  return ids && ids.length === 1 ? personColor(members, ids[0]) : FAMILY_COLOR;
}
