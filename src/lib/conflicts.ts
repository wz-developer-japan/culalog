// 同じ日のぶつかり: 保護者が行く子どもの行事（授業参観・懇談会・面談など）や、町内会・自治会の清掃・当番の日に、
// 家族の大人が仕事になっているとき（勤務カレンダー・勤務シフト表の書類）。
// 執事は「誰が行くか」も「どう休むか」も決めない（有給・欠勤・交代・行かない、はその家が決める）。
// 知らせるのは「その日は仕事」だけ。休みの申し出の期限は、勤務の書類そのものに書いてあるときだけ、その書類の名前つきで添える
// （わが家のきまりから締切を作って押し出さない）。
//
// 出す条件（コードの決まり。どの日がぶつかるかは Claude に決めさせない。キーがあるときは、ここで見つけた候補に Claude が文を書き、
// sameDayTextOk で日付・名前・締切を照らし合わせる。合わなければ ConflictCard はコードの文を出す）:
// - 子どもの側: 学校・保育園・地域の書類の「予定・行事」で、保護者が行くもの（名前に 参観・懇談・面談・保護者会・説明会・引き渡し）のうち、
//   時間まで分かっているもの（案内プリントが来ている）。年間行事予定・学年だよりの日付だけの段階では出さない（案内プリントを待つ声かけが別にある）。
//   運動会・発表会のような家族みんなで行く行事は出さない（平日の行事は大人の出勤日とほぼ全部ぶつかるので、並べても役に立たない）
// - 町内会・自治会の側: 地域の書類の行事で、清掃・当番・草刈り・総会・防災訓練など家から誰かが出るもののうち、日にちと時間が書いてあるもの
//   （「12月中」のような期間だけの当番は出さない）。子どもの行事と同じく「家族のだれが出るか」の気づき
// - 大人の側: 勤務先の書類に書いてある、その日の出勤の予定（シフト表の「出勤（日勤 …）」・勤務カレンダーの土曜出勤など）と、
//   題名が「勤務カレンダー」の書類がある人の平日（月〜金。その書類に休日・休暇・休業の予定がある日は除く）。
//   大人が2人とも仕事なら2人とも、片方だけなら その人だけ書く
// - 候補日から選ぶ行事（個別懇談会の「候補日①〜④」・「12月7日〜11日のうち1日」のような期間で時間つきのもの）は、日ごとに1枚にせず1枚にまとめ、
//   候補日のうち誰がお仕事の日かを並べる（どの日を希望するかは家族が決める）。勤務の書類がその日まで届いていない大人は「分からない」と書く。
//   行事の書類に希望の提出の締切があれば添え、それが済んだら（または日が決まった別のお知らせが届いたら）出さない

import { formatYmd, parseDate, toYmd } from "./deadlines";
import { shortDocName } from "./docName";
import type { Deadline, DocumentRecord, Household } from "./types";

export interface WorkDay {
  doc: DocumentRecord;
  deadline: Deadline;
  /** 書類の予定ではなく、勤務カレンダーのある人の平日としてコードが補ったもの */
  synthetic: boolean;
  /** 同じ勤務の書類にある、その日より前の申し出の締切（休みの希望・シフトの交代など）。書類に書いてあるときだけ */
  notice?: Deadline;
}

/** 候補日の1日分 */
export interface DayOption {
  date: string;
  deadline: Deadline;
  /** その日に仕事の大人 */
  adults: WorkDay[];
  /** その日、勤務の書類で休日・休業になっている大人 */
  off: { memberIds: string[]; label: string; doc: DocumentRecord }[];
  /** 勤務の書類はあるが、その日の分が預かっている書類に無い大人 */
  unknown: string[];
}

export interface Conflict {
  date: string;
  /** 行事（子どもの行事か、町内会・自治会の清掃・当番） */
  child: { doc: DocumentRecord; deadline: Deadline };
  /** 町内会・自治会の行事（家から誰かが出る）か */
  community: boolean;
  /** その日に仕事になっている大人（家族の並び順。あなたは最後）。候補日の行事では、どれかの候補日に仕事の大人 */
  adults: WorkDay[];
  /** 候補日から選ぶ行事のときの、候補日ごとの様子（2日以上） */
  options?: DayOption[];
  /** 候補日の行事の、希望の提出の締切（行事の書類に書いてあるとき） */
  reply?: Deadline;
}

