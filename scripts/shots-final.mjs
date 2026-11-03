// README・提出用の画面の画像を、ひととおりの流れで撮る（スマホ幅 390・時計 2026-11-07 10:00 固定・架空の家族）。
// 使い方: node scripts/shots-final.mjs <出力フォルダ> [BASE_URL]
// 流れ: はじめて開いたとき → 架空の家族 → トップ（読みたい言葉の1行・同じ日のぶつかり）→
//       授業参観の案内の書類（日本語 → Tiếng Việt・原本の行が光る）→ 家族に伝える（送る前の画面）→
//       設定（家族の読みたい言葉・家族の Telegram）→ 予定 → 写真の見本をまとめて渡す（読んでいる途中）→ 大事な番号 → 聞く
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
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light" });
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

// トップ: 家族の丸・読みたい言葉の1行・同じ日のぶつかりの気づき
await see("お仕事になっているようです");
await shot("02-top");
await shot("02b-top-long", true);

// 授業参観の案内の書類: 日本語 → Tiếng Việt
await page.goto(base + "/documents");
await page.getByText("授業参観・学級懇談会のご案内").first().click();
await page.waitForURL(/\/documents\//);
await page.getByRole("group", { name: "読む言葉" }).waitFor();
await shot("03-doc-ja");
await page.getByRole("group", { name: "読む言葉" }).getByRole("button", { name: "Tiếng Việt" }).click();
await page.getByRole("button", { name: /にする（執事が訳す）/ }).click();
await page.locator(".card.translated").waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
await shot("04-doc-vi");
// 原本の場所を押すと、原本の行が光る
const ref = page.locator(".card.translated .link-button, .card.translated button").filter({ hasText: /原本|Bản gốc/ }).first();
if (await ref.count()) {
  await ref.click();
  await page.waitForTimeout(800);
  await shot("04b-doc-vi-highlight");
}
await shot("04c-doc-vi-long", true);

// 家族に伝える（送る前の画面）
const tell = page.getByRole("button", { name: /家族に伝える/ });
await tell.scrollIntoViewIfNeeded();
await tell.click();
await page.locator(".tell-preview").waitFor({ timeout: 60000 });
await page.waitForTimeout(800);
await shot("05-tell-preview");
await shot("05b-tell-preview-long", true);
// 文の箱の中を、ベトナム語の段までスクロール
await page.locator("pre.tell-text").evaluate((el) => {
  const i = el.textContent.indexOf("【Tiếng Việt】");
  if (i < 0) return;
  const lines = el.textContent.slice(0, i).split("\n").length - 1;
  el.scrollTop = lines * parseFloat(getComputedStyle(el).lineHeight);
});
await shot("05c-tell-preview-vi");

// 設定: 家族の読みたい言葉・家族の Telegram
await page.goto(base + "/butler");
await see("家族の読みたい言葉");
await page.locator("#languages").evaluate((el) => el.scrollIntoView({ block: "start" }));
await shot("06-settings-languages");

// 予定
await page.goto(base + "/schedule");
await page.locator("h2", { hasText: "のひとこと" }).waitFor();
await shot("07-schedule");
await shot("07b-schedule-long", true);

// 渡す: 写真の見本をまとめて → 読んでいる途中
await page.goto(base + "/scan");
await shot("08-scan", true);
await page.getByRole("button", { name: /写真の見本を\d+件まとめて渡す/ }).click();
await page.waitForURL(/\/inbox/, { timeout: 30000 });
await page.waitForTimeout(2500);
await shot("09-inbox-reading");

// 大事な番号
await page.goto(base + "/numbers");
await see("大事な番号");
await shot("10-numbers");

// 聞く
await page.goto(base + "/ask");
await page.getByPlaceholder("例: 冬休みはいつからいつまで？").waitFor();
await shot("11-ask");
await browser.close();
