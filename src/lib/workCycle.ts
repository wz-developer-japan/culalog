// 決まった周期の勤務（例: 4日働いて2日休む、のくり返し）。勤務の書類が無い人のために、出勤の日・休みの日を予定として作る。
// 作るのは端末の中の「勤務」の書類1通（原本は無い。あなたが入れた周期から作ったもの）。同じ日のぶつかり・家族に伝えるの ⚠ に使う。
// 出勤・休みは「知っておくだけ」の予定（トップ・向こう7日には出さない）。

import { parseDate, toYmd } from "./deadlines";
import type { Deadline, DocumentRecord, FamilyMember } from "./types";

export interface WorkCycle {
  /** 出勤の1日目（どの回でもよい） YYYY-MM-DD */
  firstWorkDay: string;
  /** 続けて働く日数 */
  work: number;
  /** 続けて休む日数 */
  off: number;
}

export const cycleDocId = (memberId: string) => `doc-cycle-${memberId}`;

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a: Date, b: Date) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);

/** その日が出勤か（周期の中の何日目かで決める。1日目より前の日も、さかのぼって同じ周期） */
export function isWorkDay(cycle: WorkCycle, date: string): boolean {
  const len = cycle.work + cycle.off;
  const pos = ((dayDiff(parseDate(date), parseDate(cycle.firstWorkDay)) % len) + len) % len;
  return pos < cycle.work;
}

export const validCycle = (c: Partial<WorkCycle>): c is WorkCycle =>
  !!c.firstWorkDay && /^\d{4}-\d{2}-\d{2}$/.test(c.firstWorkDay) && Number.isInteger(c.work) && Number.isInteger(c.off) && c.work! >= 1 && c.off! >= 1 && c.work! + c.off! <= 31;

/** 周期から「勤務」の書類を作る。from の月の1日から months か月分 */
export function buildCycleDoc(member: FamilyMember, cycle: WorkCycle, from: Date, months = 12, at = new Date().toISOString()): DocumentRecord {
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = addDays(new Date(start.getFullYear(), start.getMonth() + months, 1), -1);
  const name = member.name.split(/\s+/).pop() || "わたし";
  const rule = `${cycle.work}日働いて${cycle.off}日休む（${cycle.work}勤${cycle.off}休）`;
  const deadlines: Deadline[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ymd = toYmd(d);
    const work = isWorkDay(cycle, ymd);
    deadlines.push({
      id: `dl-cycle-${member.id}-${ymd}`,
      kind: "event",
      label: work ? "出勤" : "休み",
      date: ymd,
      leadDays: 0,
      awareness: true,
      memberIds: [member.id],
      source: { location: `決まった周期（${rule}・${cycle.firstWorkDay} が出勤の1日目）` },
    });
  }
  return {
    id: cycleDocId(member.id),
    title: `${name}さんの勤務（${cycle.work}勤${cycle.off}休）`,
    category: "work",
    docType: "勤務の周期",
    memberIds: [member.id],
    periodLabel: `${start.getFullYear()}年${start.getMonth() + 1}月〜${end.getFullYear()}年${end.getMonth() + 1}月`,
    validFrom: toYmd(start),
    validUntil: toYmd(end),
    origin: "manual",
    summary: { what: `${name}さんの勤務です。${rule}のくり返しを、設定で入れた周期から予定にしました（原本の書類はありません）。`, todo: "周期が変わったら、設定の「決まった周期の勤務」で直す。" },
    fields: [
      { key: "f-cycle", label: "勤務日", value: rule, source: { location: "設定の「決まった周期の勤務」" }, status: "confirmed" },
      { key: "f-cycle-first", label: "出勤の1日目", value: cycle.firstWorkDay, source: { location: "設定の「決まった周期の勤務」" }, status: "confirmed" },
    ],
    contacts: [],
    deadlines,
    createdAt: at,
    confirmedAt: at,
  };
}

/** 書類から周期を読み戻す（設定の欄に今の値を出すため） */
export function cycleOf(doc: DocumentRecord | undefined): WorkCycle | undefined {
  const rule = doc?.fields.find((f) => f.key === "f-cycle")?.value.match(/(\d+)日働いて(\d+)日休む/);
  const first = doc?.fields.find((f) => f.key === "f-cycle-first")?.value;
  return rule && first ? { firstWorkDay: first, work: Number(rule[1]), off: Number(rule[2]) } : undefined;
}
