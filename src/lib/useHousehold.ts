"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearHousehold, loadHousehold, saveHousehold } from "./storage";
import { scheduleFamilySync } from "./familySync";
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

/**
 * いちばん新しい家。画面ごとではなく、ページ全体で1つだけ持つ。
 * 時間のかかる処理（つなぐ・聞く・訳す・読み取り）は、頼んだ画面から移ったあとに返ってくることがある。
 * 画面ごとに持つと、移ったあとの変更（受け取り箱に入れた写真など）が届かない古い家に足して保存し、消してしまう
 */
let shared: { household: Household | null } | null = null;

/** いちばん新しい家に変更を足した家を返す（まだ読み込んでいなければ null）。保存はしない */
export function applyToLatest(change: (current: Household) => Household): Household | null {
  if (!shared?.household) return null;
  const next = change(shared.household);
  shared = { household: next };
  return next;
}

/** いちばん新しい家（試験と、読み込みを待たずに使う所のため） */
export function latestHousehold(): Household | null {
  return shared?.household ?? null;
}

/** 端末内に保存した家のデータを読み書きする */
export function useHousehold() {
  const [household, setHousehold] = useState<Household | null>(null);
  const [loaded, setLoaded] = useState(false);
  const me = useRef(Symbol("household"));

  useEffect(() => {
    const listener = (h: Household | null, from: symbol) => {
      if (from === me.current) return;
      setHousehold(h);
      setLoaded(true);
    };
    listeners.add(listener);
    if (shared) {
      // 前の画面で読み込み済み（保存の途中でも、こちらがいちばん新しい）
      setHousehold(shared.household);
      setLoaded(true);
      scheduleFamilySync(shared.household);
    } else {
      loadHousehold().then((h) => {
        // 読み込みが遅れて、そのあいだにほかの所が保存していたら、新しい家を古い家で上書きしない
        if (shared) {
          setHousehold(shared.household);
          setLoaded(true);
          return;
        }
        shared = { household: h };
        scheduleFamilySync(h);
        setHousehold(h);
        setLoaded(true);
      });
    }
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const publish = useCallback(async (next: Household) => {
    setHousehold(next);
    broadcast(next, me.current);
    await saveHousehold(next);
    // 家族の Telegram とつないでいれば、共有した書類のまとめを家族の置き場所へ（変わったときだけ）
    scheduleFamilySync(next);
  }, []);

  // 画面は先に更新し、端末への保存はそのあと行う（チェックの反応を遅らせない）。
  // その場の操作（押した・選んだ）だけに使う。待ったあとに保存するときは update を使う
  const save = useCallback(
    async (next: Household) => {
      shared = { household: next };
      await publish(next);
    },
    [publish],
  );

  /** いちばん新しい家に変更を足して保存する（待ったあとの保存は必ずこちら） */
  const update = useCallback(
    async (change: (current: Household) => Household) => {
      const next = applyToLatest(change);
      if (!next) return;
      await publish(next);
    },
    [publish],
  );

  const clear = useCallback(async () => {
    await clearHousehold();
    shared = { household: null };
    setHousehold(null);
    broadcast(null, me.current);
  }, []);

  return { household, loaded, save, update, clear };
}
