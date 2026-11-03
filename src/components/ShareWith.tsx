"use client";

// この書類を家族の誰と共有するか。🔴 配偶者でも自動では共有しない（あなたが選ぶ）。
// 共有した人には、その人の読みたい言葉で、説明・締切・持ち物を伝えられる。

import { languageLabel, languageOf } from "@/lib/languages";
import type { DocumentRecord, FamilyMember } from "@/lib/types";

export function shareTargets(members: FamilyMember[]): FamilyMember[] {
  return members.filter((m) => m.relation !== "self");
}

export function sharedLabel(members: FamilyMember[], doc: DocumentRecord): string | undefined {
  if (!doc.sharedWith) return undefined;
  if (doc.sharedWith.length === 0) return "自分だけ";
  const names = doc.sharedWith.map((id) => members.find((m) => m.id === id)?.name.split(/\s+/).pop()).filter(Boolean);
  return `${names.join("・")}と共有`;
}

export function ShareWith({
  members,
  doc,
  onChange,
}: {
  members: FamilyMember[];
  doc: DocumentRecord;
  onChange: (sharedWith: string[] | undefined) => void;
}) {
  const targets = shareTargets(members);
  if (targets.length === 0) return null;
  const chosen = doc.sharedWith ?? [];
  const toggle = (id: string) => onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  return (
    <div className="card share-with">
      <div className="meta">
        {doc.sharedWith === undefined
          ? "まだ決めていません。共有する人を選ぶか、「共有しない」を押してください。"
          : doc.sharedWith.length === 0
            ? "共有しない（あなただけ）にしています。"
            : "共有した人には、その人の読みたい言葉で伝えられます。"}
      </div>
      {targets.map((m) => (
        <label className="check" key={m.id}>
          <input type="checkbox" checked={chosen.includes(m.id)} onChange={() => toggle(m.id)} />
          {m.name}
          <span className="meta">（{languageLabel(languageOf(m))}で読む）</span>
        </label>
      ))}
      {doc.sharedWith?.length !== 0 && (
        <button className="link-button" onClick={() => onChange([])}>
          共有しない（自分だけ）
        </button>
      )}
    </div>
  );
}
