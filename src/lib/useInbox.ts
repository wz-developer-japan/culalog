"use client";

// 受け取り箱を、執事が1枚ずつ順番に読む。
// この hook が付いている画面（ホーム・渡す・まとめて確認・聞きたいこと・書類の一覧）を開いているあいだだけ読む。
// 画面を閉じたら途中の1枚は止め、次に開いた画面が続きから読む（受け取り箱は端末に保存してある）。
// 使いすぎ対策の上限（429）に当たったら、言われた時刻まで待ってから続きを読む。

import { useEffect, useRef, useState } from "react";
import { now } from "./clock";
import { toYmd } from "./deadlines";
import type { Extraction } from "./extraction";
import { base64Of, MAX_SEND_BYTES, textOfDataUrl } from "./files";
import { claimExtract, sendExtractOnce } from "./extractOnce";
import { applyExtraction, inboxItems, markItem } from "./inbox";
import { RELATION_LABELS } from "./labels";
import { deleteFile, getFile } from "./storage";
import type { Household } from "./types";
import { newId } from "./useHousehold";

/**
 * 見本のうち、キーがあるとき本物の Claude で読むもの（審査員に Claude が読むところを見せる）。
 * 授業参観のご案内（/?demo=few で渡す見本。「来ていないもの」→ 読み取り → 確定 → 休みの申請の締切、が一続き）と、
 * ふつうの入口で渡せる個別懇談会の写真（候補日①〜④と、家族の勤務の重なり）
 */
export const LIVE_SAMPLE_IDS = ["sample-open-class", "photo-k5-kondankai"];

/** 通信に失敗したときに、次に試すまで待つ時間 */
const RETRY_MS = 60 * 1000;

export function useInboxQueue(household: Household | null, update: (change: (current: Household) => Household) => Promise<void>) {
  const running = useRef<{ id: string } | null>(null);
  // この画面が開いているか。閉じたあとに届いた返事は足さない（次に開いた画面が同じ返事を受け取って足す）
  const alive = useRef(true);
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
    running.current = { id: item.id };
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
        // 見本は、用意した仮の結果で読む（本物の Claude で読むのは LIVE_SAMPLE_IDS の見本だけ。料金と回数の上限のため）
        if (sample && !LIVE_SAMPLE_IDS.includes(sample.id)) {
          await update((h) => applyExtraction(h, item, sample.provisionalDraft, { draftSource: "provisional", dataUrl, pages, originalText: sample.text, newId }));
          await Promise.all([item.id, ...(item.pageIds ?? [])].map(deleteFile));
          return;
        }
        const body = JSON.stringify({
          ...(pages.length
            ? { pages: [dataUrl, ...pages].map((d) => ({ mediaType: item.mediaType, data: base64Of(d) })) }
            : { mediaType: item.mediaType, data: base64Of(dataUrl) }),
          today: toYmd(now()),
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
        // 同じ1枚を送っている途中なら送り直さず、同じ返事を待つ（画面を移っても二重に送らない）
        const pending = sendExtractOnce(item.id, () =>
          fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body }),
        );
        const reply = await pending;
        // 待つあいだに画面を閉じたら足さない。返事を足すのは、受け取った画面1つだけ
        if (!alive.current || !claimExtract(item.id, pending)) return;
        if (reply.kind === "network") {
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + RETRY_MS).toISOString(), inboxPauseReason: "error" }));
          return;
        }
        const res = { ok: reply.ok, status: reply.status, headers: { get: (_: string) => reply.retryAfter } };
        const json = reply.json as { extraction?: Extraction; error?: string };
        if (res.ok && json.extraction) {
          await update((h) =>
            applyExtraction(h, item, json.extraction as Extraction, {
              draftSource: "claude",
              dataUrl,
              pages,
              // 文字で渡したものは、Claude の書き写しではなく、渡した文字そのものを原本にする
              originalText: sample?.text ?? (item.mediaType === "text/plain" ? textOfDataUrl(dataUrl) : (json.extraction as Extraction).transcript || undefined),
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
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + seconds * 1000).toISOString(), inboxPauseReason: "limit" }));
          return;
        }
        if (res.status >= 500) {
          await update((h) => ({ ...h, inboxPausedUntil: new Date(Date.now() + RETRY_MS).toISOString(), inboxPauseReason: "error" }));
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

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  return { readingId: running.current?.id };
}
