// iPhone のカレンダーに予定を入れるリンク（執事の1対1のお知らせの「カレンダーに追加」から開く）。
// 推測できない合言葉つき・30日で切れる。中身は、お知らせと同じ言葉の題とメモの予定1件だけ。
// 🔴 Telegram などアプリの中のブラウザ（WebView）は .ics を「ダウンロード」にしてしまい、カレンダーの「すべて追加」が出ない。
//    iPhone の WebView から開かれたときだけ、短い案内のページを返し、x-safari-https:// で Safari に渡す（Safari は text/calendar で「すべて追加」を出す）。
//    Safari・ほかの端末・dl=1 のときは、今まで通り .ics をそのまま返す

import { NextRequest, NextResponse } from "next/server";
import { getIcsLink } from "@/lib/server/store";

/** iPhone・iPad で、Safari そのものではなく、アプリの中のブラウザ（Telegram・LINE など）や Chrome から開かれたか */
function isIosInApp(ua: string): boolean {
  if (!/iPhone|iPad|iPod/.test(ua)) return false;
  // WKWebView の既定の UA には「Safari/」が無い。アプリが名前を足すことも多い。Chrome（CriOS）・Firefox（FxiOS）は .ics を開けないことがある
  return !/Safari\//.test(ua) || /Telegram|FBAN|FBAV|Instagram|Line\/|CriOS|FxiOS|EdgiOS/i.test(ua);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function openInSafariPage(safariUrl: string, fileUrl: string): string {
  const s = esc(safariUrl);
  const f = esc(fileUrl);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>カレンダーに追加 / Thêm vào lịch</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f3;--ink:#2b2724;--sub:#6b625a;--btn:#2f6f5e;--btnInk:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#1d1b19;--ink:#f1ece6;--sub:#b5aca3;--btn:#5fb39b;--btnInk:#10201b}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Hiragino Sans",sans-serif}
main{max-width:28rem;margin:0 auto;padding:32px 16px}
h1{font-size:20px;margin:0 0 8px}
p{margin:0 0 12px}
.vi{color:var(--sub)}
a.btn{display:block;text-align:center;background:var(--btn);color:var(--btnInk);text-decoration:none;font-weight:700;padding:14px 16px;border-radius:12px;margin:20px 0 24px}
small{display:block;color:var(--sub);margin-top:16px}
small a{color:inherit}
</style></head>
<body><main>
<h1>📅 カレンダーに追加</h1>
<p>iPhone のカレンダーに入れるには、Safari で開きます。開くと「すべて追加」が出ます。</p>
<p class="vi" lang="vi">Để thêm vào lịch iPhone, hãy mở bằng Safari. Sẽ hiện nút “Thêm tất cả”.</p>
<a class="btn" href="${s}">Safari で開く ／ <span lang="vi">Mở bằng Safari</span></a>
<p>開かないときは、この画面のメニュー（… や ⋯）から「Safari で開く」を選んでください。</p>
<p class="vi" lang="vi">Nếu không mở được, hãy chọn “Mở bằng Safari” trong menu (… ) của màn hình này.</p>
<small><a href="${f}">ファイル（.ics）で受け取る ／ <span lang="vi">Tải tệp .ics</span></a></small>
</main>
<script>setTimeout(function(){location.href=${JSON.stringify(safariUrl)}},300)</script>
</body></html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const ics = await getIcsLink(token);
  if (!ics) return new NextResponse("このリンクは使えません（期限が切れたか、消されました）。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const direct = request.nextUrl.searchParams.get("dl") === "1";
  if (!direct && isIosInApp(request.headers.get("user-agent") ?? "")) {
    const fileUrl = `https://${request.nextUrl.host}/api/ics?t=${encodeURIComponent(token)}&dl=1`;
    return new NextResponse(openInSafariPage(fileUrl.replace(/^https:/, "x-safari-https:"), fileUrl), {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store", "x-robots-tag": "noindex" },
    });
  }
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="culalog.ics"',
      "cache-control": "private, no-store",
    },
  });
}
