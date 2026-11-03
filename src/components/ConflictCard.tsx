"use client";

// 同じ日のぶつかり（保護者が行く子どもの行事の日に、家族の大人が仕事）を、執事の気づきとして1枚ずつ出す。
// 誰が行くかは決めない。原本（行事・それぞれの勤務の書類）を1行ずつ並べ、休みの申し出の締切を1行で添えて、家族で決める。
// 細かい根拠（きまりの名前・原本の中の場所）はカードに出さず、書類の画面に回す（スマホの1画面に、太字からボタンまで入るように）。

import Link from "next/link";
import { conflictDate, findConflicts } from "@/lib/conflicts";
import { formatYmd } from "@/lib/deadlines";
import { languageLabel, languageOf } from "@/lib/languages";
import type { Household } from "@/lib/types";

/** 書類の題名を短く（（…）を外し、長ければ切る） */
const shortTitle = (title: string) => {
  const t = title.replace(/[（(][^（()）]*[）)]/g, "").replace(/[（(][^）)]*[）)]/g, "").replace(/\s+/g, " ").trim();
  return t.length > 24 ? `${t.slice(0, 23)}…` : t;
};

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
        const event = c.child.deadline.label.replace(/[（(].*$/, "");
        // 休みの申し出の締切: 勤務の書類の申し出の締切か、わが家のきまりの有給の申請
        const limits = c.adults.map((a) => ({ name: names(a.deadline.memberIds), date: a.notice?.date ?? a.leave?.date })).filter((x) => x.date);
        const allSame = limits.length > 1 && limits.every((x) => x.date === limits[0].date);
        return (
          <div className="card insight conflict" key={`${c.child.deadline.id}-${c.adults.map((a) => a.deadline.id).join("-")}`}>
            <div className="t">
              {conflictDate(c)}は、{names(c.child.deadline.memberIds)}さんの{event}の日です。
              {adultNames.length > 1 ? `この日は、${adultNames.map((n) => `${n}さんも`).join("")}お仕事になっているようです。` : `この日は、${adultNames[0]}さんはお仕事になっているようです。`}
            </div>
            <div className="meta">
              {event} → <Link href={`/documents/${c.child.doc.id}`}>{shortTitle(c.child.doc.title)}</Link>
            </div>
            {c.adults.map((a) => (
              <div className="meta" key={a.deadline.id}>
                {names(a.deadline.memberIds)}さん 出勤 → <Link href={`/documents/${a.doc.id}`}>{shortTitle(a.doc.title)}</Link>
              </div>
            ))}
            {limits.length > 0 && (
              <div className="meta">
                休みを取るなら、
                {allSame
                  ? `どちらも${formatYmd(limits[0].date!)}までに申し出が必要です。`
                  : limits.length > 1
                    ? `${limits.map((x) => `${x.name}さんは${formatYmd(x.date!)}まで`).join("・")}に申し出が必要です。`
                    : `${formatYmd(limits[0].date!)}までに申し出が必要です。`}
              </div>
            )}
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
