"use client";

// すべての予定・やること。予定の画面には大事なものだけを出すので、ここにはいつでも全部ある。

import Link from "next/link";
import { now } from "@/lib/clock";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Days, Source, shortDate } from "@/components/DeadlineCard";
import { Pic } from "@/components/Pics";
import { CalendarAll, CalendarButton } from "@/components/CalendarActions";
import { dayAnchor } from "@/components/WeekStrip";
import { calendarEventOf } from "@/lib/calendar";
import { candidateOf, toggleDone } from "@/lib/butler";
import { givenName } from "@/lib/whose";
import { type ActionItem, allItems, buildHome, formatYmd, isDone, itemIds, passedBeforeRegistered } from "@/lib/deadlines";
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
  const today = now();
  const done = h.done ?? {};
  const items = allItems(h, today);
  const { missing } = buildHome(h, today);
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const isPast = (i: ActionItem) => i.daysLeft < 0 && !(i.deadline.endDate && i.deadline.endDate >= formatKey(today));

  const overdue = items.filter((i) => isPast(i) && i.deadline.kind !== "event" && i.deadline.kind !== "after_event" && !i.deadline.awareness && !isDone(done, i));
  const upcoming = items.filter((i) => !isPast(i) && i.deadline.kind !== "after_event" && !isDone(done, i));
  const afterEvent = items.filter((i) => i.deadline.kind === "after_event");
  const finished = items.filter((i) => isDone(done, i));
  const pendingCount = h.documents.filter((d) => !d.confirmedAt).length;

  // 「向こう7日」の帯から、その日の最初の予定へ飛べるように
  const firstOfDay = new Set<string>();
  const seenDays = new Set<string>();
  for (const i of upcoming) {
    if (seenDays.has(i.deadline.date)) continue;
    seenDays.add(i.deadline.date);
    firstOfDay.add(i.deadline.id);
  }

  const Row = ({ item, anchor }: { item: ActionItem; anchor?: boolean }) => {
    const d = item.deadline;
    const finished = isDone(done, item);
    const c = candidateOf(item, isPast(i2(item)) && d.kind !== "event" && !finished);
    return (
      <div id={anchor && firstOfDay.has(d.id) ? dayAnchor(d.date) : undefined} className={`dcard${c.urgent && !finished && d.kind !== "after_event" ? " hot" : ""}`}>
        <div className="pic">
          <Pic kind={item.document.category} />
        </div>
        <div className="body">
          <div className="t wrap">{d.label}</div>
          {d.place && <div className="sub">場所: {d.place}</div>}
          {d.reserve && (
            <div className="sub">
              予備日: {formatYmd(d.reserve.date)}
              {d.reserve.condition && `（${d.reserve.condition}）`}
            </div>
          )}
          {d.needs?.length ? <div className="sub">必要なもの: {d.needs.join("、")}</div> : null}
          {d.leadReason && <div className="sub">{d.leadReason}</div>}
          {d.awareness && <div className="sub">知っておくだけ（自動で進むもの）。トップ・予定では知らせていません</div>}
          {item.daysLeft < 0 && passedBeforeRegistered(item) && <div className="sub">書類を登録したときには、もう過ぎていました（トップ・予定では知らせていません）</div>}
          {item.bundled?.length ? (
            <div className="sub">
              同じ予定のお知らせ:{" "}
              {item.bundled.map((b, i) => (
                <span key={b.deadline.id}>
                  {i > 0 && "、"}
                  <Link href={`/documents/${b.document.id}`}>{b.document.title}</Link>
                </span>
              ))}
            </div>
          ) : null}
          <div className="m">
            <span className="tag mut">
              {shortDate(d.date)}
              {d.endDate && `〜${shortDate(d.endDate)}`}
              {d.time && ` ${d.time}`}
            </span>
            <span className="tag mut">{DEADLINE_KIND_LABELS[d.kind]}</span>
            {d.memberIds.length > 0 && <span className="tag mut">{d.memberIds.map((id) => givenName(nameOf(id))).join("・")}</span>}
            <Source c={c} />
            {!finished && d.kind !== "after_event" && !isPast(item) && <CalendarButton event={calendarEventOf(item, nameOf)} />}
            {d.kind !== "after_event" && d.kind !== "event" && (
              <button className={`tag act ${finished ? "mut" : "ok"}`} onClick={() => save(toggleDone(h, itemIds(item)))}>
                {finished ? "済んだを取り消す" : "済んだにする"}
              </button>
            )}
          </div>
        </div>
        {!finished && d.kind !== "after_event" && <Days c={c} />}
      </div>
    );
  };
  // isPast は ActionItem を受けるので、そのまま渡す
  function i2(item: ActionItem) {
    return item;
  }

  return (
    <main>
      <BackToTop />
      <h1 className="pt">すべての予定</h1>
      <p className="lead">
        確定した書類と、わが家のきまりから作った予定・やることのすべてです。
        {pendingCount > 0 && `確認待ちの書類（${pendingCount}件）の予定は、確定するとここに入ります。`}
      </p>

      {overdue.length > 0 && (
        <>
          <h2 className="sec">締切を過ぎたもの</h2>
          {overdue.map((i) => (
            <Row key={i.deadline.id} item={i} />
          ))}
        </>
      )}

      {missing.length > 0 && (
        <>
          <h2 className="sec">来ていないもの</h2>
          {missing.map((e) => (
            <div className="dcard" key={e.id}>
              <div className="pic">
                <Pic kind="missing" />
              </div>
              <div className="body">
                <div className="t wrap">{e.label}がまだ届いていません</div>
                {e.hint && <div className="sub">{e.hint}</div>}
                <div className="m">
                  <span className="tag warn">まだ届いていない</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      <h2 className="sec">これから</h2>
      <CalendarAll events={upcoming.filter((i) => !i.deadline.awareness).map((i) => calendarEventOf(i, nameOf))} />
      {upcoming.length === 0 ? (
        <div className="calm-line">ありません。</div>
      ) : (
        upcoming.map((i) => <Row key={i.deadline.id} item={i} anchor />)
      )}

      {afterEvent.length > 0 && (
        <>
          <h2 className="sec">何か起きたときの期限</h2>
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
