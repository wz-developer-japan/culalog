"use client";

// 執事からの質問。選択肢を押すだけで答えられるようにする。

import Link from "next/link";
import { useState } from "react";
import { effectOf } from "@/lib/butler";
import { memberMark } from "@/lib/memberMark";
import type { ButlerQuestion, DocumentRecord, FamilyMember } from "@/lib/types";

export function QuestionCard({
  question,
  document,
  onAnswer,
  onLater,
  members = [],
  showDocument = true,
}: {
  /** 誰の書類かを聞くときに、家族の色の印を付ける */
  members?: FamilyMember[];
  question: ButlerQuestion;
  document?: DocumentRecord;
  onAnswer: (values: string[]) => void;
  /** 「今はわからない・あとで答える」 */
  onLater?: () => void;
  showDocument?: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  // 誰の書類か: いちばんの候補を大きく出し、ほかの人は畳んでおく
  const guess = question.about === "members" ? (question.guess ?? []) : [];
  const nameOf = (value: string) =>
    (question.options.find((o) => o.value === value)?.label ?? "").replace(/（.*）$/, "");
  const guessNames = guess.map((v) => `${nameOf(v)}さん`).join("と");
  const Dot = ({ value }: { value: string }) => {
    const mark = question.about === "members" ? memberMark(members, value) : undefined;
    return mark ? (
      <span className="member-dot" style={{ background: mark.color }} aria-hidden>
        {mark.initial}
      </span>
    ) : null;
  };

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
      <div className="effect">答えると、どうなる？ → {effectOf(question)}</div>
      {guess.length > 0 && (
        <>
          <button className="button small guess" onClick={() => onAnswer(guess)}>
            {guess.map((v) => (
              <Dot key={v} value={v} />
            ))}
            はい、{guessNames}
          </button>
          <details className="others">
            <summary>ほかの人・複数の人</summary>
            {optionChips(guess.length === 1 ? guess : [])}
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
      {onLater && (
        <button className="link-button later" onClick={onLater}>
          今はわからない・あとで答える
        </button>
      )}
    </div>
  );

  /** hide: 上の「はい」で選べる人は、畳んだ方に重ねて出さない（候補が複数のときは、一部だけ選べるよう残す） */
  function optionChips(hide: string[] = []) {
    return (
      <div className="chips">
        {question.options.filter((o) => !hide.includes(o.value)).map((o) => (
          <button
            key={o.value}
            className={`chip${selected.includes(o.value) ? " selected" : ""}`}
            onClick={() => press(o.value)}
          >
            <Dot value={o.value} />
            {o.label}
          </button>
        ))}
      </div>
    );
  }
}
