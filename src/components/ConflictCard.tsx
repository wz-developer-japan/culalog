"use client";

// 同じ日のぶつかり（保護者が行く子どもの行事 × 大人の出勤日）を、執事の気づきとして1枚ずつ出す。
// 誰が行くかは決めない。家族それぞれの言葉で伝えて、家族で決める。

import Link from "next/link";
import { conflictDate, findConflicts } from "@/lib/conflicts";
import { formatYmd } from "@/lib/deadlines";
import { languageLabel, languageOf } from "@/lib/languages";
import type { Household } from "@/lib/types";

export function ConflictCards({ household, today, memberId }: { household: Household; today: Date; memberId?: string }) {
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  const list = findConflicts(household, today).filter(
    (c) => !memberId || c.child.deadline.memberIds.includes(memberId) || c.adult.deadline.memberIds.includes(memberId),
  );
  if (list.length === 0) return null;
  return (
    <>
      {list.map((c) => {
        const shared = household.members.filter((m) => c.child.doc.sharedWith?.includes(m.id) && languageOf(m) !== "ja");
        return (
          <div className="card insight conflict" key={`${c.child.deadline.id}-${c.adult.deadline.id}`}>
            <div className="t">
              {conflictDate(c)}は、{c.child.deadline.memberIds.map(nameOf).join("・")}さんの「{c.child.deadline.label}」と、
              {c.adult.deadline.memberIds.map(nameOf).join("・")}さんの「{c.adult.deadline.label}」が同じ日です。
            </div>
            <div className="meta">
              原本: {c.child.doc.title}・{c.child.deadline.source?.location ?? "—"} ／ {c.adult.doc.title}・{c.adult.deadline.source?.location ?? "—"}
            </div>
            {c.leave && (
              <div className="meta">
                有給を取るなら、{c.adult.deadline.memberIds.map(nameOf).join("・")}さんの申請は{formatYmd(c.leave.date)}までです（わが家のきまり「{c.leave.rule.label}」: {c.leave.rule.daysBefore}日前まで）。
              </div>
            )}
            <div className="meta">誰が行くかは、家族で決めてください（執事は決めません）。</div>
            <Link className="button small" href={`/documents/${c.child.doc.id}#tell`}>
              家族に伝える{shared.length ? `（${shared.map((m) => `${nameOf(m.id)}さんには${languageLabel(languageOf(m)).replace(/（.*）/, "")}で`).join("・")}）` : ""}
            </Link>
          </div>
        );
      })}
    </>
  );
}
