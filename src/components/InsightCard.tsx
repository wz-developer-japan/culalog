"use client";

// 執事が、書類同士・きまりをつないで気づいたこと。採用するかは本人が決める。

import Link from "next/link";
import type { Insight } from "@/lib/connect";
import type { HouseRule } from "@/lib/types";

/** 原本の題名を短く（かっこの中を外し、長ければ切る）。正式な題名は書類の画面に */
const shortTitle = (title = "") => {
  let t = title.split("＋")[0];
  for (let i = 0; i < 3; i++) t = t.replace(/[（(][^（()）]*[）)]/g, "");
  t = t.replace(/・[^・\s]*?の(ご案内|お知らせ)$/, "の$1").replace(/\s+/g, " ").trim();
  return t.length > 22 ? `${t.slice(0, 21)}…` : t;
};

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
      {insight.evidence.length > 0 && (
        <div className="meta">
          原本:{" "}
          {insight.evidence.map((e, i) => (
            <span key={`${e.documentId}-${e.location}`}>
              {i > 0 && " ／ "}
              <Link href={`/documents/${e.documentId}`}>{shortTitle(e.documentTitle)}</Link>
            </span>
          ))}
          {provisional ? "・仮の気づき" : "・執事の提案"}（決めるのはあなた）
        </div>
      )}
      <div className="row-actions">
        {actionable && insight.kind === "apply_rule" ? (
          // 行事に行くかどうかで決まる: 行くと決めつけず、聞く
          <>
            <button className="button small" onClick={onAdopt}>
              行く（{rule.label.replace(/（.*）/, "")}の締切を予定に）
            </button>
            <button className="button small secondary" onClick={() => onAnswer("declined")}>
              行かない
            </button>
          </>
        ) : actionable ? (
          <button className="button small" onClick={onAdopt}>
            採用する（{insight.kind === "apply_rule_to_reserve" ? "予備日にも" : ""}{rule.label.replace(/（.*）/, "")}）
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
