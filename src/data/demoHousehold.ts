// 「架空の家族で試す」で入るデモのデータ。
// 人物・学校・会社・書類の内容はすべて架空で、このリポジトリのために新しく作ったもの。
// 日付は開いた日から相対的に作るので、いつ開いても同じ流れを試せる。
// 書類の本文（原本）は demoDocuments.ts にあり、下の項目はそこから読み取って確定した、という扱い。

import { addDays, toYmd } from "@/lib/deadlines";
import type { DemoSample, Household } from "@/lib/types";
import {
  demoDates,
  dentalCheckupProvisionalDraft,
  dentalCheckupText,
  fireInsuranceText,
  gradeLetterText,
  guaranteeText,
  injuryPolicyText,
  jpDate,
  jpShortDate,
  leaseText,
  medicalCardText,
  nurseryGuideText,
  openClassNoticeProvisionalDraft,
  openClassNoticeText,
  SHIFT_HOURS,
  SHIFT_TABLE_DAYS,
  shiftTableText,
  schoolInjuryBenefitText,
  wareki,
  revisedSchoolAnnualProvisionalDraft,
  revisedSchoolAnnualText,
  schoolAnnualText,
  subscriptionProvisionalDraft,
  subscriptionText,
} from "./demoDocuments";
import { FEW_PRECONFIRMED_IDS, PRECONFIRMED_SAMPLE_IDS, preconfirmedDocuments } from "./demoPreconfirmed";

/**
 * 架空の家族を作る。写真・メールの見本（約 700KB）は「架空の家族で試す」を押したときだけ読み込む
 * （最初の画面の JS に入れない）
 */
