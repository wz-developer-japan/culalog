"use client";

// 締切のカード（挿絵・題1行・札・右に「あと何日」）。予定の画面・家族ごとのページで使う。
// 見せ方だけで、文（題・理由）は候補のまま。日付の計算はコード（lib/butler・lib/deadlines）。

import Link from "next/link";
import { useState } from "react";
import { Pic, type PicKind } from "@/components/Pics";
import type { BriefingItem, Candidate } from "@/lib/butler";
import type { DemoSample } from "@/lib/types";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 「11/11（水）」 */
export function shortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return `${m}/${d}（${WEEKDAYS[date.getDay()]}）`;
}

/** 右に大きく出す「あと何日」。4日以内は赤 */
export function Days({ c }: { c: Candidate }) {
  if (c.type === "missing") return null;
  const d = c.daysLeft;
  if (c.overdue) {
    return (
      <div className="r">
        <div className="days hot">
          {-d}
          <small>日</small>
        </div>
        <div className="u">過ぎた</div>
      </div>
    );
  }
  if (d < 0) return <div className="r"><div className="u">受付中</div></div>;
  if (d === 0) return <div className="r"><div className="days hot today">今日</div></div>;
  return (
    <div className="r">
      <div className={`days${d <= 4 ? " hot" : ""}`}>
        {d}
        <small>日</small>
      </div>
      <div className="u">あと</div>
    </div>
  );
}

/** 理由の文。clamp のときは2行まで、続きはタップで */
function Why({ text, clamp }: { text: string; clamp?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!clamp || open) return <div className="sub">{text}</div>;
  return (
    <button className="sub clamp" onClick={() => setOpen(true)} aria-expanded={false}>
      {text}
    </button>
  );
}

/** 小さな「原本」の札。押すと書類名と場所が出る */
export function Source({ c }: { c: Pick<Candidate, "documentId" | "documentTitle" | "location"> }) {
  const [open, setOpen] = useState(false);
  if (!c.documentId) return null;
  return (
    <>
      <button className="tag src" onClick={() => setOpen(!open)} aria-expanded={open}>
        <svg className="l" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 3h9l3 3v15H6z" />
        </svg>
        原本
      </button>
      {open && (
        <div className="src-detail">
          <Link href={`/documents/${c.documentId}`}>{c.documentTitle}</Link>
          {c.location && `・${c.location}`}
        </div>
      )}
    </>
  );
}

export function DeadlineCard({
  c,
  item,
  hot,
  voice,
  sample,
  onDone,
}: {
  c: Candidate;
  /** ひとことの1件として出すとき */
  item?: BriefingItem;
  /** 締切が近い・過ぎた（赤い枠） */
  hot?: boolean;
  /** 執事の言葉（Claude が選んで言葉にしたもの）。仮のひとことは題と日付の繰り返しなので渡さない */
  voice?: string;
  /** 「届いた想定で読み取ってみる」見本 */
  sample?: DemoSample;
  onDone?: (id: string) => void;
}) {
  const kind: PicKind = c.type === "missing" ? "missing" : (c.card?.category ?? "other");
  return (
    <div className={`dcard${hot ? " hot" : ""}${item ? " briefing-item" : ""}`}>
      <div className="pic">
        <Pic kind={kind} />
      </div>
      <div className="body">
        {item?.followUpLabel && <div className="tag acc">まだ済んでいません・{item.followUpLabel}</div>}
        {hot && <div className="tag warn">⚠ {c.overdue ? "期限切れ" : "締切が近い"}</div>}
        <div className={`t${c.type === "missing" ? " wrap" : ""}`} title={c.card?.label ?? c.title}>
          {c.card?.label ?? c.title}
        </div>
        {voice && <div className="voice">{voice}</div>}
        {c.detail && <div className="sub">{c.detail}</div>}
        {c.why && <Why text={c.why} clamp={c.type === "missing"} />}
        <div className="m">
          {c.card && (
            <span className="tag mut">
              {shortDate(c.card.date)}
              {c.card.endDate && `〜${shortDate(c.card.endDate)}`}
              {c.card.time && ` ${c.card.time}`}
            </span>
          )}
          {c.type === "missing" && <span className="tag warn">まだ届いていない</span>}
          {c.card && c.card.bundled > 0 && <span className="tag mut">お知らせ{c.card.bundled + 1}通</span>}
          <Source c={c} />
          {c.type === "deadline" && !c.isEvent && onDone && (
            <button className="tag ok act" onClick={() => onDone(c.id)}>
              済んだにする
            </button>
          )}
        </div>
        {sample && (
          <Link className="button secondary small" href={`/scan?sample=${sample.id}`}>
            届いた想定で、見本を読み取ってみる
          </Link>
        )}
      </div>
      <Days c={c} />
    </div>
  );
}
