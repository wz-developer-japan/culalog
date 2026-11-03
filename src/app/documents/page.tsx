"use client";

// 登録した書類の一覧（中身は DocumentList）。パソコンの幅（1024px 以上）では右に「書類を選ぶと中身が出ます」の面を並べる。
// しまい場所などの詳しいことは書類の詳しい画面へ。データを消すのは執事・設定の画面の末尾へ移した。

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackToTop } from "@/components/BackToTop";
import { DocumentList } from "@/components/DocumentList";
import { ButlerPic } from "@/components/Pics";
import { useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

export default function Documents() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  useInboxQueue(household, update);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  return (
    <div className="docs-split">
      <main className="docs-list">
        <BackToTop />
        <DocumentList household={household} />
      </main>
      <aside className="docs-empty" aria-hidden>
        <ButlerPic width={120} />
        <div className="t">書類を選ぶと、ここに中身が出ます</div>
        <div className="s">原本の場所を押すと、原本の行が光ります。</div>
      </aside>
    </div>
  );
}
