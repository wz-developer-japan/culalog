"use client";

// 決まった周期の勤務（4勤2休など）。勤務の書類が無い大人のために、出勤・休みの日を予定にする（src/lib/workCycle.ts）

import { useState } from "react";
import { now } from "@/lib/clock";
import { formatYmd, toYmd } from "@/lib/deadlines";
import type { FamilyMember, Household } from "@/lib/types";
import { buildCycleDoc, cycleDocId, cycleOf, isWorkDay, validCycle, type WorkCycle } from "@/lib/workCycle";

/** 周期と違う日（計画休暇・休日出勤）の一覧と、日付を足す欄 */
function DayList({ title, hint, days, onChange }: { title: string; hint: string; days: string[]; onChange: (days: string[]) => void }) {
  const [day, setDay] = useState("");
  return (
    <div className="label">
      <span>{title}</span>
      <span className="meta">{hint}</span>
      {[...days].sort().map((d) => (
        <div key={d}>
          {formatYmd(d)}{" "}
          <button className="link-button" onClick={() => onChange(days.filter((x) => x !== d))}>
            外す
          </button>
        </div>
      ))}
      <div className="row-label">
        <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label={`${title}を足す日`} />
        <button
          className="button secondary"
          disabled={!/^\d{4}-\d{2}-\d{2}$/.test(day) || days.includes(day)}
          onClick={() => {
            onChange([...days, day]);
            setDay("");
          }}
        >
          足す
        </button>
      </div>
    </div>
  );
}

function MemberCycle({ member, household, save }: { member: FamilyMember; household: Household; save: (h: Household) => void | Promise<void> }) {
  const doc = household.documents.find((d) => d.id === cycleDocId(member.id));
  const current = cycleOf(doc);
  const [draft, setDraft] = useState<Partial<WorkCycle>>(current ?? { work: 4, off: 2 });
  const [open, setOpen] = useState(false);
  const name = member.name.split(/\s+/).pop() || "わたし";
  const today = now();
  const preview = validCycle(draft)
    ? Array.from({ length: 8 }, (_, i) => {
        const ymd = toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
        return `${formatYmd(ymd)} ${isWorkDay(draft, ymd) ? "出勤" : "休み"}`;
      })
    : [];

  const store = (cycle: WorkCycle) => {
    const next = buildCycleDoc(member, cycle, today);
    save({ ...household, documents: [...household.documents.filter((d) => d.id !== next.id), next] });
  };
  const apply = () => {
    if (!validCycle(draft)) return;
    store({ ...draft, restDays: current?.restDays, extraWorkDays: current?.extraWorkDays });
    setOpen(false);
  };
  const remove = () => {
    if (!confirm(`${name}さんの決まった周期の勤務（出勤・休みの予定）を消しますか？`)) return;
    save({ ...household, documents: household.documents.filter((d) => d.id !== cycleDocId(member.id)) });
  };

  return (
    <div className="card">
      <strong>{name}さん</strong>
      {current && !open ? (
        <>
          <p className="meta">
            {current.work}日働いて{current.off}日休む（{formatYmd(current.firstWorkDay)} が出勤の1日目）。{doc?.periodLabel} の分を予定にしています。
          </p>
          <DayList
            title="休みにした日（計画休暇など）"
            hint="周期では出勤の日を、休みにします。"
            days={current.restDays ?? []}
            onChange={(restDays) => store({ ...current, restDays })}
          />
          <DayList
            title="出勤にした日（休日出勤など）"
            hint="周期では休みの日を、出勤にします。"
            days={current.extraWorkDays ?? []}
            onChange={(extraWorkDays) => store({ ...current, extraWorkDays })}
          />
          <button
            className="link-button"
            onClick={() => {
              setDraft(current);
              setOpen(true);
            }}
          >
            周期を直す
          </button>{" "}
          <button className="link-button" onClick={remove}>
            消す
          </button>
        </>
      ) : !open ? (
        <div>
          <button className="link-button" onClick={() => setOpen(true)}>
            周期を入れる
          </button>
        </div>
      ) : (
        <>
          <label className="label">
            <span>出勤の1日目（どの回の1日目でもよい）</span>
            <input className="input" type="date" value={draft.firstWorkDay ?? ""} onChange={(e) => setDraft({ ...draft, firstWorkDay: e.target.value })} />
          </label>
          <label className="label row-label">
            <span>続けて働く日数</span>
            <input className="input" type="number" min={1} max={30} value={draft.work ?? ""} onChange={(e) => setDraft({ ...draft, work: Number(e.target.value) })} />
          </label>
          <label className="label row-label">
            <span>続けて休む日数</span>
            <input className="input" type="number" min={1} max={30} value={draft.off ?? ""} onChange={(e) => setDraft({ ...draft, off: Number(e.target.value) })} />
          </label>
          {preview.length > 0 && <p className="meta">今日から: {preview.join("・")}</p>}
          <button className="button" disabled={!validCycle(draft)} onClick={apply}>
            この周期で予定にする（1年分）
          </button>{" "}
          <button className="link-button" onClick={() => setOpen(false)}>
            やめる
          </button>
        </>
      )}
    </div>
  );
}

export function WorkCycleEditor({ household, save }: { household: Household; save: (h: Household) => void | Promise<void> }) {
  const adults = household.members.filter((m) => m.relation === "self" || m.relation === "spouse");
  if (!adults.length) return null;
  return (
    <>
      <h2 id="work-cycle">決まった周期の勤務</h2>
      <p className="meta">
        シフト表などの書類が無く、「4日働いて2日休む」のように決まった周期でくり返す人は、ここに入れると出勤・休みの日を予定にします。
        子どもの行事と同じ日の仕事に気づくのと、家族に伝えるときの「同じ日の予定」に使います（トップには出しません）。
      </p>
      {adults.map((m) => (
        <MemberCycle key={m.id} member={m} household={household} save={save} />
      ))}
    </>
  );
}
