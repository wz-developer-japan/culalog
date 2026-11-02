"use client";

// 書類の詳細と確定。
// 確定前は、項目ごとに「原本と見比べた」を本人が付ける。すべて付けたら確定でき、
// 確定した書類の期限だけがホームの知らせに使われる。

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CATEGORY_LABELS, DEADLINE_KIND_LABELS } from "@/lib/labels";
import type { DocumentRecord } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  // 期限は確定前の見比べだけに使う印（保存しない）
  const [checkedDeadlines, setCheckedDeadlines] = useState<string[]>([]);

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

  const nameOf = (mid: string) => household.members.find((m) => m.id === mid)?.name ?? "";
  const confirmed = Boolean(doc.confirmedAt);
  const allChecked =
    doc.fields.every((f) => f.status === "confirmed") &&
    doc.deadlines.every((d) => checkedDeadlines.includes(d.id));

  async function update(next: DocumentRecord) {
    await save({ ...household!, documents: household!.documents.map((d) => (d.id === next.id ? next : d)) });
  }

  async function toggleField(key: string) {
    await update({
      ...doc!,
      fields: doc!.fields.map((f) =>
        f.key === key ? { ...f, status: f.status === "confirmed" ? "draft" : "confirmed" } : f,
      ),
    });
  }

  async function remove() {
    if (!confirm("この書類を削除しますか？")) return;
    await save({ ...household!, documents: household!.documents.filter((d) => d.id !== doc!.id) });
    router.push("/");
  }

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>{doc.title}</h1>
      <p className="lead">
        {CATEGORY_LABELS[doc.category]}
        {doc.memberIds.length > 0 && `・${doc.memberIds.map(nameOf).join("、")}`}
        {confirmed ? "・確定済み" : "・確認待ち"}
      </p>

      {!confirmed && (
        <div className="card warn">
          原本と見比べて、合っている項目に印を付けてください。すべて付けると確定できます。
          確定するまで、この書類の期限ではお知らせしません。
        </div>
      )}

      {doc.draftSource === "provisional" && (
        <div className="card warn">
          この下書きは、読み取り機能の準備中に用意しておいた<strong>仮の結果</strong>です。Claude の読み取りではありません。
        </div>
      )}
      {doc.draftSource === "claude" && !confirmed && (
        <div className="card meta">
          この下書きは Claude が原本から読み取ったものです。読み違いがあり得るので、必ず原本と見比べてください。
        </div>
      )}

      {doc.unclear && doc.unclear.length > 0 && !confirmed && (
        <>
          <h2>読み取れなかったところ</h2>
          <div className="card warn">
            {doc.unclear.map((u, i) => (
              <div key={i}>・{u}</div>
            ))}
            <div className="meta">原本で確かめ、必要なら手入力で足してください。</div>
          </div>
        </>
      )}

      {doc.originalFile && (
        <details className="original" open={!confirmed}>
          <summary>原本（読み取った{doc.originalFile.mediaType === "application/pdf" ? " PDF" : "写真"}）</summary>
          {doc.originalFile.mediaType === "application/pdf" ? (
            <a href={doc.originalFile.dataUrl} target="_blank" rel="noreferrer">
              PDF を開く
            </a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="original-image" src={doc.originalFile.dataUrl} alt="読み取った書類の写真" />
          )}
        </details>
      )}

      {doc.storageLocation && (
        <>
          <h2>しまい場所</h2>
          <div className="card">{doc.storageLocation}</div>
        </>
      )}

      <h2>期限・予定</h2>
      {doc.deadlines.length === 0 ? (
        <div className="card meta">登録されていません。</div>
      ) : (
        doc.deadlines.map((d) => (
          <div className="card" key={d.id}>
            {d.label}: {d.date}
            {d.endDate && ` 〜 ${d.endDate}`}
            <div className="meta">
              {DEADLINE_KIND_LABELS[d.kind]}・{d.leadDays}日前からお知らせ
              {d.source && `・原本: ${d.source.location}`}
            </div>
            {d.leadReason && <div className="meta">{d.leadReason}</div>}
            {d.intent && <div className="meta">そのときしたいこと: {d.intent}</div>}
            {!confirmed && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={checkedDeadlines.includes(d.id)}
                  onChange={(e) =>
                    setCheckedDeadlines(
                      e.target.checked ? [...checkedDeadlines, d.id] : checkedDeadlines.filter((x) => x !== d.id),
                    )
                  }
                />
                原本と見比べた
              </label>
            )}
          </div>
        ))
      )}

      <h2>書いてあること</h2>
      {doc.fields.length === 0 ? (
        <div className="card meta">登録されていません。</div>
      ) : (
        doc.fields.map((f) => (
          <div className="card" key={f.key}>
            <div className="meta">{f.label}</div>
            {f.value}
            {f.source && <div className="meta">原本: {f.source.location}</div>}
            {!confirmed && (
              <label className="check">
                <input type="checkbox" checked={f.status === "confirmed"} onChange={() => toggleField(f.key)} />
                原本と見比べた
              </label>
            )}
          </div>
        ))
      )}

      {doc.contacts.length > 0 && (
        <>
          <h2>問い合わせ先</h2>
          {doc.contacts.map((c, i) => (
            <div className="card" key={i}>
              <div className="meta">{c.label}</div>
              {c.name}
              {c.phone && (
                <div>
                  <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a>
                </div>
              )}
              {c.hours && <div className="meta">{c.hours}</div>}
              {c.source && <div className="meta">原本: {c.source.location}</div>}
            </div>
          ))}
        </>
      )}

      {doc.originalText && !doc.originalFile && (
        <details className="original">
          <summary>原本を見る{doc.origin === "demo" && "（架空の書類）"}</summary>
          <pre>{doc.originalText}</pre>
        </details>
      )}

      <div className="spacer" />
      {!confirmed && (
        <button
          className="button"
          disabled={!allChecked}
          onClick={() => update({ ...doc, confirmedAt: new Date().toISOString() })}
        >
          原本と見比べて確定する
        </button>
      )}
      {confirmed && (
        <button
          className="button secondary"
          onClick={() => {
            setCheckedDeadlines([]);
            update({
              ...doc,
              confirmedAt: undefined,
              fields: doc.fields.map((f) => ({ ...f, status: "draft" })),
            });
          }}
        >
          確定を取り消す
        </button>
      )}
      <button className="button secondary" onClick={remove}>
        この書類を削除する
      </button>
    </main>
  );
}
