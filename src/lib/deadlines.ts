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

/** 月を足す（月末は、その月の最後の日にそろえる） */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), last));
}

/**
 * くり返す期限（例: 2年ごとの「解約できる期間」）は、過ぎていたら次の回を計算する。
 * 次の回の ID は `元の ID@その回の日付`（「済んだ」を回ごとに持てるように）。
 */
export function currentOccurrence(deadline: Deadline, today: Date): Deadline {
  if (!deadline.repeatMonths) return deadline;
  const start = parseDate(deadline.date);
  const end = deadline.endDate ? parseDate(deadline.endDate) : start;
  let k = 0;
  while (addMonths(end, k * deadline.repeatMonths) < startOfDay(today) && k < 1200) k++;
  if (k === 0) return deadline;
  const date = toYmd(addMonths(start, k * deadline.repeatMonths));
  return {
    ...deadline,
    id: `${deadline.id}@${date}`,
    date,
    endDate: deadline.endDate ? toYmd(addMonths(end, k * deadline.repeatMonths)) : undefined,
  };
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
  if (deadline.kind !== "event") return [];
  const reserve = deadline.reserve;
  const forReserve =
    reserve?.applyRuleIds?.length
      ? rules
          .filter((r) => reserve.applyRuleIds!.includes(r.id))
          .map((r) => ({
            // ID の先頭は本番の予定の ID（届いた案内に任せて元の予定を出さないとき、一緒に外れるように）
            id: ruleDeadlineId(deadline.id, `reserve-${r.id}`),
            kind: "notice" as const,
            label: `${deadline.label}の予備日（${reserve.condition ?? "予備日"}・${formatYmd(reserve.date)}）の${r.label}`,
            date: toYmd(addDays(parseDate(reserve.date), -r.daysBefore)),
            leadDays: Math.max(0, deadline.leadDays - r.daysBefore),
            leadReason: `予備日の分。${r.note ?? `${r.label}は${r.daysBefore}日前まで`}`,
            memberIds: [r.memberId],
            source: reserve.source,
          }))
      : [];
  if (!deadline.applyRuleIds?.length) return forReserve;
  return [...rules
    .filter((r) => deadline.applyRuleIds!.includes(r.id))
    .map((r) => ({
      id: ruleDeadlineId(deadline.id, r.id),
      kind: "notice" as const,
      label: `${deadline.label}の日の${r.label}`,
      date: toYmd(addDays(parseDate(deadline.date), -r.daysBefore)),
      leadDays: Math.max(0, deadline.leadDays - r.daysBefore),
      leadReason: r.note ?? `${r.label}は${r.daysBefore}日前まで`,
      memberIds: [r.memberId],
    })), ...forReserve];
}

/** 書類の期限と、そこにきまりを当てはめた締切をまとめて返す（today があれば、くり返す期限は今の回にする） */
export function expandDeadlines(document: DocumentRecord, rules: HouseRule[], today?: Date): Deadline[] {
  return document.deadlines
    .map((d) => (today ? currentOccurrence(d, today) : d))
    .flatMap((d) => [d, ...ruleDeadlines(d, rules)]);
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
      // 同じ予定が、ほかの書類（例: 年間行事予定の改訂版）に同じ名前・同じ日で載っていれば、それも案内に任せる
      for (const d of all) {
        if (d.id !== original.id && d.kind === "event" && d.label === original.label && d.date === original.date) ids.add(d.id);
      }
    }
  }
  return ids;
}

/**
 * 読んだ直後の4行の「いつまで？」。日付はコードで予定から出す（Claude の文には任せない）。
 * 締切（提出・申し出・満了など）があればいちばん早いもの、無ければいちばん早い予定。
 */
export function untilOf(document: DocumentRecord): { text: string; location?: string } | undefined {
  const list = document.deadlines.filter((d) => d.kind !== "after_event");
  const pick = (xs: Deadline[]) => [...xs].sort((a, b) => a.date.localeCompare(b.date))[0];
  const d = pick(list.filter((x) => x.kind !== "event")) ?? pick(list);
  if (!d) return undefined;
  const when = d.endDate ? `${formatYmd(d.date)}〜${formatYmd(d.endDate)}` : formatYmd(d.date);
  return { text: `${when} ${d.label}${d.repeatMonths ? `（${d.repeatMonths}か月ごと）` : ""}`, location: d.source?.location };
}

