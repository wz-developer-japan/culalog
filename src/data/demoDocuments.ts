// デモ用の架空の書類の本文（原本）。
// 学校・会社・人物・電話番号はすべて架空で、このリポジトリのために新しく作ったもの。
// 日付はデモを始めた日から計算して差し込むので、いつ開いても話の流れが変わらない。

import { addDays, toYmd } from "@/lib/deadlines";
import type { Extraction } from "@/lib/extraction";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 2026年11月14日（土） の形 */
export function jpDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

/** 11月14日（土） の形 */
export function jpShortDate(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

/** 今日から minDays 日以上先の、最初の土曜日 */
export function nextSaturdayAfter(today: Date, minDays: number): Date {
  let date = addDays(today, minDays);
  while (date.getDay() !== 6) date = addDays(date, 1);
  return date;
}

/** 今日が属する年度（4月始まり）の西暦 */
export function schoolYearOf(today: Date): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

/** 個人面談: 年度の12月の最初の月曜日〜その週の金曜日（デモ書類づくりの側と同じ規則） */
export function interviewDates(schoolYear: number): { from: Date; to: Date } {
  let from = new Date(schoolYear, 11, 1);
  while (from.getDay() !== 1) from = addDays(from, 1);
  return { from, to: addDays(from, 4) };
}

/** 固定の日付の祝日（月/日）。改訂日を「学校が配る平日」にするための最低限 */
const FIXED_HOLIDAYS = new Set(["1/1", "2/11", "2/23", "4/29", "5/3", "5/4", "5/5", "8/11", "11/3", "11/23"]);

/** その日から、さかのぼって最初の平日（土日・固定の祝日を除く） */
export function weekdayOnOrBefore(date: Date): Date {
  let d = date;
  while (d.getDay() === 0 || d.getDay() === 6 || FIXED_HOLIDAYS.has(`${d.getMonth() + 1}/${d.getDate()}`)) d = addDays(d, -1);
  return d;
}

export interface DemoDates {
  today: Date;
  schoolYear: number;
  /** 個人面談の週（月〜金） */
  interview: { from: Date; to: Date };
  /** 改訂版で前倒しした個人面談（前の週の火〜金） */
  interviewRevised: { from: Date; to: Date };
  /** 年間行事予定の改訂版が配られた日（開いた日の4日前から、さかのぼって最初の平日） */
  revisedOn: Date;
  /** サブスク: 今の契約期間（開いた日の3か月前の月の1日から12か月）と、解約できる期間（最後の月） */
  subscription: { start: Date; end: Date; renewal: Date; windowFrom: Date; windowTo: Date; monthsLeft: number };
  sportsDay: Date;
  sportsDayReserve: Date;
  /** 賃貸の契約期間の満了日 */
  leaseEnd: Date;
  /** 賃貸の契約開始日（満了の2年前の翌日） */
  leaseStart: Date;
  /** 火災保険の満了日（賃貸の満了より前に来る） */
  fireInsuranceEnd: Date;
  /** 遠足（開いた日の翌日以降の最初の平日。お弁当がいる日） */
  excursion: Date;
}

export function demoDates(today: Date): DemoDates {
  const sportsDay = nextSaturdayAfter(today, 10);
  const leaseEnd = addDays(today, 75);
  const leaseStart = addDays(new Date(leaseEnd.getFullYear() - 2, leaseEnd.getMonth(), leaseEnd.getDate()), 1);
  const interview = interviewDates(schoolYearOf(today));
  const subStart = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const renewal = new Date(subStart.getFullYear(), subStart.getMonth() + 12, 1);
  const subEnd = addDays(renewal, -1);
  const windowFrom = new Date(subEnd.getFullYear(), subEnd.getMonth(), 1);
  return {
    today,
    schoolYear: schoolYearOf(today),
    interview,
    interviewRevised: { from: addDays(interview.from, -6), to: addDays(interview.from, -3) },
    revisedOn: weekdayOnOrBefore(addDays(today, -4)),
    subscription: {
      start: subStart,
      end: subEnd,
      renewal,
      windowFrom,
      windowTo: subEnd,
      monthsLeft: (windowFrom.getFullYear() - today.getFullYear()) * 12 + windowFrom.getMonth() - today.getMonth(),
    },
    sportsDay,
    sportsDayReserve: addDays(sportsDay, 1),
    excursion: nextWeekday(addDays(today, 1)),
    leaseEnd,
    leaseStart,
    fireInsuranceEnd: addDays(leaseEnd, -9),
  };
}

export function schoolAnnualText(t: DemoDates): string {
  const y = t.schoolYear;
  return `くろうど第一小学校　${y}年度　年間行事予定（保護者用）

■ 主な行事
・始業式　　　　　${y}年4月7日
・授業参観・懇談会　${y}年4月24日
・夏休み　　　　　${y}年7月18日 〜 8月31日
・遠足（3年生）　　${jpDate(t.excursion)}（雨天の場合は校内で学習）
・運動会　　　　　${jpDate(t.sportsDay)}（雨天の場合は ${jpShortDate(t.sportsDayReserve)} に順延）
・個人面談　　　　${jpDate(t.interview.from)} 〜 ${jpShortDate(t.interview.to)}（日程は別途お知らせします）
・冬休み　　　　　${y}年12月25日 〜 ${y + 1}年1月7日
・修了式　　　　　${y + 1}年3月24日

※ 行事の詳しい時間・持ち物は、その都度お配りする案内プリントでお知らせします。
※ 遠足の日は、お弁当・水筒・敷物をご用意ください（給食はありません）。

■ 日課表（3年生）
・月・水・金曜日　6時間授業　下校 15:40ごろ
・火・木曜日　　　5時間授業　下校 14:50ごろ

くろうど第一小学校　職員室　000-0000-0000（平日 8:00〜17:00）`;
}

/** 運動会の案内プリント。デモでは「まだ届いていない書類」で、読み取りを試す1枚 */
export function sportsDayNoticeText(t: DemoDates): string {
  return `保護者の皆様へ

くろうど第一小学校　校長　架空 太郎

運動会のご案内

日頃より本校の教育活動にご理解とご協力をいただき、ありがとうございます。
下記のとおり運動会を行います。お子様の成長した姿をぜひご覧ください。

記

1. 日時　${jpDate(t.sportsDay)}　8:40 開会式　12:00 閉会予定
2. 雨天の場合　${jpShortDate(t.sportsDayReserve)} に順延します。
　　実施の有無は当日 6:30 に学校のお知らせアプリで連絡します。
3. 場所　本校 校庭
4. 持ち物　体操服、赤白帽子、水筒、タオル
5. 保護者の観覧について
　・観覧席は校庭の東側です。場所取りは 7:30 の開門後にお願いします。
　・お車での来校はご遠慮ください。

お問い合わせ　くろうど第一小学校　職員室　000-0000-0000`;
}

export function leaseText(t: DemoDates): string {
  return `賃貸住宅 契約書（抜粋）

貸主　架空不動産 株式会社
管理会社　みなと住まい管理（架空）　000-0000-0001（平日 9:00〜18:00）
借主　日向 翔太
物件　くろうど台ハイツ 203号室

第2条（契約期間）
契約期間は ${jpDate(t.leaseStart)} から ${jpDate(t.leaseEnd)} までの2年間とする。

第3条（賃料）
賃料は月額 85,000円、共益費は月額 3,000円とする。

第4条（更新）
1. 本契約は、貸主と借主の合意により更新することができる。
2. 借主は、更新にあたり、新賃料の1か月分を更新料として貸主に支払う。
3. 更新の意思の有無は、契約期間満了の1か月前までに管理会社へ申し出る。

第9条（解約）
借主が本契約を解約するときは、1か月前までに書面で管理会社へ申し出る。

第12条（家賃保証会社）
借主は、貸主が指定する家賃保証会社と保証委託契約を結び、本契約の期間中これを継続する。

第13条（火災保険）
借主は、借主の家財と借主の賠償責任を対象とする火災保険に加入し、本契約の期間中これを継続する。`;
}

export function guaranteeText(t: DemoDates): string {
  const firstRenewal = new Date(t.leaseStart.getFullYear() + 1, t.leaseStart.getMonth(), t.leaseStart.getDate());
  return `家賃保証 委託契約書（抜粋）

保証会社　ひだまり家賃保証（架空）　000-0000-0002（平日 10:00〜17:00）
契約者　日向 翔太
対象物件　くろうど台ハイツ 203号室

第5条（保証期間）
保証期間は ${jpDate(t.leaseStart)} から1年間とし、以後1年ごとに自動で更新する。

第6条（保証料）
1. 初回保証料は、月額賃料等の合計額の50％とする。
2. 保証期間の更新にあたり、契約者は1年ごとに更新保証料 10,000円 を支払う。
3. 月々の保証料はかからない。

第8条（賃貸借契約の更新）
賃貸借契約が更新されたときも、本契約は第5条に従い継続する。

（参考）初回の更新日　${jpDate(firstRenewal)}`;
}

export function fireInsuranceText(t: DemoDates): string {
  const start = addDays(new Date(t.fireInsuranceEnd.getFullYear() - 2, t.fireInsuranceEnd.getMonth(), t.fireInsuranceEnd.getDate()), 1);
  return `保険証券　住まいの火災保険（家財）

保険会社　そよかぜ少額短期保険（架空）
証券番号　DEMO-0000-0000
契約者・被保険者　日向 翔太
保険の対象　くろうど台ハイツ 203号室 の家財

保険期間　${jpDate(start)} 午後4時 から ${jpDate(t.fireInsuranceEnd)} 午後4時 まで（2年）
保険料　2年分 一括 20,000円

補償の内容
・家財の損害（火災・落雷・水濡れ・盗難など）　保険金額 300万円
・借家人賠償責任　保険金額 1,000万円
・個人賠償責任特約　保険金額 1億円

満期について
満期日の約1か月前に、更新のご案内をお送りします。更新の手続きをされない場合、満期日をもって契約は終了します。

事故のご連絡　そよかぜ少額短期保険 事故受付　000-0000-0003（24時間）
契約内容のお問い合わせ　000-0000-0004（平日 9:00〜17:00）`;
}

/**
 * 運動会の案内プリントの「仮の読み取り結果」。
 * 読み取り機能（Claude API）の準備中に、確定までの流れを試すためだけに使う。
 * Claude の読み取りではないことを画面にも必ず出す。
 */
export function sportsDayNoticeProvisionalDraft(t: DemoDates): Extraction {
  return {
    title: "運動会のご案内",
    transcript: "",
    summary: {
      what: "くろうど第一小学校の運動会の、時間・場所・持ち物の案内です。",
      todo: "持ち物（体操服・赤白帽子・水筒・タオル）を用意する。雨のときは当日 6:30 の連絡を見る。",
      ifIgnored: { text: "", location: "", quote: "" },
    },
    docType: "学校行事の案内",
    category: "school",
    who: {
      memberIds: ["m-son"],
      sure: true,
      reason: "くろうど第一小学校からの案内で、家族のうち小学生は蓮さん",
    },
    period: { label: "", from: "", until: "" },
    fields: [
      { label: "時間", value: "8:40 開会式、12:00 閉会予定", location: "1. 日時", quote: "8:40 開会式　12:00 閉会予定" },
      {
        label: "雨天のとき",
        value: `${jpShortDate(t.sportsDayReserve)} に順延。実施の有無は当日 6:30 に学校のお知らせアプリで連絡`,
        location: "2. 雨天の場合",
        quote: "実施の有無は当日 6:30 に学校のお知らせアプリで連絡します",
      },
      { label: "場所", value: "本校 校庭", location: "3. 場所", quote: "本校 校庭" },
      { label: "持ち物", value: "体操服、赤白帽子、水筒、タオル", location: "4. 持ち物", quote: "体操服、赤白帽子、水筒、タオル" },
      {
        label: "観覧",
        value: "観覧席は校庭の東側。場所取りは 7:30 の開門後。車での来校は控える",
        location: "5. 保護者の観覧について",
        quote: "場所取りは 7:30 の開門後にお願いします",
      },
    ],
    deadlines: [
      {
        kind: "event",
        label: "運動会",
        date: toYmd(t.sportsDay),
        endDate: "",
        time: "8:40〜12:00",
        place: "くろうど第一小学校 校庭",
        needs: ["体操服", "赤白帽子", "水筒", "タオル"],
        repeatMonths: 0,
        location: "1. 日時",
        quote: jpDate(t.sportsDay),
        reserve: {
          date: toYmd(t.sportsDayReserve),
          condition: "雨天の場合",
          location: "2. 雨天の場合",
          quote: `${jpShortDate(t.sportsDayReserve)} に順延します`,
        },
      },
    ],
    contacts: [
      { label: "問い合わせ先", name: "くろうど第一小学校 職員室", phone: "000-0000-0000", hours: "", location: "末尾" },
    ],
    questions: [],
    unclear: [],
  };
}

/** 平日（月〜金）になるまで日を進める */
export function nextWeekday(date: Date): Date {
  let d = date;
  while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  return d;
}

/** 歯科健診の日（開いた日の18日後以降の最初の平日） */
export function dentalCheckupDate(today: Date): Date {
  return nextWeekday(addDays(today, 18));
}

/** 対象の生まれ月（開いた日から見て、2歳〜2歳半の子） */
function dentalTargetText(today: Date): string {
  const from = new Date(today.getFullYear() - 2, today.getMonth() - 6, 1);
  const to = new Date(today.getFullYear() - 2, today.getMonth() - 1, 1);
  return `${from.getFullYear()}年${from.getMonth() + 1}月 〜 ${to.getFullYear()}年${to.getMonth() + 1}月に生まれたお子さま`;
}

/**
 * 作り込んでいない書類の見本: 市の2歳児歯科健診のお知らせ。
 * デモ用の「来るはずの書類」にも、どの家族の予定にも結びつけていない。
 * 対象が生まれ月で書かれていて、誰の書類か言い切れない（執事が本人に聞く場面）。
 */
export function dentalCheckupText(today: Date): string {
  const day = dentalCheckupDate(today);
  return `保護者様

くろうど市（架空）健康づくり課

2歳児歯科健康診査のご案内

お子さまの歯の健康を守るため、下記のとおり歯科健康診査を行います。
対象のお子さまと一緒にお越しください。

記

1. 対象　${dentalTargetText(today)}
2. 日時　${jpDate(day)}　受付 13:00 〜 13:30
3. 場所　くろうど市保健センター（架空）2階 健診室
4. 持ち物　母子健康手帳、問診票（同封のもの。記入してお持ちください）、歯ブラシ
5. 費用　無料
6. ご都合の悪い方は、事前に健康づくり課へご連絡ください。次回の日程をご案内します。

お問い合わせ　くろうど市 健康づくり課（架空）　000-0000-0005（平日 8:30〜17:15）`;
}

/** 歯科健診のお知らせの「仮の読み取り結果」（Claude は使っていない） */
export function dentalCheckupProvisionalDraft(today: Date): Extraction {
  const day = dentalCheckupDate(today);
  return {
    title: "2歳児歯科健康診査のご案内",
    transcript: "",
    summary: {
      what: "くろうど市の、2歳児の歯科健診の案内です。",
      todo: "問診票に記入し、母子健康手帳・歯ブラシと一緒に当日持っていく。都合が悪ければ事前に健康づくり課へ連絡する。",
      ifIgnored: { text: "", location: "", quote: "" },
    },
    docType: "歯科健診のお知らせ",
    category: "medical",
    who: {
      memberIds: ["m-daughter"],
      sure: false,
      reason: `対象は${dentalTargetText(today).replace("に生まれたお子さま", "")}生まれの子。うちだと2歳の結衣さんが当てはまりそう`,
    },
    period: { label: "", from: "", until: "" },
    fields: [
      { label: "対象", value: dentalTargetText(today), location: "1. 対象", quote: dentalTargetText(today) },
      { label: "費用", value: "無料", location: "5. 費用", quote: "無料" },
      {
        label: "都合が悪いとき",
        value: "事前に健康づくり課へ連絡すると、次回の日程を案内してもらえる",
        location: "6.",
        quote: "ご都合の悪い方は、事前に健康づくり課へご連絡ください",
      },
    ],
    deadlines: [
      {
        kind: "event",
        label: "2歳児歯科健診",
        date: toYmd(day),
        endDate: "",
        time: "受付 13:00〜13:30",
        place: "くろうど市保健センター（架空）2階 健診室",
        needs: ["母子健康手帳", "問診票（記入して持参）", "歯ブラシ"],
        repeatMonths: 0,
        location: "2. 日時",
        quote: jpDate(day),
        reserve: { date: "", condition: "", location: "", quote: "" },
      },
    ],
    contacts: [
      {
        label: "問い合わせ先",
        name: "くろうど市 健康づくり課（架空）",
        phone: "000-0000-0005",
        hours: "平日 8:30〜17:15",
        location: "末尾",
      },
    ],
    questions: [],
    unclear: [],
  };
}

// ---- 年間行事予定の改訂版（新旧の違いに気づく場面） ----

const md = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;

/**
 * 年間行事予定の改訂版。個人面談だけが前の週に動き、★印が付く。
 * 今年度版（schoolAnnualText）と同じ短い形で書いてある（見本は文字から画像に描くので、長い表は読めなくなるため）。
 * 作り込んだ A3 のカレンダー型の見本は、撮影・本物の Claude の読み取りの試しに別途使う。
 */
export function revisedSchoolAnnualText(t: DemoDates): string {
  const y = t.schoolYear;
  return `くろうど第一小学校　${y}年度　年間行事予定（保護者用）【改訂版】
${jpDate(t.revisedOn)} 改訂
★印は変更した行事です（個人面談　${md(t.interview.from)}〜 → ${md(t.interviewRevised.from)}〜。希望日の調査票は11月中旬に配布します）。先にお配りした予定表は処分してください。

■ 主な行事
・始業式　　　　　${y}年4月7日
・授業参観・懇談会　${y}年4月24日
・夏休み　　　　　${y}年7月18日 〜 8月31日
・遠足（3年生）　　${jpDate(t.excursion)}（雨天の場合は校内で学習）
・運動会　　　　　${jpDate(t.sportsDay)}（雨天の場合は ${jpShortDate(t.sportsDayReserve)} に順延）
・★個人面談　　　${jpDate(t.interviewRevised.from)} 〜 ${jpShortDate(t.interviewRevised.to)}（希望日の調査票を11月中旬に配布します）
・冬休み　　　　　${y}年12月25日 〜 ${y + 1}年1月7日
・修了式　　　　　${y + 1}年3月24日

※ 行事の詳しい時間・持ち物は、その都度お配りする案内プリントでお知らせします。
※ 遠足の日は、お弁当・水筒・敷物をご用意ください（給食はありません）。
※ 職員会議・個人面談の日は短縮日課です（5時間授業・14:50ごろ下校）。

■ 日課表（3年生）
・月・水・金曜日　6時間授業　下校 15:40ごろ
・火・木曜日　　　5時間授業　下校 14:50ごろ

くろうど第一小学校　職員室　000-0000-0000（平日 8:00〜17:00）`;
}

/** 改訂版の「仮の読み取り結果」（Claude は使っていない）。予定の名前は今年度版と同じにして、日付の違いをコードで比べられるように */
export function revisedSchoolAnnualProvisionalDraft(t: DemoDates): Extraction {
  const y = t.schoolYear;
  const ev = (label: string, date: Date, location: string, quote: string, extra: Partial<Extraction["deadlines"][number]> = {}) => ({
    kind: "event" as const,
    label,
    date: toYmd(date),
    endDate: "",
    time: "",
    place: "",
    needs: [] as string[],
    repeatMonths: 0,
    location,
    quote,
    reserve: { date: "", condition: "", location: "", quote: "" },
    ...extra,
  });
  return {
    title: `くろうど第一小学校 ${y}年度 年間行事予定（改訂版）`,
    transcript: "",
    summary: {
      what: `くろうど第一小学校の${y}年度の年間行事予定の改訂版です。個人面談の日程が変わっています（★印）。`,
      todo: "先に配られた予定表は処分する。遠足の日はお弁当・水筒・敷物を用意する。個人面談の希望日の調査票が11月中旬に配られる。",
      ifIgnored: { text: "", location: "", quote: "" },
    },
    docType: "年間行事予定",
    category: "school",
    who: { memberIds: ["m-son"], sure: true, reason: "くろうど第一小学校の予定表で、3年生の日課が書いてある。家族で小学生は蓮さん" },
    period: { label: `${y}年度`, from: `${y}-04-01`, until: `${y + 1}-03-31` },
    fields: [
      { label: "変更した行事", value: `個人面談 ${md(t.interview.from)}〜 → ${md(t.interviewRevised.from)}〜（★印）`, location: "冒頭の★の説明", quote: `★印は変更した行事です（個人面談　${md(t.interview.from)}〜 → ${md(t.interviewRevised.from)}〜` },
      { label: "日課表（3年生）", value: "月・水・金は6時間（下校15:40ごろ）、火・木は5時間（下校14:50ごろ）", location: "日課表（3年生）", quote: "下校 15:40ごろ" },
      { label: "短縮日課", value: "職員会議・個人面談の日は5時間授業・14:50ごろ下校", location: "主な行事の下の※", quote: "職員会議・個人面談の日は短縮日課です" },
      { label: "行事の詳細", value: "時間・持ち物は、その都度配られる案内プリントで知らせる", location: "主な行事の下の※", quote: "その都度お配りする案内プリントでお知らせします" },
    ],
    deadlines: [
      ev("遠足（3年生）", t.excursion, "主な行事・遠足 ／ 下の※", jpDate(t.excursion), { needs: ["お弁当", "水筒", "敷物"] }),
      ev("運動会", t.sportsDay, "主な行事・運動会", jpDate(t.sportsDay), {
        reserve: { date: toYmd(t.sportsDayReserve), condition: "雨天の場合", location: "主な行事・運動会", quote: `雨天の場合は ${jpShortDate(t.sportsDayReserve)} に順延` },
      }),
      ev("個人面談", t.interviewRevised.from, "主な行事・★個人面談", `★個人面談　　　${jpDate(t.interviewRevised.from)} 〜 ${jpShortDate(t.interviewRevised.to)}`, { endDate: toYmd(t.interviewRevised.to) }),
      ev("冬休み", new Date(y, 11, 25), "主な行事・冬休み", `冬休み　　　　　${y}年12月25日 〜 ${y + 1}年1月7日`, { endDate: `${y + 1}-01-07` }),
    ],
    contacts: [{ label: "学校", name: "くろうど第一小学校 職員室", phone: "000-0000-0000", hours: "平日 8:00〜17:00", location: "最下段" }],
    questions: [],
    unclear: [],
  };
}

// ---- サブスクの契約画面（解約できる期間を、始まる前に知らせる場面） ----

const slash = (d: Date) => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
const jpYmd = (d: Date) => `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;

/** 動画配信サブスクの契約画面（スマホのスクショ）。解約できるのは契約期間の最後の月だけ */
export function subscriptionText(t: DemoDates): string {
  const s = t.subscription;
  return `21:14　　　　　　　　　　　●●● 84%
〈 戻る　　契約内容の確認

ゆるりシネマ（架空）
映画・ドラマ見放題

ご契約者　日向 翔太 様
ログインID　demo-****@example.com
プラン　年割プラン（12か月契約・自動更新）
料金　年額 11,880円（月あたり 990円）
今の契約期間　${slash(s.start)} 〜 ${slash(s.end)}
次回の更新日　${slash(s.renewal)}

今は解約できる期間ではありません
次に解約できるのは ${jpYmd(s.windowFrom)} 〜 ${jpYmd(s.windowTo)} です（あと約${s.monthsLeft}か月）。

※ 解約できる期間（契約期間の最後の月）以外に解約すると、契約解除料 2,200円がかかります。
※ 解約できる期間に手続きをしないと、同じプランで12か月自動更新されます。
※ お問い合わせ：ゆるりシネマ サポート（架空）000-0000-0017（毎日 10:00〜19:00）

［ 解約の手続きへ ］

見本（架空）`;
}

/** サブスクの契約画面の「仮の読み取り結果」（Claude は使っていない） */
export function subscriptionProvisionalDraft(t: DemoDates): Extraction {
  const s = t.subscription;
  return {
    title: "ゆるりシネマ 契約内容の確認（画面）",
    transcript: "",
    summary: {
      what: "動画配信サービスの年割プランの契約内容の画面です。",
      todo: `${jpYmd(s.windowFrom)}〜${jpYmd(s.windowTo)} の間なら、契約解除料なしで解約の手続きができる。`,
      ifIgnored: {
        text: "解約できる期間に手続きをしないと、同じプランで12か月自動更新される",
        location: "画面下の※2つ目",
        quote: "同じプランで12か月自動更新されます",
      },
    },
    docType: "サブスクの契約画面",
    category: "subscription",
    who: { memberIds: ["m-self"], sure: true, reason: "ご契約者 日向 翔太 様 と書いてある" },
    period: { label: `今の契約期間 ${slash(s.start)}〜${slash(s.end)}`, from: toYmd(s.start), until: toYmd(s.end) },
    fields: [
      { label: "プラン", value: "年割プラン（12か月契約・自動更新）", location: "契約内容・プラン", quote: "年割プラン（12か月契約・自動更新）" },
      { label: "料金", value: "年額 11,880円（月あたり 990円）", location: "契約内容・料金", quote: "年額 11,880円" },
      { label: "期間外の解約", value: "契約解除料 2,200円", location: "画面下の※1つ目", quote: "契約解除料 2,200円" },
    ],
    deadlines: [
      {
        kind: "cancel_window",
        label: "解約できる期間（契約解除料なし）",
        date: toYmd(s.windowFrom),
        endDate: toYmd(s.windowTo),
        time: "",
        place: "",
        needs: [],
        repeatMonths: 12,
        location: "黄色の枠",
        quote: `${jpYmd(s.windowFrom)} 〜 ${jpYmd(s.windowTo)}`,
        reserve: { date: "", condition: "", location: "", quote: "" },
      },
      {
        kind: "due",
        label: "次回の更新日（自動更新）",
        date: toYmd(s.renewal),
        endDate: "",
        time: "",
        place: "",
        needs: [],
        repeatMonths: 12,
        location: "契約内容・次回の更新日",
        quote: slash(s.renewal),
        reserve: { date: "", condition: "", location: "", quote: "" },
      },
    ],
    contacts: [{ label: "サポート", name: "ゆるりシネマ サポート（架空）", phone: "000-0000-0017", hours: "毎日 10:00〜19:00", location: "画面下の※3つ目" }],
    questions: [],
    unclear: [],
  };
}
