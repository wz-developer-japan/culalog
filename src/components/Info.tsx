// 仕組みの説明を、本文から外して「ⓘ」の中にしまう。押したときだけ開く（JS なしで動く details）。
// 「仮（Claude 未使用）」の正直な表示は、見出しの横の小さな札（ProvisionalTag）で残す。

import type { ReactNode } from "react";

export function Info({ children, label = "説明" }: { children: ReactNode; label?: string }) {
  return (
    <details className="info">
      <summary aria-label={label} title={label}>
        <span aria-hidden>i</span>
      </summary>
      <div className="info-body">{children}</div>
    </details>
  );
}

/** Claude の答えでないことを正直に示す小さな札 */
export function ProvisionalTag() {
  return <span className="ptag" title="Claude を使っていない仮のもの">仮</span>;
}
