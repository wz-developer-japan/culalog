"use client";

// 登録した書類の一覧。ホームからは外して、ここにまとめる。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { CATEGORY_LABELS } from "@/lib/labels";
import { useHousehold } from "@/lib/useHousehold";

export default function Documents() {
  const router = useRouter();
  const { household, loaded, clear } = useHousehold();

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name ?? "";
  const docs = [...household.documents].sort(
    (a, b) => Number(Boolean(a.confirmedAt)) - Number(Boolean(b.confirmedAt)) || b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>書類の一覧</h1>
      <p className="lead">執事に渡した書類です。データはこの端末の中にだけ保存しています。</p>

      {docs.length === 0 ? (
        <div className="card meta">まだありません。</div>
      ) : (
        docs.map((d) => (
          <Link className="card row-link" key={d.id} href={`/documents/${d.id}`}>
            {d.title}
            {!d.confirmedAt && <span className="badge">確認待ち</span>}
            <div className="meta">
              {d.docType ?? CATEGORY_LABELS[d.category]}
              {d.memberIds.length > 0 && `・${d.memberIds.map(nameOf).join("、")}`}
            </div>
            {d.storageLocation && <div className="meta">しまい場所: {d.storageLocation}</div>}
          </Link>
        ))
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
