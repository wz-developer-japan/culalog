"use client";

// 大事な番号（証券番号・受給者番号など、めったに見ないのに急に要る番号）。
// 確定した今年度の書類から、端末の中でコードが探す。Claude には送らない。

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BackToTop } from "@/components/BackToTop";
import { NumbersList } from "@/components/NumbersList";
import { importantNumbers } from "@/lib/numbers";
import { useHousehold } from "@/lib/useHousehold";

export default function Numbers() {
  const router = useRouter();
  const { household, loaded } = useHousehold();
  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);
  if (!loaded || !household) return <main />;
  const numbers = importantNumbers(household);
  return (
    <main>
      <BackToTop />
      <h1 className="pt">大事な番号</h1>
      <p className="lead">
        証券番号・受給者番号など、手続きで急に聞かれる番号です。確定した今年度の書類から探し、この端末の中だけで答えます。
        聞く画面で「○○の番号は？」と聞いても、同じように端末の中で答えます。
      </p>
      <NumbersList numbers={numbers} members={household.members} />
    </main>
  );
}
