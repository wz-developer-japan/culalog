// 期限から「動き始める日」を逆算して、ホームに出す3つの欄を作る。
// ここは決まった計算だけで、Claude は使わない（日付の計算を言語モデルに任せない）。

import type { Deadline, DocumentRecord, ExpectedDocument, Household, HouseRule } from "./types";

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

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** YYYY-MM-DD を「11月7日（土）」の形で見せる */
export function formatYmd(ymd: string): string {
  const date = parseDate(ymd);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
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

/** きまりから作った締切の ID（予定の ID と きまりの ID をつなぐ） */
export const ruleDeadlineId = (deadlineId: string, ruleId: string) => `${deadlineId}--${ruleId}`;

/**
 * 予定に「わが家のきまり」を当てはめた締切を作る。
 * 予定の日から決まった日数を引くだけ（Claude は使わない）。予定の日を直せば締切も一緒に動く。
 * 知らせ始めるのは、もとの予定を知らせ始める日と同じ日。
 */
export function ruleDeadlines(deadline: Deadline, rules: HouseRule[]): Deadline[] {
  if (deadline.kind !== "event" || !deadline.applyRuleIds?.length) return [];
  return rules
    .filter((r) => deadline.applyRuleIds!.includes(r.id))
    .map((r) => ({
      id: ruleDeadlineId(deadline.id, r.id),
      kind: "notice" as const,
      label: `${deadline.label}の日の${r.label}`,
      date: toYmd(addDays(parseDate(deadline.date), -r.daysBefore)),
      leadDays: Math.max(0, deadline.leadDays - r.daysBefore),
      leadReason: r.note ?? `${r.label}は${r.daysBefore}日前まで`,
      memberIds: [r.memberId],
    }));
}

/** 書類の期限と、そこにきまりを当てはめた締切をまとめて返す */
export function expandDeadlines(document: DocumentRecord, rules: HouseRule[]): Deadline[] {
  return document.deadlines.flatMap((d) => [d, ...ruleDeadlines(d, rules)]);
}

/**
 * 届いた書類（例: 運動会の案内）を確定したら、もとの予定（年間行事予定の運動会）は案内の方に任せて出さない。
 * 日付が違うときは食い違いに気づけるよう、両方とも出したままにする。
 */
function supersededDeadlineIds(household: Household): Set<string> {
  const ids = new Set<string>();
  const all = household.documents.flatMap((d) => d.deadlines);
  for (const e of household.expected) {
    if (!e.relatedDeadlineId) continue;
    const original = all.find((d) => d.id === e.relatedDeadlineId);
    if (!original) continue;
    const received = household.documents.filter((d) => d.confirmedAt && d.expectedId === e.id);
    if (received.some((d) => d.deadlines.some((x) => x.kind === "event" && x.date === original.date))) {
      ids.add(original.id);
    }
  }
  return ids;
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
  const rules = household.rules ?? [];
  const superseded = supersededDeadlineIds(household);
  for (const document of household.documents) {
    if (!document.confirmedAt) continue; // 確定していない書類の期限では知らせない
    for (const deadline of expandDeadlines(document, rules)) {
      if (deadline.kind === "after_event") continue; // 何か起きたときの画面で出す
      if (superseded.has(deadline.id.split("--")[0])) continue; // きまりから作った締切も一緒に
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