export interface ActionItem {
  deadline: Deadline;
  document: DocumentRecord;
  /** 動き始める日 */
  startDate: Date;
  /** 対象日までの日数 */
  daysLeft: number;
  /** 同じ予定を知らせている別の書類のもの（初回・督促・前日通知のメールなど）。ホームでは1件にまとめる */
  bundled?: ActionItem[];
}

export interface HomeSections {
  /** 動き始める日を過ぎ、対象日がまだ来ていないもの（近い順） */
  soon: ActionItem[];
  /** 締切を過ぎて、まだ「済んだ」になっていないもの（予定・行事は除く） */
  overdue: ActionItem[];
  /** 届いているはずなのに登録されていない書類 */
  missing: ExpectedDocument[];
}

/** 過ぎた締切を、何日前まで出し続けるか */
const OVERDUE_DAYS = 14;

/** 予定・やることを1つずつ並べる（確定した書類だけ・きまりから作った締切を含む・同じ日の元の予定は除く） */
export function allItems(household: Household, today: Date): ActionItem[] {
  const items: ActionItem[] = [];
  const rules = household.rules ?? [];
  const superseded = supersededDeadlineIds(household);
  for (const document of household.documents) {
    if (!document.confirmedAt) continue; // 確定していない書類の期限では知らせない
    if (document.supersededBy) continue; // 「前のもの」は根拠に使わない（年度の取り違えを防ぐ）
    for (const deadline of expandDeadlines(document, rules, today)) {
      if (superseded.has(deadline.id.split("--")[0].split("@")[0])) continue; // きまりから作った締切も一緒に
      const startDate = addDays(parseDate(deadline.date), -deadline.leadDays);
      items.push({ deadline, document, startDate, daysLeft: daysBetween(today, parseDate(deadline.date)) });
    }
  }
  return bundle(dedupe(items)).sort((a, b) => a.daysLeft - b.daysLeft);
}

/** 予定の名前から、比べる言葉を取り出す（どの予定にもある言葉は除く） */
const GENERIC_WORDS = new Set(["更新", "満了", "満了日", "開始", "終了", "契約", "申請", "受付", "期間", "締切", "期限", "提出", "支払", "支払い", "お支払い", "申し込み", "申込", "予定", "お知らせ", "ご案内", "手続き", "期日", "当日", "前日", "まで", "日付"]);
function labelWords(label: string): Set<string> {
  const words = label.replace(/（[^）]*）|\([^)]*\)/g, " ").match(/[\p{Script=Han}\p{Script=Katakana}ーA-Za-z0-9]{2,}/gu) ?? [];
  return new Set(words.filter((w) => !GENERIC_WORDS.has(w)));
}

/**
 * 束ねる: 同じ日の同じ予定を、別々の書類（初回のお知らせ・督促・前日通知のメールなど）が知らせているときは、
 * いちばん新しい書類のものを代表にして1件にまとめ、ほかは bundled に入れる（ホームのひとことは1件だけ）。
 * 同じ予定とみなすのは、日付・終わりの日が同じで、束ねる印（bundleKey）が同じか、
 * 名前の言葉の半分以上が重なり、誰の予定かも重なるとき。
 */
function bundle(items: ActionItem[]): ActionItem[] {
  const out: ActionItem[] = [];
  const same = (a: ActionItem, b: ActionItem) => {
    const x = a.deadline;
    const y = b.deadline;
    if (a.document.id === b.document.id || x.date !== y.date || (x.endDate ?? "") !== (y.endDate ?? "")) return false;
    if (x.bundleKey && y.bundleKey) return x.bundleKey === y.bundleKey;
    if (!x.memberIds.some((id) => y.memberIds.includes(id))) return false;
    const wa = labelWords(x.label);
    const wb = labelWords(y.label);
    if (wa.size === 0 || wb.size === 0) return false;
    const common = [...wa].filter((w) => wb.has(w) || [...wb].some((v) => v.includes(w) || w.includes(v))).length;
    return common * 2 >= Math.min(wa.size, wb.size) && common >= 1;
  };
  const newer = (a: ActionItem, b: ActionItem) => a.document.createdAt > b.document.createdAt;
  for (const item of items) {
    const group = out.findIndex((o) => [o, ...(o.bundled ?? [])].some((x) => same(x, item)));
    if (group < 0) {
      out.push(item);
      continue;
    }
    const head = out[group];
    const members = [head, ...(head.bundled ?? []), item, ...(item.bundled ?? [])].map((x) => ({ ...x, bundled: undefined }));
    const lead = members.reduce((a, b) => (newer(b, a) ? b : a));
    out[group] = { ...lead, bundled: members.filter((x) => x !== lead) };
  }
  return out;
}

