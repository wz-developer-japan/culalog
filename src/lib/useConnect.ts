"use client";

// つなぐ＋ひとことを、書類・きまりが変わったときと、日付が変わったときだけ Claude に頼む。
// 結果は端末に保存する。Claude の準備中・つながらないときは、その場で仮のものを作る（保存しない）。

import { useEffect, useRef, useState } from "react";
import { now } from "./clock";
import { buildCandidates } from "./butler";
import { characterOf } from "./character";
import { basisOf, buildConnectInput, type ConnectResult, provisionalConnect, verifyConnect } from "./connect";
import { toYmd } from "./deadlines";
import type { Household } from "./types";

export type ConnectStatus = "claude" | "thinking" | "unavailable" | "error";

// 同じ中身・同じ日で頼んだかを、画面を移っても覚えておく（トップと予定を行き来するたび・日付を進めて戻すたびに
// Claude を呼び直して、回数の上限に当たらないように）。ページを読み込み直すと忘れる
const done = new Map<string, { status: ConnectStatus; result?: ConnectResult }>();
// 頼んだ画面から移ったあとに答えが返ってきたとき、いま開いている画面を描き直す
const listeners = new Set<() => void>();

export function useConnect(
  household: Household | null,
  update: (change: (current: Household) => Household) => Promise<void>,
) {
  const [state, setStatus] = useState<ConnectStatus>("thinking");
  let status = state;
  const asked = useRef("");
  const ymd = toYmd(now());
  const [, setTick] = useState(0);
  useEffect(() => {
    const redraw = () => setTick((n) => n + 1);
    listeners.add(redraw);
    return () => {
      listeners.delete(redraw);
    };
  }, []);

  const input = household ? buildConnectInput(household, buildCandidates(household, now()), ymd, characterOf(household).style) : null;
  const basis = input ? basisOf(input) : "";
  const stored = household?.connect;
  const fresh = Boolean(stored && stored.source === "claude" && stored.basis === basis && stored.createdOn === ymd);

  useEffect(() => {
    if (!household || !input || fresh) return;
    const tag = `${basis}@${ymd}`;
    if (asked.current === tag) return;
    asked.current = tag;
    if (done.has(tag)) {
      setTick((n) => n + 1);
      return;
    }
    done.set(tag, { status: "thinking" });
    const finish = (s: ConnectStatus, result?: ConnectResult) => {
      done.set(tag, { status: s, result });
      setStatus(s);
      listeners.forEach((f) => f());
    };
    setStatus("thinking");
    (async () => {
      try {
        const response = await fetch("/api/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (response.status === 503) {
          finish("unavailable");
          return;
        }
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.result) {
          finish("error");
          return;
        }
        let ok = false;
        let kept: ConnectResult | undefined;
        await update((current) => {
          // 返ってくるまでのあいだに変わっていても、そのときの家で確かめる
          const verified = verifyConnect(body.result, current, buildCandidates(current, now()), {
            source: "claude",
            createdOn: ymd,
            basis,
          });
          ok = Boolean(verified);
          if (verified) kept = verified;
          return verified ? { ...current, connect: verified } : current;
        });
        finish(ok ? "claude" : "error", kept);
      } catch {
        finish("error");
      }
    })();
    // input は basis に入っているので、basis と日付で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, basis, ymd, fresh]);

  if (!household) return { result: null as ConnectResult | null, status };
  // この画面より前に、同じ中身・同じ日で頼んでいたもの
  const before = done.get(`${basis}@${ymd}`);
  if (!fresh && before?.result) return { result: before.result, status: "claude" as const };
  if (!fresh && before && before.status !== "thinking") status = before.status;
  // Claude の答え（新しくても古くても、保存してあれば使う。作り直しのあいだは前のものを出す）
  if (stored?.source === "claude" && (fresh || status === "thinking")) {
    return { result: stored, status: fresh ? ("claude" as const) : status };
  }
  // 仮: コードで比べた違いと、デモ用に用意した例（Claude は使っていない）
  const result = verifyConnect(provisionalConnect(household, ymd), household, buildCandidates(household, now()), {
    source: "provisional",
    createdOn: ymd,
    basis,
  });
  return { result, status };
}
