"use client";

// 予定を、いつものカレンダー（iPhone・Android・Google）に入れる。作るのはこの端末の中だけ（サーバーに送らない）。

import { useState } from "react";
import { now } from "@/lib/clock";
import { type CalendarEvent, downloadIcs, googleCalendarUrl } from "@/lib/calendar";

/** 予定1件の「カレンダーに入れる」。押すと .ics と Google カレンダーの2つが出る */
export function CalendarButton({ event }: { event: CalendarEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="tag act mut" onClick={() => setOpen(!open)} aria-expanded={open}>
        カレンダーに入れる
      </button>
      {open && (
        <div className="cal-choices">
          <button className="button small secondary" onClick={() => downloadIcs([event], `culalog-${event.date}.ics`, now())}>
            端末のカレンダー（.ics）
          </button>
          <a className="button small secondary" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
            Google カレンダー
          </a>
          <div className="meta">サーバーには送りません。あとで日付が変わったら、カレンダーの方も直してください。</div>
        </div>
      )}
    </>
  );
}

/** これからの予定をまとめて1つの .ics に */
export function CalendarAll({ events }: { events: CalendarEvent[] }) {
  if (!events.length) return null;
  return (
    <div className="card cal-all">
      <button className="button secondary" onClick={() => downloadIcs(events, "culalog-schedule.ics", now())}>
        これからの{events.length}件を、まとめてカレンダーに入れる
      </button>
      <div className="meta">
        開くと、端末のカレンダーが「追加しますか？」と聞きます（知らせる日も一緒に）。知っておくだけのものは入れません。
        予定はこの端末の中で作り、サーバーには送りません。
      </div>
    </div>
  );
}
