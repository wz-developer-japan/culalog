"use client";

// 登録した書類の一覧。探す欄（幅いっぱい）→ 分類の6語（横1行・スクロール）→ 人（小さく2段目）→ カード（題名・分類1つ・誰）。
// しまい場所などの詳しいことは書類の詳しい画面へ。データを消すのは執事・設定の画面の末尾へ移した。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Info } from "@/components/Info";
import { faceBackground, MemberFace } from "@/components/MemberFace";
import { inboxProgress } from "@/lib/inbox";
import { importantNumbers } from "@/lib/numbers";
import { ButlerPic, Pic } from "@/components/Pics";
import { type Group, GROUPS, groupsOf } from "@/lib/labels";
import type { DocumentRecord } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";
import { ownersLabel } from "@/lib/whose";

export default function Documents() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  useInboxQueue(household, update);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Group | "">("");
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
  const categories = GROUPS.filter((g) => current.some((d) => groupsOf(d).includes(g)));
  const people = household.members.filter((m) => current.some((d) => d.memberIds.includes(m.id)));
  const docs = current
    .filter((d) => (!category || groupsOf(d).includes(category)) && (!member || d.memberIds.includes(member)))
    .filter((d) => words.every((w) => textOf(d).includes(w)))
    .sort((a, b) => Number(Boolean(a.confirmedAt)) - Number(Boolean(b.confirmedAt)) || b.createdAt.localeCompare(a.createdAt));
  const filtered = words.length > 0 || category !== "" || member !== "";
  // 大事な番号（確定した今年度の書類から。人で絞っているときはその人の分）
  const numbers = importantNumbers(household).filter((n) => !member || n.memberIds.includes(member));

  // 写真の見本をまだ渡していない（受け取り箱が空・写真の書類が無い）なら、上に「写真の見本をまとめて渡す」の導線を1枚だけ出す。
  // 初めの書類は増やさない（渡す前 → 後 を見せるため）
  const offerSamples =
    (household.demoSamples?.some((x) => x.images?.length) ?? false) &&
    inboxProgress(household).total === 0 &&
    !household.documents.some((d) => d.origin === "photo");

  return (
    <main>
      <BackToTop />
      <h1 className="pt">
        書類
        <Info label="この画面について">
          執事に渡した書類です。データはこの端末の中にだけ保存しています。分類（暮らし・お金など）は探しやすくするための並べ方で、1つの書類が2つの分類に出ることがあります。
        </Info>
      </h1>

      {offerSamples && (
        <Link className="ask soft" href="/scan#photo-samples">
          <svg className="l" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 7h4l2-2h4l2 2h4v12H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          <div className="t">写真の見本をまとめて渡す</div>
          <span className="go">試す</span>
        </Link>
      )}

      {current.length > 4 && (
        <>
          <label className="search">
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" />
            </svg>
            <input
              className="input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="探す（例: 運動会　保険　更新料）"
              aria-label="書類を探す"
            />
          </label>
          <div className="chips scroll" role="group" aria-label="分類で絞る">
            <button className={`chip${category === "" ? " selected" : ""}`} onClick={() => setCategory("")}>
              すべて
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip${category === c ? " selected" : ""}`} onClick={() => setCategory(category === c ? "" : c)}>
                {c}
                <small>{current.filter((d) => groupsOf(d).includes(c)).length}</small>
              </button>
            ))}
          </div>
          {people.length > 1 && (
            <div className="chips scroll small" role="group" aria-label="人で絞る">
              {people.map((m) => {
                return (
                  <button key={m.id} className={`chip${member === m.id ? " selected" : ""}`} onClick={() => setMember(member === m.id ? "" : m.id)}>
                    <span className="member-dot" style={{ background: faceBackground(household.members, m) }} aria-hidden>
                      <MemberFace members={household.members} member={m} />
                    </span>
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
        <Link className="link-row" href="/numbers">
          大事な番号<small>{numbers.length}</small>
          <span aria-hidden>›</span>
        </Link>
      )}

      {docs.length === 0 ? (
        filtered ? (
          <div className="calm-line">当てはまる書類はありません。</div>
        ) : (
          <div className="empty">
            <ButlerPic width={110} />
            <div className="t">まだ書類はありません</div>
            <div className="s">下の「＋」から、写真・スクショ・PDF・メールの本文を渡してください。</div>
          </div>
        )
      ) : (
        docs.map((d) => (
          <Link className="dcard row-link" key={d.id} href={`/documents/${d.id}`}>
            <div className="pic">
              <Pic kind={d.category} />
            </div>
            <div className="body">
              <div className="t wrap">{d.title}</div>
              <div className="m">
                {!d.confirmedAt && <span className="tag warn">確認待ち</span>}
                <span className="tag">{groupsOf(d)[0]}</span>
                <span className="tag mut">{d.notForFamily ? "この家の書類ではない" : ownersLabel(household.members, d)}</span>
              </div>
            </div>
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
    </main>
  );
}
