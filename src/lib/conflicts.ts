// 同じ日のぶつかり: 子どもの行事（共有した書類）と、大人の家族の予定（勤務カレンダーの出勤日など）が同じ日にあるとき。
// 執事は「誰が行くか」は決めない。同じ日だと知らせて、家族で決められるようにする。

import { formatYmd, toYmd } from "./deadlines";
import type { Deadline, DocumentRecord, Household } from "./types";

export interface Conflict {
  date: string;
  child: { doc: DocumentRecord; deadline: Deadline };
  adult: { doc: DocumentRecord; deadline: Deadline };
}

const CHILD_EVENT = ["school", "childcare", "community"];

export function findConflicts(household: Household, today: Date): Conflict[] {
  const from = toYmd(today);
  const isChild = (id: string) => household.members.find((m) => m.id === id)?.relation === "child";
  const isAdult = (id: string) => ["self", "spouse"].includes(household.members.find((m) => m.id === id)?.relation ?? "");
  const docs = household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !d.notForFamily);
  const events = docs.flatMap((doc) =>
    doc.deadlines.filter((d) => d.kind === "event" && d.date >= from && !(household.done ?? {})[d.id]).map((deadline) => ({ doc, deadline })),
  );
  const out: Conflict[] = [];
  for (const child of events) {
    // 子どもの体のこと（病院・歯科）は出さない。学校・保育園・地域の行事だけ
    if (!child.doc.sharedWith?.length || !child.deadline.memberIds.some(isChild) || !CHILD_EVENT.includes(child.doc.category)) continue;
    for (const adult of events) {
      if (adult.doc.id === child.doc.id || adult.deadline.date !== child.deadline.date) continue;
      // 大人の側は、勤務の予定（勤務カレンダーの出勤日など）
      if (adult.doc.category !== "work" || !adult.deadline.memberIds.length || !adult.deadline.memberIds.every(isAdult)) continue;
      out.push({ date: child.deadline.date, child, adult });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const conflictDate = (c: Conflict) => formatYmd(c.date);
