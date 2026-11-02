// 画面の画像を撮る（スマホ幅 390・時計 2026-11-07 10:00 固定・架空の家族）。
// 使い方: node scripts/shots.mjs <出力フォルダ> <名前の頭> [BASE_URL] [名前:パス[:click=文字] ...]
//   例: node scripts/shots.mjs docs/img readme http://localhost:3100 "top:/" "family:/family/m-son"
//   名前に fold を付けると画面1枚分だけ（例: top-fold）。付けなければ縦に長い1枚（下のタブが途中に写るのは撮り方の都合）。
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

const [outDir, prefix, BASE = "http://localhost:3100", ...rest] = process.argv.slice(2);
if (!outDir || !prefix) {
  console.error("使い方: node scripts/shots.mjs <出力フォルダ> <名前の頭> [BASE_URL] [名前:パス ...]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
const pages = rest.length ? rest : ["top:/", "schedule:/schedule", "documents:/documents", "ask:/ask"];
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ja-JP", timezoneId: "Asia/Tokyo" });
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-11-07T10:00:00+09:00"));
await page.goto(BASE.replace(/\/$/, "") + "/");
await page.getByRole("button", { name: "架空の家族で試す" }).click();
await page.getByText("架空の家族で試しています").first().waitFor({ timeout: 20000 });
for (const spec of pages) {
  const [name, path, ...actions] = spec.split(":");
  await page.goto(BASE.replace(/\/$/, "") + path);
  await page.waitForTimeout(1500);
  for (const a of actions) {
    if (a.startsWith("click=")) {
      await page.getByText(a.slice(6), { exact: false }).first().click();
      await page.waitForTimeout(800);
    }
  }
  await page.screenshot({ path: `${outDir}/${prefix}-${name}.png`, fullPage: !/fold/.test(name) });
  console.log("saved", `${outDir}/${prefix}-${name}.png`);
}
await browser.close();
