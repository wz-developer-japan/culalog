"use client";

// 「覚えておいて」と話したことの案。🔴 予定に入れるかは、あなたが確定ボタンで決める（書類の確定と同じ線）。
// 名前と日付は確定の前に直せる。いつから知らせるかは、話の中に無ければ「いつごろお知らせしましょう？」とボタンで聞く
// （種類ごとのおすすめを最初から選んでおき、押すだけで済むように）。日付の計算はコード。

import { Info, ProvisionalTag } from "@/components/Info";
import Link from "next/link";
import { useState } from "react";
import type { AskRecord } from "@/lib/ask";
import { askRecords } from "@/lib/ask";
import { now } from "@/lib/clock";
import { DEADLINE_KIND_LABELS } from "@/lib/labels";
import { daysBetween, parseDate } from "@/lib/deadlines";
import {
  dateText,
  defaultLeadDays,
  LEAD_CHOICES,
  leadPhrase,
  noticeStartOf,
  noticeText,
  rememberedDocument,
  type RememberDraft,
  withChecks,
} from "@/lib/remember";
import { newId, useHousehold } from "@/lib/useHousehold";

export function RememberCard({ record, butler, compact = false }: { record: AskRecord; butler: string; compact?: boolean }) {
  const { household, update } = useHousehold();
  const original = record.result!.remember!;
  const [draft, setDraft] = useState<RememberDraft>(original);
  // 話に知らせる時期が無かったときの選び方（日数のボタンか、日付を自分で決めるか）
  const recommended = defaultLeadDays(original.kind);
  const [customLead, setCustomLead] = useState(false);
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
    // 確定したあとは、保存した予定の中身を出す（画面を開き直しても、選んだ時期のまま）
    const saved = household?.documents.find((d) => d.id === record.rememberedDocumentId)?.deadlines[0];
    const shown = saved ? { label: saved.label, date: saved.date, endDate: saved.endDate ?? "", leadDays: saved.leadDays } : draft;
    return (
      <div className="card briefing">
        {head}
        <div className="briefing-text">
          覚えました。「{shown.label}」は {dateText(shown.date, today)}
          {shown.endDate && `〜${dateText(shown.endDate, today)}`}、{noticeText(shown, today)}お知らせします。
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
      {original.leadSpoken === false && (
        <div className="lead-choice" role="group" aria-label="いつごろお知らせするか">
          <div className="label">いつごろお知らせしましょう？</div>
          <div className="chips">
            {LEAD_CHOICES.map((days) => {
              const on = !customLead && draft.leadDays === days;
              return (
                <button
                  key={days}
                  className={`chip${on ? " selected" : ""}${days === recommended ? " recommended" : ""}`}
                  aria-pressed={on}
                  onClick={() => {
                    setCustomLead(false);
                    setDraft({ ...draft, leadDays: days });
                  }}
                >
                  {leadPhrase(days)}
                  {days === recommended && <small>おすすめ</small>}
                </button>
              );
            })}
            <button className={`chip${customLead ? " selected" : ""}`} aria-pressed={customLead} onClick={() => setCustomLead(true)}>
              日付を自分で決める
            </button>
          </div>
          {customLead && valid && (
            <label className="label">
              この日からお知らせする
              <input
                className="input"
                type="date"
                value={noticeStartOf(draft)}
                max={draft.date}
                onChange={(e) => {
                  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) return;
                  const lead = daysBetween(parseDate(e.target.value), parseDate(draft.date));
                  setDraft({ ...draft, leadDays: Math.max(0, lead) });
                }}
              />
            </label>
          )}
        </div>
      )}
      <div className="meta">
        種類: {DEADLINE_KIND_LABELS[draft.kind]}・
        {valid ? `${noticeText(draft, today)}お知らせします（日付の計算はコード）` : "日付を入れてください"}
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
      <div className="card-foot">
        {provisional && <ProvisionalTag />}
        <span>確定するまで予定には入りません。</span>
        <Info label="この案について">
          {provisional
            ? "仮の案: 執事（Claude）の準備中のため、「覚えて」「その前に教えて」などの決まった言い回しと「○月○日」だけをコードで読んでいます。"
            : "執事（Claude）が、話したことから予定の案を作りました。日付はコードで確かめています。"}{" "}
          確定するまで予定には入りません。原本の場所は「あなたが話したこと」として残ります。
        </Info>
      </div>
    </div>
  );
}
