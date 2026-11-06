// 受け取り箱の1枚を /api/extract に送るのは、ページ全体で1回だけにする。
// 画面を移る（受け取り箱を読む画面がいったん閉じて、別の画面が続きを読む）と、前は送り直していて、
// 同じ書類を Claude に2回読ませていた（料金も回数の上限も2回分）。
// 送っている途中の1枚は、ここに返事の約束（Promise）を置き、次に開いた画面は同じ返事を待つ。
// 返事を家のデータに足せるのは、受け取った（claimExtract で取り出した）画面だけ（二重に足さない）。

export type ExtractReply =
  | { kind: "reply"; ok: boolean; status: number; retryAfter: string | null; json: Record<string, unknown> }
  | { kind: "network" };

const inflight = new Map<string, Promise<ExtractReply>>();

/** 受け取り箱の1枚（itemId）を送る。同じ1枚を送っている途中・返事を受け取る前なら、送らずに同じ返事を待つ */
export function sendExtractOnce(itemId: string, send: () => Promise<Response>): Promise<ExtractReply> {
  const pending = inflight.get(itemId);
  if (pending) return pending;
  const p: Promise<ExtractReply> = send()
    .then(async (res) => ({
      kind: "reply" as const,
      ok: res.ok,
      status: res.status,
      retryAfter: res.headers.get("Retry-After"),
      json: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>,
    }))
    .catch(() => ({ kind: "network" as const }));
  inflight.set(itemId, p);
  return p;
}

/** 返事を家のデータに足す前に呼ぶ。true を返した画面だけが足す（同じ返事を二重に足さない） */
export function claimExtract(itemId: string, reply: Promise<ExtractReply>): boolean {
  if (inflight.get(itemId) !== reply) return false;
  inflight.delete(itemId);
  return true;
}

/** 試験用: 送っている途中の数 */
export function inflightCount(): number {
  return inflight.size;
}
