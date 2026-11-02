"use client";

// 執事からの質問。選択肢を押すだけで答えられるようにする。

import Link from "next/link";
import { useState } from "react";
import type { ButlerQuestion, DocumentRecord } from "@/lib/types";

export function QuestionCard({
  question,
  document,
  onAnswer,
  showDocument = true,
}: {
  question: ButlerQuestion;
  document?: DocumentRecord;
  onAnswer: (values: string[]) => void;
  showDocument?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  // 誰の書類か: いちばんの候補を大きく出し、ほかの人は畳んでおく
  const guess = question.about === "members" ? (question.guess ?? []) : [];
  const nameOf = (value: string) =>
    (question.options.find((o) => o.value === value)?.label ?? "").replace(/（.*）$/, "");
  const guessNames = guess.map((v) => `${nameOf(v)}さん`).join("と");

  const press = (value: string) => {
    if (!question.multiple || value === "all") {
      onAnswer([value]);
      return;
    }
    setSelected(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="card question">
      {showDocument && document && (
        <div className="meta">
          <Link href={`/documents/${document.id}`}>{document.title}</Link>について
        </div>
      )}
      <div className="question-text">{guess.length ? `たぶん${guessNames}の書類？` : question.text}</div>
      {question.reason && <div className="meta">{question.reason}</div>}
      {guess.length > 0 && (
        <>
          <button className="button small guess" onClick={() => onAnswer(guess)}>
            はい、{guessNames}
          </button>
          <details className="others">
            <summary>ほかの人・複数の人</summary>
            {optionChips()}
            {selected.length > 0 && (
              <button className="button small" onClick={() => onAnswer(selected)}>
                これで答える
              </button>
            )}
          </details>
        </>
      )}
      {guess.length === 0 && optionChips()}
      {guess.length === 0 && question.multiple && selected.length > 0 && (
        <button className="button small" onClick={() => onAnswer(selected)}>
          これで答える
        </button>
      )}
    </div>
  );

  function optionChips() {
    return (
      <div className="chips">
        {question.options.map((o) => (
          <button
            key={o.value}
            className={`chip${selected.includes(o.value) ? " selected" : ""}`}
            onClick={() => press(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
}
