// 同じ日のぶつかり: 保護者が行く子どもの行事（授業参観・懇談会・面談など。共有した書類）の日に、
// 家族の大人が仕事になっているとき（勤務カレンダー・勤務シフト表の書類）。
// 執事は「誰が行くか」は決めない。同じ日だと知らせ、有給のきまりや申し出の締切があれば添えて、家族で決められるようにする。
//
// 出す条件（コードの決まり。どの日がぶつかるかは Claude に決めさせない。キーがあるときは、ここで見つけた候補に Claude が文を書き、
// sameDayTextOk で日付・名前・締切を照らし合わせる。合わなければ ConflictCard はコードの文を出す）:
// - 子どもの側: 学校・保育園・地域の書類の「予定・行事」で、保護者が行くもの（名前に 参観・懇談・面談・保護者会・説明会・引き渡し）のうち、
//   時間まで分かっているもの（案内プリントが来ている）。年間行事予定・学年だよりの日付だけの段階では出さない（案内プリントを待つ声かけが別にある）。
//   運動会・発表会のような家族みんなで行く行事は出さない（平日の行事は大人の出勤日とほぼ全部ぶつかるので、並べても役に立たない）
// - 大人の側: 勤務先の書類に書いてある、その日の出勤の予定（シフト表の「出勤（日勤 …）」・勤務カレンダーの土曜出勤など）と、
//   題名が「勤務カレンダー」の書類がある人の平日（月〜金。その書類に休日・休暇・休業の予定がある日は除く）。
//   大人が2人とも仕事なら2人とも、片方だけなら その人だけ書く

import { addDays, formatYmd, parseDate, toYmd } from "./deadlines";
import type { Deadline, DocumentRecord, HouseRule, Household } from "./types";

export interface WorkDay {
  doc: DocumentRecord;
  deadline: Deadline;
  /** 書類の予定ではなく、勤務カレンダーのある人の平日としてコードが補ったもの */
  synthetic: boolean;
  /** その人に有給のきまり（わが家のきまり）があれば、申請の締切（勤務の書類に申し出の締切が無いときだけ） */
  leave?: { rule: HouseRule; date: string };
  /** 同じ勤務の書類にある、その日より前の申し出の締切（休みの希望・シフトの交代など）。あればこちらを使う */
  notice?: Deadline;
}

export interface Conflict {
  date: string;
  child: { doc: DocumentRecord; deadline: Deadline };
  /** その日に仕事になっている大人（家族の並び順。あなたは最後） */
  adults: WorkDay[];
}

const CHILD_EVENT = ["school", "childcare", "community"];
const PARENT_ATTENDS = /参観|懇談|面談|保護者会|説明会|引き渡し|引渡し/;
const WORK_EVENT = /出勤|日勤|早番|遅番|夜勤/;
const WEEKDAY_CALENDAR = /勤務カレンダー/;
const DAY_OFF = /休日|休暇|休業|休み/;
const NOTICE = /交代|希望|申し出|申請/;

const activeDocs = (household: Household) => household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !d.notForFamily);

const isAdult = (household: Household, id: string) => ["self", "spouse"].includes(household.members.find((m) => m.id === id)?.relation ?? "");

/** 勤務先の書類のうち、平日が出勤日と読める「勤務カレンダー」の書類（大人の家族のもの） */
function weekdayCalendars(household: Household): DocumentRecord[] {
  return activeDocs(household).filter(
    (doc) => doc.category === "work" && doc.memberIds.length > 0 && doc.memberIds.every((id) => isAdult(household, id)) && WEEKDAY_CALENDAR.test(`${doc.title} ${doc.docType ?? ""}`),
  );
}

