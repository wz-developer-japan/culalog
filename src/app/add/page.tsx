"use client";

// 手入力の登録。ここで保存した書類は「確認待ち」になり、
// 原本と見比べて確定するまでホームの知らせには使わない。

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentRecord, Household } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";

export default function AddDocument() {
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  const [initial] = useState<DocumentRecord>(() => ({
    id: newId("doc"),
    title: "",
    category: "other",
    memberIds: [],
    origin: "manual",
    fields: [],
    contacts: [],
    deadlines: [],
    createdAt: new Date().toISOString(),
  }));

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;

  async function submit(doc: DocumentRecord) {
    const current = household as Household;
    await save({ ...current, documents: [...current.documents, doc] });
    router.push(`/documents/${doc.id}`);
  }

  return (
    <main>
      <h1>書類を登録</h1>
      <p className="lead">手元の書類を見ながら入れてください。保存したあと、原本と見比べて確定します。</p>
      <DocumentForm
        initial={initial}
        members={household.members}
        submitLabel="保存して確認へ"
        onSubmit={submit}
        onCancel={() => router.push("/")}
      />
    </main>
  );
}
