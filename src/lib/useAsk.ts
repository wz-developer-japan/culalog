"use client";

// 「頼んで、あとで報告」。
// 頼んだことは端末にすぐ保存し、答えはあとから付ける。この hook が付いている画面（ホーム・聞く）を開いているあいだに、
// 答えの無い頼みごとを1つずつ調べて保存する。画面を閉じると途中の調べは止め、次に開いた画面が調べ直す。

import { useEffect, useRef } from "react";
import { type AskRecord, askRecords, runAsk } from "./ask";
import { characterOf } from "./character";
import { answerNumberQuestion } from "./numbers";
import type { Household } from "./types";
import { newId } from "./useHousehold";

/**
 * 頼みごとを足す（答えはあとで）。
 * 「○○の番号は？」「○○持ってる？」は、Claude に送らずに、この端末の中で確定した書類から探してすぐ答える
 */
export function addAsk(household: Household, question: string): { household: Household; record: AskRecord } {
  const now = new Date().toISOString();
  const numberAnswer = answerNumberQuestion(household, question.trim());
  const record: AskRecord = numberAnswer
    ? { id: newId("ask"), question: question.trim(), askedAt: now, numberAnswer, seenAt: now }
    : { id: newId("ask"), question: question.trim(), askedAt: now };
  return { household: { ...household, asks: [record, ...askRecords(household)].slice(0, 30) }, record };
}

/** 報告を「見た」にする */
export function markAskSeen(household: Household, id: string): Household {
  const now = new Date().toISOString();
  return { ...household, asks: askRecords(household).map((a) => (a.id === id ? { ...a, seenAt: now } : a)) };
}

/** まだ答えの無い頼みごと（古い順） */
export function pendingAsks(household: Household): AskRecord[] {
  return askRecords(household).filter((a) => !a.result && !a.numberAnswer).reverse();
}

/** 答えが付いて、まだ「見た」にしていない報告（新しい順） */
export function unseenReports(household: Household): AskRecord[] {
  return askRecords(household).filter((a) => a.result && !a.seenAt);
}

export function useAskQueue(household: Household | null, update: (change: (current: Household) => Household) => Promise<void>) {
  const running = useRef<{ id: string; controller: AbortController } | null>(null);
  const pendingId = household ? (pendingAsks(household)[0]?.id ?? "") : "";

  useEffect(() => {
    if (!household || !pendingId || running.current) return;
    const record = pendingAsks(household)[0];
    const controller = new AbortController();
    running.current = { id: record.id, controller };
    (async () => {
      try {
        const result = await runAsk(household, record.question, characterOf(household).style, controller.signal);
        await update((current) => ({
          ...current,
          asks: askRecords(current).map((a) => (a.id === record.id ? { ...a, result } : a)),
        }));
      } catch {
        // 画面を閉じた（中断）。次に開いた画面が調べ直す
      } finally {
        if (running.current?.id === record.id) running.current = null;
      }
    })();
    // household は pendingId で代表させる（答えを保存するたびに調べ直さないため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  useEffect(() => () => running.current?.controller.abort(), []);
}
