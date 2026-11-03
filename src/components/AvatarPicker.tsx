"use client";

// 家族の丸のアイコンを選ぶ（キャラクター・写真・頭文字）。家族ごとのページで使う。
// 🔴 写真はこの端末の中（files）にだけ置く。CULALOG のサーバーにも Claude にも送らない。

import { useRef, useState } from "react";
import { CharacterFace, setCachedPhoto } from "@/components/MemberFace";
import { CHARACTERS, PHOTO_ICON, photoKey, squarePhoto } from "@/lib/avatars";
import { memberMark } from "@/lib/memberMark";
import { deleteFile, putFile } from "@/lib/storage";
import type { FamilyMember, Household } from "@/lib/types";

export function AvatarPicker({
  household,
  member,
  save,
  onClose,
}: {
  household: Household;
  member: FamilyMember;
  save: (next: Household) => Promise<void> | void;
  onClose: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const mark = memberMark(household.members, member.id);

  const choose = async (icon: string) => {
    // 写真をやめたら、端末に置いた写真も消す
    if (member.icon === PHOTO_ICON && icon !== PHOTO_ICON) {
      await deleteFile(photoKey(member.id));
      setCachedPhoto(member.id, null);
    }
    await save({ ...household, members: household.members.map((m) => (m.id === member.id ? { ...m, icon } : m)) });
    onClose();
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    try {
      const url = await squarePhoto(file);
      await putFile(photoKey(member.id), url);
      setCachedPhoto(member.id, url);
      await choose(PHOTO_ICON);
    } catch {
      setError("この写真は読み込めませんでした。別の写真を選んでください。");
    }
  };

  return (
    <div className="card avatar-picker" role="group" aria-label="アイコンを選ぶ">
      <div className="t">アイコンを選ぶ</div>
      <div className="grid">
        {CHARACTERS.map((c) => (
          <button key={c.id} className={member.icon === c.id ? "on" : undefined} aria-pressed={member.icon === c.id} onClick={() => choose(c.id)}>
            <CharacterFace id={c.id} size={52} />
            <span>{c.label}</span>
          </button>
        ))}
        <button className={!member.icon ? "on" : undefined} aria-pressed={!member.icon} onClick={() => choose("")}>
          <b className="initial" style={{ background: mark?.color }}>
            {mark?.initial}
          </b>
          <span>名前の1文字</span>
        </button>
      </div>
      <button className="button secondary" onClick={() => fileInput.current?.click()}>
        写真を選ぶ
      </button>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
      {error && <p className="warn-text">{error}</p>}
      <p className="note">写真はこの端末の中にだけ置きます。CULALOG のサーバーにも Claude にも送りません。</p>
      <button className="link-button" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
}
