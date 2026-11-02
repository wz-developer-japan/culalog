// 期限から「動き始める日」を逆算して、ホームに出す3つの欄を作る。
// ここは決まった計算だけで、Claude は使わない（日付の計算を言語モデルに任せない）。

import type { Deadline, DocumentRecord, ExpectedDocument, Household } from "./types";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD をその日の 0 時（端末の時刻）として扱う */
export function parseDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export interface ActionItem {
  deadline: Deadline;
  document: DocumentRecord;
  /** 動き始める日 */
  startDate: Date;
  /** 対象日までの日数 */
  daysLeft: number;
}

export interface HomeSections {
  /** 動き始める日を過ぎ、対象日がまだ来ていないもの（近い順） */
  soon: ActionItem[];
  /** 届いているはずなのに登録されていない書類 */
  missing: ExpectedDocument[];
}

export function buildHome(household: Household, today: Date): HomeSections {
  const soon: ActionItem[] = [];
  for (const document of household.documents) {
    if (!document.confirmedAt) continue; // 確定していない書類の期限では知らせない
    for (const deadline of document.deadlines) {
      if (deadline.kind === "after_event") continue; // 何か起きたときの画面で出す
      const target = parseDate(deadline.endDate ?? deadline.date);
      const startDate = addDays(parseDate(deadline.date), -deadline.leadDays);
      const daysLeft = daysBetween(today, parseDate(deadline.date));
      if (startOfDay(today) >= startDate && startOfDay(today) <= target) {
        soon.push({ deadline, document, startDate, daysLeft });
      }
    }
  }
  soon.sort((a, b) => a.daysLeft - b.daysLeft);

  // 届いた書類を登録して「確定」したら、来ていないものから外す
  const received = new Set(
    household.documents.filter((d) => d.confirmedAt && d.expectedId).map((d) => d.expectedId),
  );
  const missing = household.expected.filter(
    (e) => !e.receivedDocumentId && !received.has(e.id) && startOfDay(today) >= parseDate(e.expectedBy),
  );

  return { soon, missing };
}