/**
 * 同じ予定（種類・名前・日付・誰の、がすべて同じ）が2つの書類に載っているとき（例: 年間行事予定と、その改訂版を
 * 「前のものにしますか？」と聞いている最中。請求と、その前日の督促メール）は、新しい方の書類のものを出し、
 * ほかは bundled に入れる（済んだ・取り消すは一緒に扱う）。日付が違えば両方出す（違いに気づけるように）。
 */
function dedupe(items: ActionItem[]): ActionItem[] {
  const newest = new Map<string, ActionItem>();
  const keyOf = ({ deadline: d }: ActionItem) => [d.kind, d.label, d.date, d.endDate ?? "", [...d.memberIds].sort().join(",")].join("|");
  const startOf = (doc: DocumentRecord) => doc.validFrom ?? doc.createdAt.slice(0, 10);
  for (const item of items) {
    const key = keyOf(item);
    const seen = newest.get(key);
    // 同じ始まりなら、あとに登録した方（書類の並びで後ろ）を新しいとみなす
    if (!seen || startOf(item.document) > startOf(seen.document) || (startOf(item.document) === startOf(seen.document) && item.document.createdAt >= seen.document.createdAt)) {
      newest.set(key, item);
    }
  }
  return items
    .filter((item) => newest.get(keyOf(item)) === item)
    .map((item) => {
      const others = items.filter((x) => x !== item && newest.get(keyOf(x)) === item);
      return others.length ? { ...item, bundled: others } : item;
    });
}

/** この予定と、束ねた予定の ID（済んだにする・取り消すは一緒に） */
export function itemIds(item: ActionItem): string[] {
  return [item.deadline.id, ...(item.bundled ?? []).map((b) => b.deadline.id)];
}

/** 済んだか（束ねたどれかが済んでいれば済んだ） */
export function isDone(done: Record<string, string> | undefined, item: ActionItem): boolean {
  return itemIds(item).some((id) => done?.[id]);
}

/**
 * 書類を登録したときには、もう過ぎていた締切か（古いプリントをあとから撮って渡した、など）。
 * 知らせても間に合わないので、ひとこと・安全網では「期限切れ」として騒がず、すべての予定の画面にだけ残す
 */
export function passedBeforeRegistered({ deadline, document }: ActionItem): boolean {
  return parseDate(deadline.endDate ?? deadline.date) < startOfDay(new Date(document.createdAt));
}

export function buildHome(household: Household, today: Date): HomeSections {
  const done = household.done ?? {};
  const soon: ActionItem[] = [];
  const overdue: ActionItem[] = [];
  for (const item of allItems(household, today)) {
    const { deadline, startDate, daysLeft } = item;
    if (deadline.kind === "after_event") continue; // 何か起きたときに出す
    if (deadline.awareness) continue; // 知っておくだけ（自動の引き落とし・更新など）は、すべての予定の画面でだけ見せる
    if (isDone(done, item)) continue;
    const target = parseDate(deadline.endDate ?? deadline.date);
    if (startOfDay(today) >= startDate && startOfDay(today) <= target) {
      soon.push(item);
    } else if (
      deadline.kind !== "event" &&
      startOfDay(today) > target &&
      daysBetween(target, today) <= OVERDUE_DAYS &&
      !passedBeforeRegistered(item)
    ) {
      overdue.push(item);
    }
  }

  // 届いた書類を登録して「確定」したら、来ていないものから外す
  const received = new Set(
    household.documents.filter((d) => d.confirmedAt && d.expectedId).map((d) => d.expectedId),
  );
  // もとの予定（例: 運動会）が過ぎたら、もう待たない
  const allDeadlines = household.documents.flatMap((d) => d.deadlines);
  const eventPassed = (e: ExpectedDocument) => {
    const original = allDeadlines.find((d) => d.id === e.relatedDeadlineId);
    return !!original && startOfDay(today) > parseDate(original.endDate ?? original.date);
  };
  const missing = household.expected.filter(
    (e) => !e.receivedDocumentId && !received.has(e.id) && startOfDay(today) >= parseDate(e.expectedBy) && !eventPassed(e),
  );

  return { soon, overdue, missing };
}
