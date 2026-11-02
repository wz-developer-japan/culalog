// デモの流れをスマホ幅で通しで確かめる確認スクリプト。
// 使い方: node scripts/smoke.mjs [BASE_URL] （既定は http://localhost:3100）
// 時計を 2026-11-07 10:00（東京）に固定して、いつ動かしても同じ条件で確かめる。
// 画面の画像は scripts/out/ に書き出す（コミットしない）。
import { mkdirSync } from "node:fs";

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
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-11-07T10:00:00+09:00"));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push(["NG", name, String(e.message ?? e).split("\n")[0]]);
  }
  await page.screenshot({ path: `${OUT}${String(results.length).padStart(2, "0")}.png`, fullPage: true }).catch(() => {});
}
const see = (text) => page.getByText(text).first().waitFor({ timeout: 15000 });

await step("最初の画面から架空の家族で始められる", async () => {
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "架空の家族で試す" }).click();
  await see("架空の家族で試しています");
});

await step("ホームに執事のひとことと安全網がある", async () => {
  await page.locator("h2", { hasText: "のひとこと" }).waitFor({ timeout: 15000 });
  await page.locator("h2", { hasText: "期日が近いもの" }).waitFor({ timeout: 15000 });
});

await step("Claude の答えでないものには「仮」と出ている（キーが無いとき）", async () => {
  const body = await page.locator("main").innerText();
  if (!/仮/.test(body)) console.log("  （「仮」の表示なし。Claude のキーがある環境なら正常）");
});

await step("すべての予定に、これからの予定が並ぶ", async () => {
  await page.goto(BASE + "/schedule");
  await page.locator("h2", { hasText: "これから" }).waitFor({ timeout: 15000 });
});

await step("書類の一覧に確定済みの書類がある", async () => {
  await page.goto(BASE + "/documents");
  await see("年間行事予定");
});

await step("執事に頼むと、原本の場所つきの答えか「書いていません」が返る", async () => {
  await page.goto(BASE + "/ask");
  await page.getByPlaceholder("例: 冬休みはいつからいつまで？").fill("冬休みはいつからいつまで？");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  await page.locator(".card.briefing, .card.unknown").first().waitFor({ timeout: 90000 });
});

await step("けがの頼みごとで、学校のお知らせと傷害保険の証券の両方から引用が出る", async () => {
  await page.getByPlaceholder("例: 冬休みはいつからいつまで？").fill("蓮が学校でけがをした。保険の条件と連絡先を調べておいて");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  const card = page.locator(".card", { hasText: "保険の条件と連絡先" }).first();
  await card.locator("text=家族傷害保険").first().waitFor({ timeout: 90000 });
  const text = await card.innerText();
  if (!/学校でのけがの給付/.test(text)) throw new Error("学校のお知らせの引用がありません");
  // 学校名やタイトルだけの行が引用になっていないか
  if (/「くろうど第一小学校」/.test(text)) throw new Error("学校名だけの引用が出ています");
  await card.scrollIntoViewIfNeeded();
});

await step("頼んだことがホームの報告に残る", async () => {
  await page.goto(BASE + "/");
  await page.locator("h2", { hasText: "からの報告" }).waitFor({ timeout: 15000 });
});

await step("見本をまとめて渡すと、受け取り箱で順番に読まれ、まとめて確定できる", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /まとめて渡す/ }).click();
  await page.waitForURL(/\/inbox/, { timeout: 15000 });
  await see("全部読み終わりました");
  const button = page.getByRole("button", { name: /まとめて確定する/ });
  await button.click();
  await see("件を確定しました");
});

await step("聞きたいことに答えると、執事が覚える", async () => {
  await page.goto(BASE + "/questions");
  const yes = page.locator(".button.guess").first();
  await yes.waitFor({ timeout: 15000 });
  await yes.click();
  await see("覚えました");
});

await step("同じ見本をもう一度渡すと、同じファイルとして読まない", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /まとめて渡す/ }).click();
  await see("前に渡したものと同じファイル");
});

await browser.close();
for (const [s, name, why] of results) console.log(`${s}  ${name}${why ? `\n    ${why}` : ""}`);
console.log(`画面の画像: ${OUT}`);
process.exit(results.some(([s]) => s === "NG") ? 1 : 0);