export async function createDemoHousehold(today: Date = new Date(), options: { few?: boolean } = {}): Promise<Household> {
  const allPhotoSamples = (await import("./photoSamples.json")).default as unknown as DemoSample[];
  const members: Household["members"] = [
    // 一緒に住んでいる家族だけ（離れて暮らす親などは、この家の書類としては扱わない）
    { id: "m-self", icon: "man", name: "日向 翔太", relation: "self", roleLabel: "あなた", note: "書類の管理をしている。平日は会社勤め", names: { vi: "Shōta" } },
    { id: "m-spouse", icon: "woman-long", name: "日向 タオ", relation: "spouse", roleLabel: "妻", note: "ベトナム出身。食品工場に勤務（土曜の出勤あり）", language: "vi", names: { vi: "Thảo" } },
    { id: "m-son", icon: "boy", name: "日向 蓮", relation: "child", roleLabel: "長男", note: "小学3年", names: { vi: "Ren" } },
    { id: "m-daughter", icon: "girl", name: "日向 結衣", relation: "child", roleLabel: "長女", note: "2歳・保育園", names: { vi: "Yui" } },
  ];
  // ふつうは、写真・メールの見本の一部をもう預かっている（確定済み）ところから始める。
  // options.few（入口 /?demo=few）は、書類が少ない状態（9件）から始める（「まとめて渡す」の前と後を見せる録画用）
  const preIds = options.few ? FEW_PRECONFIRMED_IDS : PRECONFIRMED_SAMPLE_IDS;
  const pre = preconfirmedDocuments(allPhotoSamples, members, today, preIds);
  const photoSamples = allPhotoSamples.filter((s) => !preIds.has(s.id));
  const t = demoDates(today);
  const ymd = (date: Date) => toYmd(date);
  const createdAt = today.toISOString();
  const y = t.schoolYear;
  const guaranteeRenewal = addDays(t.leaseEnd, 1);

  const household: Household = {
    isDemo: true,
    members,
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
        summary: {
          what: "蓮さんの小学校の、今年度の主な行事（運動会・個人面談・長期休みなど）と3年生の日課表です。",
          todo: "行事の日を家族で知っておく。時間・持ち物は、その都度配られる案内プリントで確かめる。",
        },
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
            value: "時間・持ち物は、その都度配られる案内プリントで知らせる。2学期以降の授業参観の日は学年だよりで知らせる",
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
            leadDays: 14,
            leadReason: "持ち物は案内プリントで知らせると書いてある",
            memberIds: ["m-son"],
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
        id: "doc-grade-letter",
        title: `3学年だより（${t.gradeLetterIssued.getMonth() + 1}月号）`,
        category: "school",
        docType: "学年だより",
        memberIds: ["m-son"],
        periodLabel: `${t.gradeLetterIssued.getMonth() + 1}月号`,
        origin: "demo",
        storageLocation: "冷蔵庫の扉（磁石）",
        originalText: gradeLetterText(t),
        summary: {
          what: "蓮さんの学年のおたよりです。2学期の授業参観の日が書いてあります。",
          todo: "授業参観の時間・教室は、あとで配られる案内プリントで確かめる。上着に名前を書く。欠席の連絡は 8:00 までに連絡アプリで。",
        },
        fields: [
          {
            key: "f-open-class-notice",
            label: "授業参観の時間・教室",
            value: "後日配られる案内プリントで知らせる",
            source: { location: "これからのおもな予定・授業参観（2学期）の※", quote: "時間・教室は、後日お配りする案内プリントでお知らせします" },
            status: "confirmed",
          },
        ],
        contacts: [
          { label: "学校", name: "くろうど第一小学校", phone: "000-0000-0000", source: { location: "最下段" } },
        ],
        deadlines: [
          {
            id: "dl-open-class",
            kind: "event",
            label: "授業参観（2学期）",
            date: ymd(t.openClass),
            leadDays: 21,
            leadReason: "平日の行事。行くかどうかを家族で決められるよう、案内プリントで時間を確かめたい",
            memberIds: ["m-son", "m-self"],
            source: { location: "これからのおもな予定・授業参観（2学期）", quote: `授業参観（2学期）　${jpDate(t.openClass)}` },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        // 翔太の勤務先の勤務シフト表。授業参観（11/27 金）の日は父も母も仕事、を見せるための見本（日付は 11月で固定）
        id: "doc-shift-nov",
        title: "くろうどロジスティクス 11月 勤務シフト表（くろうど物流センター）",
        category: "work",
        docType: "勤務シフト表",
        memberIds: ["m-self"],
        periodLabel: "2026年11月",
        origin: "demo",
        storageLocation: "書斎の机の引き出し（会社の書類）",
        originalText: shiftTableText(),
        summary: {
          what: "翔太さんの勤務先の、11月の勤務シフト表です。日勤・早番・遅番と休日が日ごとに書いてあります。",
          todo: "休みの希望やシフトの交代は、前の週の金曜日までに班長へ申し出る。",
        },
        fields: [
          {
            key: "f-shift-hours",
            label: "勤務の種類と時間",
            value: "日勤 8:30〜17:30／早番 6:00〜15:00／遅番 13:00〜22:00",
            source: { location: "表の上の凡例", quote: "日勤 8:30〜17:30 ／ 早番 6:00〜15:00 ／ 遅番 13:00〜22:00" },
            status: "confirmed",
          },
          {
            key: "f-shift-change",
            label: "休みの希望・シフトの交代",
            value: "前の週の金曜日までに班長へ申し出る（27（金）の分は 11月20日（金）まで）",
            source: { location: "表の下の※（1つ目）", quote: "休みの希望・シフトの交代は、前の週の金曜日までに班長へ申し出てください" },
            status: "confirmed",
          },
        ],
        contacts: [{ label: "問い合わせ", name: "くろうど物流センター 入出荷2班", phone: "000-0000-0000", source: { location: "最下段" } }],
        deadlines: [
          // 出勤の日は「知っておくだけ」の予定（ホームや向こう7日には出さず、同じ日のぶつかりと「家族に伝える」の ⚠ に使う）
          ...SHIFT_TABLE_DAYS.filter((d) => d.shift !== "休").map((d) => ({
            id: `dl-shift-${d.date}`,
            kind: "event" as const,
            label: `出勤（${d.shift} ${SHIFT_HOURS[d.shift]}）`,
            date: d.date,
            time: SHIFT_HOURS[d.shift],
            leadDays: 0,
            awareness: true,
            memberIds: ["m-self"],
            source: { location: `翔太の行・${Number(d.date.slice(8, 10))}日`, quote: d.shift },
          })),
          {
            id: "dl-shift-change-1127",
            kind: "notice" as const,
            label: "休みの希望・シフトの交代の申し出（27（金）の分・班長へ）",
            date: "2026-11-20",
            leadDays: 7,
            memberIds: ["m-self"],
            source: { location: "表の下の※（1つ目）", quote: "27（金）の分は 11月20日（金）まで" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-lease",
        title: "賃貸住宅 契約書",
        category: "housing",
        memberIds: [],
        householdWide: true,
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
            memberIds: [],
            source: { location: "第2条" },
          },
          {
            id: "dl-lease-notice",
            kind: "notice",
            label: "更新するかどうかの申し出（管理会社へ）",
            date: ymd(addDays(t.leaseEnd, -30)),
            leadDays: 30,
            memberIds: [],
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
        memberIds: [],
        householdWide: true,
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
            memberIds: [],
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
        memberIds: [],
        householdWide: true,
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル",
        originalText: fireInsuranceText(t),
        summary: {
          what: "住まいの火災保険（家財）の保険証券です。保険期間は2年。",
          todo: "継続しない場合は、満期日の1か月前までに連絡する（何もしなければ自動で継続する）。",
          ifIgnored: {
            text: "申し出がなければ、同じ内容で自動継続する",
            source: { location: "満期について", quote: "お申し出がない場合は、同じ内容で自動継続します。" },
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
            value: "満期日の約1か月前に継続の案内が届く。申し出がなければ同じ内容で自動継続。継続しない場合は満期日の1か月前までに連絡",
            source: { location: "満期について", quote: "継続しない場合は、満期日の1か月前までにご連絡ください。" },
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
            label: "火災保険の満期（申し出がなければ自動継続）",
            date: ymd(t.fireInsuranceEnd),
            leadDays: 60,
            awareness: true,
            memberIds: [],
            source: { location: "保険期間" },
          },
          {
            id: "dl-fire-insurance-notice",
            kind: "notice",
            label: "火災保険を継続しない場合の申し出の締切",
            date: ymd(new Date(t.fireInsuranceEnd.getFullYear(), t.fireInsuranceEnd.getMonth() - 1, t.fireInsuranceEnd.getDate())),
            leadDays: 21,
            leadReason: "継続しないなら、満期日の1か月前までに連絡する（何もしなければ自動継続）",
            memberIds: [],
            source: { location: "満期について", quote: "継続しない場合は、満期日の1か月前までにご連絡ください。" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      // ---- けがの場面の書類（「その写真は前に送ってあるはず」。確定済み） ----
      {
        id: "doc-school-injury-benefit",
        title: "学校でのけがの給付について（お知らせ）",
        category: "school",
        docType: "学校のけがの給付のお知らせ",
        memberIds: ["m-son"],
        periodLabel: `${wareki(y)}年4月10日 発行`,
        validFrom: `${y}-04-10`,
        origin: "demo",
        storageLocation: "冷蔵庫の横のファイル（学校のプリント）",
        originalText: schoolInjuryBenefitText(t),
        summary: {
          what: "学校の管理下でのけがのとき、学校安全互助会の給付の手続きを知らせるお知らせです。",
          todo: "受診したら担任か保健室へ連絡し、受診報告書を医療機関で書いてもらって保健室へ出す。",
          ifIgnored: {
            text: "けがをした日から2年以内に手続きをしないと、給付を受けられなくなる",
            source: { location: "４．期限", quote: "けがをした日から2年以内に手続きをしないと、給付を受けられなくなります" },
          },
        },
        fields: [
          { key: "f-target", label: "対象", value: "学校の管理下（授業中・休み時間・学校行事・登下校中など）で起きたけが", source: { location: "１．対象", quote: "学校の管理下（授業中、休み時間、学校行事、登下校中など）で起きたけが" }, status: "confirmed" },
          { key: "f-benefit", label: "給付の条件", value: "保険診療分の支払いの合計が1つのけがにつき3,000円以上。有無と額は互助会が決める", source: { location: "２．給付", quote: "1つのけがにつき3,000円以上になったときに、互助会の基準で見舞金が支給されます。給付の有無と額は互助会が決めます" }, status: "confirmed" },
          { key: "f-steps", label: "手続きの順番", value: "①担任か保健室へ連絡 ②受診報告書の用紙を受け取る ③医療機関で記入（1か月ごとに1枚）④保健室へ出す", source: { location: "３．手続き", quote: "けがをして受診したら、担任または保健室へご連絡ください" }, status: "confirmed" },
          { key: "f-limit", label: "期限", value: "けがをした日から2年以内に手続きをする", source: { location: "４．期限", quote: "けがをした日から2年以内に手続きをしないと" }, status: "confirmed" },
          { key: "f-slip", label: "けがの連絡票", value: "きりとり線の下。年・組・名前、けがをした日、場所・様子、医療機関、保護者の連絡先を書いて担任か保健室へ", source: { location: "きりとり線の下", quote: "けがの連絡票（受診したら、担任または保健室へお出しください）" }, status: "confirmed" },
        ],
        contacts: [
          { label: "最初の連絡", name: "くろうど第一小学校 保健室（養護教諭 葉見）", phone: "000-0000-0000", hours: "平日 8:00〜17:00", source: { location: "５．問い合わせ" } },
          { label: "互助会", name: "くろうど市 学校安全互助会 事務局（架空）", phone: "000-0000-0013", hours: "平日 9:00〜16:00", source: { location: "５．問い合わせ" } },
        ],
        deadlines: [],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-injury-insurance",
        title: "こもれび損害保険 家族傷害保険 保険証券",
        category: "insurance",
        docType: "傷害保険の証券",
        memberIds: ["m-self", "m-spouse", "m-son", "m-daughter"],
        householdWide: true,
        periodLabel: `保険期間 ${wareki(y)}年6月10日〜${wareki(y + 1)}年6月10日`,
        validFrom: `${y}-06-10`,
        validUntil: `${y + 1}-06-10`,
        origin: "demo",
        storageLocation: "書類棚 2段目の青いファイル",
        originalText: injuryPolicyText(t),
        summary: {
          what: "翔太さんが契約している家族傷害保険の証券です。補償を受けられる方の範囲が家族の続柄で書かれています。",
          todo: "けがのときは、事故の日を含めて30日以内に事故受付センターへ連絡する。",
          ifIgnored: {
            text: "保険金を請求できる期間は、事故の日の翌日から3年間",
            source: { location: "重要事項 4", quote: "保険金を請求できる期間は、事故の日の翌日から3年間です" },
          },
        },
        fields: [
          { key: "f-range", label: "補償を受けられる方の範囲", value: "記名被保険者、その配偶者、同居している親族、別居している未婚の子（名前ではなく続柄で書かれている）", source: { location: "補償を受けられる方の範囲", quote: "記名被保険者、その配偶者、記名被保険者または配偶者と同居している親族、別居している未婚の子" }, status: "confirmed" },
          { key: "f-outpatient", label: "通院保険金", value: "日額 1,000円（事故の日から180日以内の通院、90日分まで）", source: { location: "補償の内容・通院保険金", quote: "事故の日から180日以内の通院、90日分まで" }, status: "confirmed" },
          { key: "f-report", label: "事故の連絡の期限", value: "事故の日を含めて30日以内に、事故受付センターへ連絡する", source: { location: "重要事項 1", quote: "その日を含めて30日以内に、事故受付センターへご連絡ください" }, status: "confirmed" },
          { key: "f-claim", label: "請求できる期間", value: "事故の日の翌日から3年間", source: { location: "重要事項 4", quote: "事故の日の翌日から3年間です" }, status: "confirmed" },
          { key: "f-docs", label: "請求に必要なもの", value: "保険金請求書、事故の状況がわかるもの、通院した日がわかる書類（領収書のコピーなど）", source: { location: "重要事項 3", quote: "保険金請求書、事故の状況がわかるもの、通院した日がわかる書類（領収書のコピーなど）" }, status: "confirmed" },
          { key: "f-judge", label: "対象になるかの判断", value: "連絡の内容を確認したうえで保険会社が判断する", source: { location: "重要事項 5", quote: "補償の対象になるかどうかは、ご連絡の内容を確認したうえで当社が判断します" }, status: "confirmed" },
          { key: "f-renew", label: "更新", value: "満期の1か月前までに申し出がなければ同じ内容で自動更新", source: { location: "更新", quote: "満期の1か月前までにお申し出がない場合は、同じ内容で自動更新" }, status: "confirmed" },
        ],
        contacts: [
          { label: "事故のご連絡", name: "こもれび損害保険 事故受付センター（架空）", phone: "000-0000-0012", hours: "24時間・年中無休", source: { location: "重要事項の下" } },
          { label: "ご契約内容のお問い合わせ", name: "こもれび損害保険（架空）", phone: "000-0000-0016", hours: "平日 9:00〜17:00", source: { location: "重要事項の下" } },
        ],
        deadlines: [
          {
            id: "dl-injury-insurance-end",
            kind: "expiry",
            label: "家族傷害保険の保険期間の終わり",
            date: `${y + 1}-06-10`,
            time: "16:00",
            repeatMonths: 12,
            leadDays: 45,
            leadReason: "満期の1か月前までに申し出がなければ自動更新",
            memberIds: ["m-self", "m-spouse", "m-son", "m-daughter"],
            source: { location: "保険期間", quote: `${wareki(y + 1)}年6月10日 午後4時` },
          },
          {
            id: "dl-injury-insurance-notice",
            kind: "notice",
            label: "家族傷害保険を更新しないときの申し出（満期の1か月前まで）",
            date: `${y + 1}-05-10`,
            leadDays: 21,
            memberIds: ["m-self", "m-spouse", "m-son", "m-daughter"],
            source: { location: "更新", quote: "満期の1か月前までにお申し出がない場合は、同じ内容で自動更新" },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-medical-card",
        title: "くろうど市 子ども医療費受給者証（蓮）",
        category: "medical_card",
        docType: "子ども医療費受給者証",
        memberIds: ["m-son"],
        periodLabel: `有効期間 ${wareki(y)}年4月1日〜${wareki(y + 1)}年3月31日`,
        validFrom: `${y}-04-01`,
        validUntil: `${y + 1}-03-31`,
        origin: "demo",
        storageLocation: "母子手帳ケースの中（玄関の棚）",
        originalText: medicalCardText(t),
        summary: {
          what: "くろうど市の、蓮さんの子ども医療費受給者証です。",
          todo: "受診のときは、保険証などと一緒に窓口に出す。",
        },
        fields: [
          { key: "f-number", label: "受給者番号", value: "DEMO-0000-1234", source: { location: "おもて・受給者番号", quote: "DEMO-0000-1234" }, status: "confirmed" },
          { key: "f-copay", label: "一部負担金", value: "通院 1回 200円 ／ 入院 1日 500円", source: { location: "おもて・一部負担金", quote: "通院 1回 200円　／　入院 1日 500円" }, status: "confirmed" },
          { key: "f-use", label: "使い方", value: "保険証などと一緒に医療機関の窓口に出す", source: { location: "うら・ご注意 1", quote: "健康保険の資格確認書類（保険証など）と一緒に窓口に出してください" }, status: "confirmed" },
          { key: "f-refund", label: "市外で出せなかったとき", value: "いったん支払い、領収書を持って子育て支援課で払い戻しの申請（受診した日の翌日から1年以内）", source: { location: "うら・ご注意 2", quote: "受診した日の翌日から1年以内" }, status: "confirmed" },
        ],
        contacts: [
          { label: "受給者証のお問い合わせ", name: "くろうど市 子育て支援課（架空）", phone: "000-0000-0011", hours: "平日 8:30〜17:15", source: { location: "うら・最下段" } },
        ],
        deadlines: [
          {
            id: "dl-medical-card-end",
            kind: "expiry",
            label: "子ども医療費受給者証の有効期間の終わり",
            date: `${y + 1}-03-31`,
            repeatMonths: 12,
            leadDays: 14,
            leadReason: "次の年度の受給者証は3月中に郵送される（うら・ご注意 4）",
            memberIds: ["m-son"],
            source: { location: "おもて・有効期間", quote: `${wareki(y + 1)}年3月31日 まで` },
          },
        ],
        createdAt,
        confirmedAt: createdAt,
      },
      {
        id: "doc-nursery-guide",
        title: "こぐま保育園 入園のしおり（12 園でけがをしたとき）",
        category: "childcare",
        docType: "保育園のしおり",
        memberIds: ["m-daughter"],
        periodLabel: `${wareki(y)}年度`,
        validFrom: `${y}-04-01`,
        validUntil: `${y + 1}-03-31`,
        origin: "demo",
        storageLocation: "本棚の保育園のファイル",
        originalText: nurseryGuideText(t),
        summary: {
          what: "結衣さんの保育園で、けがや急な病気のときにどうするかのページです。",
          todo: "園でのけがは、領収書のコピーを受診した月の翌月10日までに園へ出す。",
        },
        fields: [
          { key: "f-bring", label: "受診のときに持つもの", value: "健康保険の資格確認書類（保険証など）、子ども医療費受給者証", source: { location: "12．園でけがをしたとき", quote: "健康保険の資格確認書類（保険証など）と子ども医療費受給者証をお持ちください" }, status: "confirmed" },
          { key: "f-mimai", label: "見舞金の制度", value: "くろうど市 保育施設 けがの見舞金制度（架空）。手続きは園が行う", source: { location: "12．けがの見舞金の手続き", quote: "手続きは園が行います" }, status: "confirmed" },
          { key: "f-mimai-limit", label: "見舞金の手続きの期限", value: "医療機関の領収書のコピーを、受診した月の翌月10日までに園へ", source: { location: "12．けがの見舞金の手続き", quote: "受診した月の翌月10日までに園へお出しください" }, status: "confirmed" },
          { key: "f-other", label: "ほかの施設のけが", value: "小学校など、ほかの施設でのけがの手続きとは別", source: { location: "最下段の※", quote: "小学校など、ほかの施設でのけがの手続きとは別です" }, status: "confirmed" },
        ],
        contacts: [
          { label: "保育園", name: "こぐま保育園（架空）", phone: "000-0000-0015", hours: "7:00〜19:00", source: { location: "最下段" } },
        ],
        deadlines: [],
        createdAt,
        confirmedAt: createdAt,
      },
      ...pre.documents,
    ],
    done: Object.keys(pre.done).length ? pre.done : undefined,
    expected: [
      {
        id: "exp-open-class-notice",
        label: "授業参観の案内プリント",
        // ふつうの入口では、案内プリント（写真の見本 o9）をもう預かっている（/?demo=few では、まだ届いていない）
        receivedDocumentId: pre.documents.find((d) => d.id === "doc-o9-sankan-annai")?.id,
        expectedBy: ymd(today),
        relatedDeadlineId: "dl-open-class",
        missingWhat: "時間や教室",
        basisLocation: "これからのおもな予定・授業参観（2学期）の※",
      },
    ],
    demoSamples: [
      // 授業参観の案内プリントは、ふつうの入口では写真の見本（o9）をもう預かっているので、文字の見本は /?demo=few のときだけ（「まだ届いていない」の声かけから渡す）
      ...(pre.documents.some((d) => d.id === "doc-o9-sankan-annai")
        ? []
        : [
          {
            id: "sample-open-class",
            title: "授業参観のご案内（架空）",
            text: openClassNoticeText(t),
            expectedId: "exp-open-class-notice",
            provisionalDraft: openClassNoticeProvisionalDraft(t),
          },
          ]),
      {
        id: "sample-dental",
        title: "2歳児歯科健康診査のご案内（架空）",
        text: dentalCheckupText(today),
        provisionalDraft: dentalCheckupProvisionalDraft(today),
      },
      {
        id: "sample-annual-revised",
        title: "年間行事予定の改訂版（架空）",
        text: revisedSchoolAnnualText(t),
        provisionalDraft: revisedSchoolAnnualProvisionalDraft(t),
      },
      {
        id: "sample-subscription",
        title: "サブスクの契約画面（架空）",
        text: subscriptionText(t),
        provisionalDraft: subscriptionProvisionalDraft(t),
      },
      // 写真の見本（本物らしい紙・スクショ・スキャン。撮影日を基準日にした日付で、開いた日に合わせて動かない）
      ...photoSamples,
    ],
    questions: [],
    rules: [
      {
        id: "rule-leave",
        label: "休みの申請（勤務先）",
        daysBefore: 7,
        memberId: "m-self",
        note: "勤務先のきまりで、休みの申請は遅くとも1週間前まで",
      },
      {
        id: "rule-leave-spouse",
        label: "休みの申請（タオの勤務先）",
        daysBefore: 7,
        memberId: "m-spouse",
        note: "タオの勤務先のきまりで、休みの申請は遅くとも1週間前まで",
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
  return { ...household, documents: household.documents.map(withDemoShare) };
}

/**
 * 見本の家族の「誰と共有するか」。この家では、子ども・学校・保育園・地域のこと・タオさんの書類はタオさんと共有し、
 * 翔太さんだけの書類（給与・税金・年金など）と、住まい・車の契約は共有しない（自分だけ）にしている、という設定。
 * 🔴 実際に使うときは、配偶者でも自動では共有しない（書類ごとにあなたが選ぶ）
 */
function withDemoShare(doc: Household["documents"][number]): Household["documents"][number] {
  if (doc.notForFamily) return doc;
  const forFamily =
    ["school", "childcare", "community", "medical", "medical_card"].includes(doc.category) ||
    doc.memberIds.some((id) => id === "m-spouse" || id === "m-son" || id === "m-daughter");
  return { ...doc, sharedWith: forFamily ? ["m-spouse"] : [] };
}
