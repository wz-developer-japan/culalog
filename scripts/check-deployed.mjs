// 本番（または指定した URL）が新しい版になったかを、ページが読む JS の中の文字列で確かめる（Vercel の画面を見なくてよいように）。
// 使い方: node scripts/check-deployed.mjs [BASE_URL] [探す文字列...]
//   文字列を省くと、この版で足した言葉を探す。全部見つかれば「新しい版」、1つでも無ければ「古い版」
// 🔴 最初の画面・トップは端末でデータを読んでから描くので、HTML の本文ではなく JS を見る

const BASE = (process.argv[2] ?? "https://culalog.vercel.app").replace(/\/$/, "");
const WANT = process.argv.length > 3 ? process.argv.slice(3) : ["わが家のきまりを、この予定に使う", "Thêm vào lịch"];
// 画面ごとに読む JS が分かれるので、いくつかの画面の HTML から JS を集める
const PAGES = ["/", "/schedule", "/documents", "/documents/x"];

const scripts = new Set();
for (const path of PAGES) {
  const res = await fetch(BASE + path, { headers: { "cache-control": "no-cache" } }).catch(() => null);
  if (!res?.ok) continue;
  const html = await res.text();
  for (const m of html.matchAll(/<script[^>]+src="([^"]+\.js[^"]*)"/g)) scripts.add(new URL(m[1], BASE).href);
}
let js = "";
for (const src of scripts) js += await fetch(src).then((r) => (r.ok ? r.text() : "")).catch(() => "");

const found = WANT.map((w) => [w, js.includes(w) || js.includes(JSON.stringify(w).slice(1, -1))]);
for (const [w, ok] of found) console.log(`${ok ? "あり" : "なし"}  ${w}`);
const fresh = found.every(([, ok]) => ok);
console.log(`${BASE}: ${fresh ? "新しい版" : "古い版（まだ出ていない）"}（JS ${scripts.size} 本・${Math.round(js.length / 1024)} KB を見た）`);
process.exit(fresh ? 0 : 1);
