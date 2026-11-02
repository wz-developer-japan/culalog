"use client";

import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    loadHousehold().then((h) => {
      setHousehold(h);
      setLoaded(true);
    });
  }, []);

  // 画面は先に更新し、端末への保存はそのあと行う（チェックの反応を遅らせない）
  const save = useCallback(async (next: Household) => {
    setHousehold(next);
    await saveHousehold(next);
  }, []);

  const clear = useCallback(async () => {
    await clearHousehold();
    setHousehold(null);
  }, []);

  return { household, loaded, save, clear };
}
