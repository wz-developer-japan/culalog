"use client";

// 受け取り箱を、執事が1枚ずつ順番に読む。
// この hook が付いている画面（ホーム・渡す・まとめて確認・聞きたいこと・書類の一覧）を開いているあいだだけ読む。
// 画面を閉じたら途中の1枚は止め、次に開いた画面が続きから読む（受け取り箱は端末に保存してある）。
// 使いすぎ対策の上限（429）に当たったら、言われた時刻まで待ってから続きを読む。

import { useEffect, useRef, useState } from "react";
import { toYmd } from "./deadlines";
import type { Extraction } from "./extraction";
import { base64Of, MAX_SEND_BYTES } from "./files";
import { applyExtraction, inboxItems, markItem } from "./inbox";
import { RELATION_LABELS } from "./labels";
import { deleteFile, getFile } from "./storage";
import type { Household } from "./types";
import { newId } from "./useHousehold";

/** 通信に失敗したときに、次に試すまで待つ時間 */
const RETRY_MS = 60 * 1000;

export function useInboxQueue(household: Household | null, update: (change: (current: Household) => Household) => Promise<void>) {
  const running = useRef<{ id: string; controller: AbortController } | null>(null);
  const [tick, setTick] = useState(0);
  const next = household ? inboxItems(household).find((i) => i.status === "waiting") : undefined;
  const pausedUntil = household?.inboxPausedUntil ? Date.parse(household.inboxPausedUntil) : 0;

  useEffect(() => {
    if (!household || !next || running.current) return;
    const wait = pausedUntil - Date.now();
    if (wait > 0) {
      const timer = setTimeout(() => setTick((t) => t + 1), Math.min(wait + 1000, 2 ** 31 - 1));
      return () => clearTimeout(timer);
    }
    const item = next;
    const controller = new AbortController();
    running.current = { id: item.id, controller };
    (async () => {
      try {
        const dataUrl = await getFile(item.id);
        if (!dataUrl) {
          await update((h) => markItem(h, item.id, { status: "failed", error: "ファイルが端末に見つかりませんでした。もう一度渡してください。" }));
          return;
        }
        const pages: string[] = [];
        for (const pid of item.pageIds ?? []) {
          const page = await getFile(pid);
          if (page) pages.push(page);
        }
        if (pages.length < (item.pageIds?.length ?? 0)) {
          await update((h) => markItem(h, item.id, { status: "failed", error: "ページの写真が端末に見つかりませんでした。もう一度渡してください。" }));
          return;
        }
        const sample = item.sampleId ? household.demoSamples?.find((x) => x.id === item.sampleId) : undefined;
        const body = JSON.stringify({
          ...(pages.length
            ? { pages: [dataUrl, ...pages].map((d) => ({ mediaType: item.mediaType, data: base64Of(d) })) }
            : { mediaType: item.mediaType, data: base64Of(dataUrl) }),
          today: toYmd(new Date()),
          family: household.members.map((m) => ({ id: m.id, name: m.name, relation: RELATION_LABELS[m.relation], note: m.note ?? "" })),
        });
        if (body.length > MAX_SEND_BYTES) {
          await update((h) =>
            markItem(h, item.id, {
              status: "failed",
              error: pages.length ? "ページの写真を合わせると大きすぎます。ページを分けて渡してください。" : "ファイルが大きすぎます。撮り直すか、手入力で登録してください。",
            }),
          );
          return;
        }
        let res: Response;
        try {
          res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
        } catch (e) {
          if (controller.signal.aborted) throw e;
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + RETRY_MS).toISOString() }));
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.extraction) {
          await update((h) =>
            applyExtraction(h, item, json.extraction as Extraction, {
              draftSource: "claude",
              dataUrl,
              pages,
              originalText: sample?.text ?? ((json.extraction as Extraction).transcript || undefined),
              newId,
            }),
          );
          await Promise.all([item.id, ...(item.pageIds ?? [])].map(deleteFile));
          return;
        }
        if (res.status === 503) {
          // 執事の準備中: 見本なら、用意しておいた仮の結果で流れを試せる。それ以外は準備ができるまで待つ
          if (sample) {
            await update((h) =>
              applyExtraction(h, item, sample.provisionalDraft, { draftSource: "provisional", dataUrl, pages, originalText: sample.text, newId }),
            );
            await Promise.all([item.id, ...(item.pageIds ?? [])].map(deleteFile));
          } else {
            await update((h) => markItem(h, item.id, { status: "needsKey", error: json.error }));
          }
          return;
        }
        if (res.status === 429) {
          const seconds = Number(res.headers.get("Retry-After")) || 60;
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + seconds * 1000).toISOString() }));
          return;
        }
        if (res.status >= 500) {
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + RETRY_MS).toISOString() }));
          return;
        }
        await update((h) => markItem(h, item.id, { status: "failed", error: json.error ?? "読み取れませんでした。" }));
      } catch {
        // 画面を閉じた（中断）。次に開いた画面が続きから読む
      } finally {
        if (running.current?.id === item.id) running.current = null;
        setTick((t) => t + 1);
      }
    })();
    // household は次の1枚の ID と待つ時刻で代表させる（保存のたびに読み直さないため）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next?.id, pausedUntil, tick]);

  useEffect(() => () => running.current?.controller.abort(), []);

  return { readingId: running.current?.id };
}
