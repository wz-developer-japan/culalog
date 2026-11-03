"use client";

// 家族の丸の中身（キャラクター・写真・頭文字）。家族の丸・家族のページ・誰の書類かの選択肢・書類の絞り込みで同じものを使う。
// 挿絵の決まり（線なし・丸い形・1つの絵に3色まで: 背景・肌・髪）は Pics.tsx に合わせる。
// 🔴 写真は端末の中（files）から読むだけ。どこにも送らない。

import { useEffect, useState } from "react";
import { type CharacterId, isCharacter, PHOTO_ICON, photoKey } from "@/lib/avatars";
import { memberMark } from "@/lib/memberMark";
import { getFile } from "@/lib/storage";
import type { FamilyMember } from "@/lib/types";

const SKIN = "#f6d2b8";
const NAVY = "#3d4a6b";
const BROWN = "#5a3b2e";
const LIGHT_BROWN = "#a8714a";

const Eyes = ({ y = 24, color }: { y?: number; color: string }) => (
  <>
    <circle cx="16" cy={y} r="1.5" fill={color} />
    <circle cx="24" cy={y} r="1.5" fill={color} />
    <path d={`M17.5 ${y + 3.6}h5a2.5 2.5 0 0 1-5 0z`} fill={color} />
  </>
);

/** キャラクターのアイコン（40×40 の丸。背景も含む） */
export function CharacterFace({ id, size }: { id: CharacterId; size?: number }) {
  const common = { className: "face", viewBox: "0 0 40 40", width: size, height: size, "aria-hidden": true as const };
  switch (id) {
    case "man":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#d6e4fa" />
          <path d="M8 40c1-5 5-7.5 12-7.5s11 2.5 12 7.5z" fill={NAVY} />
          <ellipse cx="20" cy="23" rx="9.5" ry="10.5" fill={SKIN} />
          <path d="M10 21.5c-.5-8 4-12.5 10-12.5s10.5 4.5 10 12.5c-1.5-3.5-4-5.5-7-6-3 2-8 3.5-13 6z" fill={NAVY} />
          <Eyes color={NAVY} />
        </svg>
      );
    case "woman-long":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#fde0cc" />
          <path d="M8.5 22c0-8 5-13 11.5-13s11.5 5 11.5 13v11a4 4 0 0 1-4 4h-15a4 4 0 0 1-4-4z" fill={BROWN} />
          <ellipse cx="20" cy="23.5" rx="8.5" ry="9.5" fill={SKIN} />
          <path d="M11 21.5c0-6 4-9.5 9-9.5s9 3.5 9 9c-3-1-6-3-7.5-5.5-2 3-5.5 5-10.5 6z" fill={BROWN} />
          <Eyes y={24.5} color={BROWN} />
        </svg>
      );
    case "woman-short":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#fdeab8" />
          <path d="M9 23c0-9 5-13.5 11-13.5s11 4.5 11 13.5v5a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" fill={NAVY} />
          <ellipse cx="20" cy="23.5" rx="8.5" ry="9.5" fill={SKIN} />
          <path d="M11.2 21c.3-5.5 4-8.8 8.8-8.8s8.5 3.3 8.8 8.8z" fill={NAVY} />
          <Eyes y={24.5} color={NAVY} />
        </svg>
      );
    case "boy":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#d4efdd" />
          <path d="M10 40c1-4 4-6.5 10-6.5s9 2.5 10 6.5z" fill={NAVY} />
          <ellipse cx="20" cy="24" rx="9" ry="9.5" fill={SKIN} />
          <path d="M11 22.5c-1-7.5 3-11.5 9-11.5s10 4 9 11.5c-1-2.5-2.5-4-4.5-4.5l-2 2-2.5-2.5-2.5 2.5-2-2c-2 .5-3.5 2-4.5 4.5z" fill={NAVY} />
          <Eyes y={25} color={NAVY} />
        </svg>
      );
    case "girl":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#fbdde4" />
          <circle cx="9" cy="25" r="4.5" fill={BROWN} />
          <circle cx="31" cy="25" r="4.5" fill={BROWN} />
          <ellipse cx="20" cy="24.5" rx="9" ry="9.5" fill={SKIN} />
          <path d="M11 23c0-7 4-10.5 9-10.5s9 3.5 9 10.5c-2.5-2.5-5.5-3.5-9-3.5s-6.5 1-9 3.5z" fill={BROWN} />
          <Eyes y={25.5} color={BROWN} />
        </svg>
      );
    case "baby":
      return (
        <svg {...common}>
          <circle cx="20" cy="20" r="20" fill="#fff0c4" />
          <circle cx="20" cy="23.5" r="11" fill={SKIN} />
          <circle cx="20" cy="12.5" r="2.6" fill={LIGHT_BROWN} />
          <circle cx="22.8" cy="11.2" r="1.6" fill={LIGHT_BROWN} />
          <Eyes y={25} color={LIGHT_BROWN} />
        </svg>
      );
  }
}

// 写真は一度読んだら覚えておく（丸が何か所にもあるので、そのたびに端末から読まない）
const photos = new Map<string, string | null>();
const photoListeners = new Set<() => void>();

/** 写真を変えたときに呼ぶ（同じ画面の丸を描き直す） */
export function setCachedPhoto(memberId: string, dataUrl: string | null) {
  photos.set(memberId, dataUrl);
  for (const l of photoListeners) l();
}

function usePhoto(memberId: string, enabled: boolean): string | null {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const listener = () => setVersion((v) => v + 1);
    photoListeners.add(listener);
    if (!photos.has(memberId)) getFile(photoKey(memberId)).then((url) => setCachedPhoto(memberId, url));
    return () => {
      photoListeners.delete(listener);
    };
  }, [memberId, enabled]);
  return enabled ? (photos.get(memberId) ?? null) : null;
}

/** 丸の中身。キャラクター・写真のときは丸いっぱいに描き、無ければ頭文字（背景は呼ぶ側が mark.color を塗る） */
export function MemberFace({ members, member }: { members: FamilyMember[]; member: FamilyMember }) {
  const photo = usePhoto(member.id, member.icon === PHOTO_ICON);
  if (photo) return <img className="face" src={photo} alt="" />;
  if (isCharacter(member.icon)) return <CharacterFace id={member.icon} />;
  return <>{memberMark(members, member.id)?.initial}</>;
}

/** 丸の背景（キャラクターは自分の背景を持つので塗らない。写真は読み終わるまで頭文字を出すので色を塗る） */
export function faceBackground(members: FamilyMember[], member: FamilyMember): string | undefined {
  if (isCharacter(member.icon)) return "transparent";
  return memberMark(members, member.id)?.color;
}
