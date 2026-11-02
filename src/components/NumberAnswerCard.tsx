"use client";

// 「○○の番号は？」「○○持ってる？」への答え。Claude は使わず、端末の中で確定した書類からコードで探したもの。
// 番号は伏せて出し、「見る」を押したときだけ見せる。判断（この番号で手続きできる等）はしない。

import Link from "next/link";
import type { AskRecord } from "@/lib/ask";
import { resolveNumbers } from "@/lib/numbers";
import type { Household } from "@/lib/types";
import { NumberRow } from "./NumberRow";

export function NumberAnswerCard({ record, household }: { record: AskRecord; household: Household }) {
  const answer = record.numberAnswer!;
  const numbers = resolveNumbers(household, answer);
  const docs = answer.documentIds.map((id) => household.documents.find((d) => d.id === id)).filter((d) => d !== undefined);
  const ownerOf = (ids: string[]) =>
    ids
      .map((id) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop())
      .filter(Boolean)
      .join("・");
  const found = numbers.length > 0 || docs.length > 0;
  // 確認待ちの書類（いまの状態で引く。確定したあとなら、もう一度聞けば番号が出る）
  const waiting = (answer.unconfirmedIds ?? []).map((id) => household.documents.find((d) => d.id === id)).filter((d) => d !== undefined && !d.confirmedAt);
  const asksNumber = /番号|記号|ナンバー/.test(record.question);
  return (
    <div className={`card ${found ? "briefing" : "unknown"}`}>
      <div className="meta">書類から探しました（この端末の中だけで）</div>
      <div className="question-text">{record.question}</div>
      {!found && (
        <>
          <div className="unknown-label">？ 確定した書類には見つかりませんでした</div>
          {waiting.length > 0 ? (
            <div>
              確認待ちの書類にあります:{" "}
              {waiting.map((d, i) => (
                <span key={d!.id}>
                  {i > 0 && "、"}
                  <Link href={`/documents/${d!.id}`}>{d!.title}</Link>
                </span>
              ))}
              。<Link href="/inbox">まとめて確認</Link>で原本と見比べて確定すると、ここで探せるようになります。
            </div>
          ) : /マイナンバー|個人番号/.test(record.question) ? (
            <div>
              マイナンバーは登録されていません。写真で渡すと画像ごと読み取りに送ることになるため、残しておくなら手入力での登録をおすすめします（書類の項目の名前を「マイナンバー」にすると、ここで探せます）。
            </div>
          ) : (
            <div>
              「{answer.terms.join("」「")}」が書いてある書類は、まだ登録されていないようです。手帳やカード、届いた通知を撮って渡しておくと、次からここで探せます。
            </div>
          )}
        </>
      )}
      {numbers.map((n, i) => (
        <NumberRow key={`${n.documentId}-${n.label}-${i}`} item={n} owner={ownerOf(n.memberIds)} />
      ))}
      {docs.map((d) => (
        <div className="number-row" key={d.id}>
          <div>
            <Link href={`/documents/${d.id}`}>{d.title}</Link> があります{d.memberIds.length > 0 && `（${ownerOf(d.memberIds)}）`}。{asksNumber && "番号は書類から読み取れていません。"}
          </div>
          {d.storageLocation && <div className="meta">しまい場所: {d.storageLocation}</div>}
        </div>
      ))}
      <div className="meta provisional">
        Claude には送らず、確定した書類の項目と原本の文字からコードで探しました。{numbers.length > 0 && "番号は「見る」を押したときだけ表示します。"}手続きに使えるかなどの判断はしません。最終の確認は原本と窓口でお願いします。
      </div>
    </div>
  );
}
