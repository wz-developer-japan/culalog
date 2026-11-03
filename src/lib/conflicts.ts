// 同じ日のぶつかり: 保護者が行く子どもの行事（授業参観・懇談会・面談など。共有した書類）と、
// 大人の家族の出勤日（勤務カレンダーの書類）が同じ日にあるとき。
// 執事は「誰が行くか」は決めない。同じ日だと知らせ、有給のきまりがあれば申請の締切も添えて、家族で決められるようにする。
//
// 出す条件（コードの決まり。Claude は使わない）:
// - 子どもの側: 学校・保育園・地域の書類の「予定・行事」で、保護者が行くもの（名前に 参観・懇談・面談・保護者会・説明会・引き渡し）のうち、
//   時間まで分かっているもの（案内プリントが来ている）。年間行事予定・学年だよりの日付だけの段階では出さない（案内プリントを待つ声かけが別にある）。
//   運動会・発表会のような家族みんなで行く行事は出さない（平日の行事は大人の出勤日とほぼ全部ぶつかるので、並べても役に立たない）
// - 大人の側: 勤務先の書類のうち、題名か書類の種類が「勤務カレンダー」「勤務表」「シフト」のもの。
//   書類に「出勤」と書いてある日の予定（土曜出勤など）と、その人の平日（月〜金。その書類に休日・休暇・休業の予定がある日は除く）

import { addDays, formatYmd, parseDate, toYmd } from "./deadlines";
import type { Deadline, DocumentRecord, HouseRule, Household } from "./types";

export interface WorkDay {
  doc: DocumentRecord;
  deadline: Deadline;
  /** 書類の予定ではなく、勤務カレンダーのある人の平日としてコードが補ったもの */
  synthetic: boolean;
}

export interface Conflict {
  date: string;
  child: { doc: DocumentRecord; deadline: Deadline };
  adult: WorkDay;
  /** 大人の側の人に有給のきまりがあれば、その申請の締切 */
  leave?: { rule: HouseRule; date: string };
}

const CHILD_EVENT = ["school", "childcare", "community"];
const PARENT_ATTENDS = /参観|懇談|面談|保護者会|説明会|引き渡し|引渡し/;
const WORK_CALENDAR = /勤務カレンダー|勤務表|シフト/;
const DAY_OFF = /休日|休暇|休業|休み/;

const activeDocs = (household: Household) => household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !d.notForFamily);

const isAdult = (household: Household, id: string) => ["self", "spouse"].includes(household.members.find((m) => m.id === id)?.relation ?? "");

/** 勤務先の書類のうち、出勤日が読める「勤務カレンダー」の書類（大人の家族のもの） */
function workCalendars(household: Household): DocumentRecord[] {
  return activeDocs(household).filter(
    (doc) =>
      doc.category === "work" &&
      doc.memberIds.length > 0 &&
      doc.memberIds.every((id) => isAdult(household, id)) &&
      WORK_CALENDAR.test(`${doc.title} ${doc.docType ?? ""}`),
  );
}

/** その日の、大人の家族の出勤日（書類に書いてある出勤の予定と、勤務カレンダーのある人の平日） */
export function adultWorkOn(household: Household, date: string, excludeDocId?: string): WorkDay[] {
  const out: WorkDay[] = [];
  for (const doc of activeDocs(household)) {
    if (doc.id === excludeDocId || doc.category !== "work") continue;
    for (const deadline of doc.deadlines) {
      if (deadline.kind !== "event" || deadline.date !== date || !/出勤/.test(deadline.label) || (household.done ?? {})[deadline.id]) continue;
      if (!deadline.memberIds.length || !deadline.memberIds.every((id) => isAdult(household, id))) continue;
      out.push({ doc, deadline, synthetic: false });
    }
  }
  const weekday = parseDate(date).getDay();
  if (weekday >= 1 && weekday <= 5) {
    for (const doc of workCalendars(household)) {
      if (doc.id === excludeDocId || out.some((w) => w.doc.id === doc.id)) continue;
      // その書類に、同じ日の休日・休暇の予定があれば出勤日ではない
      if (doc.deadlines.some((d) => d.date === date && DAY_OFF.test(d.label))) continue;
      const field = doc.fields.find((f) => /勤務時間|勤務日/.test(f.label)) ?? doc.fields.find((f) => /出勤/.test(f.label));
      out.push({
        doc,
        synthetic: true,
        deadline: {
          id: `work-${doc.id}-${date}`,
          kind: "event",
          label: "出勤日（平日）",
          date,
          leadDays: 0,
          memberIds: doc.memberIds,
          source: { location: `${field?.source?.location ?? "勤務カレンダー"}（平日は出勤）`, quote: field?.source?.quote },
        },
      });
    }
  }
  return out;
}

/** その人の有給のきまり（わが家のきまりの「有給」） */
function leaveRuleOf(household: Household, memberIds: string[]): HouseRule | undefined {
  return (household.rules ?? []).find((r) => memberIds.includes(r.memberId) && /有給|休暇/.test(r.label));
}

export function findConflicts(household: Household, today: Date): Conflict[] {
  const from = toYmd(today);
  const isChild = (id: string) => household.members.find((m) => m.id === id)?.relation === "child";
  const out: Conflict[] = [];
  for (const doc of activeDocs(household)) {
    if (!CHILD_EVENT.includes(doc.category)) continue;
    for (const deadline of doc.deadlines) {
      if (deadline.kind !== "event" || deadline.date < from || (household.done ?? {})[deadline.id]) continue;
      // 保護者が行く行事で、時間まで分かっているものだけ。子どもの体のこと（病院・歯科）や、家族みんなで行く行事（運動会など）は出さない
      if (!deadline.memberIds.some(isChild) || !PARENT_ATTENDS.test(deadline.label) || !deadline.time) continue;
      for (const adult of adultWorkOn(household, deadline.date, doc.id)) {
        const rule = leaveRuleOf(household, adult.deadline.memberIds);
        out.push({
          date: deadline.date,
          child: { doc, deadline },
          adult,
          leave: rule ? { rule, date: toYmd(addDays(parseDate(deadline.date), -rule.daysBefore)) } : undefined,
        });
      }
    }
  }
  // 同じ日の同じ行事が二つの書類にあっても（学年だよりと案内プリント）、大人の側ごとに1件だけ。時間まで書いてある方（案内プリント）を優先
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || (b.child.deadline.time ? 1 : 0) - (a.child.deadline.time ? 1 : 0))
    .filter((c, i, all) => all.findIndex((x) => x.date === c.date && x.adult.doc.id === c.adult.doc.id && sameEvent(x.child.deadline, c.child.deadline)) === i);
}

/** 同じ行事が別の書類にも書いてある（学年だよりと案内プリント）とみなす: 名前の頭4文字が同じ */
export const sameEvent = (a: Deadline, b: Deadline) => a.label.replace(/[（(].*$/, "").slice(0, 4) === b.label.replace(/[（(].*$/, "").slice(0, 4);

export const conflictDate = (c: Conflict) => formatYmd(c.date);
