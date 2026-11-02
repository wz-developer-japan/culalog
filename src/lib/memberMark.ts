// 家族の小さな印（色と頭文字）。文字を読まなくても、誰かが分かるように。
// 注意（赤）・テーマ（オレンジ）とかぶらない色だけを使う。

import type { FamilyMember } from "./types";

const COLORS = ["#2f6f9f", "#5f7f1f", "#7a4fa8", "#287368", "#8a6a2f", "#4f5f8f", "#9a4f7f"];

export function memberMark(members: FamilyMember[], id: string): { color: string; initial: string } | undefined {
  const index = members.findIndex((m) => m.id === id);
  if (index < 0) return undefined;
  const parts = members[index].name.split(/\s+/);
  return { color: COLORS[index % COLORS.length], initial: [...parts[parts.length - 1]][0] ?? "" };
}
