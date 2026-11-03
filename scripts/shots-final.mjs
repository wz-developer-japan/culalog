// README・提出用の画面の画像を、ひととおりの流れで撮る（スマホ幅 390・時計 2026-11-07 10:00 固定・架空の家族）。
// 使い方: node scripts/shots-final.mjs <出力フォルダ> [BASE_URL]
// 流れ: はじめて開いたとき → 架空の家族 → 写真・メールの見本をまとめて渡す（読んでいる途中・読み終わり・確定）→
//       トップ・蓮のページ・予定（向こう7日・見に行きますか？）・聞きたいこと・大事な番号・聞く（けがの頼みごと）・
//       すべての予定（束ねたメール・カレンダーに入れる）・こんなとき
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

const [outDir, BASE = "http://localhost:3100"] = process.argv.slice(2);
if (!outDir) {
  console.error("使い方: node scripts/shots-final.mjs <出力フォルダ> [BASE_URL]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const base = BASE.replace(/\/$/, "");
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-11-07T10:00:00+09:00"));
const shot = async (name, fullPage = false) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage });
  console.log("saved", name);
};
const see = (text, timeout = 30000) => page.getByText(text).first().waitFor({ timeout });

await page.goto(base + "/");
await page.getByRole("button", { name: "架空の家族で試す" }).waitFor();
await shot("01-start");
await page.getByRole("button", { name: "架空の家族で試す" }).click();
await see("架空の家族で試しています");

// 渡す: 写真の見本をまとめて → 読んでいる途中
await page.goto(base + "/scan");
await shot("04a-scan", true);
await page.getByRole("button", { name: /写真の見本を\d+件まとめて渡す/ }).click();
await page.waitForURL(/\/inbox/, { timeout: 30000 });
await page.waitForTimeout(2500);
await shot("04b-inbox-reading");
await see("全部読み終わりました", 240000);
await shot("05-inbox-done", true);
await page.getByRole("button", { name: /まとめて確定する/ }).click();
await see("件を確定しました");
await shot("05b-inbox-after-confirm");
// メールの見本
await page.goto(base + "/scan");
await page.getByRole("button", { name: /メールの見本を\d+件まとめて渡す/ }).click();
await page.waitForURL(/\/inbox/, { timeout: 30000 });
await see("全部読み終わりました", 240000);
await page.getByRole("button", { name: /まとめて確定する/ }).click();
await see("件を確定しました");

// トップ・蓮のページ・予定
await page.goto(base + "/");
await see("メニュー");
await shot("02-top");
await page.goto(base + "/family/m-son");
await see("近いもの");
await shot("03-family-son");
await shot("03b-family-son-long", true);
await page.goto(base + "/schedule");
await page.locator("h2", { hasText: "のひとこと" }).waitFor();
await shot("06-schedule");
await shot("06b-schedule-long", true);
// 授業参観に「見に行きますか？」
const openClass = page.locator(".card.insight").filter({ hasText: /見に行きますか/ }).first();
await openClass.waitFor({ timeout: 30000 });
await openClass.evaluate((el) => el.scrollIntoView({ block: "center" }));
await shot("06c-open-class");
await page.goto(base + "/questions");
await page.waitForTimeout(1500);
await shot("07-questions");
await page.goto(base + "/numbers");
await see("大事な番号");
await shot("08-numbers");
// 聞く: けがの頼みごと
await page.goto(base + "/ask");
await page.getByPlaceholder("例: 冬休みはいつからいつまで？").fill("蓮が学校でけがをした。保険の条件と連絡先を調べておいて");
await page.getByRole("button", { name: /に頼む$/ }).click();
await page.locator(".card", { hasText: "保険の条件と連絡先" }).first().locator("text=家族傷害保険").first().waitFor({ timeout: 120000 });
await shot("09-ask-injury", true);
// すべての予定: 束ねたメール
await page.goto(base + "/schedule/all");
await see("これから");
const bill = page.locator(".dcard").filter({ hasText: "後払いの支払期限" }).first();
await bill.scrollIntoViewIfNeeded();
await shot("10-schedule-all-bundled");
// いつものカレンダーに入れる（遠足）
const excursion = page.locator(".dcard").filter({ hasText: "遠足" }).first();
await excursion.getByRole("button", { name: "カレンダーに入れる" }).click();
await excursion.getByRole("link", { name: "Google カレンダー" }).waitFor();
await excursion.evaluate((el) => el.scrollIntoView({ block: "center" }));
await shot("11-calendar");
// こんなとき
await page.goto(base + "/cases");
await page.waitForTimeout(1000);
await shot("12-cases");
await page.goto(base + "/cases?s=injury");
await see("けがのときに見る所");
await shot("12b-cases-injury");
await browser.close();
