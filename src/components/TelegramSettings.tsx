"use client";

// 家族の Telegram グループとつなぐ（グループで /link → 出た6文字を入れる）。
// つなぐと「家族に伝える」でグループに送れ、近い予定の「日付と件数」だけを通知のために預ける。

import { useState } from "react";
import { now } from "@/lib/clock";
import { upcomingCounts } from "@/lib/tellBuild";
import type { Household } from "@/lib/types";

export function TelegramSettings({ household, save }: { household: Household; save: (h: Household) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function link() {
    setBusy(true);
    setStatus("");
    const res = await fetch("/api/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (res?.ok && json.chatId) {
      await save({ ...household, telegram: { chatId: json.chatId, token: json.token, linkedAt: new Date().toISOString() } });
      setCode("");
      setStatus("つなぎました。");
    } else setStatus(json.error ?? "つなげませんでした。");
  }

  async function notifyNow() {
    if (!household.telegram) return;
    setBusy(true);
    const res = await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...household.telegram, upcoming: upcomingCounts(household, now()), sendNow: true }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    setStatus(res?.ok ? "通知を送りました（7日以内の予定の件数だけ）。" : (json.error ?? "送れませんでした。"));
  }

  return (
    <>
      <h2>家族の Telegram</h2>
      <p className="meta">
        家族の Telegram グループに執事（bot）を入れると、会話をそれぞれの読みたい言葉に訳し、共有した書類を「家族に伝える」で送れます。
        書類は端末の中のまま。家族に伝えた中身と会話は Telegram と通訳（Claude）を通ります。通知のために預けるのは、近い予定の日付と件数だけです。
      </p>
      {household.telegram ? (
        <div className="card">
          つないでいます（{household.telegram.linkedAt.slice(0, 10)}）
          <button className="button secondary" disabled={busy} onClick={notifyNow}>
            近い予定の通知を、いま送ってみる
          </button>
          <button className="link-button" onClick={() => save({ ...household, telegram: undefined })}>
            つなぐのをやめる
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="meta">グループで /link と送ると、6文字の合言葉が出ます。</div>
          <input className="input" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.trim())} placeholder="例: AB12CD" aria-label="合言葉" />
          <button className="button" disabled={busy || code.length !== 6} onClick={link}>
            つなぐ
          </button>
        </div>
      )}
      {status && (
        <p className="note" role="status">
          {status}
        </p>
      )}
    </>
  );
}
