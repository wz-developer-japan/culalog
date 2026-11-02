"use client";

// 受け取り箱とまとめて確認。
// 上: 執事が読んでいる進み具合（何枚読んだか・上限で待っているか・準備待ちか）
// 下: 読み終わった下書きを種類ごとに並べ、チェックしたものを一度に確定する。気になるものだけ詳細で原本と見比べて直す。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { confirmDocument, openQuestions } from "@/lib/butler";
import { formatYmd } from "@/lib/deadlines";
import { bulkConfirmBlocker, confirmMany, inboxItems, inboxProgress, retryInbox, tidyInbox } from "@/lib/inbox";
import { CATEGORY_LABELS } from "@/lib/labels";
import { deleteFile } from "@/lib/storage";
import type { DocumentRecord, Household } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

const timeOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Inbox() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  const { readingId } = useInboxQueue(household, update);
  // チェックを外したもの（既定は、迷う理由が無いものすべてにチェック）
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  const drafts = useMemo(() => (household?.documents ?? []).filter((d) => !d.confirmedAt), [household]);

  if (!loaded || !household) return <main />;
  const h = household as Household;
  const progress = inboxProgress(h);
  const items = inboxItems(h);
  const questions = openQuestions(h);
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  const blockerOf = (d: DocumentRecord) => bulkConfirmBlocker(h, d);
  const isChecked = (d: DocumentRecord) => (blockerOf(d) ? checked.has(d.id) : !unchecked.has(d.id));
  const toggle = (d: DocumentRecord) => {
    const flip = (s: Set<string>) => {
      const n = new Set(s);
      if (n.has(d.id)) n.delete(d.id);
      else n.add(d.id);
      return n;
    };
    if (blockerOf(d)) setChecked(flip(checked));
    else setUnchecked(flip(unchecked));
  };
  const selected = drafts.filter(isChecked);

  // 種類ごとに並べる（多い種類から）
  const groups = Object.entries(
    drafts.reduce<Record<string, DocumentRecord[]>>((acc, d) => {
      (acc[d.category] ??= []).push(d);
      return acc;
    }, {}),
  ).sort((a, b) => b[1].length - a[1].length);

  const read = progress.done + progress.duplicate + progress.failed;
  const percent = progress.total ? Math.round((read / progress.total) * 100) : 0;
  const reading = items.find((i) => i.id === readingId);

  async function confirmSelected() {
    const ids = selected.map((d) => d.id);
    await update((current) => confirmMany(current, ids, (hh, id) => confirmDocument(hh, id, newId)));
    setMessage(`${ids.length}件を確定しました。ひとこと・予定・聞くの根拠に使います。`);
    setUnchecked(new Set());
    setChecked(new Set());
  }

  async function tidy() {
    const gone = items.filter((i) => i.status === "done" || i.status === "duplicate");
    await update(tidyInbox);
    await Promise.all(gone.map((i) => deleteFile(i.id)));
  }

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>まとめて確認</h1>

      {progress.total > 0 && (
        <div className="card">
          <div className="progress-label">
            受け取った {progress.total}件のうち、{read}件済み
            <span className="meta">（読んで下書きにした {progress.done}件）</span>
          </div>
          <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${percent}%` }} />
          </div>
          {reading && <div className="meta thinking">いま読んでいます: {reading.name}</div>}
          {progress.pausedUntil && progress.waiting > 0 && (
            <div className="meta">
              読み取りの回数の上限に当たったので、{timeOf(progress.pausedUntil)}ごろから続きを読みます（この画面かホームを開いていれば、自動で続けます）。
            </div>
          )}
          {!progress.pausedUntil && progress.waiting > 0 && !reading && <div className="meta">続きを読む準備をしています…</div>}
          {progress.waiting === 0 && progress.needsKey === 0 && <div className="meta">全部読み終わりました。</div>}
          {progress.needsKey > 0 && (
            <div className="card unknown" style={{ marginTop: 8 }}>
              {progress.needsKey}件は、執事（Claude）の読み取りの準備ができていないため、まだ読めていません。写真は端末に置いてあります。
              <button className="link-button" onClick={() => update((c) => retryInbox(c, ["needsKey"]))}>
                もう一度読んでみる
              </button>
            </div>
          )}
          {progress.duplicate > 0 && <div className="meta">{progress.duplicate}件は、前に渡したものと同じだったので読んでいません。</div>}
          {items
            .filter((i) => i.status === "failed")
            .map((i) => (
              <div className="meta error" key={i.id}>
                {i.name}: {i.error}
              </div>
            ))}
          {progress.failed > 0 && (
            <button className="link-button" onClick={() => update((c) => retryInbox(c, ["failed"]))}>
              読めなかったものを、もう一度読む
            </button>
          )}
          {(progress.done > 0 || progress.duplicate > 0) && progress.waiting === 0 && (
            <button className="link-button" onClick={tidy}>
              読み終わった分を受け取り箱から片付ける（書類は残ります）
            </button>
          )}
        </div>
      )}

      {questions.length > 0 && (
        <Link className="card row-link question-link" href="/questions">
          執事から聞きたいことが {questions.length}問 あります
          <span className="badge">答える</span>
        </Link>
      )}

      {message && <div className="card calm">{message}</div>}

      {drafts.length === 0 ? (
        <div className="card meta">確認待ちの書類はありません。</div>
      ) : (
        <>
          <p className="lead">
            読み終わった {drafts.length}件です。写真の日付と、下の予定の日付だけはざっと見比べてから確定してください。
            気になるものは、題名を押すと原本と並べて直せます。
          </p>
          {groups.map(([category, docs]) => (
            <section key={category}>
              <h2>
                {CATEGORY_LABELS[category as DocumentRecord["category"]]}（{docs.length}）
              </h2>
              {docs.map((d) => {
                const blocker = blockerOf(d);
                const dates = [...d.deadlines].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
                return (
                  <div className={`card bulk${isChecked(d) ? " checked" : ""}`} key={d.id}>
                    <label className="bulk-check">
                      <input type="checkbox" checked={isChecked(d)} onChange={() => toggle(d)} />
                      <span>
                        <Link href={`/documents/${d.id}`}>{d.title}</Link>
                        {d.draftSource === "provisional" && <span className="badge">仮の結果</span>}
                      </span>
                    </label>
                    <div className="bulk-body">
                      {d.originalFile && d.originalFile.mediaType.startsWith("image/") && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="thumb" src={d.originalFile.dataUrl} alt="" />
                      )}
                      <div>
                        <div className="meta">
                          {d.memberIds.length ? `${d.memberIds.map(nameOf).join("・")}さん` : "誰の書類か未定"}
                          {d.periodLabel && `・${d.periodLabel}`}
                        </div>
                        {d.summary?.what && <div>{d.summary.what}</div>}
                        {dates.map((x) => (
                          <div className="meta" key={x.id}>
                            {formatYmd(x.date)}
                            {x.endDate && `〜${formatYmd(x.endDate)}`} {x.label}
                          </div>
                        ))}
                        {d.deadlines.length > 3 && <div className="meta">ほか{d.deadlines.length - 3}件の予定</div>}
                        {d.learnedNotes?.map((n, i) => (
                          <div className="meta learned" key={i}>
                            ✓ {n}
                          </div>
                        ))}
                        {blocker && <div className="meta warn-text">⚠ {blocker}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
          <div className="sticky-actions">
            <button className="button" disabled={selected.length === 0} onClick={confirmSelected}>
              チェックした {selected.length}件を、まとめて確定する
            </button>
          </div>
          <p className="note">
            まとめて確定しても、あとから書類の画面で直せます。確定した書類だけを、ひとこと・予定・執事に聞くの根拠に使います。
          </p>
        </>
      )}

      <div className="spacer" />
      <Link className="button secondary" href="/scan" style={{ textAlign: "center", textDecoration: "none" }}>
        もっと渡す
      </Link>
    </main>
  );
}
