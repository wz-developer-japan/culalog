"use client";

// すべての予定・やること。ホームには大事なものだけを出すので、ここにはいつでも全部ある。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toggleDone } from "@/lib/butler";
import { type ActionItem, allItems, buildHome, formatYmd } from "@/lib/deadlines";
import { DEADLINE_KIND_LABELS } from "@/lib/labels";
import type { Household } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";

export default function Schedule() {
  const router = useRouter();
  const { household, loaded, save } = useHousehold();

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const h = household as Household;
  const today = new Date();
  const done = h.done ?? {};
  const items = allItems(h, today);
  const { missing } = buildHome(h, today);
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const isPast = (i: ActionItem) => i.daysLeft < 0 && !(i.deadline.endDate && i.deadline.endDate >= formatKey(today));

  const overdue = items.filter((i) => isPast(i) && i.deadline.kind !== "event" && i.deadline.kind !== "after_event" && !done[i.deadline.id]);
  const upcoming = items.filter((i) => !isPast(i) && i.deadline.kind !== "after_event" && !done[i.deadline.id]);
  const afterEvent = items.filter((i) => i.deadline.kind === "after_event");
  const finished = items.filter((i) => done[i.deadline.id]);
  const pendingCount = h.documents.filter((d) => !d.confirmedAt).length;

  const Row = ({ item }: { item: ActionItem }) => {
    const d = item.deadline;
    return (
      <div className="card">
        <div className="meta">
          {formatYmd(d.date)}
          {d.endDate && ` 〜 ${formatYmd(d.endDate)}`}
          {d.time && `・${d.time}`}
          {item.daysLeft > 0 && `（あと${item.daysLeft}日）`}
          {item.daysLeft === 0 && "（今日）"}
        </div>
        {d.label}
        {d.place && <div>場所: {d.place}</div>}
        {d.needs?.length ? <div>必要なもの: {d.needs.join("、")}</div> : null}
        <div className="meta">
          {DEADLINE_KIND_LABELS[d.kind]}
          {d.memberIds.length > 0 && `・${d.memberIds.map(nameOf).join("、")}`}
        </div>
        {d.leadReason && <div className="meta">{d.leadReason}</div>}
        <div className="meta">
          原本: <Link href={`/documents/${item.document.id}`}>{item.document.title}</Link>
          {d.source?.location && `・${d.source.location}`}
        </div>
        {d.kind !== "after_event" && d.kind !== "event" && (
          <button className="link-button" onClick={() => save(toggleDone(h, d.id))}>
            {done[d.id] ? "済んだを取り消す" : "済んだ"}
          </button>
        )}
      </div>
    );
  };

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>すべての予定</h1>
      <p className="lead">
        確定した書類と、わが家のきまりから作った予定・やることのすべてです。
        {pendingCount > 0 && `確認待ちの書類（${pendingCount}件）の予定は、確定するとここに入ります。`}
      </p>

      {overdue.length > 0 && (
        <>
          <h2>締切を過ぎたもの</h2>
          {overdue.map((i) => (
            <Row key={i.deadline.id} item={i} />
          ))}
        </>
      )}

      {missing.length > 0 && (
        <>
          <h2>来ていないもの</h2>
          {missing.map((e) => (
            <div className="card warn" key={e.id}>
              {e.label}がまだ届いていません
              {e.hint && <div className="meta">{e.hint}</div>}
            </div>
          ))}
        </>
      )}

      <h2>これから</h2>
      {upcoming.length === 0 ? (
        <div className="card meta">ありません。</div>
      ) : (
        upcoming.map((i) => <Row key={i.deadline.id} item={i} />)
      )}

      {afterEvent.length > 0 && (
        <>
          <h2>何か起きたときの期限</h2>
          {afterEvent.map((i) => (
            <Row key={i.deadline.id} item={i} />
          ))}
        </>
      )}

      {finished.length > 0 && (
        <details className="original">
          <summary>済んだもの（{finished.length}件）</summary>
          {finished.map((i) => (
            <Row key={i.deadline.id} item={i} />
          ))}
        </details>
      )}
    </main>
  );
}

function formatKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
