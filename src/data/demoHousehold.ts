// 「架空の家族で試す」で入るデモのデータ。
// 人物・会社・書類の内容はすべて架空で、このリポジトリのために新しく作ったもの。
// 日付は開いた日から相対的に作るので、いつ開いても同じ流れを試せる。
// （書類の本文と、残りの書類は今後追加する）

import { addDays, toYmd } from "@/lib/deadlines";
import type { Household } from "@/lib/types";

export function createDemoHousehold(today: Date = new Date()): Household {
  const d = (days: number) => toYmd(addDays(today, days));
  const createdAt = today.toISOString();

  return {
    isDemo: true,
    members: [
      { id: "m-self", name: "日向 翔太", relation: "self", note: "書類の管理をしている。土日も勤務がある変則シフト" },
      { id: "m-spouse", name: "日向 美咲", relation: "spouse" },
      { id: "m-son", name: "日向 蓮", relation: "child", note: "小学3年" },
      { id: "m-daughter", name: "日向 結衣", relation: "child", note: "2歳・保育園" },
      { id: "m-grandpa", name: "日向 正雄", relation: "parent", note: "翔太の父・遠方に住む" },
      { id: "m-grandma", name: "日向 和子", relation: "parent", note: "翔太の母・遠方に住む" },
      { id: "m-aunt", name: "森 由紀", relation: "sibling", note: "翔太の妹・両親の近くに住む" },
    ],
    documents: [
      {
        id: "doc-school-annual",
        title: "あおば台小学校 年間行事予定",
        category: "school",
        memberIds: ["m-son"],
        origin: "demo",
        storageLocation: "冷蔵庫の扉（磁石）",
        fields: [],
        contacts: [{ label: "学校", name: "あおば台小学校 職員室", phone: "000-0000-0000" }],
        deadlines: [
          {
            id: "dl-sports-day",
            kind: "event",
            label: "運動会",
            date: d(12),
            leadDays: 14,
            leadReason: "有給の申請は遅くとも1週間前まで。その前に案内プリントで日時を確かめたい",
            memberIds: ["m-son", "m-self"],
            source: { location: "表面・行事の一覧" },
          },
        ],
        createdAt,
      },
      {
        id: "doc-lease",
        title: "賃貸住宅 契約書",
        category: "housing",
        memberIds: ["m-self"],
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル",
        fields: [],
        contacts: [{ label: "管理会社", name: "みなと住まい管理（架空）", phone: "000-0000-0001" }],
        deadlines: [
          {
            id: "dl-lease-renewal",
            kind: "expiry",
            label: "賃貸の契約期間の満了（更新）",
            date: d(75),
            leadDays: 90,
            leadReason: "更新料・保証会社・火災保険の3つを確かめる時間を取る",
            memberIds: ["m-self"],
            source: { location: "第2条（契約期間）" },
          },
        ],
        createdAt,
      },
    ],
    expected: [
      {
        id: "exp-sports-day-notice",
        label: "運動会の案内プリント",
        expectedBy: d(0),
        relatedDeadlineId: "dl-sports-day",
        hint: "例年なら届いている時期です。ランドセルの中に入ったままかもしれません。",
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
