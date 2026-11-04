"use client";

// 家族の Telegram グループとつなぐ（グループで /link → 出た6文字を入れる）。
// つなぐと、共有した書類のまとめを家族の置き場所に置き、「家族に伝える」を大人それぞれの1対1に送れる。

import { useState } from "react";
import { now } from "@/lib/clock";
import { isShared } from "@/lib/familyShare";
import { clearFamily, syncFamily } from "@/lib/familySync";
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

  async function syncNow() {
    setBusy(true);
    const r = await syncFamily(household, true);
    setBusy(false);
    setStatus(r.ok ? `共有した書類のまとめ ${r.count ?? 0}件を、家族の置き場所に置きました。` : (r.error ?? "置けませんでした。"));
  }

  async function clearNow() {
    if (!confirm("家族の置き場所（サーバー）にある、共有した書類のまとめ・家族の名簿・預かる？を全部消します。端末の書類は消えません。")) return;
    setBusy(true);
    const r = await clearFamily(household);
    setBusy(false);
    setStatus(r.ok ? "家族の置き場所のまとめを全部消しました。次に書類を共有すると、また置きます（置きたくなければ、つなぐのをやめてください）。" : (r.error ?? "消せませんでした。"));
  }

  const sharedCount = household.documents.filter(isShared).length;

  return (
    <>
      <h2>家族の Telegram</h2>
      <p className="meta">
        家族のグループでは会話を訳し、大人それぞれとの1対1にお知らせを届けます。
        そのため<b>共有した書類のまとめ</b>（題・予定・やること・訳）をサーバーに置きます。写真・原本の全文・大事な番号は置きません。
      </p>
      {household.telegram ? (
        <div className="card">
          つないでいます（{household.telegram.linkedAt.slice(0, 10)}）
          <div className="meta">共有した書類 {sharedCount}件のまとめを置いています（変わったら置き直します）。</div>
          <button className="button secondary" disabled={busy} onClick={syncNow}>
            共有した書類のまとめを、いま置き直す
          </button>
          <button className="link-button" disabled={busy} onClick={clearNow}>
            家族の置き場所のまとめを全部消す
          </button>
          <button className="button secondary" disabled={busy} onClick={notifyNow}>
            近い予定の通知を、いま送ってみる
          </button>
          <button
            className="link-button"
            onClick={async () => {
              await clearFamily(household);
              await save({ ...household, telegram: undefined });
            }}
          >
            つなぐのをやめる（家族の置き場所のまとめも消す）
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
