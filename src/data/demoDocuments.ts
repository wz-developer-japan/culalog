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

export interface DemoDates {
  today: Date;
  schoolYear: number;
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
  return {
    today,
    schoolYear: schoolYearOf(today),
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
・個人面談　　　　${y}年12月8日 〜 12月12日（日程は別途お知らせします）
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
