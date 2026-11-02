// Claude API の使いすぎ対策（サーバー側）。
//
// 公開 URL は誰でも開けるため、Claude を呼ぶ API には次の3段の制限をかける。
//   1. 接続元ごとの回数上限（1時間あたり）
//   2. サーバー全体の回数上限（1日あたり）
//   3. 入力サイズの上限（API ルート側で確認）
//
// 注意: この回数の記録はサーバーのメモリ上にあるため、サーバーレス環境では
// インスタンスごとに別々に数えられ、再起動で消える。確実な上限ではないので、
// 最終的な歯止めは Anthropic Console 側の利用上限で設定する。
// なお「架空の家族で試す」は読み取り済みのデータを使うので、Claude API を呼ばない。

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function readLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const perClient = new Map<string, number[]>();
let globalWindowStart = Date.now();
let globalCount = 0;

export type RateLimitResult =
  | { ok: true }
  | { ok: false; reason: "client" | "global"; retryAfterSeconds: number };

export function checkRateLimit(clientId: string, now: number = Date.now()): RateLimitResult {
  const perHour = readLimit("RATE_LIMIT_PER_HOUR", 10);
  const perDay = readLimit("RATE_LIMIT_GLOBAL_PER_DAY", 200);

  if (now - globalWindowStart >= DAY_MS) {
    globalWindowStart = now;
    globalCount = 0;
  }
  if (globalCount >= perDay) {
    return {
      ok: false,
      reason: "global",
      retryAfterSeconds: Math.ceil((globalWindowStart + DAY_MS - now) / 1000),
    };
  }

  const recent = (perClient.get(clientId) ?? []).filter((t) => now - t < HOUR_MS);
  if (recent.length >= perHour) {
    perClient.set(clientId, recent);
    return {
      ok: false,
      reason: "client",
      retryAfterSeconds: Math.ceil((recent[0] + HOUR_MS - now) / 1000),
    };
  }

  recent.push(now);
  perClient.set(clientId, recent);
  globalCount += 1;

  // 記録が増えすぎないよう、古い接続元を掃除する
  if (perClient.size > 5000) {
    for (const [id, times] of perClient) {
      if (times.every((t) => now - t >= HOUR_MS)) perClient.delete(id);
    }
  }
  return { ok: true };
}

/** テスト用 */
export function resetRateLimit(): void {
  perClient.clear();
  globalWindowStart = Date.now();
  globalCount = 0;
}
