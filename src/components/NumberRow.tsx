"use client";

// 大事な番号の1行。番号は最初は伏せて、「見る」を押したときだけ、その場で見せる（画面を離れたらまた伏せる）。
// 番号の横に、原本のどこに書いてあるかと、現物のしまい場所を添える。

import Link from "next/link";
import { useState } from "react";
import { maskedValue, type ImportantNumber } from "@/lib/numbers";

export function NumberRow({ item, owner }: { item: ImportantNumber; owner?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="number-row">
      <div className="number-head">
        <span className="number-label">
          {item.label}
          {owner && <span className="meta">（{owner}）</span>}
        </span>
        <button className="link-button" onClick={() => setShown(!shown)} aria-pressed={shown}>
          {shown ? "伏せる" : "見る"}
        </button>
      </div>
      <div className={`number-value${shown ? "" : " masked"}`} aria-live="polite">
        {shown ? item.value : maskedValue(item.value)}
      </div>
      <div className="meta">
        原本: <Link href={`/documents/${item.documentId}`}>{item.documentTitle}</Link>・{item.location}
      </div>
      {item.storageLocation && <div className="meta">しまい場所: {item.storageLocation}</div>}
    </div>
  );
}
