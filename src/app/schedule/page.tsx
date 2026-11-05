"use client";

// 予定（トップのメニュー「予定」の中身）。主役は「いちばん近い締切」の大きなカード1枚。
// 並び: 家族の丸（?who= で絞る）→ 向こう7日 → いちばん近い締切 → 執事から（ひとこと・期日が近いもの・報告・気づいたことを1か所に。
// 初めの2件だけ見せて残りは畳む。「見に行きますか？」など、あなたの返事を待つものは畳まない）→ すべての予定を見る。
// 仕組みの説明は ⓘ の中。すべての予定は /schedule/all にいつでも全部ある。

import { ConflictCards } from "@/components/ConflictCard";
import Link from "next/link";
import { now } from "@/lib/clock";
import { useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect } from "react";
import { AskAnswer } from "@/components/AskAnswer";
import { BackToTop } from "@/components/BackToTop";
import { FamilyRow } from "@/components/FamilyRow";
import { Info, ProvisionalTag } from "@/components/Info";
import { DeadlineCard, shortDate, Source } from "@/components/DeadlineCard";
import { InsightCard } from "@/components/InsightCard";
import { WeekStrip } from "@/components/WeekStrip";
import { ButlerPic, Pic } from "@/components/Pics";
import {
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
import { butlerName, characterOf } from "@/lib/character";
import { adoptInsight, answerInsight } from "@/lib/connect";
import { overlapCase } from "@/lib/cases";
import { inboxProgress } from "@/lib/inbox";
import type { Household } from "@/lib/types";
import { markAskSeen, pendingAsks, unseenReports } from "@/lib/useAsk";
import { useConnect } from "@/lib/useConnect";
import { useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";
import { colorOf } from "@/lib/personColor";
import { givenName, isFor, type Whose } from "@/lib/whose";

function ScheduleBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { household, loaded, save, update } = useHousehold();
  // つなぐ＋ひとこと（書類・きまりが変わったとき・1日1回だけ Claude に頼み、端末に保存）
  const { result: connect, status } = useConnect(household, update);
  // 頼んで、あとで報告: 答えの無い頼みごとがあれば、この画面を開いているあいだに調べて保存する
  // まとめて渡した書類: この画面を開いているあいだに、執事が1枚ずつ読む
  useInboxQueue(household, update);

  // 済むまで追いかける: 念押しの段に入った日を覚える（その日だけ、ひとことの上に出す）
  useEffect(() => {
    if (!household) return;
    const marked = markFollowUps(household, buildCandidates(household, now()), now());
    if (marked !== household) save(marked);
  }, [household, save]);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;

  const today = now();
  const h = household as Household;
  // 人の切り替え: ?who=（みんな／家族の ID）。家族にいない ID はみんなに戻す
  const whoParam = params.get("who");
  const who: Whose = whoParam && h.members.some((m) => m.id === whoParam) ? whoParam : "all";
  const all = buildCandidates(h, today);
  const candidates = all.filter((c) => isFor(who, c.memberIds));
  // Claude が選んだひとこと。Claude の準備中・つながらないときは、コードで期日の近い順に並べた仮のもの
  const isFollowUp = (c: Candidate) => followUpToday(h, c, today);
  const fromClaude = connect?.source === "claude" ? claudeBriefing(connect.briefing, candidates, isFollowUp) : null;
  // Claude の選んだものが照らし合わせで全部外れたときは、「急ぐことはない」と言わずに仮の並びに戻す
  const briefing =
    fromClaude && (fromClaude.items.length > 0 || !connect?.dropped)
      ? fromClaude
      : provisionalBriefing(candidates, 3, isFollowUp);
  const answers = h.insightAnswers ?? {};
  const byId = new Map(all.map((c) => [c.id, c]));
  const docMembers = (id: string) => h.documents.find((d) => d.id === id)?.memberIds ?? [];
  const insights = (connect?.insights ?? [])
    .filter((i) => !answers[i.key])
    .filter((i) => who === "all" || isFor(who, (i.deadlineId && byId.get(i.deadlineId)?.memberIds) || []) || i.evidence.some((e) => docMembers(e.documentId).includes(who)));
  // 保険の補償の重なりは、いま確定している書類で実際に見つかったときだけ気づきに出す（見つからなければ出さない）
  const overlap = overlapCase(h);
  const overlapKey = `overlap:${overlap.groups.map((g) => `${g.title}=${g.docs.map((d) => d.doc.id).join(",")}`).join("|")}`;
  const showOverlap = who === "all" && overlap.groups.length > 0 && !answers[overlapKey];
  // いちばん近い締切（期限切れがあればそれ）を、上の大きなカードに。執事からの欄には同じものを出さない
  const nearest = candidates.filter((c) => c.type === "deadline" && c.card && !(c.daysLeft < 0 && !c.overdue)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysLeft - b.daysLeft)[0];
  const net = safetyNet(candidates, briefing).filter((c) => c.id !== nearest?.id);
  const briefingItems = briefing.items.filter((item) => item.candidateId !== nearest?.id);
  const questions = openQuestions(h, today);
  const unconfirmed = h.documents.filter((d) => !d.confirmedAt);
  const progress = inboxProgress(h);
  const reading = progress.waiting + progress.needsKey;
  const reports = who === "all" ? unseenReports(h) : [];
  const pending = who === "all" ? pendingAsks(h) : [];
  // 誰の予定か（色と一緒に出す名前）。1人ならその名前、2人以上は並べ、空なら「みんな」
  const whoOf = (ids: string[]) =>
    ids.length === 0 ? "みんな" : ids.map((id) => givenName(h.members.find((m) => m.id === id)?.name ?? "")).filter(Boolean).join("・");
  const sampleFor = (candidateId: string) =>
    candidateId.startsWith("missing:")
      ? h.demoSamples?.find((x) => x.expectedId === candidateId.slice("missing:".length))
      : undefined;

  const done = (id: string) => save(toggleDone(h, id));
  const character = characterOf(h);
  const name = butlerName(h);
  const empty = h.documents.length === 0 && all.length === 0;
  const provisional = briefing.source === "provisional" || ((insights.length > 0) && connect?.source !== "claude");

  // 執事から: あなたの返事を待つもの（畳まない）と、知らせるもの（初めの2件だけ見せて、残りは畳む）
  const waiting: { key: string; node: ReactNode }[] = [];
  const telling: { key: string; node: ReactNode }[] = [];
  pending.forEach((a) => waiting.push({ key: a.id, node: <AskAnswer record={a} butler={name} compact /> }));
  if (questions.length > 0)
    waiting.push({
      key: "questions",
      node: (
        <Link className="ask" href="/questions">
          <svg className="l" viewBox="0 0 24 24" aria-hidden>
            <path d="M5 5h14v10H9l-4 4z" />
          </svg>
          <div className="t">
            {name}から聞きたいことが{questions.length < 10 ? `${questions.length}つ` : `${questions.length}件`}
          </div>
          <span className="go">答える</span>
        </Link>
      ),
    });
  if (reading > 0 || unconfirmed.length > 0)
    waiting.push({
      key: "inbox",
      node: (
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
            {progress.pausedUntil && reading > 0 && <span className="block meta">{progress.pauseReason === "error" ? "読み取りがうまくいかなかったので" : "回数の上限に当たったので"}、少しおいて続きを読みます</span>}
          </div>
          <span className="go">まとめて確認</span>
        </Link>
      ),
    });
  const insightCard = (i: (typeof insights)[number]) => (
    <InsightCard
      insight={i}
      rules={h.rules ?? []}
      provisional={connect?.source !== "claude"}
      onAdopt={() => update((current) => adoptInsight(current, i))}
      onAnswer={(answer) => update((current) => answerInsight(current, i, answer))}
    />
  );
  // 「見に行きますか？」（行事に行くかで決まるもの）は、返事を待つので畳まない
  insights.filter((i) => i.kind === "apply_rule").forEach((i) => waiting.push({ key: i.key, node: insightCard(i) }));
  briefingItems.forEach((item) => {
    const c = byId.get(item.candidateId);
    if (c)
      telling.push({
        key: item.candidateId,
        node: <DeadlineCard c={c} color={colorOf(h.members, c.memberIds)} who={whoOf(c.memberIds)} item={item} voice={briefing.source === "claude" ? item.text : undefined} sample={sampleFor(c.id)} onDone={done} />,
      });
  });
  net.forEach((c) => telling.push({ key: c.id, node: <DeadlineCard c={c} color={colorOf(h.members, c.memberIds)} who={whoOf(c.memberIds)} hot sample={sampleFor(c.id)} onDone={done} /> }));
  if (showOverlap)
    telling.push({
      key: "overlap",
      node: (
        <div className="card insight">
          <div className="insight-text">
            書類を見比べたら、{overlap.groups.map((g) => g.title).join("。")}。同じ種類の補償が重なっているかもしれません。
          </div>
          <div className="meta">{overlap.groups[0].note}</div>
          <div className="row-actions">
            <Link className="button small" href="/cases?s=overlap" style={{ textDecoration: "none" }}>
              原本の行を並べて見る
            </Link>
            <button
              className="button small secondary"
              onClick={() => update((current) => ({ ...current, insightAnswers: { ...(current.insightAnswers ?? {}), [overlapKey]: "seen" } }))}
            >
              わかった
            </button>
          </div>
        </div>
      ),
    });
  insights.filter((i) => i.kind !== "apply_rule").forEach((i) => telling.push({ key: i.key, node: insightCard(i) }));
  reports.forEach((a) =>
    telling.push({ key: a.id, node: <AskAnswer record={a} butler={name} compact onSeen={() => update((current) => markAskSeen(current, a.id))} /> }),
  );
  const SHOWN = 2;
  const shown = telling.slice(0, SHOWN);
  const folded = telling.slice(SHOWN);
  const whoName = who === "all" ? undefined : givenName(h.members.find((m) => m.id === who)?.name ?? "");

  return (
    <main className="home">
      <BackToTop />
      <h1 className="pt">予定</h1>
      {!empty && <FamilyRow members={h.members} current={who} hrefFor={(w) => (w === "all" ? "/schedule" : `/schedule?who=${w}`)} />}
      {!empty && <WeekStrip household={h} today={today} who={who} />}

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
        <div className={`hero${nearest.overdue ? " over" : ""}`} style={{ background: colorOf(h.members, nearest.memberIds) }}>
          <span className="hero-label">{nearest.overdue ? "期限切れ" : "いちばん近い締切"}</span>
          <div className="ring">
            <svg viewBox="0 0 36 36" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" style={{ stroke: "color-mix(in srgb, var(--on-color) 30%, transparent)" }} strokeWidth="3" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                style={{ stroke: "var(--on-color)" }}
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
              {whoOf(nearest.memberIds)}・
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
                  済んだにする
                </button>
              )}
            </div>
          </div>
          <div className="bag">
            <Pic kind={nearest.card.category} size={58} />
          </div>
        </div>
      ) : whoName ? (
        <div className="calm-line">{whoName}さんの締切は、いまはありません。</div>
      ) : null}

      {!empty && (
        <>
          <h2 className="sec from">
            {name}から
            {provisional && <ProvisionalTag />}
            <Info label="この欄について">
              {briefing.source === "provisional" ? (
                <>
                  仮のひとこと: 執事（Claude）
                  {connect?.source === "claude"
                    ? "の選んだものが書類と照らし合わせて合わなかった"
                    : status === "error"
                      ? "につながらなかった"
                      : "の準備中の"}
                  ため、期日の近い順に並べています。話し方は選んだ執事に合わせていますが、中身はコードで作っています。
                  {connect?.source === "claude" && " 同じ日の気づきのカードは別に照らし合わせていて、合ったものは執事（Claude）の文のまま出しています。"}
                </>
              ) : (
                <>
                  執事（Claude）が、書類とわが家のきまりを見て選びました。日付・原本の場所は、コードで書類と照らし合わせています。
                  {connect && connect.dropped > 0 && ` 照らし合わせで合わなかった${connect.dropped}件は出していません。`}
                </>
              )}
              {connect?.source !== "claude" &&
                " 気づいたことも仮のもので、新旧の書類の日付の違いはコードで比べています。デモの家族では、学年だより・案内プリントの授業参観に「行きますか？」と聞く例も出しています。"}
              {" 3日以内の締切・期限切れのものは、選ばれなくてもこの欄に必ず出します。"}
            </Info>
          </h2>
          <ConflictCards household={h} today={today} memberId={who === "all" ? undefined : who} />
          {status === "thinking" && <div className="meta thinking">{name}が、書類とわが家のきまりを見ています…</div>}
          {waiting.map((x) => (
            <div key={x.key} className="from-item">{x.node}</div>
          ))}
          {shown.map((x) => (
            <div key={x.key} className="from-item">{x.node}</div>
          ))}
          {waiting.length + shown.length === 0 && (
            <div className="calm-line">{nearest ? "いちばん近いものは、上の大きなカードに出しています。" : character.calm}</div>
          )}
          {folded.length > 0 && (
            <details className="fold">
              <summary>あと{folded.length}件</summary>
              {folded.map((x) => (
                <div key={x.key} className="from-item">{x.node}</div>
              ))}
            </details>
          )}
        </>
      )}

      <Link className="button secondary" href={who === "all" ? "/schedule/all" : `/family/${who}`} style={{ textAlign: "center", textDecoration: "none", marginTop: 24 }}>
        {who === "all" ? "すべての予定を見る" : `${whoName}さんの予定と書類をすべて見る`}
      </Link>
      <Link className="link-row subtle" href="/rules">
        わが家のきまり<small>勤務先のきまりなど</small>
        <span aria-hidden>›</span>
      </Link>
    </main>
  );
}

export default function Schedule() {
  return (
    <Suspense fallback={<main />}>
      <ScheduleBody />
    </Suspense>
  );
}
