// 「架空の家族で試す」で入るデモのデータ。
// 人物・学校・会社・書類の内容はすべて架空で、このリポジトリのために新しく作ったもの。
// 日付は開いた日から相対的に作るので、いつ開いても同じ流れを試せる。
// 書類の本文（原本）は demoDocuments.ts にあり、下の項目はそこから読み取って確定した、という扱い。

import { addDays, toYmd } from "@/lib/deadlines";
import type { Household } from "@/lib/types";
import {
  demoDates,
  dentalCheckupProvisionalDraft,
  dentalCheckupText,
  fireInsuranceText,
  guaranteeText,
  jpDate,
  jpShortDate,
  leaseText,
  schoolAnnualText,
  sportsDayNoticeProvisionalDraft,
  sportsDayNoticeText,
} from "./demoDocuments";

export function createDemoHousehold(today: Date = new Date()): Household {
  const t = demoDates(today);
  const ymd = (date: Date) => toYmd(date);
  const createdAt = today.toISOString();
  const y = t.schoolYear;
  const guaranteeRenewal = addDays(t.leaseEnd, 1);

  return {
    isDemo: true,
    members: [
      { id: "m-self", name: "日向 翔太", relation: "self", roleLabel: "本人", note: "書類の管理をしている。土日も勤務がある変則シフト" },
      { id: "m-spouse", name: "日向 美咲", relation: "spouse", roleLabel: "妻" },
      { id: "m-son", name: "日向 蓮", relation: "child", roleLabel: "長男", note: "小学3年" },
      { id: "m-daughter", name: "日向 結衣", relation: "child", roleLabel: "長女", note: "2歳・保育園" },
      { id: "m-grandpa", name: "日向 正雄", relation: "parent", roleLabel: "祖父", note: "翔太の父・遠方に住む" },
      { id: "m-grandma", name: "日向 和子", relation: "parent", roleLabel: "祖母", note: "翔太の母・遠方に住む" },
      { id: "m-aunt", name: "森 由紀", relation: "sibling", roleLabel: "叔母", note: "翔太の妹・両親の近くに住む" },
    ],
    documents: [
      {
        id: "doc-school-annual",
        title: "くろうど第一小学校 年間行事予定",
        category: "school",
        docType: "年間行事予定",
        memberIds: ["m-son"],
        periodLabel: `${y}年度`,
        validFrom: `${y}-04-01`,
        validUntil: `${y + 1}-03-31`,
        origin: "demo",
        storageLocation: "冷蔵庫の扉（磁石）",
        originalText: schoolAnnualText(t),
        fields: [
          {
            key: "f-timetable",
            label: "日課表（3年生）",
            value: "月・水・金は6時間（下校15:40ごろ）、火・木は5時間（下校14:50ごろ）",
            source: { location: "日課表（3年生）" },
            status: "confirmed",
          },
          {
            key: "f-notice",
            label: "行事の詳細",
            value: "時間・持ち物は、その都度配られる案内プリントで知らせる",
            source: { location: "主な行事の下の※" },
            status: "confirmed",
          },
        ],
        contacts: [
          {
            label: "学校",
            name: "くろうど第一小学校 職員室",
            phone: "000-0000-0000",
            hours: "平日 8:00〜17:00",
            source: { location: "最下段" },
          },
        ],
        deadlines: [
          {
            id: "dl-excursion",
            kind: "event",
            label: "遠足（3年生）",
            date: ymd(t.excursion),
            leadDays: 7,
            needs: ["お弁当", "水筒", "敷物"],
            memberIds: ["m-son"],
            source: { location: "主な行事・遠足 ／ 下の※", quote: "遠足の日は、お弁当・水筒・敷物をご用意ください" },
          },
          {
            id: "dl-sports-day",
            kind: "event",
            label: "運動会",
            date: ymd(t.sportsDay),
            leadDays: 21,
            leadReason: "土日も勤務がある。有給の申請に間に合うよう、案内プリントで日時を確かめたい",
            memberIds: ["m-son", "m-self"],
            source: { location: "主な行事・運動会", quote: jpDate(t.sportsDay) },
            reserve: {
              date: ymd(t.sportsDayReserve),
              condition: "雨天の場合",
              source: { location: "主な行事・運動会", quote: `雨天の場合は ${jpShortDate(t.sportsDayReserve)} に順延` },
            },
          },
          {
            id: "dl-interview",
            kind: "event",
            label: "個人面談",
            date: ymd(t.interview.from),
            endDate: ymd(t.interview.to),
            leadDays: 21,
            leadReason: "日程の希望を出すお知らせが来るはず",
            memberIds: ["m-son"],
            source: { location: "主な行事・個人面談" },
          },
          {
            id: "dl-winter-break",
            kind: "event",
            label: "冬休み",
            date: `${y}-12-25`,
            endDate: `${y + 1}-01-07`,
            leadDays: 30,
            leadReason: "勤務のシフトや預け先を考える",
            memberIds: ["m-son"],
            source: { location: "主な行事・冬休み" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-lease",
        title: "賃貸住宅 契約書",
        category: "housing",
        memberIds: ["m-self"],
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル",
        originalText: leaseText(t),
        fields: [
          { key: "f-rent", label: "賃料", value: "月額 85,000円（共益費 3,000円）", source: { location: "第3条" }, status: "confirmed" },
          { key: "f-renewal-fee", label: "更新料", value: "新賃料の1か月分", source: { location: "第4条2項" }, status: "confirmed" },
          {
            key: "f-guarantor",
            label: "家賃保証会社",
            value: "指定の保証会社との契約を、契約期間中継続する",
            source: { location: "第12条" },
            status: "confirmed",
          },
          {
            key: "f-fire",
            label: "火災保険",
            value: "家財と賠償責任の火災保険に加入し、契約期間中継続する",
            source: { location: "第13条" },
            status: "confirmed",
          },
          { key: "f-cancel", label: "解約の申し出", value: "1か月前までに書面で管理会社へ", source: { location: "第9条" }, status: "confirmed" },
        ],
        contacts: [
          {
            label: "管理会社",
            name: "みなと住まい管理（架空）",
            phone: "000-0000-0001",
            hours: "平日 9:00〜18:00",
            source: { location: "冒頭" },
          },
        ],
        deadlines: [
          {
            id: "dl-lease-renewal",
            kind: "expiry",
            label: "賃貸の契約期間の満了（更新）",
            date: ymd(t.leaseEnd),
            leadDays: 90,
            leadReason: "更新料・保証会社・火災保険の3つを確かめる時間を取る",
            memberIds: ["m-self"],
            source: { location: "第2条" },
          },
          {
            id: "dl-lease-notice",
            kind: "notice",
            label: "更新するかどうかの申し出（管理会社へ）",
            date: ymd(addDays(t.leaseEnd, -30)),
            leadDays: 30,
            memberIds: ["m-self"],
            source: { location: "第4条3項", quote: "契約期間満了の1か月前までに管理会社へ申し出る" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-guarantee",
        title: "家賃保証 委託契約書",
        category: "housing",
        memberIds: ["m-self"],
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル（賃貸の契約書の後ろ）",
        originalText: guaranteeText(t),
        fields: [
          { key: "f-renewal-guarantee", label: "更新保証料", value: "1年ごとに 10,000円", source: { location: "第6条2項" }, status: "confirmed" },
          { key: "f-monthly", label: "月々の保証料", value: "かからない", source: { location: "第6条3項" }, status: "confirmed" },
          { key: "f-period", label: "保証期間", value: "1年ごとに自動で更新", source: { location: "第5条" }, status: "confirmed" },
        ],
        contacts: [
          {
            label: "保証会社",
            name: "ひだまり家賃保証（架空）",
            phone: "000-0000-0002",
            hours: "平日 10:00〜17:00",
            source: { location: "冒頭" },
          },
        ],
        deadlines: [
          {
            id: "dl-guarantee-renewal",
            kind: "expiry",
            label: "家賃保証の更新（更新保証料の支払い）",
            date: ymd(guaranteeRenewal),
            leadDays: 60,
            memberIds: ["m-self"],
            source: { location: "第5条・第6条2項" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-fire-insurance",
        title: "火災保険（家財） 保険証券",
        category: "insurance",
        memberIds: ["m-self"],
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル",
        originalText: fireInsuranceText(t),
        summary: {
          what: "住まいの火災保険（家財）の保険証券です。保険期間は2年。",
          todo: "満期日の約1か月前に届く更新の案内を見て、更新の手続きをするか決める。",
          ifIgnored: {
            text: "更新の手続きをしないと、満期日で契約が終わる",
            source: { location: "満期について", quote: "更新の手続きをされない場合、満期日をもって契約は終了します。" },
          },
        },
        fields: [
          { key: "f-premium", label: "保険料", value: "2年分 一括 20,000円", source: { location: "保険料" }, status: "confirmed" },
          {
            key: "f-coverage",
            label: "補償の内容",
            value: "家財 300万円／借家人賠償責任 1,000万円／個人賠償責任特約 1億円",
            source: { location: "補償の内容" },
            status: "confirmed",
          },
          {
            key: "f-renewal",
            label: "満期について",
            value: "満期日の約1か月前に更新の案内が届く。手続きしないと満期日で終了",
            source: { location: "満期について" },
            status: "confirmed",
          },
        ],
        contacts: [
          {
            label: "事故のご連絡",
            name: "そよかぜ少額短期保険 事故受付（架空）",
            phone: "000-0000-0003",
            hours: "24時間",
            source: { location: "最下段" },
          },
          {
            label: "契約内容のお問い合わせ",
            name: "そよかぜ少額短期保険（架空）",
            phone: "000-0000-0004",
            hours: "平日 9:00〜17:00",
            source: { location: "最下段" },
          },
        ],
        deadlines: [
          {
            id: "dl-fire-insurance-end",
            kind: "expiry",
            label: "火災保険の満期",
            date: ymd(t.fireInsuranceEnd),
            leadDays: 60,
            leadReason: "手続きしないと満期日で終わる",
            memberIds: ["m-self"],
            source: { location: "保険期間" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
    ],
    expected: [
      {
        id: "exp-sports-day-notice",
        label: "運動会の案内プリント",
        expectedBy: ymd(today),
        relatedDeadlineId: "dl-sports-day",
        hint: "年間行事予定に「時間・持ち物は案内プリントで知らせる」とあります。ランドセルの中に入ったままかもしれません。",
      },
    ],
    demoSamples: [
      {
        id: "sample-sports-day",
        title: "運動会のご案内（架空）",
        text: sportsDayNoticeText(t),
        expectedId: "exp-sports-day-notice",
        provisionalDraft: sportsDayNoticeProvisionalDraft(t),
      },
      {
        id: "sample-dental",
        title: "2歳児歯科健康診査のご案内（架空）",
        text: dentalCheckupText(today),
        provisionalDraft: dentalCheckupProvisionalDraft(today),
      },
    ],
    questions: [],
    rules: [
      {
        id: "rule-leave",
        label: "有給の申請（勤務先）",
        daysBefore: 7,
        memberId: "m-self",
        note: "勤務先のきまりで、有給の申請は遅くとも1週間前まで",
      },
    ],
    timetable: [
      { memberId: "m-son", weekday: 1, periods: 6, dismissal: "15:40" },
      { memberId: "m-son", weekday: 2, periods: 5, dismissal: "14:50" },
      { memberId: "m-son", weekday: 3, periods: 6, dismissal: "15:40" },
      { memberId: "m-son", weekday: 4, periods: 5, dismissal: "14:50" },
      { memberId: "m-son", weekday: 5, periods: 6, dismissal: "15:40" },
    ],
  };
}
