"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AskAnswer } from "@/components/AskAnswer";
import { InsightCard } from "@/components/InsightCard";
import { ButlerPic, Pic, type PicKind } from "@/components/Pics";
import { createDemoHousehold } from "@/data/demoHousehold";
import {
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
import { allItems, isDone } from "@/lib/deadlines";
import { inboxProgress } from "@/lib/inbox";
import type { Household } from "@/lib/types";
import { markAskSeen, pendingAsks, unseenReports, useAskQueue } from "@/lib/useAsk";
import { useConnect } from "@/lib/useConnect";
import { createEmptyHousehold, useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「11/11（水）」 */
function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d}（${WEEKDAYS[date.getDay()]}）`;
}

/** 右に大きく出す「あと何日」。4日以内は赤 */
function Days({ c }: { c: Candidate }) {
  if (c.type === "missing") return null;
  const d = c.daysLeft;
  if (c.overdue) {
    return (
      <div className="r">
        <div className="days hot">
          {-d}
          <small>日</small>
        </div>
        <div className="u">過ぎた</div>
      </div>
    );
  }
  if (d < 0) return <div className="r"><div className="u">受付中</div></div>;
  if (d === 0) return <div className="r"><div className="days hot today">今日</div></div>;
  return (
    <div className="r">
      <div className={`days${d <= 4 ? " hot" : ""}`}>
        {d}
        <small>日</small>
      </div>
      <div className="u">あと</div>
    </div>
  );
}

/** 理由の文。clamp のときは2行まで、続きはタップで */
function Why({ text, clamp }: { text: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!clamp || open) return <div className="sub">{text}</div>;
  return (
    <button className="sub clamp" onClick={() => setOpen(true)} aria-expanded={false}>
      {text}
    </button>
  );
}

/** 小さな「原本」の札。押すと書類名と場所が出る */
function Source({ c }: { c: Pick<Candidate, "documentId" | "documentTitle" | "location"> }) {
  const [open, setOpen] = useState(false);
  if (!c.documentId) return null;
  return (
    <>
      <button className="tag src" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg className="l" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 3h9l3 3v15H6z" />
        </svg>
        原本
      </button>
      {open && (
        <div className="src-detail">
          <Link href={`/documents/${c.documentId}`}>{c.documentTitle}</Link>
          {c.location && `・${c.location}`}
        </div>
      )}
    </>
  );
}

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

  // はじめて開いたとき（家のデータが無い）は、下のタブを隠す
  const start = loaded && !household;
  useEffect(() => {
    if (start) document.body.dataset.start = "1";
    else delete document.body.dataset.start;
    return () => {
      delete document.body.dataset.start;
    };
  }, [start]);

  if (!loaded) return <main />;

  if (!household) {
    return (
      <main className="start">
        <div className="greet">
          <div>
            <div className="d">はじめまして</div>
            <h1>CULALOG（クラログ）</h1>
          </div>
        </div>
        <div className="empty">
          <ButlerPic />
          <div className="t">書類は、まとめて渡してください</div>
          <div className="s">
            写真・スクショ・PDF・メールの本文。
            <br />
            読んで、仕分けて、いつ・何を・どこで、を先回りしてお知らせします。
          </div>
        </div>
        <button className="button" onClick={() => save(createDemoHousehold())}>
          架空の家族で試す
        </button>
        <button className="button secondary" onClick={() => save(createEmptyHousehold())}>
          自分の書類で始める
        </button>
        <p className="note">デモの家族・書類はすべて架空です。データはこの端末の中にだけ保存され、いつでも消せます。</p>
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
  // いちばん近い締切（期限切れがあればそれ）を、上の大きなカードに。ひとこと・念のための欄には同じものを出さない
  const nearest = candidates.filter((c) => c.type === "deadline" && c.card).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysLeft - b.daysLeft)[0];
  const net = safetyNet(candidates, briefing).filter((c) => c.id !== nearest?.id);
  const questions = openQuestions(h, today);
  const unconfirmed = h.documents.filter((d) => !d.confirmedAt);
  const progress = inboxProgress(h);
  const reading = progress.waiting + progress.needsKey;
  const reports = unseenReports(h);
  const pending = pendingAsks(h);
  const todayClasses = h.timetable.filter((t) => t.weekday === today.getDay());
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const sampleFor = (candidateId: string) =>
    candidateId.startsWith("missing:")
      ? h.demoSamples?.find((x) => x.expectedId === candidateId.slice("missing:".length))
      : undefined;
  // 件数: 今月の締切（済んでいないもの）・預かった書類
  const ym = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = allItems(h, today).filter(
    (i) => i.deadline.date.startsWith(ym) && i.deadline.kind !== "after_event" && !i.deadline.awareness && !isDone(h.done, i),
  ).length;

  const done = (id: string) => save(toggleDone(h, id));
  const character = characterOf(h);
  const name = butlerName(h);

  /** 予定のカード（挿絵・題・札・右に「あと何日」） */
  const Card = ({ c, item, hot }: { c: Candidate; item?: BriefingItem; hot?: boolean }) => {
    const sample = sampleFor(c.id);
    const kind: PicKind = c.type === "missing" ? "missing" : (c.card?.category ?? "other");
    // 執事の言葉（Claude が選んで言葉にしたもの）は1行で残す。仮のひとことは題と日付の繰り返しなので出さない
    const voice = item && briefing.source === "claude" ? item.text : undefined;
    return (
      <div className={`dcard${hot ? " hot" : ""}${item ? " briefing-item" : ""}`}>
        <div className="pic">
          <Pic kind={kind} />
        </div>
        <div className="body">
          {item?.followUpLabel && <div className="tag acc">まだ済んでいません・{item.followUpLabel}</div>}
          {hot && <div className="tag warn">⚠ {c.overdue ? "期限切れ" : "締切が近い"}</div>}
          <div className={`t${c.type === "missing" ? " wrap" : ""}`} title={c.card?.label ?? c.title}>
            {c.card?.label ?? c.title}
          </div>
          {voice && <div className="voice">{voice}</div>}
          {c.detail && <div className="sub">{c.detail}</div>}
          {c.why && <Why text={c.why} clamp={c.type === "missing"} />}
          <div className="m">
            {c.card && (
              <span className="tag mut">
                {shortDate(c.card.date)}
                {c.card.endDate && `〜${shortDate(c.card.endDate)}`}
                {c.card.time && ` ${c.card.time}`}
              </span>
            )}
            {c.type === "missing" && <span className="tag warn">まだ届いていない</span>}
            {c.card && c.card.bundled > 0 && <span className="tag mut">お知らせ{c.card.bundled + 1}通</span>}
            <Source c={c} />
            {c.type === "deadline" && !c.isEvent && (
              <button className="tag ok act" onClick={() => done(c.id)}>
                済んだ
              </button>
            )}
          </div>
          {sample && (
            <Link className="button secondary small" href={`/scan?sample=${sample.id}`}>
              届いた想定で、見本を読み取ってみる
            </Link>
          )}
        </div>
        <Days c={c} />
      </div>
    );
  };

  const empty = h.documents.length === 0 && candidates.length === 0;

  return (
    <main className="home">
      <div className="greet">
        <div>
          <div className="d">執事の{name}より</div>
          <h1>{character.greeting(timeOfDay(today), addressee(h))}</h1>
          <div className="d">
            {today.getMonth() + 1}月{today.getDate()}日（{WEEKDAYS[today.getDay()]}）{h.isDemo && "・架空の家族で試しています"}
            {todayClasses.map((t) => (
              <span key={t.memberId} className="block">
                {nameOf(t.memberId)}: {t.periods}限まで・下校はだいたい {t.dismissal}
              </span>
            ))}
          </div>
        </div>
        <Link href="/butler" className="face" aria-label={`${name}（執事を選ぶ）`}>
          {character.icon}
        </Link>
      </div>

      {empty ? (
        <div className="empty">
          <ButlerPic />
          <div className="t">書類は、まとめて渡してください</div>
          <div className="s">
            写真・スクショ・PDF・メールの本文。
            <br />
            読んで、仕分けて、締切をお知らせします。
          </div>
          <Link className="button" href="/scan" style={{ textAlign: "center", textDecoration: "none", maxWidth: 260, margin: "14px auto 0" }}>
            書類を渡す
          </Link>
        </div>
      ) : nearest?.card ? (
        <div className={`hero${nearest.overdue ? " over" : ""}`}>
          <div className="ring">
            <svg viewBox="0 0 36 36" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.3)" strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${Math.round(97.4 * Math.min(1, Math.max(0.06, nearest.overdue ? 1 : nearest.card.leadDays > 0 ? 1 - nearest.daysLeft / nearest.card.leadDays : 1)))} 97.4`}
              />
            </svg>
            <div className="n">
              {nearest.overdue ? (
                <span>
                  <b>{-nearest.daysLeft}</b>
                  <small>日過ぎ</small>
                </span>
              ) : nearest.daysLeft === 0 ? (
                <span>
                  <b className="word">今日</b>
                </span>
              ) : nearest.daysLeft < 0 ? (
                <span>
                  <b className="word">受付中</b>
                </span>
              ) : (
                <span>
                  <b>{nearest.daysLeft}</b>
                  <small>日後</small>
                </span>
              )}
            </div>
          </div>
          <div className="hero-body">
            <div className="t">{nearest.card.label}</div>
            <div className="s">
              {shortDate(nearest.card.date)}
              {nearest.card.endDate && `〜${shortDate(nearest.card.endDate)}`}
              {nearest.card.time && `・${nearest.card.time}`}
              {nearest.card.place && `・${nearest.card.place}`}
              {nearest.card.needs?.length ? `・${nearest.card.needs.join("・")}` : ""}
            </div>
            <div className="m">
              <Source c={nearest} />
              {!nearest.isEvent && (
                <button className="tag ok act" onClick={() => done(nearest.id)}>
                  済んだ
                </button>
              )}
            </div>
          </div>
          <div className="bag">
            <Pic kind={nearest.card.category} size={58} />
          </div>
        </div>
      ) : null}

      {!empty && (
        <div className="bento">
          <Link className="tile" href="/schedule">
            <div className="k">今月の締切</div>
            <div className="v">
              {thisMonth}
              <small> 件</small>
            </div>
          </Link>
          <Link className="tile" href="/documents">
            <div className="k">預かった書類</div>
            <div className="v">
              {h.documents.length}
              <small> 通</small>
            </div>
          </Link>
          {questions.length > 0 && (
            <Link className="ask" href="/questions">
              <svg className="l" viewBox="0 0 24 24" aria-hidden>
                <path d="M5 5h14v10H9l-4 4z" />
              </svg>
              <div className="t">
                {name}から聞きたいことが{questions.length}つ
                <span className="block meta">{character.asking}</span>
              </div>
              <span className="go">答える</span>
            </Link>
          )}
          {(reading > 0 || unconfirmed.length > 0) && (
            <Link className="ask soft" href="/inbox">
              <svg className="l" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 3h9l3 3v15H6z" />
                <path d="M9 11h6M9 15h6" />
              </svg>
              <div className="t">
                {reading > 0
                  ? `${name}が読んでいます: ${progress.done + progress.duplicate + progress.failed} / ${progress.total}件`
                  : `読み終わりました: 確認待ち ${unconfirmed.length}件`}
                {reading > 0 && unconfirmed.length > 0 && <span className="block meta">確認待ち {unconfirmed.length}件</span>}
                {progress.pausedUntil && reading > 0 && <span className="block meta">読み取りの回数の上限に当たったので、少し時間をおいて続きを読みます</span>}
              </div>
              <span className="go">まとめて確認</span>
            </Link>
          )}
        </div>
      )}

      <h2 className="sec">
        {name}のひとこと
        <Link href="/schedule" className="more">
          すべて見る
        </Link>
      </h2>
      {status === "thinking" && <div className="meta thinking">{name}が、書類とわが家のきまりを見ています…</div>}
      {briefing.items.filter((item) => item.candidateId !== nearest?.id).length === 0 ? (
        <div className="calm-line">{nearest ? "いちばん近いものは、上の大きなカードに出しています。" : character.calm}</div>
      ) : (
        briefing.items.map((item) => {
          const c = byId.get(item.candidateId);
          return c && c.id !== nearest?.id ? <Card key={item.candidateId} c={c} item={item} /> : null;
        })
      )}
      <p className="meta provisional">
        {briefing.source === "provisional" ? (
          <>
            仮のひとこと: 執事（Claude）
            {connect?.source === "claude"
              ? "の選んだものが書類と照らし合わせて合わなかった"
              : status === "error"
                ? "につながらなかった"
                : "の準備中の"}
            ため、期日の近い順に並べています。話し方は選んだ執事に合わせていますが、中身はコードで作っています。
          </>
        ) : (
          <>
            執事（Claude）が、書類とわが家のきまりを見て選びました。日付・原本の場所は、コードで書類と照らし合わせています。
            {connect && connect.dropped > 0 && ` 照らし合わせで合わなかった${connect.dropped}件は出していません。`}
          </>
        )}
      </p>

      <h2 className="sec">期日が近いもの（念のため）</h2>
      {net.length === 0 ? (
        <div className="calm-line">
          {candidates.some((c) => c.urgent)
            ? "3日以内の締切・期限切れのものは、上のひとことにすべて入っています。"
            : "3日以内の締切・期限切れのものはありません。"}
        </div>
      ) : (
        net.map((c: Candidate) => <Card key={c.id} c={c} hot />)
      )}

      {(reports.length > 0 || pending.length > 0) && (
        <>
          <h2 className="sec">{name}からの報告</h2>
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

      {insights.length > 0 && (
        <>
          <h2 className="sec">{name}が気づいたこと</h2>
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

      <div className="foot-links">
        <Link href="/scan">渡し方を選ぶ</Link>
        <Link href="/add">手入力で登録</Link>
        <Link href="/rules">わが家のきまり</Link>
        <Link href="/butler">執事を選ぶ</Link>
      </div>
    </main>
  );
}
