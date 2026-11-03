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

export function useConnect(
  household: Household | null,
  update: (change: (current: Household) => Household) => Promise<void>,
) {
  const [status, setStatus] = useState<ConnectStatus>("thinking");
  const asked = useRef("");
  const ymd = toYmd(now());

  const input = household ? buildConnectInput(household, buildCandidates(household, now()), ymd, characterOf(household).style) : null;
  const basis = input ? basisOf(input) : "";
  const stored = household?.connect;
  const fresh = Boolean(stored && stored.source === "claude" && stored.basis === basis && stored.createdOn === ymd);

  useEffect(() => {
    if (!household || !input || fresh) return;
    const tag = `${basis}@${ymd}`;
    if (asked.current === tag) return;
    asked.current = tag;
    setStatus("thinking");
    (async () => {
      try {
        const response = await fetch("/api/connect", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (response.status === 503) {
          setStatus("unavailable");
          return;
        }
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.result) {
          setStatus("error");
          return;
        }
        let ok = false;
        await update((current) => {
          // 返ってくるまでのあいだに変わっていても、そのときの家で確かめる
          const verified = verifyConnect(body.result, current, buildCandidates(current, now()), {
            source: "claude",
            createdOn: ymd,
            basis,
          });
          ok = Boolean(verified);
          return verified ? { ...current, connect: verified } : current;
        });
        setStatus(ok ? "claude" : "error");
      } catch {
        setStatus("error");
      }
    })();
    // input は basis に入っているので、basis と日付で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household, basis, ymd, fresh]);

  if (!household) return { result: null as ConnectResult | null, status };
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
