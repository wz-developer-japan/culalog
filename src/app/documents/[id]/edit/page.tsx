"use client";

// 登録済みの書類を直す。読み取りの下書きの読み違いも、ここで原本を見ながら直す。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { DocumentForm } from "@/components/DocumentForm";
import type { DocumentRecord } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";

export default function EditDocument() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { household, loaded, save } = useHousehold();

  if (!loaded) return <main />;
  const doc = household?.documents.find((d) => d.id === id);
  if (!household || !doc) {
    return (
      <main>
        <p>書類が見つかりません。</p>
        <Link href="/">ホームへ</Link>
      </main>
    );
  }

  async function submit(next: DocumentRecord) {
    await save({ ...household!, documents: household!.documents.map((d) => (d.id === next.id ? next : d)) });
    router.push(`/documents/${next.id}`);
  }

  return (
    <main>
      <p className="meta">
        <Link href={`/documents/${doc.id}`}>← 書類へ戻る</Link>
      </p>
      <h1>書類を直す</h1>
      <p className="lead">
        {doc.confirmedAt
          ? "確定済みの書類です。直した内容もそのまま確定として扱います。"
          : "原本を見ながら直してください。保存したあと、原本と見比べて確定します。"}
      </p>
      <DocumentForm
        initial={doc}
        members={household.members}
        submitLabel="保存する"
        onSubmit={submit}
        onCancel={() => router.push(`/documents/${doc.id}`)}
      >
        {doc.originalFile && doc.originalFile.mediaType !== "application/pdf" && (
          <details className="original" open>
            <summary>原本（読み取った写真）</summary>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="original-image" src={doc.originalFile.dataUrl} alt="読み取った書類の写真" />
          </details>
        )}
        {doc.originalText && !doc.originalFile && (
          <details className="original">
            <summary>原本を見る{doc.origin === "demo" && "（架空の書類）"}</summary>
            <pre>{doc.originalText}</pre>
          </details>
        )}
      </DocumentForm>
    </main>
  );
}
