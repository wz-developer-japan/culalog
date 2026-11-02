// 「つなぐ」と「ひとこと」（サーバーとブラウザで共通）。
// Claude には、コードが作った候補・確定した書類・わが家のきまりを渡し、
//   1. ひとことに何を選び、どう言うか（候補の ID を選ぶだけ。日付はコードが持っている）
//   2. 書類同士・きまりをつないで気づいたこと（予定・きまり・書類の ID で返す）
// を返させる。返ってきたものはコードで確かめる（ID が実在するか・文の中の日付が合っているか・
// 新旧の日付が本当に違うか・判断の言い回しが無いか）。合わないものは外し、外した数も画面に出す。
// 採用するかは本人が決める。

import type { Candidate } from "./butler";
import { formatYmd, parseDate, ruleDeadlines } from "./deadlines";
import type { Deadline, DocumentRecord, Household } from "./types";

export type InsightKind = "apply_rule" | "apply_rule_to_reserve" | "date_changed" | "other";

/** 気づいたこと（確かめたあと・画面に出す形） */
export interface Insight {
  /** 採用／違う の答えを覚えるための、内容から決まる鍵 */
  key: string;
  kind: InsightKind;
  text: string;
  /** apply_rule / apply_rule_to_reserve: どの予定に、どのきまりを当てはめるか */
  deadlineId?: string;
  ruleId?: string;
  /** date_changed: 新しい書類の予定と、前の書類の予定 */
  oldDeadlineId?: string;
  /** date_changed: コードが書類から作った「前 → 新」の1行 */
  change?: string;
  /** 根拠（どの書類のどこか） */
  evidence: { documentId: string; documentTitle: string; location: string }[];
}

export interface ConnectResult {
  source: "claude" | "provisional";
  /** その日に作った（YYYY-MM-DD） */
  createdOn: string;
  /** 何をもとに作ったか（書類・きまり・答えが変わったら作り直す） */
  basis: string;
  briefing: { candidateId: string; text: string }[];
  insights: Insight[];
  /** コードの確かめで外したものの数 */
  dropped: number;
}

// ---- Claude に渡す形 ----

export interface ConnectInput {
  today: string;
  /** 架空の家族か（サーバーの設定で、デモの家族だけ Claude を呼ばないようにできる。Claude には送らない） */
  demo: boolean;
  /** 口調（キャラの種類の説明だけ。名前は入れない） */
  style: string;
  family: { id: string; name: string; relation: string; note: string }[];
  rules: { id: string; label: string; daysBefore: number; memberId: string; note: string }[];
  documents: {
    id: string;
    title: string;
    docType: string;
    period: string;
    memberIds: string[];
    /** この書類が、別の書類（id）の前のもの（比べるだけに使い、ひとことの根拠にしない） */
    olderVersionOf: string;
    fields: { label: string; value: string; location: string }[];
    deadlines: {
      id: string;
      kind: string;
      label: string;
      date: string;
      endDate: string;
      time: string;
      place: string;
      needs: string[];
      location: string;
      appliedRuleIds: string[];
      reserve: { date: string; condition: string; location: string; appliedRuleIds: string[] } | null;
    }[];
  }[];
  candidates: { id: string; title: string; detail: string; why: string; urgent: boolean; followUp: string }[];
  /** 本人が「違う」と言った気づき（同じことを言わない） */
  rejected: string[];
}

const str = { type: "string" } as const;

/** Claude の構造化出力に渡す JSON Schema */
export const CONNECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["briefing", "insights"],
  properties: {
    briefing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["candidateId", "text"],
        properties: { candidateId: str, text: str },
      },
    },
    insights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "deadlineId", "ruleId", "oldDeadlineId", "evidence"],
        properties: {
          kind: { type: "string", enum: ["apply_rule", "apply_rule_to_reserve", "date_changed", "other"] },
          text: str,
          deadlineId: str,
          ruleId: str,
          oldDeadlineId: str,
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["documentId", "location"],
              properties: { documentId: str, location: str },
            },
          },
        },
      },
    },
  },
} as const;

