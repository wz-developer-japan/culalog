"use client";

// 登録した書類の一覧。ホームからは外して、ここにまとめる。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { memberMark } from "@/lib/memberMark";
import { importantNumbers } from "@/lib/numbers";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { DocumentCategory, DocumentRecord } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";
import { ownersLabel } from "@/lib/whose";

export default function Documents() {
  const router = useRouter();
  const { household, loaded, clear, update } = useHousehold();
  useInboxQueue(household, update);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<DocumentCategory | "">("");
  const [member, setMember] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name ?? "";
  const current = household.documents.filter((d) => !d.supersededBy);
  const old = household.documents.filter((d) => d.supersededBy);
  // 探す: 題名・種類・期間・項目・予定・原本の文字のどこかに、空白で区切った言葉が全部あるもの
  const words = query.trim().split(/\s+/).filter(Boolean);
  const textOf = (d: DocumentRecord) =>
    [d.title, d.docType, d.periodLabel, d.storageLocation, ...d.fields.map((f) => `${f.label} ${f.value}`), ...d.deadlines.map((x) => x.label), d.originalText]
      .filter(Boolean)
      .join(" ");
  const categories = [...new Set(current.map((d) => d.category))];
  const people = household.members.filter((m) => current.some((d) => d.memberIds.includes(m.id)));
  const docs = current
    .filter((d) => (!category || d.category === category) && (!member || d.memberIds.includes(member)))
    .filter((d) => words.every((w) => textOf(d).includes(w)))
    .sort((a, b) => Number(Boolean(a.confirmedAt)) - Number(Boolean(b.confirmedAt)) || b.createdAt.localeCompare(a.createdAt));
  const filtered = words.length > 0 || category !== "" || member !== "";
  // 大事な番号（確定した今年度の書類から。人で絞っているときはその人の分）
  const numbers = importantNumbers(household).filter((n) => !member || n.memberIds.includes(member));

  return (
    <main>
      <BackToTop />
      <h1>書類の一覧</h1>
      <p className="lead">執事に渡した書類です。データはこの端末の中にだけ保存しています。</p>

      {current.length > 4 && (
        <>
          <input
            className="input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="探す（例: 運動会　保険　更新料）"
            aria-label="書類を探す"
          />
          <div className="chips">
            <button className={`chip${category === "" ? " selected" : ""}`} onClick={() => setCategory("")}>
              すべての種類
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip${category === c ? " selected" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
                {CATEGORY_LABELS[c]}（{current.filter((d) => d.category === c).length}）
              </button>
            ))}
          </div>
          {people.length > 1 && (
            <div className="chips">
              {people.map((m) => {
                const mark = memberMark(household.members, m.id);
                return (
                  <button key={m.id} className={`chip${member === m.id ? " selected" : ""}`} onClick={() => setMember(member === m.id ? "" : m.id)}>
                    {mark && (
                      <span className="member-dot" style={{ background: mark.color }} aria-hidden>
                        {mark.initial}
                      </span>
                    )}
                    {m.name.split(/\s+/).pop()}
                  </button>
                );
              })}
            </div>
          )}
          {filtered && (
            <p className="meta">
              {docs.length}件 / {current.length}件
            </p>
          )}
        </>
      )}

      {numbers.length > 0 && (
        <p className="meta">
          <Link href="/numbers">大事な番号（{numbers.length}）</Link>: 証券番号・受給者番号など、手続きで急に聞かれる番号。端末の中だけで答えます
        </p>
      )}

      {docs.length === 0 ? (
        <div className="card meta">{filtered ? "当てはまる書類はありません。" : "まだありません。"}</div>
      ) : (
        docs.map((d) => (
          <Link className="card row-link" key={d.id} href={`/documents/${d.id}`}>
            {d.title}
            {!d.confirmedAt && <span className="badge">確認待ち</span>}
            <div className="meta">
              {d.docType ?? CATEGORY_LABELS[d.category]}
              {d.periodLabel && `・${d.periodLabel}`}
              ・{d.notForFamily ? "この家の書類ではない" : ownersLabel(household.members, d)}
            </div>
            {d.storageLocation && <div className="meta">しまい場所: {d.storageLocation}</div>}
            {d.notForFamily && <div className="meta">家族の情報にしていません（記入例・見本など）</div>}
          </Link>
        ))
      )}

      {old.length > 0 && (
        <details className="original">
          <summary>前のもの（{old.length}件）</summary>
          <p className="meta">同じ種類の新しい書類が来たので、ひとこと・予定の根拠には使っていない書類です。</p>
          {old.map((d) => (
            <Link className="card row-link" key={d.id} href={`/documents/${d.id}`}>
              {d.title}
              <div className="meta">{d.periodLabel ?? d.createdAt.slice(0, 10)}</div>
            </Link>
          ))}
        </details>
      )}

      <div className="spacer" />
      <Link className="button" href="/scan" style={{ textAlign: "center", textDecoration: "none" }}>
        執事に書類を渡す
      </Link>
      <button
        className="button secondary"
        onClick={async () => {
          if (confirm("この端末に保存したデータをすべて消しますか？")) {
            await clear();
            router.push("/");
          }
        }}
      >
        この端末のデータをすべて消す
      </button>
    </main>
  );
}
