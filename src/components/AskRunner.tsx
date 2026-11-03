"use client";

// 頼みごとを裏で調べる係。どの画面にも付いている（layout）ので、アプリの中で画面を移っても途中で止めない。
// アプリを閉じた・ほかのアプリに切り替えた間は止まり、次に開いたときに続きから調べる（データは端末にあるため）。

import { useAskQueue } from "@/lib/useAsk";
import { useHousehold } from "@/lib/useHousehold";

export function AskRunner() {
  const { household, update } = useHousehold();
  useAskQueue(household, update);
  return null;
}
