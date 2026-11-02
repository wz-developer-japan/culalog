"use client";

// 大事な番号の一覧（人ごとの見出し）。/numbers と家族ごとのページで使う。番号は Claude に送らず、端末の中でコードが探す。

import { NumberRow } from "@/components/NumberRow";
import type { ImportantNumber } from "@/lib/numbers";
import type { FamilyMember } from "@/lib/types";
import { givenName } from "@/lib/whose";

export function NumbersList({ numbers, members }: { numbers: ImportantNumber[]; members: FamilyMember[] }) {
  const ownerOf = (ids: string[]) =>
    ids.map((id) => members.find((m) => m.id === id)).filter(Boolean).map((m) => givenName((m as FamilyMember).name)).join("・") || "家全体";
  if (numbers.length === 0) return <div className="card meta">確定した書類に、大事な番号はまだありません。</div>;
  return (
    <>
      {[...new Set(numbers.map((n) => ownerOf(n.memberIds)))].map((owner) => (
        <div key={owner} className="card numbers">
          <h3 className="number-owner">{owner}</h3>
          {numbers
            .filter((n) => ownerOf(n.memberIds) === owner)
            .map((n, i) => (
              <NumberRow key={`${n.documentId}-${n.label}-${i}`} item={n} />
            ))}
        </div>
      ))}
      <p className="meta">確定した書類から、コードで探しています。番号は Claude には送りません。押すと番号が見えます。</p>
    </>
  );
}
