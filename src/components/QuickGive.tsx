"use client";

// ホームから、そのまま撮って・選んで渡す。渡し方の画面へ行く一手間を省く。
// 渡した分は受け取り箱に入り、ホームを開いているあいだに執事が1枚ずつ読む（ホームの「渡した書類」に進み具合が出る）。
// 何ページもある書類・見本・ドラッグは、渡す画面（/scan）で。

import Link from "next/link";
import { useState } from "react";
import { type AddResult, addFilesToInbox } from "@/lib/addToInbox";
import type { Household } from "@/lib/types";

export function QuickGive({ update }: { update: (change: (h: Household) => Household) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);

  async function give(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResult(await addFilesToInbox(files, update));
    setBusy(false);
  }

  return (
    <>
      <label className={`button file-button${busy ? " busy" : ""}`}>
        {busy ? "受け取っています…" : "撮って渡す・まとめて選ぶ"}
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => {
            give([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>
      {result && (
        <div className="card calm" role="status">
          {result.added > 0 && <div>{result.added}件を受け取りました。読むのは任せて、このまま閉じても大丈夫です。</div>}
          {result.duplicates > 0 && <div>{result.duplicates}件は、前に渡したものと同じファイルだったので読みません。</div>}
          {result.rejected.map((r, i) => (
            <div key={i} className="meta">
              {r.name}: {r.error}
            </div>
          ))}
        </div>
      )}
      <Link className="button secondary" href="/scan" style={{ textAlign: "center", textDecoration: "none" }}>
        渡し方を選ぶ（何ページもある書類・見本で試す）
      </Link>
    </>
  );
}
