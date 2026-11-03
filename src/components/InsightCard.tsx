"use client";

// 執事が、書類同士・きまりをつないで気づいたこと。採用するかは本人が決める。

import Link from "next/link";
import type { Insight } from "@/lib/connect";
import type { HouseRule } from "@/lib/types";

export function InsightCard({
  insight,
  rules,
  provisional,
  onAdopt,
  onAnswer,
}: {
  insight: Insight;
  rules: HouseRule[];
  /** Claude ではなく、仮のもの */
  provisional: boolean;
  onAdopt: () => void;
  onAnswer: (answer: "rejected" | "seen" | "declined") => void;
}) {
  const rule = rules.find((r) => r.id === insight.ruleId);
  const actionable = (insight.kind === "apply_rule" || insight.kind === "apply_rule_to_reserve") && rule;

  return (
    <div className="card insight">
      <div className="insight-text">{insight.text}</div>
      {insight.change && <div className="insight-change">{insight.change}</div>}
      {insight.evidence.map((e) => (
        <div className="meta" key={`${e.documentId}-${e.location}`}>
          原本: <Link href={`/documents/${e.documentId}`}>{e.documentTitle}</Link>
          {e.location && `・${e.location}`}
        </div>
      ))}
      <div className="meta">
        {provisional ? "仮の気づきです。" : "執事（Claude）の提案です。"}
        採用するかは、あなたが決めます。
      </div>
      <div className="row-actions">
        {actionable && insight.kind === "apply_rule" ? (
          // 行事に行くかどうかで決まる: 行くと決めつけず、聞く
          <>
            <button className="button small" onClick={onAdopt}>
              行く（「{rule.label}」の締切を予定に入れる）
            </button>
            <button className="button small secondary" onClick={() => onAnswer("declined")}>
              行かない
            </button>
          </>
        ) : actionable ? (
          <button className="button small" onClick={onAdopt}>
            採用する（{insight.kind === "apply_rule_to_reserve" ? "予備日にも" : ""}「{rule.label}」を当てはめる）
          </button>
        ) : (
          <button className="button small secondary" onClick={() => onAnswer("seen")}>
            分かった
          </button>
        )}
        <button className="link-button" onClick={() => onAnswer("rejected")}>
          違う
        </button>
      </div>
    </div>
  );
}
