"use client";

import Link from "next/link";
import { useEffect } from "react";
import { InsightCard } from "@/components/InsightCard";
import { QuestionCard } from "@/components/QuestionCard";
import { createDemoHousehold } from "@/data/demoHousehold";
import {
  answerLater,
  type BriefingItem,
  buildCandidates,
  type Candidate,
  claudeBriefing,
  followUpToday,
  markFollowUps,
  openQuestions,
  provisionalBriefing,
  safetyNet,
  toggleDone,
} from "@/lib/butler";
import { addressee, butlerName, characterOf, timeOfDay } from "@/lib/character";
import { adoptInsight, answerInsight } from "@/lib/connect";
import { answerAndLearn, inboxProgress } from "@/lib/inbox";
import type { Household } from "@/lib/types";
import { markAskSeen, pendingAsks, unseenReports, useAskQueue } from "@/lib/useAsk";
import { useConnect } from "@/lib/useConnect";
import { createEmptyHousehold, newId, useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";
import { AskAnswer } from "@/components/AskAnswer";
import { QuickGive } from "@/components/QuickGive";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function Home() {
  const { household, loaded, save, update } = useHousehold();
  // つなぐ＋ひとこと（書類・きまりが変わったとき・1日1回だけ Claude に頼み、端末に保存）
  const { result: connect, status } = useConnect(household, update);
  // 頼んで、あとで報告: 答えの無い頼みごとがあれば、この画面を開いているあいだに調べて保存する
  useAskQueue(household, update);
  // まとめて渡した書類: この画面を開いているあいだに、執事が1枚ずつ読む
  useInboxQueue(household, update);

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
  // Claude が選んだひとこと。Claude の準備中・つながらないときは、コードで期日の近い順に並べた仮のもの
  const isFollowUp = (c: Candidate) => followUpToday(h, c, today);
  const fromClaude = connect?.source === "claude" ? claudeBriefing(connect.briefing, candidates, isFollowUp) : null;
  // Claude の選んだものが照らし合わせで全部外れたときは、「急ぐことはない」と言わずに仮の並びに戻す
  const briefing =
    fromClaude && (fromClaude.items.length > 0 || !connect?.dropped)
      ? fromClaude
      : provisionalBriefing(candidates, 3, isFollowUp);
  const answers = h.insightAnswers ?? {};
  const insights = (connect?.insights ?? []).filter((i) => !answers[i.key]);
  const net = safetyNet(candidates, briefing);
  const questions = openQuestions(h, today);
  const unconfirmed = h.documents.filter((d) => !d.confirmedAt);
  const progress = inboxProgress(h);
  const reading = progress.waiting + progress.needsKey;
  const reports = unseenReports(h);
  const pending = pendingAsks(h);
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
        {status === "thinking" && <div className="meta thinking">{name}が、書類とわが家のきまりを見ています…</div>}
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
            仮のひとこと: 執事（Claude）
            {connect?.source === "claude"
              ? "の選んだものが書類と照らし合わせて合わなかった"
              : status === "error"
                ? "につながらなかった"
                : "の準備中の"}
            ため、期日の近い順に並べています。話し方は選んだ執事に合わせていますが、中身はコードで作っています。
          </div>
        )}
        {briefing.source === "claude" && (
          <div className="meta provisional">
            執事（Claude）が、書類とわが家のきまりを見て選びました。日付・原本の場所は、コードで書類と照らし合わせています。
            {connect && connect.dropped > 0 && ` 照らし合わせで合わなかった${connect.dropped}件は出していません。`}
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

      {(reports.length > 0 || pending.length > 0) && (
        <>
          <h2>{name}からの報告</h2>
          {pending.map((a) => (
            <AskAnswer key={a.id} record={a} butler={name} compact />
          ))}
          {reports.slice(0, 3).map((a) => (
            <AskAnswer key={a.id} record={a} butler={name} compact onSeen={() => update((current) => markAskSeen(current, a.id))} />
          ))}
          {reports.length > 3 && (
            <p className="meta">
              ほか{reports.length - 3}件の報告は<Link href="/ask">聞く画面</Link>に。
            </p>
          )}
        </>
      )}

      {(reading > 0 || unconfirmed.length > 0) && (
        <>
          <h2>渡した書類</h2>
          <Link className="card row-link" href="/inbox">
            {reading > 0
              ? `${name}が読んでいます: ${progress.done + progress.duplicate + progress.failed} / ${progress.total}件`
              : `読み終わりました: 確認待ち ${unconfirmed.length}件`}
            {reading > 0 && unconfirmed.length > 0 && <span className="block meta">確認待ち {unconfirmed.length}件</span>}
            {progress.pausedUntil && reading > 0 && <span className="block meta">読み取りの回数の上限に当たったので、少し時間をおいて続きを読みます</span>}
            <span className="badge">まとめて確認</span>
          </Link>
        </>
      )}

      {questions.length > 0 && (
        <>
          <h2>
            {name}から聞きたいこと（{questions.length}問）
          </h2>
          <p className="meta">{character.asking}</p>
          <QuestionCard
            key={questions[0].id}
            question={questions[0]}
            document={h.documents.find((d) => d.id === questions[0].documentId)}
            onAnswer={(values) => update((current) => answerAndLearn(current, questions[0].id, values, newId).household)}
            onLater={() => update((current) => answerLater(current, questions[0].id, today))}
            members={h.members}
          />
          {questions.length > 1 && (
            <Link className="button secondary small" href="/questions" style={{ textAlign: "center", textDecoration: "none" }}>
              残りの{questions.length - 1}問に答える
            </Link>
          )}
        </>
      )}

      {insights.length > 0 && (
        <>
          <h2>{name}が気づいたこと</h2>
          {insights.map((i) => (
            <InsightCard
              key={i.key}
              insight={i}
              rules={h.rules ?? []}
              provisional={connect?.source !== "claude"}
              onAdopt={() => update((current) => adoptInsight(current, i))}
              onAnswer={(answer) => update((current) => answerInsight(current, i, answer))}
            />
          ))}
          {connect?.source !== "claude" && (
            <p className="meta">
              仮の気づき: 執事（Claude）の準備中のため、新旧の書類の日付の違いはコードで比べています。デモの家族では、運動会の例も用意しておいたものを出しています。
            </p>
          )}
        </>
      )}


      <div className="spacer" />
      <QuickGive update={update} />
      <Link className="button secondary" href="/ask" style={{ textAlign: "center", textDecoration: "none" }}>
        {name}に聞く・調べてもらう（例: 冬休みはいつからいつまで？）
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
