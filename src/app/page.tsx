"use client";

import Link from "next/link";
import { QuestionCard } from "@/components/QuestionCard";
import { createDemoHousehold } from "@/data/demoHousehold";
import {
  answerQuestion,
  type BriefingItem,
  buildCandidates,
  type Candidate,
  openQuestions,
  provisionalBriefing,
  safetyNet,
  toggleDone,
} from "@/lib/butler";
import type { Household } from "@/lib/types";
import { createEmptyHousehold, useHousehold } from "@/lib/useHousehold";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function Home() {
  const { household, loaded, save } = useHousehold();

  if (!loaded) return <main />;

  if (!household) {
    return (
      <main>
        <h1>CULALOG（クラログ）</h1>
        <p className="lead">家族の書類から、いつ・何を・どこで、を先回りしてお知らせします。</p>
        <button className="button" onClick={() => save(createDemoHousehold())}>
          架空の家族で試す
        </button>
        <button className="button secondary" onClick={() => save(createEmptyHousehold())}>
          自分の書類で始める
        </button>
        <p className="note">
          デモの家族・書類はすべて架空です。データはこの端末の中にだけ保存され、いつでも消せます。
        </p>
      </main>
    );
  }

  const today = new Date();
  const h = household as Household;
  const candidates = buildCandidates(h, today);
  // 11/4 から: Claude が選んだひとこと（書類を確定したとき・1日1回だけ作る）。それまではコードで並べた仮のもの
  const briefing = provisionalBriefing(candidates);
  const net = safetyNet(candidates, briefing);
  const questions = openQuestions(h);
  const pending = h.documents.filter((d) => !d.confirmedAt);
  const todayClasses = h.timetable.filter((t) => t.weekday === today.getDay());
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const sampleFor = (candidateId: string) =>
    candidateId.startsWith("missing:")
      ? h.demoSamples?.find((x) => x.expectedId === candidateId.slice("missing:".length))
      : undefined;

  const done = (id: string) => save(toggleDone(h, id));

  const Source = ({ item }: { item: Pick<BriefingItem, "documentId" | "documentTitle" | "location"> }) =>
    item.documentId ? (
      <div className="meta">
        原本: <Link href={`/documents/${item.documentId}`}>{item.documentTitle}</Link>
        {item.location && `・${item.location}`}
      </div>
    ) : null;

  const Actions = ({ id, isEvent }: { id: string; isEvent?: boolean }) => {
    const sample = sampleFor(id);
    if (sample) {
      return (
        <Link className="button secondary small" href={`/scan?sample=${sample.id}`}>
          届いた想定で、見本を読み取ってみる
        </Link>
      );
    }
    if (id.startsWith("missing:") || isEvent) return null;
    return (
      <button className="link-button" onClick={() => done(id)}>
        済んだ
      </button>
    );
  };

  return (
    <main>
      <h1>今日のこと</h1>
      <p className="lead">
        {today.getMonth() + 1}月{today.getDate()}日（{WEEKDAYS[today.getDay()]}）
        {h.isDemo && "・架空の家族で試しています"}
        {todayClasses.map((t) => (
          <span key={t.memberId} className="block">
            {nameOf(t.memberId)}: {t.periods}限まで・下校はだいたい {t.dismissal}
          </span>
        ))}
      </p>

      <h2>執事のひとこと</h2>
      <div className="card briefing">
        {briefing.items.length === 0 ? (
          <div>今は急いで動くことはありません。</div>
        ) : (
          briefing.items.map((item) => (
            <div className="briefing-item" key={item.candidateId}>
              <div className="briefing-text">{item.text}</div>
              {item.detail && <div>{item.detail}</div>}
              {item.why && <div className="meta">{item.why}</div>}
              <Source item={item} />
              <Actions id={item.candidateId} isEvent={item.isEvent} />
            </div>
          ))
        )}
        {briefing.source === "provisional" && (
          <div className="meta provisional">
            仮のひとこと: 執事（Claude）の準備中のため、期日の近い順に並べています。
          </div>
        )}
      </div>

      {net.length > 0 && (
        <>
          <h2>期日が近いもの（念のため）</h2>
          {net.map((c: Candidate) => (
            <div className="card warn" key={c.id}>
              {c.title}
              {c.detail && <div>{c.detail}</div>}
              {c.why && <div className="meta">{c.why}</div>}
              <Source item={c} />
              <Actions id={c.id} isEvent={c.isEvent} />
            </div>
          ))}
        </>
      )}

      {questions.length > 0 && (
        <>
          <h2>執事から聞きたいこと</h2>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              document={h.documents.find((d) => d.id === q.documentId)}
              onAnswer={(values) => save(answerQuestion(h, q.id, values))}
            />
          ))}
        </>
      )}

      {pending.length > 0 && (
        <>
          <h2>確認待ち</h2>
          {pending.map((d) => (
            <Link className="card row-link" key={d.id} href={`/documents/${d.id}`}>
              {d.title}
              <span className="badge">原本と見比べる</span>
            </Link>
          ))}
        </>
      )}

      <div className="spacer" />
      <Link className="button" href="/scan" style={{ textAlign: "center", textDecoration: "none" }}>
        執事に書類を渡す
      </Link>
      <div className="nav-links">
        <Link className="button secondary" href="/schedule">
          すべての予定
        </Link>
        <Link className="button secondary" href="/documents">
          書類の一覧
        </Link>
        <Link className="button secondary" href="/add">
          手入力で登録
        </Link>
        <Link className="button secondary" href="/rules">
          わが家のきまり
        </Link>
      </div>
    </main>
  );
}
