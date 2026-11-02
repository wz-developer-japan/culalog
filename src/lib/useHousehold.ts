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

/** 端末内に保存した家のデータを読み書きする */
export function useHousehold() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loaded, setLoaded] = useState(false);
  // いちばん新しい家（時間のかかる処理の結果を、そのあいだの操作を消さずに足すため）
  const latest = useRef<Household | null>(null);

  useEffect(() => {
    loadHousehold().then((h) => {
      latest.current = h;
      setHousehold(h);
      setLoaded(true);
    });
  }, []);

  // 画面は先に更新し、端末への保存はそのあと行う（チェックの反応を遅らせない）
  const save = useCallback(async (next: Household) => {
    latest.current = next;
    setHousehold(next);
    await saveHousehold(next);
  }, []);

  /** いちばん新しい家に変更を足して保存する */
  const update = useCallback(async (change: (current: Household) => Household) => {
    if (!latest.current) return;
    const next = change(latest.current);
    latest.current = next;
    setHousehold(next);
    await saveHousehold(next);
  }, []);

  const clear = useCallback(async () => {
    await clearHousehold();
    latest.current = null;
    setHousehold(null);
  }, []);

  return { household, loaded, save, update, clear };
}