const CHILD_EVENT = ["school", "childcare", "community"];
const PARENT_ATTENDS = /参観|懇談|面談|保護者会|説明会|引き渡し|引渡し/;
const WORK_EVENT = /出勤|日勤|早番|遅番|夜勤/;
const WEEKDAY_CALENDAR = /勤務カレンダー/;
const DAY_OFF = /休日|休暇|休業|休み/;
const NOTICE = /交代|希望|申し出|申請/;
/** 町内会・自治会の、家から誰かが出る行事（日にちと時間が書いてあるものだけ） */
const COMMUNITY_DUTY = /清掃|掃除|当番|草刈り|草取り|総会|防災訓練|避難訓練|夜回り|見回り|パトロール|役員会|班長会|廃品回収/;
/** 候補日から選ぶ行事（「個別懇談会の候補日①」など） */
const CANDIDATE = /候補/;
/** 候補日の行事の、希望を出す締切 */
const REPLY = /希望|調査票|申込|申し込み|提出/;
/** 候補日の行事のまとまりの名前: 「個別懇談会の候補日①」→「個別懇談会」 */
const optionGroup = (label: string) => label.replace(/[（(].*$/, "").replace(/の?候補日?[①-⑳\d]*$/, "").trim();

const activeDocs = (household: Household) => household.documents.filter((d) => d.confirmedAt && !d.supersededBy && !d.notForFamily);

const isAdult = (household: Household, id: string) => ["self", "spouse"].includes(household.members.find((m) => m.id === id)?.relation ?? "");

/** 勤務先の書類のうち、平日が出勤日と読める「勤務カレンダー」の書類（大人の家族のもの） */
function weekdayCalendars(household: Household): DocumentRecord[] {
  return activeDocs(household).filter(
    (doc) => doc.category === "work" && doc.memberIds.length > 0 && doc.memberIds.every((id) => isAdult(household, id)) && WEEKDAY_CALENDAR.test(`${doc.title} ${doc.docType ?? ""}`),
  );
}

/** 書類の有効期間（期間が書いてあれば）にその日が入っているか */
const inPeriod = (doc: DocumentRecord, date: string) => (!doc.validFrom || doc.validFrom <= date) && (!doc.validUntil || date <= doc.validUntil);

/** その日が書類の予定の日（期間なら期間の中）か */
const onDay = (d: Deadline, date: string) => d.date <= date && date <= (d.endDate || d.date);

/** その勤務の書類に、その日の分が書いてあるか（有効期間か、出勤の予定が同じ月にあるか。どちらも無ければ分からないので書いてあるとみなす） */
function workDocCovers(doc: DocumentRecord, date: string): boolean {
  if (doc.validFrom || doc.validUntil) return inPeriod(doc, date);
  const shifts = doc.deadlines.filter((d) => d.kind === "event" && WORK_EVENT.test(d.label));
  return !shifts.length || shifts.some((d) => d.date.slice(0, 7) === date.slice(0, 7));
}

/** その日、勤務の書類で休日・休業になっている大人 */
function adultOffOn(household: Household, date: string): { memberIds: string[]; label: string; doc: DocumentRecord }[] {
  const out: { memberIds: string[]; label: string; doc: DocumentRecord }[] = [];
  for (const doc of activeDocs(household)) {
    if (doc.category !== "work" || !doc.memberIds.length || !doc.memberIds.every((id) => isAdult(household, id))) continue;
    const d = doc.deadlines.find((x) => onDay(x, date) && DAY_OFF.test(x.label) && !WORK_EVENT.test(x.label));
    if (d) out.push({ memberIds: doc.memberIds, label: d.label, doc });
  }
  return out;
}

/** 勤務の書類はあるが、その日の分が預かっている書類に無い大人（家族の ID） */
function adultUnknownOn(household: Household, date: string): string[] {
  const adults = household.members.filter((m) => isAdult(household, m.id)).map((m) => m.id);
  return adults.filter((id) => {
    const docs = activeDocs(household).filter((d) => d.category === "work" && d.memberIds.includes(id));
    return docs.length > 0 && !docs.some((d) => workDocCovers(d, date));
  });
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
      if (doc.id === excludeDocId || out.some((w) => w.doc.id === doc.id) || !inPeriod(doc, date)) continue;
      // その書類に、同じ日の休日・休暇・休業の予定（期間も）があれば出勤日ではない
      if (doc.deadlines.some((d) => onDay(d, date) && DAY_OFF.test(d.label))) continue;
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

/** 同じ勤務の書類にある、その日より前の申し出の締切（休みの希望・シフトの交代など）。いちばん近いもの */
function noticeBefore(w: WorkDay, date: string): Deadline | undefined {
  // 「27（金）の分」のように別の日の分と書いてある申し出は、その日のものではない
  const forDay = (d: Deadline) => {
    const m = d.label.match(/(\d{1,2})[（(][日月火水木金土][）)]の分/);
    return !m || Number(m[1]) === parseDate(date).getDate();
  };
  return w.doc.deadlines
    .filter((d) => (d.kind === "notice" || d.kind === "due") && d.date < date && NOTICE.test(d.label) && forDay(d))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** 同じ行事が別の書類にも書いてある（学年だよりと案内プリント）とみなす: 名前の頭4文字が同じ */
export const sameEvent = (a: Deadline, b: Deadline) => a.label.replace(/[（(].*$/, "").slice(0, 4) === b.label.replace(/[（(].*$/, "").slice(0, 4);

export function findConflicts(household: Household, today: Date): Conflict[] {
  const from = toYmd(today);
  const isChild = (id: string) => household.members.find((m) => m.id === id)?.relation === "child";
  const done = household.done ?? {};
  const out: Conflict[] = [];
  /** 候補日の行事のまとまり（書類ごと・名前ごと） */
  const groups = new Map<string, { doc: DocumentRecord; community: boolean; days: { date: string; deadline: Deadline }[] }>();
  for (const doc of activeDocs(household)) {
    if (!CHILD_EVENT.includes(doc.category)) continue;
    for (const deadline of doc.deadlines) {
      const last = deadline.endDate && deadline.endDate > deadline.date ? deadline.endDate : deadline.date;
      if (deadline.kind !== "event" || !deadline.time || last < from || done[deadline.id]) continue;
      // 保護者が行く子どもの行事か、町内会・自治会の清掃・当番。どちらも時間まで分かっているものだけ。
      // 子どもの体のこと（病院・歯科）や、家族みんなで行く行事（運動会など）は出さない
      const forChild = deadline.memberIds.some(isChild) && PARENT_ATTENDS.test(deadline.label);
      const community = doc.category === "community" && !deadline.memberIds.some(isChild) && COMMUNITY_DUTY.test(deadline.label);
      if (!forChild && !community) continue;
      // 候補日から選ぶもの（候補日①〜・時間つきの期間）は、あとでまとめる。期間は平日を1日ずつ候補日に
      if (CANDIDATE.test(deadline.label) || last > deadline.date) {
        const key = `${doc.id}|${optionGroup(deadline.label)}`;
        const g = groups.get(key) ?? { doc, community, days: [] };
        for (let d = parseDate(deadline.date); toYmd(d) <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
          const ymd = toYmd(d);
          const wd = d.getDay();
          if (ymd < from || (last > deadline.date && (wd === 0 || wd === 6))) continue;
          if (!g.days.some((x) => x.date === ymd)) g.days.push({ date: ymd, deadline });
        }
        groups.set(key, g);
        continue;
      }
      // 勤務の書類にその日の分の申し出の締切が書いてあれば添える（書いていなければ何も言わない）
      const adults = adultWorkOn(household, deadline.date, doc.id).map((w) => ({ ...w, notice: noticeBefore(w, deadline.date) }));
      if (adults.length) out.push({ date: deadline.date, child: { doc, deadline }, community, adults });
    }
  }
  for (const { doc, community, days } of groups.values()) {
    days.sort((a, b) => a.date.localeCompare(b.date));
    if (!days.length) continue;
    const first = days[0].deadline;
    // 希望の提出の締切（行事の書類に書いてあるもの）。済んだら、もう候補日から選ぶ段階ではない
    const reply = doc.deadlines
      .filter((d) => (d.kind === "due" || d.kind === "notice") && REPLY.test(d.label) && d.date <= days[0].date)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    if (reply && done[reply.id]) continue;
    // 日が決まった別のお知らせ（候補日ではない同じ行事）が届いていれば、そちらで出す
    const decided = activeDocs(household).some(
      (o) => o.id !== doc.id && o.deadlines.some((d) => d.kind === "event" && !CANDIDATE.test(d.label) && days.some((x) => x.date === d.date) && sameEvent(d, first)),
    );
    if (decided) continue;
    const options: DayOption[] = days.map(({ date, deadline }) => ({
      date,
      deadline,
      adults: adultWorkOn(household, date, doc.id),
      off: adultOffOn(household, date),
      unknown: adultUnknownOn(household, date),
    }));
    if (!options.some((o) => o.adults.length)) continue;
    if (options.length === 1) {
      const o = options[0];
      const adults = o.adults.map((w) => ({ ...w, notice: noticeBefore(w, o.date) }));
      out.push({ date: o.date, child: { doc, deadline: o.deadline }, community, adults });
      continue;
    }
    // どれかの候補日に仕事の大人（1人1件・家族の並び順）。候補日ごとの申し出の期限は添えない（日が決まってから）
    const adults = options
      .flatMap((o) => o.adults)
      .filter((w, i, all) => all.findIndex((x) => x.deadline.memberIds.join() === w.deadline.memberIds.join()) === i);
    const order = (w: WorkDay) => {
      const i = household.members.findIndex((m) => w.deadline.memberIds.includes(m.id));
      return household.members[i]?.relation === "self" ? 999 : i;
    };
    adults.sort((a, b) => order(a) - order(b));
    out.push({ date: options[0].date, child: { doc, deadline: first }, community, adults, options, reply });
  }
  // 同じ日の同じ行事が二つの書類にあっても（学年だよりと案内プリント）1件だけ。時間まで書いてある方（案内プリント）を優先
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || (b.child.deadline.time ? 1 : 0) - (a.child.deadline.time ? 1 : 0))
    .filter((c, i, all) => all.findIndex((x) => x.date === c.date && !x.options === !c.options && sameEvent(x.child.deadline, c.child.deadline)) === i);
}

/** トップに出す1件: 子どもの行事（日が決まっているもの）を先に。無ければいちばん近いもの */
export function topConflict(list: Conflict[]): Conflict | undefined {
  return list.find((c) => !c.community && !c.options) ?? list[0];
}

/** 候補日の行事の、カードの文（コードの文）。太字に出す文と、下に小さく出す文 */
export function optionText(c: Conflict, household: Household): { head: string; rest: string[] } {
  const options = c.options ?? [];
  const first = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  const names = (ids: string[]) => ids.map(first).filter(Boolean);
  const list = (ds: string[]) => ds.map(formatYmd).join("・");
  const consecutive = options.every((o, i) => i === 0 || (parseDate(o.date).getTime() - parseDate(options[i - 1].date).getTime()) / 86400000 <= (parseDate(o.date).getDay() === 1 ? 3 : 1));
  const span = consecutive && options.length > 2 ? `${formatYmd(options[0].date)}〜${formatYmd(options[options.length - 1].date)}` : list(options.map((o) => o.date));
  const event = optionGroup(c.child.deadline.label) || c.child.deadline.label;
  const whose = c.community ? event : `${names(c.child.deadline.memberIds).join("・")}さんの${event}`;
  const sentences = [`${whose}の候補日は、${span}の${options.length}日です。`];
  // 仕事の人の組み合わせごとに、日をまとめる
  const byWho = new Map<string, string[]>();
  for (const o of options) {
    if (!o.adults.length) continue;
    const who = names(o.adults.flatMap((a) => a.deadline.memberIds));
    const key = who.join("|");
    byWho.set(key, [...(byWho.get(key) ?? []), o.date]);
  }
  for (const [key, ds] of byWho) {
    const who = key.split("|");
    const all = ds.length === options.length;
    const w = who.length > 1 ? `${who.map((n) => `${n}さんも`).join("")}お仕事のようです。` : `${who[0]}さんがお仕事のようです。`;
    sentences.push(`${all ? "どの日も" : `${list(ds)}は`}、${w}`);
  }
  const rest: string[] = [];
  // 誰も仕事の予定が無い日（休日なら勤務の書類の名前で）
  for (const o of options.filter((x) => !x.adults.length)) {
    const off = o.off.map((x) => `${shortDocName(x.doc, household.members)}では${x.label}`);
    rest.push(off.length ? `${formatYmd(o.date)}は、${off.join("、")}です。` : `${formatYmd(o.date)}は、預かっている勤務の書類ではお仕事の予定が見つかりません。`);
  }
  // 勤務の書類はあるが、候補日の分が無い人
  const unknown = household.members.filter((m) => options.some((o) => o.unknown.includes(m.id)));
  for (const m of unknown) {
    const months = [...new Set(options.filter((o) => o.unknown.includes(m.id)).map((o) => parseDate(o.date).getMonth() + 1))];
    rest.push(`${first(m.id)}さんの${months.map((x) => `${x}月`).join("・")}の勤務は、預かっている書類にはまだありません。`);
  }
  const go = c.community ? "出る" : "行く";
  rest.push(
    `${c.reply ? `${c.reply.label.replace(/[（(].*$/, "")}は${formatYmd(c.reply.date)}まで。` : ""}どの日を希望するか（${go === "出る" ? "出ない" : "行かない"}か）は、家族で決めてください。日が決まったら、勤務先への連絡も忘れずに。`,
  );
  return { head: sentences.join(""), rest };
}

export const conflictDate = (c: Conflict) => formatYmd(c.date);

/** 勤務の書類に書いてある、休みの申し出の期限（書いてある人の分だけ。わが家のきまりからは作らない） */
export function workNotices(c: Conflict): { memberIds: string[]; date: string; label: string; location: string; doc: DocumentRecord }[] {
  return c.adults
    .filter((a) => a.notice)
    .map((a) => ({ memberIds: a.deadline.memberIds, date: a.notice!.date, label: a.notice!.label, location: a.notice!.source?.location ?? "", doc: a.doc }));
}

/** 申し出の名前の短い形（かっこ書き・「の申し出」を外す）: 「休みの希望・シフトの交代の申し出（27（金）の分・班長へ）」→「休みの希望・シフトの交代」 */
export const noticeShort = (label: string) => label.replace(/[（(].*$/, "").replace(/の(申し出|申請|連絡)$/, "").trim();

/** 同じ日のぶつかりを見分ける鍵（行事・誰がどの書類で仕事か・申し出の締切。どれかが変われば別のもの） */
export const conflictKey = (c: Conflict) =>
  [
    c.options ? "options" : "sameday",
    c.child.deadline.id,
    ...(c.options ?? []).map((o) => `${o.date}:${o.adults.map((a) => a.deadline.memberIds.join("+")).join(",")}`),
    ...c.adults.map((a) => `${a.deadline.memberIds.join("+")}@${a.doc.id}:${a.notice?.date ?? ""}`),
  ].join("|");

// ---- Claude が書いた同じ日の気づきの文を、コードで照らし合わせる ----

/** 誰が行くかを決める・勧める言い回し（出さない） */
const DECIDES = /(行くべき|行ってください|が行くと(よい|いい)|が行きましょう|が出ると(よい|いい)|出てください|休んでください|休みを取ってください|取るべき|取った(方|ほう)が|おすすめ|お勧め)/;
/** 休み方を決めつける言葉（その家が決める。有給が残っていない・欠勤・交代・行かない、もある） */
const HOW_TO_REST = /有給|有休|年休|欠勤|休暇を取/;
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
 * 日付は行事の日と、勤務の書類に書いてある申し出の期限だけ（どちらも入っている）・仕事の大人と子どもの名前が全部入っている・
 * 家族で決めると書いてある・誰が行くかも休み方（有給など）も決めない・判断しない。合わなければ使わない（コードの文に戻す）
 */
export function sameDayTextOk(text: string, c: Conflict, household: Household): boolean {
  const first = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  if (!text || text.length > 220 || DECIDES.test(text) || JUDGE.test(text) || HOW_TO_REST.test(text)) return false;
  const limits = workNotices(c).map((x) => x.date);
  if (!datesMatch(text, [c.date, ...limits], [c.date, ...limits])) return false;
  const names = [...c.child.deadline.memberIds, ...c.adults.flatMap((a) => a.deadline.memberIds)].map(first).filter(Boolean);
  if (!names.every((n) => text.includes(n))) return false;
  // 仕事ではない大人の家族を「仕事」と書いていないか（名前が出るなら、ぶつかりの中の人だけ）
  const working = new Set(c.adults.flatMap((a) => a.deadline.memberIds));
  const others = household.members.filter((m) => ["self", "spouse"].includes(m.relation) && !working.has(m.id)).map((m) => first(m.id));
  if (others.some((n) => n && text.includes(n))) return false;
  return /家族/.test(text) && /決め/.test(text);
}

/** 書類の行事の日の、同じ日のぶつかり（家族に伝えるの ⚠ に、勤務の書類の申し出の期限を添えるため）。その日を「今日」として探す */
export function conflictFor(household: Household, deadline: Deadline): Conflict | undefined {
  return findConflicts(household, parseDate(deadline.date)).find((c) => c.date === deadline.date && (c.child.deadline.id === deadline.id || sameEvent(c.child.deadline, deadline)));
}
