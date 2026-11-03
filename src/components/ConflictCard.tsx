"use client";

// 同じ日のぶつかり（保護者が行く子どもの行事の日に、家族の大人が仕事）を、執事の気づきとして1枚ずつ出す。
// 誰が行くかは決めない。原本（行事・それぞれの勤務の書類）を並べ、家族それぞれの言葉で伝えて、家族で決める。

import Link from "next/link";
import { conflictDate, findConflicts } from "@/lib/conflicts";
import { formatYmd } from "@/lib/deadlines";
import { languageLabel, languageOf } from "@/lib/languages";
import type { Household } from "@/lib/types";

export function ConflictCards({ household, today, memberId }: { household: Household; today: Date; memberId?: string }) {
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  const names = (ids: string[]) => ids.map(nameOf).join("・");
  const list = findConflicts(household, today).filter(
    (c) => !memberId || c.child.deadline.memberIds.includes(memberId) || c.adults.some((a) => a.deadline.memberIds.includes(memberId)),
  );
  if (list.length === 0) return null;
  return (
    <>
      {list.map((c) => {
        const shared = household.members.filter((m) => c.child.doc.sharedWith?.includes(m.id) && languageOf(m) !== "ja");
        const adultNames = c.adults.map((a) => names(a.deadline.memberIds));
        return (
          <div className="card insight conflict" key={`${c.child.deadline.id}-${c.adults.map((a) => a.deadline.id).join("-")}`}>
            <div className="t">
              {conflictDate(c)}は、{names(c.child.deadline.memberIds)}さんの「{c.child.deadline.label}」の日です。
              {adultNames.length > 1 ? `この日は、${adultNames.map((n) => `${n}さんも`).join("")}お仕事になっているようです。` : `この日は、${adultNames[0]}さんはお仕事になっているようです。`}
            </div>
            <div className="meta">
              {c.child.deadline.label.replace(/[（(].*$/, "")}: {c.child.doc.title}・{c.child.deadline.source?.location ?? "—"}
            </div>
            {c.adults.map((a) => (
              <div className="meta" key={a.deadline.id}>
                {names(a.deadline.memberIds)}さんの出勤日: {a.doc.title}・{a.deadline.source?.location ?? "—"}
                {a.synthetic ? "" : `（${a.deadline.label}）`}
                {a.leave && `。有給を取るなら、申請は${formatYmd(a.leave.date)}まで（わが家のきまり「${a.leave.rule.label}」: ${a.leave.rule.daysBefore}日前まで）`}
                {a.notice && `。${a.notice.label.replace(/[（(].*$/, "")}は${formatYmd(a.notice.date)}まで（原本: ${a.notice.source?.location ?? "—"}）`}
              </div>
            ))}
            <div className="meta">{adultNames.length > 1 ? "どちらが行くかは" : "誰が行くかは"}、家族で決めてください（執事は決めません）。</div>
            <Link className="button small" href={`/documents/${c.child.doc.id}#tell`}>
              家族に伝える{shared.length ? `（${shared.map((m) => `${nameOf(m.id)}さんには${languageLabel(languageOf(m)).replace(/（.*）/, "")}で`).join("・")}）` : ""}
            </Link>
          </div>
        );
      })}
    </>
  );
}
