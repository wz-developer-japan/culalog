"use client";

// 「覚えておいて」と話したことの案。🔴 予定に入れるかは、あなたが確定ボタンで決める（書類の確定と同じ線）。
// 名前と日付は確定の前に直せる。いつから知らせるかはコードが計算して見せる。

import Link from "next/link";
import { useState } from "react";
import type { AskRecord } from "@/lib/ask";
import { askRecords } from "@/lib/ask";
import { now } from "@/lib/clock";
import { DEADLINE_KIND_LABELS } from "@/lib/labels";
import { dateText, leadPhrase, noticeStartOf, rememberedDocument, type RememberDraft, withChecks } from "@/lib/remember";
import { newId, useHousehold } from "@/lib/useHousehold";

export function RememberCard({ record, butler, compact = false }: { record: AskRecord; butler: string; compact?: boolean }) {
  const { update } = useHousehold();
  const original = record.result!.remember!;
  const [draft, setDraft] = useState<RememberDraft>(original);
  const today = now();
  const checked = withChecks(draft, record.question, today);
  const valid = Boolean(draft.label.trim()) && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && (!draft.endDate || draft.endDate >= draft.date);
  const provisional = record.result!.source === "provisional";

  const confirm = () =>
    update((current) => {
      const doc = rememberedDocument(current, { ...draft, label: draft.label.trim() }, record.question, record.askedAt, newId);
      return {
        ...current,
        documents: [...current.documents, doc],
        asks: askRecords(current).map((a) => (a.id === record.id ? { ...a, rememberedDocumentId: doc.id, seenAt: new Date().toISOString() } : a)),
      };
    });
  const dismiss = () =>
    update((current) => ({
      ...current,
      asks: askRecords(current).map((a) => (a.id === record.id ? { ...a, rememberDismissed: true, seenAt: new Date().toISOString() } : a)),
    }));

  const head = (
    <>
      <div className="meta">{compact ? `${butler}からの報告` : "話したこと"}</div>
      <div className="question-text">{record.question}</div>
    </>
  );

  if (record.rememberedDocumentId) {
    return (
      <div className="card briefing">
        {head}
        <div className="briefing-text">
          覚えました。「{draft.label}」は {dateText(draft.date, today)}{draft.endDate && `〜${dateText(draft.endDate, today)}`}、{leadPhrase(draft.leadDays)}の{" "}
          {dateText(noticeStartOf(draft), today)} からお知らせします。
        </div>
        <div className="meta">
          原本: <Link href={`/documents/${record.rememberedDocumentId}`}>あなたが話したこと</Link>（書類は無く、話した言葉を原本として残しています）
        </div>
      </div>
    );
  }
  if (record.rememberDismissed) {
    return (
      <div className="card">
        {head}
        <div className="meta">覚えないことにしました。</div>
      </div>
    );
  }
  return (
    <div className="card briefing remember">
      {head}
      <div className="briefing-text">{record.result!.answer}</div>
      <label className="label">
        何を
        <input className="input" value={draft.label} maxLength={60} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
      </label>
      <div className="row-2">
        <label className="label">
          {draft.endDate ? "いつから" : "いつ"}
          <input className="input" type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
        </label>
        {draft.endDate && (
          <label className="label">
            いつまで
            <input className="input" type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </label>
        )}
      </div>
      <div className="meta">
        種類: {DEADLINE_KIND_LABELS[draft.kind]}・{valid ? `${leadPhrase(draft.leadDays)}の ${dateText(noticeStartOf(draft), today)} からお知らせします（日付の計算はコード）` : "日付を入れてください"}
      </div>
      {checked.check && <div className="unknown-label" style={{ marginTop: 6 }}>⚠ {checked.check}</div>}
      <div className="row-actions" style={{ marginTop: 10 }}>
        <button className="button small" style={{ width: "auto", margin: 0 }} disabled={!valid} onClick={confirm}>
          覚えておく（確定）
        </button>
        <button className="button small secondary" style={{ width: "auto", margin: 0 }} onClick={dismiss}>
          覚えない
        </button>
      </div>
      <div className="meta provisional">
        {provisional
          ? "仮の案: 執事（Claude）の準備中のため、「覚えて」「その前に教えて」などの決まった言い回しと「○月○日」だけをコードで読んでいます。"
          : "執事（Claude）が、話したことから予定の案を作りました。日付はコードで確かめています。"}{" "}
        確定するまで予定には入りません。原本の場所は「あなたが話したこと」として残ります。
      </div>
    </div>
  );
}
