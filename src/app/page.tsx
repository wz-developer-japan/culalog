"use client";

import Link from "next/link";
import { useEffect } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { createDemoHousehold } from "@/data/demoHousehold";
import {
  answerLater,
  answerQuestion,
  type BriefingItem,
  buildCandidates,
  type Candidate,
  followUpToday,
  markFollowUps,
  openQuestions,
  provisionalBriefing,
  safetyNet,
  toggleDone,
} from "@/lib/butler";
import { addressee, butlerName, characterOf, timeOfDay } from "@/lib/character";
import type { Household } from "@/lib/types";
import { createEmptyHousehold, useHousehold } from "@/lib/useHousehold";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function Home() {
  const { household, loaded, save } = useHousehold();

  // 済むまで追いかける: 念押しの段に入った日を覚える（その日だけ、ひとことの上に出す）
  useEffect(() => {
    if (!household) return;
    const marked = markFollowUps(household, buildCandidates(household, new Date()), new Date());
    if (marked !== household) save(marked);
  }, [household, save]);

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
  const briefing = provisionalBriefing(candidates, 3, (c) => followUpToday(h, c, today));
  const net = safetyNet(candidates, briefing);
  const questions = openQuestions(h, today);
  const pending = h.documents.filter((d) => !d.confirmedAt);
  const todayClasses = h.timetable.filter((t) => t.weekday === today.getDay());
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const sampleFor = (candidateId: string) =>
    candidateId.startsWith("missing:")
      ? h.demoSamples?.find((x) => x.expectedId === candidateId.slice("missing:".length))
      : undefined;

  const done = (id: string) => save(toggleDone(h, id));
  const character = characterOf(h);
  const name = butlerName(h);

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
      <div className="greeting">
        <Link href="/butler" className="face" aria-label={`${name}（執事を選ぶ）`} style={{ textDecoration: "none" }}>
          {character.icon}
        </Link>
        <div>
          <div className="greeting-name">執事の{name}</div>
          <div className="greeting-text">{character.greeting(timeOfDay(today), addressee(h))}</div>
        </div>
      </div>
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

      <h2>{name}のひとこと</h2>
      <div className="card briefing">
        {briefing.items.length === 0 ? (
          <div>{character.calm}</div>
        ) : (
          briefing.items.map((item) => (
            <div className="briefing-item" key={item.candidateId}>
              {item.followUpLabel && (
                <div className="follow-up">まだ済んでいません・{item.followUpLabel}</div>
              )}
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
            仮のひとこと: 執事（Claude）の準備中のため、期日の近い順に並べています。話し方は選んだ執事に合わせていますが、中身はコードで作っています。
          </div>
        )}
      </div>

      <h2>期日が近いもの（念のため）</h2>
      {net.length === 0 ? (
        <div className="card calm">
          {candidates.some((c) => c.urgent)
            ? "3日以内の締切・期限切れのものは、上のひとことにすべて入っています。"
            : "3日以内の締切・期限切れのものはありません。"}
        </div>
      ) : (
        <>
          {net.map((c: Candidate) => (
            <div className="card alert" key={c.id}>
              <div className="alert-label">⚠ {c.overdue ? "期限切れ" : "締切が近い"}</div>
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
          <h2>{name}から聞きたいこと</h2>
          <p className="meta">{character.asking}</p>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              document={h.documents.find((d) => d.id === q.documentId)}
              onAnswer={(values) => save(answerQuestion(h, q.id, values))}
              onLater={() => save(answerLater(h, q.id, today))}
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
        <Link className="button secondary" href="/butler">
          執事を選ぶ
        </Link>
      </div>
    </main>
  );
}
