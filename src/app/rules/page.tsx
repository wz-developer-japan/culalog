"use client";

// わが家のきまり。書類には書いていない、その家の事情（例: 有給の申請は1週間前まで）。
// 書類の予定に当てはめると、予定の日から逆算した締切がホームに出る。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Household, HouseRule } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";

export default function Rules() {
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  const [label, setLabel] = useState("");
  const [daysBefore, setDaysBefore] = useState(7);
  const [memberId, setMemberId] = useState("m-self");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const rules = household.rules ?? [];
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name ?? "";

  async function add() {
    if (!label.trim()) {
      setError("きまりの名前を入れてください。");
      return;
    }
    const rule: HouseRule = {
      id: newId("rule"),
      label: label.trim(),
      daysBefore,
      memberId,
      note: note.trim() || undefined,
    };
    await save({ ...(household as Household), rules: [...rules, rule] });
    setLabel("");
    setNote("");
    setError("");
  }

  async function remove(id: string) {
    if (!confirm("このきまりを消しますか？当てはめた予定からも締切が消えます。")) return;
    await save({ ...(household as Household), rules: rules.filter((r) => r.id !== id) });
  }

  return (
    <main>
      <BackToTop />
      <h1>わが家のきまり</h1>
      <p className="lead">
        書類には書いていない、家の事情です。書類の予定に当てはめると、その日から逆算した締切をお知らせします。
      </p>

      {rules.length === 0 ? (
        <div className="card meta">まだありません。</div>
      ) : (
        rules.map((r) => (
          <div className="card" key={r.id}>
            {r.label}: 予定の{r.daysBefore}日前まで
            <div className="meta">
              {nameOf(r.memberId)}
              {r.note && `・${r.note}`}
            </div>
            <button className="link-button" onClick={() => remove(r.id)}>
              このきまりを消す
            </button>
          </div>
        ))
      )}

      <h2>きまりを足す</h2>
      <div className="card">
        <label className="label">
          何のきまりか
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 有給の申請（勤務先）" />
        </label>
        <label className="label">
          予定の何日前までか
          <input
            className="input"
            type="number"
            min={0}
            value={daysBefore}
            onChange={(e) => setDaysBefore(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="label">
          誰のきまりか
          <select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {household.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="label">
          メモ（任意）
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="例: シフトは2週間前に決まる" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" onClick={add}>
          足す
        </button>
      </div>
    </main>
  );
}