/** 送る前に番号を伏せる（証券番号・受給者番号・長い数字の並び）。電話番号はつなぐのに使わないので送らない */
export function maskNumbers(label: string, value: string): string {
  if (/番号|ID|記号/.test(label)) return "（伏せています）";
  return value.replace(/[0-9０-９][0-9０-９\-－ ]{7,}[0-9０-９]/g, "（伏せています）");
}

/** 根拠に使う書類（確定した・前のものではない）と、比べるためだけに送る前の書類 */
function documentsForConnect(household: Household): { doc: DocumentRecord; olderVersionOf: string }[] {
  const confirmed = household.documents.filter((d) => d.confirmedAt);
  const current = confirmed.filter((d) => !d.supersededBy);
  // 前のもの: 「前のものにした」書類と、「前のものにしますか？」とまだ聞いている書類
  const older = new Map<string, string>();
  for (const d of confirmed) if (d.supersededBy) older.set(d.id, d.supersededBy);
  for (const q of household.questions ?? []) {
    if (q.about === "supersede" && !q.answeredAt && q.targetDocumentId) older.set(q.targetDocumentId, q.documentId);
  }
  return [
    ...current.filter((d) => !older.has(d.id)).map((doc) => ({ doc, olderVersionOf: "" })),
    ...confirmed.filter((d) => older.has(d.id)).map((doc) => ({ doc, olderVersionOf: older.get(doc.id)! })),
  ];
}

export function buildConnectInput(
  household: Household,
  candidates: Candidate[],
  today: string,
  style: string,
): ConnectInput {
  const rejected = Object.entries(household.insightAnswers ?? {})
    .filter(([, a]) => a === "rejected")
    .map(([key]) => key);
  return {
    today,
    demo: household.isDemo,
    style,
    family: household.members.map((m) => ({
      id: m.id,
      name: m.name,
      relation: m.roleLabel ?? m.relation,
      note: m.note ?? "",
    })),
    rules: (household.rules ?? []).map((r) => ({
      id: r.id,
      label: r.label,
      daysBefore: r.daysBefore,
      memberId: r.memberId,
      note: r.note ?? "",
    })),
    documents: documentsForConnect(household).map(({ doc, olderVersionOf }) => ({
      id: doc.id,
      title: doc.title,
      docType: doc.docType ?? "",
      period: doc.periodLabel ?? "",
      memberIds: doc.memberIds,
      olderVersionOf,
      fields: doc.fields.map((f) => ({ label: f.label, value: maskNumbers(f.label, f.value), location: f.source?.location ?? "" })),
      deadlines: doc.deadlines.map((d) => ({
        id: d.id,
        kind: d.kind,
        label: d.label,
        date: d.date,
        endDate: d.endDate ?? "",
        time: d.time ?? "",
        place: d.place ?? "",
        needs: d.needs ?? [],
        location: d.source?.location ?? "",
        appliedRuleIds: d.applyRuleIds ?? [],
        reserve: d.reserve
          ? {
              date: d.reserve.date,
              condition: d.reserve.condition ?? "",
              location: d.reserve.source?.location ?? "",
              appliedRuleIds: d.reserve.applyRuleIds ?? [],
            }
          : null,
      })),
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      title: c.title,
      detail: c.detail ?? "",
      why: c.why ?? "",
      urgent: c.urgent,
      followUp: c.followUp?.label ?? "",
    })),
    rejected,
  };
}

/**
 * 作り直すかどうかを決める鍵。書類・きまり・家族・話し方が変わったら作り直す。
 * 今日の日付・候補は含めない（日付が変わったら別に作り直す）。「違う」の答えも含めない
 * （答えるたびに呼ばないため。違うと言った気づきは画面の側で出さない）
 */