/** その日の、大人の家族の出勤（書類に書いてある出勤の予定と、勤務カレンダーのある人の平日） */
export function adultWorkOn(household: Household, date: string, excludeDocId?: string): WorkDay[] {
  const out: WorkDay[] = [];
  for (const doc of activeDocs(household)) {
    if (doc.id === excludeDocId || doc.category !== "work") continue;
    for (const deadline of doc.deadlines) {
      if (deadline.kind !== "event" || deadline.date !== date || !WORK_EVENT.test(deadline.label) || (household.done ?? {})[deadline.id]) continue;
      if (!deadline.memberIds.length || !deadline.memberIds.every((id) => isAdult(household, id))) continue;
      out.push({ doc, deadline, synthetic: false });
    }
  }
  const weekday = parseDate(date).getDay();
  if (weekday >= 1 && weekday <= 5) {
    for (const doc of weekdayCalendars(household)) {
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
  // 同じ人の出勤は1件（書類が複数あっても）。家族の並び順で、あなたは最後
  const order = (w: WorkDay) => {
    const i = household.members.findIndex((m) => w.deadline.memberIds.includes(m.id));
    return household.members[i]?.relation === "self" ? 999 : i;
  };
  return out
    .filter((w, i, all) => all.findIndex((x) => x.deadline.memberIds.join() === w.deadline.memberIds.join()) === i)
    .sort((a, b) => order(a) - order(b));
}

/** その人の有給のきまり（わが家のきまりの「有給」「休暇」） */
function leaveRuleOf(household: Household, memberIds: string[]): HouseRule | undefined {
  return (household.rules ?? []).find((r) => memberIds.includes(r.memberId) && /有給|休暇/.test(r.label));
}

/** 同じ勤務の書類にある、その日より前の申し出の締切（休みの希望・シフトの交代など）。いちばん近いもの */
function noticeBefore(w: WorkDay, date: string): Deadline | undefined {
  return w.doc.deadlines
    .filter((d) => (d.kind === "notice" || d.kind === "due") && d.date < date && NOTICE.test(d.label))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** 同じ行事が別の書類にも書いてある（学年だよりと案内プリント）とみなす: 名前の頭4文字が同じ */
export const sameEvent = (a: Deadline, b: Deadline) => a.label.replace(/[（(].*$/, "").slice(0, 4) === b.label.replace(/[（(].*$/, "").slice(0, 4);

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
      const adults = adultWorkOn(household, deadline.date, doc.id).map((w) => {
        // 勤務の書類にその日の分の申し出の締切が書いてあれば、それを使う（わが家のきまりの有給の申請は、無いときだけ）
        const notice = noticeBefore(w, deadline.date);
        const rule = notice ? undefined : leaveRuleOf(household, w.deadline.memberIds);
        return { ...w, leave: rule ? { rule, date: toYmd(addDays(parseDate(deadline.date), -rule.daysBefore)) } : undefined, notice };
      });
      if (adults.length) out.push({ date: deadline.date, child: { doc, deadline }, adults });
    }
  }
  // 同じ日の同じ行事が二つの書類にあっても（学年だよりと案内プリント）1件だけ。時間まで書いてある方（案内プリント）を優先
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || (b.child.deadline.time ? 1 : 0) - (a.child.deadline.time ? 1 : 0))
    .filter((c, i, all) => all.findIndex((x) => x.date === c.date && sameEvent(x.child.deadline, c.child.deadline)) === i);
}

export const conflictDate = (c: Conflict) => formatYmd(c.date);

/** 休みの申し出の締切（勤務の書類の申し出の締切か、わが家のきまりの有給の申請）。締切の分かる大人だけ */
export function leaveLimits(c: Conflict): { memberIds: string[]; date: string }[] {
  return c.adults
    .map((a) => ({ memberIds: a.deadline.memberIds, date: a.notice?.date ?? a.leave?.date ?? "" }))
    .filter((x) => x.date);
}

/** 同じ日のぶつかりを見分ける鍵（行事・誰がどの書類で仕事か・申し出の締切。どれかが変われば別のもの） */
export const conflictKey = (c: Conflict) =>
  ["sameday", c.child.deadline.id, ...c.adults.map((a) => `${a.deadline.memberIds.join("+")}@${a.doc.id}:${a.notice?.date ?? a.leave?.date ?? ""}`)].join("|");

// ---- Claude が書いた同じ日の気づきの文を、コードで照らし合わせる ----

/** 誰が行くかを決める・勧める言い回し（出さない） */
const DECIDES = /(行くべき|行ってください|が行くと(よい|いい)|が行きましょう|休んでください|休みを取ってください|取るべき|取った(方|ほう)が|おすすめ|お勧め)/;
const JUDGE = /(補償され|保険(金)?が(使え|おり|下り|出)|受診|違法|訴え|お得|損です)/;

/** 文の中の「○月○日」が全部 ymds のどれかで、must の日付は全部入っているか */
function datesMatch(text: string, ymds: string[], must: string[]): boolean {
  const md = (y: string) => {
    const d = parseDate(y);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const allowed = new Set(ymds.map(md));
  const seen = [...text.matchAll(/(\d{1,2})月(\d{1,2})日/g)].map((m) => `${Number(m[1])}月${Number(m[2])}日`);
  if (seen.some((x) => !allowed.has(x))) return false;
  // 月の無い「20日」の形は使わせない（どの月か読み違えるので）
  if (/(^|[^月\d])\d{1,2}日(?!前|間|以内|まで前)/.test(text.replace(/\d{1,2}月\d{1,2}日/g, ""))) return false;
  return must.every((y) => seen.includes(md(y)));
}

/**
 * Claude の書いた文が、コードの見つけたぶつかりと合うか。
 * 日付は行事の日と申し出の締切だけ（両方入っている）・仕事の大人と子どもの名前が全部入っている・
 * 家族で決めると書いてある・誰が行くかを決めない・判断しない。合わなければ使わない（コードの文に戻す）
 */
export function sameDayTextOk(text: string, c: Conflict, household: Household): boolean {
  const first = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  if (!text || text.length > 220 || DECIDES.test(text) || JUDGE.test(text)) return false;
  const limits = leaveLimits(c).map((x) => x.date);
  if (!datesMatch(text, [c.date, ...limits], [c.date, ...limits])) return false;
  const names = [...c.child.deadline.memberIds, ...c.adults.flatMap((a) => a.deadline.memberIds)].map(first).filter(Boolean);
  if (!names.every((n) => text.includes(n))) return false;
  // 仕事ではない大人の家族を「仕事」と書いていないか（名前が出るなら、ぶつかりの中の人だけ）
  const working = new Set(c.adults.flatMap((a) => a.deadline.memberIds));
  const others = household.members.filter((m) => ["self", "spouse"].includes(m.relation) && !working.has(m.id)).map((m) => first(m.id));
  if (others.some((n) => n && text.includes(n))) return false;
  return /家族/.test(text) && /決め/.test(text);
}

/** 書類の行事の日の、同じ日のぶつかり（家族に伝えるの ⚠ に申し出の締切を添えるため）。その日を「今日」として探す */
export function conflictFor(household: Household, deadline: Deadline): Conflict | undefined {
  return findConflicts(household, parseDate(deadline.date)).find((c) => c.date === deadline.date && (c.child.deadline.id === deadline.id || sameEvent(c.child.deadline, deadline)));
}
