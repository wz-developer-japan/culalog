"use client";

// アプリの「今日」。ふだんは端末の時計。デモでは「日付を進める」で何日か先の日として見られる
// （審査員が自分で日を進めて、締切が近づく・過ぎる様子を見るため）。進めた日数は端末に覚える。
// 🔴 日付の計算そのものは lib/deadlines.ts。ここは「いつを今日とみなすか」だけ。

import { useCallback, useEffect, useState } from "react";

const KEY = "culalog:todayOffset";
const EVENT = "culalog:today-change";

export function todayOffset(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

/** いまこの瞬間（進めた日数を足したもの） */
export function now(): Date {
  const d = new Date();
  const off = todayOffset();
  if (off) d.setDate(d.getDate() + off);
  return d;
}

export function setTodayOffset(days: number): void {
  try {
    if (days) localStorage.setItem(KEY, String(days));
    else localStorage.removeItem(KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** 画面で「進めた日数」を使う（変えたら画面を描き直す） */
export function useTodayOffset(): [number, (days: number) => void] {
  const [offset, setState] = useState(0);
  useEffect(() => {
    setState(todayOffset());
    const sync = () => setState(todayOffset());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const set = useCallback((days: number) => {
    setTodayOffset(days);
    setState(days);
  }, []);
  return [offset, set];
}