export function basisOf(input: ConnectInput): string {
  const { today: _today, candidates: _candidates, rejected: _rejected, ...rest } = input;
  void _today;
  void _candidates;
  void _rejected;
  const text = JSON.stringify(rest);
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}-${(h >>> 0).toString(36)}`;
}

// ---- コードでの確かめ ----

/** 判断・当てはめの言い回し（出さない） */
const JUDGMENT = /(補償され|保険(金)?が(使え|おり|下り|出)|お金が(出|戻)|受診(すべき|してください|した方)|解約(すべき|した方)|お得|損です|違法|訴え)/;

/** 文の中の日付（「12月1日」「15日（日）」）が、その場面の日付に入っているか */
export function datesAreKnown(text: string, ymds: string[]): boolean {
  const known = ymds.filter(Boolean).map((y) => parseDate(y));
  for (const m of text.matchAll(/(\d{1,2})月(\d{1,2})日/g)) {
    const [mo, d] = [Number(m[1]), Number(m[2])];
    if (!known.some((k) => k.getMonth() + 1 === mo && k.getDate() === d)) return false;
  }
  // 月の無い「15日（日）」の形
  for (const m of text.replace(/\d{1,2}月\d{1,2}日/g, "").matchAll(/(\d{1,2})日（/g)) {
    const d = Number(m[1]);
    if (!known.some((k) => k.getDate() === d)) return false;
  }
  return true;
}

const range = (d: { date: string; endDate?: string }) =>
  d.endDate ? `${formatYmd(d.date)}〜${formatYmd(d.endDate)}` : formatYmd(d.date);

export const insightKey = (kind: string, deadlineId: string, ruleId: string, oldDeadlineId: string) =>
  [kind, deadlineId, ruleId, oldDeadlineId].join("|");

interface RawInsight {
  kind: string;
  text: string;
  deadlineId: string;
  ruleId: string;
  oldDeadlineId: string;
  evidence: { documentId: string; location: string }[];
}

/** Claude（または仮）の答えを確かめて、画面に出せる形にする */
export function verifyConnect(
  raw: unknown,
  household: Household,
  candidates: Candidate[],
  meta: { source: "claude" | "provisional"; createdOn: string; basis: string },
): ConnectResult | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as { briefing?: unknown; insights?: unknown };
  if (!Array.isArray(v.briefing) || !Array.isArray(v.insights)) return null;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  let dropped = 0;

  // ひとこと: 候補の中から選んだものだけ・日付が合うものだけ。合わなければ外す（安全網と仮の並びが拾う）
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const briefing: ConnectResult["briefing"] = [];
  for (const b of v.briefing.slice(0, 5)) {
    const c = byId.get(s(b?.candidateId));
    const text = s(b?.text).slice(0, 160);
    if (!c || !text || briefing.some((x) => x.candidateId === c.id)) {
      dropped++;
      continue;
    }
    if (JUDGMENT.test(text) || !datesAreKnown(text, c.dates)) {
      dropped++;
      continue;
    }
    briefing.push({ candidateId: c.id, text });
  }

  // 気づいたこと
  const docs = household.documents;
  const findDeadline = (id: string) => {
    for (const doc of docs) {
      const d = doc.deadlines.find((x) => x.id === id);
      if (d) return { doc, d };
    }
    return undefined;
  };
  const rules = household.rules ?? [];
  const answers = household.insightAnswers ?? {};
  const insights: Insight[] = [];
  for (const r of v.insights.slice(0, 6) as RawInsight[]) {
    const kind = s(r?.kind) as InsightKind;
    const text = s(r?.text).slice(0, 220);
    const deadlineId = s(r?.deadlineId);
    const ruleId = s(r?.ruleId);
    const oldDeadlineId = s(r?.oldDeadlineId);
    const evidence = (Array.isArray(r?.evidence) ? r.evidence : [])
      .map((e) => ({ documentId: s(e?.documentId), location: s(e?.location) }))
      .map((e) => ({ ...e, doc: docs.find((d) => d.id === e.documentId) }))
      .filter((e) => e.doc)
      .map((e) => ({ documentId: e.documentId, documentTitle: e.doc!.title, location: e.location }));
    // other は予定・きまりの ID を持たないので、根拠の書類の組み合わせを鍵にする（同じ書類の組の気づきは1つ）
    const key =
      kind === "other"
        ? insightKey(kind, "", "", [...new Set(evidence.map((e) => e.documentId))].sort().join(","))
        : insightKey(kind, deadlineId, ruleId, oldDeadlineId);
    const ok = (() => {
      if (!text || JUDGMENT.test(text) || answers[key] || insights.some((i) => i.key === key)) return false;
      if (kind === "apply_rule" || kind === "apply_rule_to_reserve") {
        const found = findDeadline(deadlineId);
        const rule = rules.find((x) => x.id === ruleId);
        if (!found || !rule || found.d.kind !== "event" || found.doc.supersededBy || !found.doc.confirmedAt) return false;
        if (kind === "apply_rule" && found.d.applyRuleIds?.includes(ruleId)) return false;
        if (kind === "apply_rule_to_reserve" && (!found.d.reserve || found.d.reserve.applyRuleIds?.includes(ruleId))) return false;
        // 文に出てよい日付: 予定・予備日・当てはめたときの締切
        const trial: Deadline = {
          ...found.d,
          applyRuleIds: [ruleId],
          reserve: found.d.reserve ? { ...found.d.reserve, applyRuleIds: [ruleId] } : undefined,
        };
        const dates = [found.d.date, found.d.endDate ?? "", found.d.reserve?.date ?? "", ...ruleDeadlines(trial, rules).map((x) => x.date)];
        return datesAreKnown(text, dates);
      }
      if (kind === "date_changed") {
        const now = findDeadline(deadlineId);
        const before = findDeadline(oldDeadlineId);
        if (!now || !before || now.doc.id === before.doc.id) return false;
        if (now.d.date === before.d.date && (now.d.endDate ?? "") === (before.d.endDate ?? "")) return false; // 日付が同じなら違いではない
        return datesAreKnown(text, [now.d.date, now.d.endDate ?? "", before.d.date, before.d.endDate ?? ""]);
      }
      if (kind === "other") return evidence.length > 0 && datesAreKnown(text, docs.flatMap((d) => d.deadlines.flatMap((x) => [x.date, x.endDate ?? "", x.reserve?.date ?? ""])));
      return false;
    })();
    if (!ok) {
      dropped++;
      continue;
    }
    const insight: Insight = { key, kind, text, evidence };
    if (kind === "apply_rule" || kind === "apply_rule_to_reserve") {
      insight.deadlineId = deadlineId;
      insight.ruleId = ruleId;
    }
    if (kind === "date_changed") {
      const now = findDeadline(deadlineId)!;
      const before = findDeadline(oldDeadlineId)!;
      insight.deadlineId = deadlineId;
      insight.oldDeadlineId = oldDeadlineId;
      insight.change = `${now.d.label}: ${range(before.d)} → ${range(now.d)}`;
      // 根拠は両方の原本（コードで足す）
      for (const { doc, d } of [before, now]) {
        if (!insight.evidence.some((e) => e.documentId === doc.id)) {
          insight.evidence.push({ documentId: doc.id, documentTitle: doc.title, location: d.source?.location ?? "" });
        }
      }
    }
    insights.push(insight);
  }
  return { ...meta, briefing: briefing.slice(0, 3), insights, dropped };
}

// ---- Claude の準備中（キーが無いとき）に使う、仮のつなぐ ----

/**
 * 前のものと新しいものの、同じ名前の予定の日付をコードで比べる（Claude は使っていない）。
 * デモの家族では、運動会の予備日ときまりの例も、用意しておいた仮の気づきとして出す。
 */
export function provisionalConnect(household: Household): { briefing: []; insights: RawInsight[] } {
  const insights: RawInsight[] = [];
  const confirmed = household.documents.filter((d) => d.confirmedAt);
  const pairs = documentsForConnect(household).filter((x) => x.olderVersionOf);
  for (const { doc: old, olderVersionOf } of pairs) {
    const now = confirmed.find((d) => d.id === olderVersionOf);
    if (!now) continue;
    for (const d of now.deadlines) {
      const before = old.deadlines.find((x) => x.label === d.label);
      if (!before || (before.date === d.date && (before.endDate ?? "") === (d.endDate ?? ""))) continue;
      insights.push({
        kind: "date_changed",
        text: `「${now.title}」で、${d.label}の日付が変わっています（${range(before)} → ${range(d)}）。`,
        deadlineId: d.id,
        ruleId: "",
        oldDeadlineId: before.id,
        evidence: [],
      });
    }
  }
  insights.push(...provisionalInsuranceBeforeLease(household));
  if (household.isDemo) {
    const rule = household.rules?.find((r) => r.id === "rule-leave");
    const notice = confirmed.find((d) => !d.supersededBy && d.expectedId === "exp-sports-day-notice");
    const sports = notice?.deadlines.find((d) => d.kind === "event" && d.reserve);
    if (rule && notice && sports) {
      const self = household.members.find((m) => m.id === rule.memberId);
      const first = self?.name.split(/\s+/).pop() ?? "";
      if (!sports.applyRuleIds?.includes(rule.id)) {
        insights.push({
          kind: "apply_rule",
          text: `運動会は${formatYmd(sports.date)}です。${first}さんは土日も勤務があるので、この日もお仕事なら「${rule.label}」が要るかもしれません。`,
          deadlineId: sports.id,
          ruleId: rule.id,
          oldDeadlineId: "",
          evidence: [{ documentId: notice.id, location: sports.source?.location ?? "" }],
        });
      } else {
        insights.push({
          kind: "apply_rule_to_reserve",
          text: `雨なら${formatYmd(sports.reserve!.date)}に順延です。日曜もお仕事なら、そちらの休みも要るかもしれません。`,
          deadlineId: sports.id,
          ruleId: rule.id,
          oldDeadlineId: "",
          evidence: [{ documentId: notice.id, location: sports.reserve!.source?.location ?? "" }],
        });
      }
    }
  }
  return { briefing: [], insights };
}

/**
 * 住まいの契約（賃貸など）の満了より先に、その契約が「期間中は続ける」と書いている保険の満期が来る、をコードで見つける
 * （Claude は使っていない。本物の執事は、同じつながりを other の気づきとして自分で見つける）。
 * 出すのは「先に来る」という事実と原本の場所まで。更新すべきかどうかは言わない。
 */
function provisionalInsuranceBeforeLease(household: Household): RawInsight[] {
  const current = household.documents.filter((d) => d.confirmedAt && !d.supersededBy);
  const out: RawInsight[] = [];
  for (const home of current.filter((d) => d.category === "housing")) {
    const homeEnd = home.deadlines.find((d) => d.kind === "expiry");
    const clause = home.fields.find((f) => /保険/.test(`${f.label}${f.value}`));
    if (!homeEnd || !clause) continue;
    for (const policy of current.filter((d) => d.category === "insurance" && d.memberIds.some((m) => home.memberIds.includes(m)))) {
      const policyEnd = policy.deadlines.find((d) => d.kind === "expiry");
      if (!policyEnd || policyEnd.date >= homeEnd.date) continue;
      out.push({
        kind: "other",
        text: `「${policy.title}」の${policyEnd.label}（${formatYmd(policyEnd.date)}）は、「${home.title}」の${homeEnd.label}（${formatYmd(homeEnd.date)}）より先に来ます。契約書には「${clause.value}」とあります。先に保険のほうを確かめておくとよいかもしれません。`,
        deadlineId: "",
        ruleId: "",
        oldDeadlineId: "",
        evidence: [
          { documentId: policy.id, location: policyEnd.source?.location ?? "" },
          { documentId: home.id, location: clause.source?.location ?? "" },
        ],
      });
    }
  }
  return out;
}

/** 気づいたことを採用する（当てはめは決まった操作。日付はきまりから毎回計算する） */
export function adoptInsight(household: Household, insight: Insight): Household {
  const answers = { ...(household.insightAnswers ?? {}), [insight.key]: "adopted" as const };
  const documents = household.documents.map((doc) => ({
    ...doc,
    deadlines: doc.deadlines.map((d) => {
      if (d.id !== insight.deadlineId || !insight.ruleId) return d;
      if (insight.kind === "apply_rule") {
        return { ...d, applyRuleIds: [...new Set([...(d.applyRuleIds ?? []), insight.ruleId])] };
      }
      if (insight.kind === "apply_rule_to_reserve" && d.reserve) {
        return { ...d, reserve: { ...d.reserve, applyRuleIds: [...new Set([...(d.reserve.applyRuleIds ?? []), insight.ruleId])] } };
      }
      return d;
    }),
  }));
  return { ...household, documents, insightAnswers: answers };
}

/** 「違う」「分かった」: もう出さない（違うと言ったものは、次から Claude にも伝える） */
export function answerInsight(household: Household, insight: Insight, answer: "rejected" | "seen"): Household {
  return { ...household, insightAnswers: { ...(household.insightAnswers ?? {}), [insight.key]: answer } };
}
