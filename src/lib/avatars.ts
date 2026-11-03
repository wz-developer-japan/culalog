// 家族の丸のアイコン（キャラクターか、端末の中だけに置く写真）。
// 🔴 写真はこの端末の中（IndexedDB の files）にだけ置き、CULALOG のサーバーにも Claude にも送らない。

import type { FamilyMember } from "./types";

export const CHARACTERS = [
  { id: "man", label: "お父さん" },
  { id: "woman-long", label: "長い髪の女の人" },
  { id: "woman-short", label: "短い髪の女の人" },
  { id: "boy", label: "男の子" },
  { id: "girl", label: "女の子" },
  { id: "baby", label: "赤ちゃん" },
] as const;

export type CharacterId = (typeof CHARACTERS)[number]["id"];

/** 写真のアイコン（icon: "photo"）の置き場所。家のデータを重くしないよう files に置く */
export const PHOTO_ICON = "photo";
export const photoKey = (memberId: string) => `avatar:${memberId}`;

/** 架空の家族の既定のアイコン（前に始めた架空の家族にも、読み込みのときに足す） */
export const DEMO_ICONS: Record<string, CharacterId> = {
  "m-self": "man",
  "m-spouse": "woman-long",
  "m-son": "boy",
  "m-daughter": "girl",
};

export function isCharacter(icon: string | undefined): icon is CharacterId {
  return CHARACTERS.some((c) => c.id === icon);
}

/** 架空の家族で、まだアイコンを決めていない人に既定のキャラクターを入れる（変えていない人だけ） */
export function withDemoIcons<T extends { isDemo?: boolean; members: FamilyMember[] }>(household: T): T {
  if (!household.isDemo || household.members.every((m) => m.icon !== undefined || !DEMO_ICONS[m.id])) return household;
  return { ...household, members: household.members.map((m) => (m.icon === undefined && DEMO_ICONS[m.id] ? { ...m, icon: DEMO_ICONS[m.id] } : m)) };
}

/** 選んだ写真を、丸に使う小さな正方形（中央を切り抜き）にする */
export async function squarePhoto(file: Blob, side = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, side, side);
  return canvas.toDataURL("image/jpeg", 0.85);
}
