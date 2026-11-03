"use client";

// 書類の一覧。探す欄（幅いっぱい）→ 分類の6語（横1行・スクロール）→ 人（小さく2段目）→ カード（題名・分類1つ・誰）。
// 書類の画面（/documents）と、パソコンの幅で書類の中身の左に並べる一覧（selectedId のカードに枠）で同じものを使う。

import Link from "next/link";
import { useState } from "react";
import { Info } from "@/components/Info";
import { faceStyle, MemberFace } from "@/components/MemberFace";
import { inboxProgress } from "@/lib/inbox";
import { importantNumbers } from "@/lib/numbers";
import { ButlerPic } from "@/components/Pics";
import { GroupIcon } from "@/components/GroupIcon";
import { WhoDot } from "@/components/WhoDot";
import { sharedLabel } from "@/components/ShareWith";
import { type Group, GROUPS, groupsOf } from "@/lib/labels";
import type { DocumentRecord, Household } from "@/lib/types";
import { ownersLabel } from "@/lib/whose";

export function DocumentList({ household, selectedId }: { household: Household; selectedId?: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Group | "">("");
  const [member, setMember] = useState("");
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

  const cardOf = (d: DocumentRecord) => (
    <Link className={`dcard row-link${d.id === selectedId ? " selected" : ""}`} key={d.id} href={`/documents/${d.id}`} aria-current={d.id === selectedId ? "page" : undefined}>
      <div className="pic gpic">
        <GroupIcon group={groupsOf(d)[0]} />
      </div>
      <div className="body">
        <div className="t wrap">{d.title}</div>
        <div className="m">
          {!d.confirmedAt && <span className="tag warn">確認待ち</span>}
          <span className="tag">{groupsOf(d)[0]}</span>
          <span className="tag mut">{d.notForFamily ? "この家の書類ではない" : ownersLabel(household.members, d)}</span>
          {d.sharedWith && d.sharedWith.length > 0 && <span className="tag mut">{sharedLabel(household.members, d)}</span>}
        </div>
      </div>
      {!d.notForFamily && <WhoDot members={household.members} ids={d.memberIds} />}
    </Link>
  );
  // 絞っていないときは、家族と共有している書類を主役に。自分だけの書類は畳む
  const sections: { key: string; title?: string; docs: DocumentRecord[]; fold?: boolean }[] = filtered
    ? [{ key: "all", docs }]
    : [
        { key: "pending", docs: docs.filter((d) => !d.confirmedAt) },
        { key: "shared", title: "家族と共有している書類", docs: docs.filter((d) => d.confirmedAt && d.sharedWith && d.sharedWith.length > 0) },
        { key: "undecided", title: "共有するか、まだ決めていない書類", docs: docs.filter((d) => d.confirmedAt && d.sharedWith === undefined) },
        { key: "mine", title: "自分だけの書類", docs: docs.filter((d) => d.confirmedAt && d.sharedWith?.length === 0), fold: true },
      ];

  return (
    <>
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
                    <span className="member-dot" style={faceStyle(household.members, m)} aria-hidden>
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
        sections
          .filter((x) => x.docs.length > 0)
          .map((x) =>
            x.fold ? (
              <details className="fold mine" key={x.key}>
                <summary>
                  {x.title}（{x.docs.length}件）
                </summary>
                {x.docs.map(cardOf)}
              </details>
            ) : (
              <section key={x.key}>
                {x.title && sections.filter((y) => y.docs.length > 0 && y.title).length > 1 && <h2 className="sec">{x.title}</h2>}
                {x.docs.map(cardOf)}
              </section>
            ),
          )
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
    </>
  );
}
