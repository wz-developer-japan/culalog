"use client";

// 執事に頼んだことと、その答え（報告）。
// 書いてあったときは根拠（原本のどこか）付き、書いていなかったときは色の違うカード＋問い合わせ先。
// 答えがまだ無いときは「調べています」。

import { Info, ProvisionalTag } from "@/components/Info";
import Link from "next/link";
import type { AskRecord } from "@/lib/ask";
import { readAloudEnabled, speak } from "@/lib/voice";
import { RememberCard } from "./RememberCard";

const stampOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function AskAnswer({
  record,
  butler,
  onSeen,
  compact = false,
}: {
  record: AskRecord;
  /** 執事の名前（画面でコードが差し込む） */
  butler: string;
  /** ホームの報告で「見た」にするとき */
  onSeen?: () => void;
  /** ホーム用: 引用は2つまで・くわしくは聞く画面へ */
  compact?: boolean;
}) {
  const result = record.result;
  if (!result) {
    return (
      <div className="card">
        <div className="meta">{stampOf(record.askedAt)}・頼んだこと</div>
        <div className="question-text">{record.question}</div>
        <div className="meta thinking">{butler}が書類を見て調べています… 画面を閉じても、次に開いたときに報告に残ります。</div>
      </div>
    );
  }
  // 「覚えておいて」と話したとき: 予定の案（確定はあなた）
  if (result.remember) return <RememberCard record={record} butler={butler} compact={compact} />;
  const unknown = !result.found;
  const citations = compact ? result.citations.slice(0, 2) : result.citations;
  const more = result.citations.length - citations.length;
  return (
    <div className={`card ${unknown ? "unknown" : "briefing"}`}>
      <div className="meta">
        {stampOf(record.askedAt)}・{compact ? `${butler}からの報告` : "聞いたこと"}
      </div>
      <div className="question-text">{record.question}</div>
      {unknown && <div className="unknown-label">{result.withheld ? "？ 執事の答えを出していません" : "？ 登録されている書類には書いていません"}</div>}
      {result.withheld ? <div>{result.withheld}</div> : result.answer ? <div className="briefing-text">{result.answer}</div> : null}
      {citations.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {citations.map((c, i) => (
            <div className="meta" key={`${c.documentId}-${i}`}>
              原本: <Link href={`/documents/${c.documentId}`}>{c.documentTitle}</Link>
              {c.location && `・${c.location}`}
              {c.quote && <span className="block">「{c.quote}」</span>}
            </div>
          ))}
          {more > 0 && (
            <div className="meta">
              ほか{more}件の根拠は<Link href="/ask">聞く画面</Link>で
            </div>
          )}
        </div>
      )}
      {(unknown || result.contacts.length > 0) && (
        <div style={{ marginTop: 8 }}>
          {result.contacts.length > 0 ? (
            <>
              <div className="meta">{unknown ? "書類に載っている問い合わせ先（確かめるのはこちらへ）:" : "引用した書類に載っている問い合わせ先（確かめるのはこちらへ）:"}</div>
              {result.contacts.slice(0, compact ? 2 : 10).map((c, i) => (
                <div className="meta" key={i}>
                  {c.contact.label}: {c.contact.name}
                  {c.contact.phone && ` ${c.contact.phone}`}
                  {c.contact.hours && `（${c.contact.hours}）`}・<Link href={`/documents/${c.documentId}`}>{c.documentTitle}</Link>
                </div>
              ))}
            </>
          ) : (
            <div className="meta">関係しそうな書類の問い合わせ先も見つかりませんでした。</div>
          )}
        </div>
      )}
      {readAloudEnabled() && (result.withheld || result.answer) && (
        <button type="button" className="link-button" style={{ marginTop: 6 }} onClick={() => speak(result.withheld ?? result.answer)}>
          🔊 読み上げる
        </button>
      )}
      <div className="card-foot">
        {result.source === "provisional" && <ProvisionalTag />}
        <span>判断はしません。最終の確認は原本と窓口で。</span>
        <Info label="この答えについて">
          {result.source === "provisional"
            ? `仮の答え: ${result.fallbackReason ?? "執事（Claude）の準備中のため"}、質問の言葉を書類の中からコードで探して並べています。文章の答えは作っていません。`
            : "執事（Claude）が、確定した書類だけを根拠に答えました。引用はコードで原本と照らし合わせています。"}
          {result.dropped > 0 && ` 照らし合わせで合わなかった引用${result.dropped}件は出していません。`}
          {" "}保険・医療・法律の判断はしません。最終の確認は原本と窓口でお願いします。
        </Info>
      </div>
      {onSeen && (
        <div className="row-actions" style={{ marginTop: 8 }}>
          <button className="button small secondary" style={{ width: "auto", margin: 0 }} onClick={onSeen}>
            見た
          </button>
          <Link href="/ask" className="link-button">
            くわしく・続けて聞く
          </Link>
        </div>
      )}
    </div>
  );
}
