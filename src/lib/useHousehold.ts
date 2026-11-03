"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearHousehold, loadHousehold, saveHousehold } from "./storage";
import type { Household } from "./types";

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** 自分で始めるときの、空の家（本人だけ） */
export function createEmptyHousehold(): Household {
  return {
    isDemo: false,
    members: [{ id: "m-self", name: "わたし", relation: "self" }],
    documents: [],
    expected: [],
    timetable: [],
  };
}

/**
 * 同じ画面の中で家のデータを使っている所（いまの画面と、裏で頼みごとを調べる係）に、変わったことを知らせる。
 * 片方が古い家のまま保存して、もう片方の変更（頼みごとの答えなど）を消さないため
 */
const listeners = new Set<(household: Household | null, from: symbol) => void>();
function broadcast(household: Household | null, from: symbol) {
  for (const listener of listeners) listener(household, from);
}

/** 端末内に保存した家のデータを読み書きする */
export function useHousehold() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loaded, setLoaded] = useState(false);
  // いちばん新しい家（時間のかかる処理の結果を、そのあいだの操作を消さずに足すため）
  const latest = useRef<Household | null>(null);
  const me = useRef(Symbol("household"));
  // ほかの所が保存する前に読み終わったか（読み込みが遅れて、新しい家を古い家で上書きしないため）
  const touched = useRef(false);

  useEffect(() => {
    const listener = (h: Household | null, from: symbol) => {
      if (from === me.current) return;
      touched.current = true;
      latest.current = h;
      setHousehold(h);
      setLoaded(true);
    };
    listeners.add(listener);
    loadHousehold().then((h) => {
      if (touched.current) return;
      latest.current = h;
      setHousehold(h);
      setLoaded(true);
    });
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // 画面は先に更新し、端末への保存はそのあと行う（チェックの反応を遅らせない）
  const save = useCallback(async (next: Household) => {
    latest.current = next;
    setHousehold(next);
    broadcast(next, me.current);
    await saveHousehold(next);
  }, []);

  /** いちばん新しい家に変更を足して保存する */
  const update = useCallback(async (change: (current: Household) => Household) => {
    if (!latest.current) return;
    const next = change(latest.current);
    latest.current = next;
    setHousehold(next);
    broadcast(next, me.current);
    await saveHousehold(next);
  }, []);

  const clear = useCallback(async () => {
    await clearHousehold();
    latest.current = null;
    setHousehold(null);
    broadcast(null, me.current);
  }, []);

  return { household, loaded, save, update, clear };
}
