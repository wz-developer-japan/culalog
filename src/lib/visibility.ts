// 画面が裏に回った（ほかのアプリに切り替えた・ホームに戻った・画面を消した）かを覚えておく。
// スマホでは裏に回ると通信が止められることがあるので、その間に失敗した頼みごとは「つながらなかった」の仮の答えにせず、
// 画面に戻ったときに続きから調べる。

let lastHiddenAt = 0;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") lastHiddenAt = Date.now();
  });
}

/** いま裏に回っているか */
export function isHidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/** その時刻のあとに、一度でも裏に回ったか（いま裏にいる場合も） */
export function wasHiddenSince(time: number): boolean {
  return isHidden() || lastHiddenAt >= time;
}

/** 裏に回っていたせいで止まった、の印（中断と同じ扱いで、答えにはしない） */
export function interruptedError(): Error {
  const e = new Error("画面が裏に回っていたため、止まりました");
  e.name = "AbortError";
  return e;
}
