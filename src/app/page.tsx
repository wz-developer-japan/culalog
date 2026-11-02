"use client";

// トップ（メニュー）。アプリを開いたらここ。上から: あいさつ → 家族の丸（みんな・ひとりずつ）→
// いちばん近い締切1件の小さなカード → メニュー6つ（予定・書類・家族ごと・大事な番号・聞く・わが家のきまり）。
// ここから全部の場所に行けて、どの画面からも左上の「‹ トップ」と下のタブで1回で戻れる。
// 日付の計算はコード（lib/butler・lib/deadlines）。ここは見せ方と入口だけ。

import Link from "next/link";
import { now, useTodayOffset } from "@/lib/clock";
import { useEffect } from "react";
import { FamilyRow } from "@/components/FamilyRow";
import { ButlerPic, MenuPic, type MenuKind } from "@/components/Pics";
import { createDemoHousehold } from "@/data/demoHousehold";
import { buildCandidates, markFollowUps, openQuestions } from "@/lib/butler";
import { addressee, butlerName, characterOf, timeOfDay } from "@/lib/character";
import { inboxProgress } from "@/lib/inbox";
import { importantNumbers } from "@/lib/numbers";
import type { Household } from "@/lib/types";
import { pendingAsks, unseenReports, useAskQueue } from "@/lib/useAsk";
import { useConnect } from "@/lib/useConnect";
import { createEmptyHousehold, useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「2つ」「10件」 */
const countOf = (n: number) => (n < 10 ? `${n}つ` : `${n}件`);

export default function Top() {
  const { household, loaded, save, update } = useHousehold();
  const [offset, setOffset] = useTodayOffset();
  // つなぐ＋ひとこと（書類・きまりが変わったとき・1日1回だけ Claude に頼み、端末に保存）
  useConnect(household, update);
  // 頼んで、あとで報告: 答えの無い頼みごとがあれば、この画面を開いているあいだに調べて保存する
  useAskQueue(household, update);
  // まとめて渡した書類: この画面を開いているあいだに、執事が1枚ずつ読む
  useInboxQueue(household, update);

  // 済むまで追いかける: 念押しの段に入った日を覚える（その日だけ、ひとことの上に出す）
  useEffect(() => {
    if (!household) return;
    const marked = markFollowUps(household, buildCandidates(household, now()), now());
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
        <button className="button" onClick={async () => save(await createDemoHousehold())}>
          架空の家族で試す
        </button>
        <button className="button secondary" onClick={() => save(createEmptyHousehold())}>
          自分の書類で始める
        </button>
        <p className="note">デモの家族・書類はすべて架空です。データはこの端末の中にだけ保存され、いつでも消せます。</p>
      </main>
    );
  }

  const today = now();
  const h = household as Household;
  const candidates = buildCandidates(h, today);
  // いちばん近い締切（期限切れがあればそれ）を、小さなオレンジのカードに
  const nearest = candidates.filter((c) => c.type === "deadline" && c.card && !(c.daysLeft < 0 && !c.overdue)).sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.daysLeft - b.daysLeft)[0];
  // やること（済んだにする締切・届いていない書類）の数。予定・行事は数えない
  const todo = candidates.filter((c) => c.type === "missing" || !c.isEvent).length;
  const questions = openQuestions(h, today);
  const unconfirmed = h.documents.filter((d) => !d.confirmedAt);
  const progress = inboxProgress(h);
  const reading = progress.waiting + progress.needsKey;
  const news = unseenReports(h).length + pendingAsks(h).length;
  const numbers = importantNumbers(h).length;
  const rules = h.rules ?? [];
  const todayClasses = h.timetable.filter((t) => t.weekday === today.getDay());
  const nameOf = (id: string) => h.members.find((m) => m.id === id)?.name ?? "";
  const character = characterOf(h);
  const name = butlerName(h);

  const MENU: { kind: MenuKind; href: string; label: string; sub: string; dot?: number }[] = [
    { kind: "schedule", href: "/schedule", label: "予定", sub: candidates.length ? "締切を近い順に" : "まだありません", dot: todo },
    { kind: "documents", href: "/documents", label: "書類", sub: h.documents.length ? `預かった${h.documents.length}通` : "まだありません", dot: unconfirmed.length },
    { kind: "family", href: "/family/all", label: "家族ごと", sub: "人で分けて見る" },
    { kind: "numbers", href: "/numbers", label: "大事な番号", sub: numbers ? `${numbers}件・端末の中だけ` : "端末の中だけ" },
    { kind: "ask", href: questions.length ? "/questions" : "/ask", label: "聞く", sub: questions.length ? `聞きたいこと${countOf(questions.length)}` : news ? `報告が${news}件` : "原本の場所つきで", dot: questions.length + news },
    { kind: "rules", href: "/rules", label: "わが家のきまり", sub: rules.length ? `きまり${rules.length}件` : "勤務先のきまりなど" },
  ];

  return (
    <main className="top">
      <div className="greet">
        <div>
          <div className="d">執事の{name}より</div>
          <h1>{character.greeting(timeOfDay(today), addressee(h))}</h1>
          <div className="d">
            {today.getMonth() + 1}月{today.getDate()}日（{WEEKDAYS[today.getDay()]}）{h.isDemo && "・架空の家族で試しています"}
            {offset !== 0 && <span className="tag acc" style={{ marginLeft: 6 }}>{offset > 0 ? `${offset}日先の日として見ています` : `${-offset}日前の日として見ています`}</span>}
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

      <FamilyRow members={h.members} />

      {nearest?.card ? (
        <Link className={`mini${nearest.overdue ? " over" : ""}`} href="/schedule">
          <div className="n">
            {nearest.overdue ? (
              <>
                {-nearest.daysLeft}
                <small>日過ぎ</small>
              </>
            ) : nearest.daysLeft === 0 ? (
              <span className="word">今日</span>
            ) : nearest.daysLeft < 0 ? (
              <span className="word">受付中</span>
            ) : (
              <>
                {nearest.daysLeft}
                <small>日後</small>
              </>
            )}
          </div>
          <div className="body">
            <div className="t">{nearest.card.label}</div>
            <div className="s">
              {nearest.overdue ? "期限切れ・" : "いちばん近い締切・"}
              {nearest.card.date.slice(5).replace("-", "/")}
              {nearest.card.time && ` ${nearest.card.time}`}
            </div>
          </div>
          <svg className="l go" viewBox="0 0 24 24" aria-hidden>
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      ) : (
        h.documents.length === 0 && (
          <div className="empty">
            <ButlerPic width={120} />
            <div className="t">書類は、まとめて渡してください</div>
            <div className="s">写真・スクショ・PDF・メールの本文。読んで、仕分けて、締切をお知らせします。</div>
          </div>
        )
      )}

      {(reading > 0 || unconfirmed.length > 0) && (
        <Link className="ask soft" href="/inbox" style={{ marginTop: 10 }}>
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

      <h2 className="sec">メニュー</h2>
      <nav className="menu" aria-label="メニュー">
        {MENU.map((m) => (
          <Link key={m.kind} className="mi" href={m.href}>
            {m.dot ? <span className="dot">{m.dot}</span> : null}
            <MenuPic kind={m.kind} />
            <b>{m.label}</b>
            <small>{m.sub}</small>
          </Link>
        ))}
      </nav>

      {h.isDemo && (
        <div className="timeshift">
          <span className="k">日付を進めて、締切が近づく・過ぎる様子を見る</span>
          <div className="row">
            {[0, 1, 3, 7, 14, 30].map((d) => (
              <button key={d} className={`chip${offset === d ? " selected" : ""}`} onClick={() => setOffset(d)} aria-pressed={offset === d}>
                {d === 0 ? "今日" : `+${d}日`}
              </button>
            ))}
          </div>
          <span className="meta">架空の家族のときだけ。日付の計算は同じコードで、進めた日を「今日」とみなします。</span>
        </div>
      )}

      <div className="foot-links">
        <Link href="/scan">渡し方を選ぶ</Link>
        <Link href="/add">手入力で登録</Link>
        <Link href="/butler">執事を選ぶ</Link>
      </div>
      <p className="note">データはこの端末の中にだけ保存しています。読み取る・つなぐ・聞くときだけ、必要な中身を Claude API に送ります。</p>
    </main>
  );
}
