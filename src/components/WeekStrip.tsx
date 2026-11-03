"use client";

// 予定の画面のいちばん上の「向こう7日」の帯。日ごとに件数・予定名・誰の。押すと、すべての予定のその日の所へ。
// 並べるだけで、日付の計算は lib/deadlines（allItems）。「日付を進める」で今日が動けば一緒に動く。

import Link from "next/link";
import { addDays, type ActionItem, allItems, isDone, toYmd } from "@/lib/deadlines";
import { givenName, isFor, ownersOf, type Whose } from "@/lib/whose";
import type { Household } from "@/lib/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** その日に当たる予定（期間のものは、期間の中の日すべて） */
export function weekDays(h: Household, today: Date, who: Whose = "all"): { ymd: string; date: Date; items: ActionItem[] }[] {
  const items = allItems(h, today).filter(
    (i) =>
      i.deadline.kind !== "after_event" &&
      !i.deadline.awareness &&
      !isDone(h.done, i) &&
      isFor(who, ownersOf(i.deadline, i.document), i.document.notForFamily),
  );
  return Array.from({ length: 7 }, (_, n) => {
    const date = addDays(today, n);
    const ymd = toYmd(date);
    // 何日も続く期間の予定が毎日の先頭を占めないよう、その日だけ・その日に始まる予定を先に並べる
    const ongoing = (i: ActionItem) => (i.deadline.date < ymd ? 1 : 0);
    const dayItems = items
      .filter((i) => i.deadline.date <= ymd && (i.deadline.endDate ?? i.deadline.date) >= ymd)
      .sort((a, b) => ongoing(a) - ongoing(b));
    return { ymd, date, items: dayItems };
  });
}

/** すべての予定の画面で、その日の予定へ飛ぶための印 */
export const dayAnchor = (ymd: string) => `day-${ymd}`;

export function WeekStrip({ household, today, who = "all" }: { household: Household; today: Date; who?: Whose }) {
  const days = weekDays(household, today, who);
  const nameOf = (id: string) => givenName(household.members.find((m) => m.id === id)?.name ?? "");
  return (
    <section className="week" aria-label="向こう7日の予定">
      <div className="week-head">
        <span className="k">向こう7日</span>
        <span className="meta">{days.reduce((n, d) => n + d.items.length, 0)}件</span>
      </div>
      <div className="week-row">
        {days.map(({ ymd, date, items }, n) => {
          const dow = date.getDay();
          const who = [...new Set(items.flatMap((i) => i.deadline.memberIds))].map(nameOf).filter(Boolean);
          const target = items.length ? [...items].sort((a, b) => a.deadline.date.localeCompare(b.deadline.date))[0].deadline.date : "";
          const body = (
            <>
              <div className={`d${dow === 0 ? " sun" : dow === 6 ? " sat" : ""}`}>
                {n === 0 ? "今日" : n === 1 ? "明日" : `${date.getMonth() + 1}/${date.getDate()}`}
                <small>（{WEEKDAYS[dow]}）</small>
              </div>
              {items.length ? (
                <>
                  <div className="c">{items.length}件</div>
                  {items.slice(0, 2).map((i) => (
                    <div className="l" key={i.deadline.id}>
                      {i.deadline.label}
                    </div>
                  ))}
                  {items.length > 2 && <div className="l more">ほか{items.length - 2}件</div>}
                  {who.length > 0 && <div className="w">{who.join("・")}</div>}
                </>
              ) : (
                <div className="none">なし</div>
              )}
            </>
          );
          return items.length ? (
            <Link key={ymd} className={`wday has${n === 0 ? " today" : ""}`} href={`/schedule/all#${dayAnchor(target)}`}>
              {body}
            </Link>
          ) : (
            <div key={ymd} className={`wday${n === 0 ? " today" : ""}`}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
