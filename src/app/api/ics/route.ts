// iPhone のカレンダーに予定を入れるリンク（執事の1対1のお知らせの「カレンダーに追加」から開く）。
// 推測できない合言葉つき・30日で切れる。中身は、お知らせと同じ言葉の題とメモの予定1件だけ。
// 🔴 Telegram の中のブラウザ（SFSafariViewController）は User-Agent が Safari と同じなのに、.ics を「ダウンロード」にしてしまい、
//    カレンダーの「すべて追加」が出ない。UA では見分けられないので、iPhone・iPad から開かれたら（Safari でも）いつも短い案内のページを返す。
//    ページのボタン: ① x-safari-https:// で Safari に渡す（アプリの中のブラウザから）② そのまま .ics を開く（Safari で開いているとき）。自動では飛ばさない。
//    ほかの端末・dl=1 のときは、今まで通り .ics をそのまま返す

import { NextRequest, NextResponse } from "next/server";
import { getIcsLink } from "@/lib/server/store";

const isIos = (ua: string) => /iPhone|iPad|iPod/.test(ua);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function addToCalendarPage(safariUrl: string, fileUrl: string): string {
  const s = esc(safariUrl);
  const f = esc(fileUrl);
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>カレンダーに追加 / Thêm vào lịch</title>
<style>
:root{color-scheme:light dark;--bg:#fbf8f3;--ink:#2b2724;--sub:#6b625a;--btn:#2f6f5e;--btnInk:#fff;--line:#d9d0c5}
@media (prefers-color-scheme:dark){:root{--bg:#1d1b19;--ink:#f1ece6;--sub:#b5aca3;--btn:#5fb39b;--btnInk:#10201b;--line:#4a443e}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,"Hiragino Sans",sans-serif}
main{max-width:28rem;margin:0 auto;padding:32px 16px}
h1{font-size:20px;margin:0 0 16px}
p{margin:0 0 8px}
.vi{color:var(--sub)}
a.btn{display:block;text-align:center;background:var(--btn);color:var(--btnInk);text-decoration:none;font-weight:700;font-size:18px;padding:16px;border-radius:12px;margin:8px 0 28px}
a.sub{display:block;text-align:center;color:var(--ink);text-decoration:none;border:1px solid var(--line);padding:12px 16px;border-radius:12px;margin:8px 0 24px}
small{display:block;color:var(--sub)}
</style></head>
<body><main>
<h1>📅 カレンダーに追加 ／ <span lang="vi">Thêm vào lịch</span></h1>
<p>下のボタンを押すと、Safari で開いて「すべて追加」が出ます。</p>
<p class="vi" lang="vi">Bấm nút bên dưới, Safari sẽ mở và hiện “Thêm tất cả”.</p>
<a class="btn" href="${s}">カレンダーに追加 ／ <span lang="vi">Thêm vào lịch</span></a>
<p>上のボタンで何も起きないとき（Safari で開いているとき）は、こちら:</p>
<p class="vi" lang="vi">Nếu nút trên không có tác dụng (khi đang mở bằng Safari), hãy bấm vào đây:</p>
<a class="sub" href="${f}">このまま開く ／ <span lang="vi">Mở trực tiếp</span></a>
<small>それでも「ダウンロード」と出るときは、右下の Safari のマーク（コンパス）で Safari に移ってから、もう一度上のボタンを。</small>
<small class="vi" lang="vi">Nếu vẫn hiện “Tải xuống”, hãy bấm biểu tượng Safari (la bàn) ở góc dưới bên phải để chuyển sang Safari, rồi bấm lại nút ở trên.</small>
</main></body></html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t") ?? "";
  const ics = await getIcsLink(token);
  if (!ics) return new NextResponse("このリンクは使えません（期限が切れたか、消されました）。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const direct = request.nextUrl.searchParams.get("dl") === "1";
  if (!direct && isIos(request.headers.get("user-agent") ?? "")) {
    const fileUrl = `https://${request.nextUrl.host}/api/ics?t=${encodeURIComponent(token)}&dl=1`;
    return new NextResponse(addToCalendarPage(fileUrl.replace(/^https:/, "x-safari-https:"), fileUrl), {
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
