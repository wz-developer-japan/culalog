// 「つなぐ」の答えが返る前に写真を渡しても、受け取り箱の1件が消えないかを、スマホ幅のブラウザで確かめる。
// 審査員が踏んだ不具合（11/06）: /?demo=few →「架空の家族で試す」→ すぐ ＋ で写真を1枚渡す →
// 最初の /api/connect が返った瞬間に受け取り箱が空になり、読み取りが返っても書類がどこにも出なかった。
// （トップの画面の「いちばん新しい家」が、移ったあとの変更を知らない古い家のままで、そこに答えを足して保存していた）
// /api/connect と /api/extract はこの中で作った答えを返す（本物の Claude は呼ばない）。
// 使い方: node scripts/check-connect-race.mjs [BASE_URL] （既定は http://localhost:3100）
import { readFileSync } from "node:fs";

async function loadPlaywright() {
  for (const name of ["playwright", "/opt/node-tools/node_modules/playwright/index.js"]) {
    try {
      const mod = await import(name);
      return mod.chromium ? mod : mod.default;
    } catch {}
  }
  throw new Error("Playwright が見つかりません。");
}

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const PHOTO = new URL("../public/samples/2026-11-07/o9-sankan-annai-photo.jpg", import.meta.url).pathname;
// 授業参観の案内を本物の Claude が読んだ結果（11/6 に保存したもの）を、読み取りの答えとして返す
const reading = JSON.parse(readFileSync(new URL("../src/data/savedReadings.json", import.meta.url), "utf8"))["photo-o9-sankan-annai"].reading;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-11-07T10:00:00+09:00"));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let connectAnswered = false;
let releaseExtract;
const extractGate = new Promise((r) => (releaseExtract = r));
let connectCalls = 0;
let extractCalls = 0;

// つなぐ: 最初の1回は 8秒待ってから返す（そのあいだに写真を渡す）。答えの中身は空でよい（保存されることが大事）
await page.route("**/api/connect", async (route) => {
  connectCalls++;
  const first = connectCalls === 1;
  if (first) await wait(8000);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ result: { briefing: [], insights: [] } }) });
  if (first) connectAnswered = true;
});
// 読み取り: つなぐが返ったあとまで待たせてから返す
await page.route("**/api/extract", async (route) => {
  extractCalls++;
  await extractGate;
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ extraction: reading }) });
});

const results = [];
const check = (ok, name, detail = "") => results.push([ok, name, detail]);

try {
  await page.goto(BASE + "/?demo=few");
  await page.getByRole("button", { name: "架空の家族で試す" }).click();
  await page.getByText("架空の家族で試しています").first().waitFor({ timeout: 15000 });
  await wait(1500);
  check(!connectAnswered && connectCalls >= 1, "始めてすぐは、つなぐがまだ返っていない（不具合と同じ順番）");

  await page.locator("a.fab[href='/scan']").click();
  await page.waitForURL(/\/scan$/, { timeout: 15000 });
  await page.locator("input[type=file]").first().setInputFiles(PHOTO);
  await page.getByText("1件を受け取りました").first().waitFor({ timeout: 15000 });
  check(!connectAnswered, "写真を渡し終えた時点でも、つなぐはまだ返っていない");

  await page.locator("a[href='/inbox']").first().click();
  await page.waitForURL(/\/inbox$/, { timeout: 15000 });
  const deadline = Date.now() + 20000;
  while (!connectAnswered && Date.now() < deadline) await wait(200);
  check(connectAnswered, "つなぐが返った");
  await wait(1500);
  // 読んでいるあいだは「確認待ちの書類はありません」でも正しい。消えたかは、受け取り箱の進み具合の欄で見る
  const kept = await page.getByText(/受け取った\s*1件のうち/).count();
  check(kept > 0, "つなぐが返っても、受け取り箱の1件が消えない（「受け取った 1件のうち…」が残る）");

  releaseExtract();
  await page.getByText("授業参観").first().waitFor({ timeout: 20000 }).then(
    () => check(true, "読み取りが返ると、授業参観の案内が確認待ちに出る"),
    () => check(false, "読み取りが返ると、授業参観の案内が確認待ちに出る"),
  );
  check(extractCalls === 1, "読み取りは1回だけ送った", `${extractCalls}回`);

  // 読み込み直しても（端末に保存したものから）書類が残っている
  await page.reload();
  await page.getByText("授業参観").first().waitFor({ timeout: 15000 }).then(
    () => check(true, "読み込み直しても、読んだ書類が端末に残っている"),
    () => check(false, "読み込み直しても、読んだ書類が端末に残っている"),
  );
} catch (e) {
  check(false, "途中で止まった", String(e.message ?? e).split("\n")[0]);
} finally {
  releaseExtract?.();
  await browser.close();
}

for (const [ok, name, detail] of results) console.log(`${ok ? "ok" : "NG"}  ${name}${detail ? `（${detail}）` : ""}`);
const ng = results.filter(([ok]) => !ok).length;
console.log(ng ? `NG が ${ng} 件` : `${results.length}項目 ok`);
process.exit(ng ? 1 : 0);
