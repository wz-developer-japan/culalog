"use client";

// 執事から聞きたいこと。
// 執事が読みながら分からなかったことを、1問ずつ選択肢で聞く。片手で数秒で答えられる形に。
// 答えは「覚えたこと」として残り、同じ種類の書類では二度聞かない（ほかの書類の同じ質問にも、その場で当てはめる）。

import Link from "next/link";
import { now as clockNow } from "@/lib/clock";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ButlerPic } from "@/components/Pics";
import { QuestionCard } from "@/components/QuestionCard";
import { answerLater, effectOf, openQuestions } from "@/lib/butler";
import { butlerName, characterOf } from "@/lib/character";
import { answerAndLearn, forget } from "@/lib/inbox";
import { newId, useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

export default function Questions() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  useInboxQueue(household, update);
  const [feedback, setFeedback] = useState<string[]>([]);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const today = clockNow();
  const name = butlerName(household);
  const all = openQuestions(household);
  const now = openQuestions(household, today);
  const later = all.length - now.length;
  const q = now[0];
  const learned = household.learned ?? [];
  const saved = household.documents.reduce((n, d) => n + (d.learnedNotes?.length ?? 0), 0);
  const answered = (household.questions ?? []).filter((x) => x.answeredAt).length;

  async function answer(values: string[]) {
    if (!q) return;
    let lines: string[] = [];
    await update((current) => {
      const r = answerAndLearn(current, q.id, values, newId);
      lines = [`答えました。${effectOf(q)}`];
      if (r.learned) {
        lines.push(
          r.learned.kind === "members"
            ? `覚えました: 「${r.learned.docType}」は ${r.learned.labels.join("・")}${r.learned.labels[0] === "家族みんな" ? "" : "さん"}の書類。次からは聞きません。`
            : `覚えました: 「${r.learned.docType}」の「${r.learned.question}」は「${r.learned.labels.join("、")}」。次からは聞きません。`,
        );
      }
      if (r.applied > 0) lines.push(`同じ種類のほかの書類 ${r.applied}件にも、同じ答えを当てはめました。`);
      return r.household;
    });
    setFeedback(lines);
  }

  return (
    <main>
      <BackToTop />
      <h1 className="pt">{name}から聞きたいこと</h1>
      <p className="lead">
        {now.length > 0 ? `あと ${now.length}問` : "いま聞きたいことはありません"}
        {later > 0 && `（「あとで」にしたもの ${later}問は、明日また聞きます）`}
        <span className="block meta">{characterOf(household).asking}</span>
      </p>

      {feedback.length > 0 && (
        <div className="card calm" role="status">
          {feedback.map((f, i) => (
            <div key={i}>{f}</div>
          ))}
        </div>
      )}

      {q ? (
        <div className="question-corner">
          <QuestionCard
            key={q.id}
            question={q}
            document={household.documents.find((d) => d.id === q.documentId)}
            members={household.members}
            onAnswer={answer}
            onLater={async () => {
              await update((current) => answerLater(current, q.id, today));
              setFeedback(["あとでにしました。明日また聞きます。"]);
            }}
          />
          {now.length > 1 && <p className="meta">次の質問: {now[1].text}</p>}
        </div>
      ) : (
        <div className="empty">
          <ButlerPic width={110} />
          <div className="t">{answered > 0 ? "全部答えてもらいました" : "いま聞きたいことはありません"}</div>
          <div className="s">{answered > 0 ? "ありがとうございます。" : "書類を渡すと、分からないことがあればここに並べます。"}</div>
        </div>
      )}

      <h2 className="sec">
        {name}が覚えたこと <small>{learned.length}件</small>
      </h2>
      <p className="meta">
        これまでに答えてもらった {answered}問から覚えました。
        {saved > 0 && ` 覚えたことのおかげで、${saved}回は聞かずに済みました。`}
      </p>
      {learned.length === 0 ? (
        <div className="calm-line">まだありません。質問に答えると、同じ種類の書類では二度聞かないように覚えます。</div>
      ) : (
        learned.map((l) => (
          <div className="card" key={l.id}>
            <div>
              「{l.docType}」
              {l.kind === "members" ? ` → ${l.labels.join("・")}${l.labels[0] === "家族みんな" ? "" : "さん"}の書類` : `の「${l.question}」 → ${l.labels.join("、")}`}
            </div>
            <button className="link-button" onClick={() => update((current) => forget(current, l.id))}>
              忘れる（次からはまた聞く）
            </button>
          </div>
        ))
      )}
      <p className="note">覚えたことは、この端末の中にだけ保存します。読み取り（Claude）には送らず、読んだあとにコードで当てはめます。</p>
    </main>
  );
}
