"use client";

import { useEffect, useState } from "react";
import { createDemoHousehold } from "@/data/demoHousehold";
import { buildHome } from "@/lib/deadlines";
import { clearHousehold, loadHousehold, saveHousehold } from "@/lib/storage";
import type { Household } from "@/lib/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export default function Home() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadHousehold().then((h) => {
      setHousehold(h);
      setLoaded(true);
    });
  }, []);

  async function startDemo() {
    const demo = createDemoHousehold();
    await saveHousehold(demo);
    setHousehold(demo);
  }

  async function reset() {
    await clearHousehold();
    setHousehold(null);
  }

  if (!loaded) return <main />;

  if (!household) {
    return (
      <main>
        <h1>CULALOG（クラログ）</h1>
        <p className="lead">家族の書類から、いつ・何を・どこで、を先回りしてお知らせします。</p>
        <button className="button" onClick={startDemo}>
          架空の家族で試す
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
          </div>
        ))
      )}

      <h2>そろそろ動くこと</h2>
      {soon.length === 0 ? (
        <div className="card meta">ありません。</div>
      ) : (
        soon.map(({ deadline, document, daysLeft }) => (
          <div className="card" key={deadline.id}>
            {deadline.label}まで あと{daysLeft}日
            <div className="meta">
              {document.title}
              {deadline.source && `（${deadline.source.location}）`}
            </div>
            {deadline.leadReason && <div className="meta">{deadline.leadReason}</div>}
          </div>
        ))
      )}

      <button className="button secondary" onClick={reset}>
        この端末のデータをすべて消す
      </button>
    </main>
  );
}
