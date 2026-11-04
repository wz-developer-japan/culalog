// iPhone のカレンダーに予定を入れるリンク（執事の1対1のお知らせの「カレンダーに追加」から開く）。
// 推測できない合言葉つき・30日で切れる。中身は、お知らせと同じ言葉の題とメモの予定1件だけ

import { NextRequest, NextResponse } from "next/server";
import { getIcsLink } from "@/lib/server/store";

export async function GET(request: NextRequest) {
  const ics = await getIcsLink(request.nextUrl.searchParams.get("t") ?? "");
  if (!ics) return new NextResponse("このリンクは使えません（期限が切れたか、消されました）。", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="culalog.ics"',
      "cache-control": "private, no-store",
    },
  });
}
