"use client";

import Link from "next/link";
import { createDemoHousehold } from "@/data/demoHousehold";
import { buildHome } from "@/lib/deadlines";
import { createEmptyHousehold, useHousehold } from "@/lib/useHousehold";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function Home() {
  const { household, loaded, save, clear } = useHousehold();

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
  const { soon, missing } = buildHome(household, today);
  const todayClasses = household.timetable.filter((t) => t.weekday === today.getDay());
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name ?? "";
  const pending = household.documents.filter((d) => !d.confirmedAt);

  return (
    <main>
      <h1>今日のこと</h1>
      <p className="lead">
        {today.getMonth() + 1}月{today.getDate()}日（{WEEKDAYS[today.getDay()]}）
        {household.isDemo && "・架空の家族で試しています"}
      </p>

      <h2>今日</h2>
      {todayClasses.length === 0 ? (
        <div className="card meta">今日は授業の登録がありません。</div>
      ) : (
        todayClasses.map((t) => (
          <div className="card" key={t.memberId}>
            {nameOf(t.memberId)}: {t.periods}限まで・下校はだいたい {t.dismissal}
          </div>
        ))
      )}

      <h2>来ていないもの</h2>
      {missing.length === 0 ? (
        <div className="card meta">ありません。</div>
      ) : (
        missing.map((e) => (
          <div className="card warn" key={e.id}>
            {e.label}がまだ登録されていません
            {e.hint && <div className="meta">{e.hint}</div>}
            {e.sample && (
              <Link className="button secondary small" href={`/scan?expected=${e.id}`}>
                届いた想定で、見本を読み取ってみる
              </Link>
            )}
          </div>
        ))
      )}

      <h2>そろそろ動くこと</h2>
      {soon.length === 0 ? (
        <div className="card meta">ありません。</div>
      ) : (
        soon.map(({ deadline, document, daysLeft }) => (
          <Link className="card row-link" key={deadline.id} href={`/documents/${document.id}`}>
            {daysLeft >= 0 ? `${deadline.label}まで あと${daysLeft}日` : `${deadline.label}（受付中）`}
            <div className="meta">
              {document.title}
              {deadline.source && `（${deadline.source.location}）`}
            </div>
            {deadline.leadReason && <div className="meta">{deadline.leadReason}</div>}
          </Link>
        ))
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

      <h2>登録した書類</h2>
      {household.documents.length === 0 ? (
        <div className="card meta">まだありません。</div>
      ) : (
        household.documents.map((d) => (
          <Link className="card row-link" key={d.id} href={`/documents/${d.id}`}>
            {d.title}
            {d.storageLocation && <div className="meta">しまい場所: {d.storageLocation}</div>}
          </Link>
        ))
      )}

      <div className="spacer" />
      <Link className="button" href="/scan" style={{ textAlign: "center", textDecoration: "none" }}>
        写真・PDF から登録する
      </Link>
      <Link className="button secondary" href="/add" style={{ textAlign: "center", textDecoration: "none" }}>
        手入力で登録する
      </Link>
      <Link className="button secondary" href="/rules" style={{ textAlign: "center", textDecoration: "none" }}>
        わが家のきまり
      </Link>
      <button
        className="button secondary"
        onClick={() => {
          if (confirm("この端末に保存したデータをすべて消しますか？")) clear();
        }}
      >
        この端末のデータをすべて消す
      </button>
    </main>
  );
}
