"use client";

// 執事に聞く。
// 根拠は「今年度の確定した書類」だけ（前のものは使わない）。答えには必ず「どの書類のどこか」を添え、
// 引用はコードで原本と照らし合わせる。書いていないことは色の違うカードで「書いていません」と出し、問い合わせ先だけを添える。
// 判断（補償される・解約してよい等）は、執事の答えに入っていてもコードが出さない。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type AskResult, buildAskInput, documentsForAsk, provisionalAsk, verifyAsk } from "@/lib/ask";
import { butlerName, characterOf } from "@/lib/character";
import { toYmd } from "@/lib/deadlines";
import type { Household } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";

const SUGGESTIONS = ["冬休みはいつからいつまで？", "運動会の持ち物は？", "賃貸の更新料はいくら？", "火災保険の事故の連絡先は？", "けがをしたとき、保険の条件はどこに書いてある？"];

function AskPage() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<AskResult | null>(null);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const h = household as Household;
  const name = butlerName(h);
  const docs = documentsForAsk(h);
  const older = h.documents.filter((d) => d.confirmedAt && d.supersededBy).length;

  async function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    setLatest(null);
    const current = h;
    const input = buildAskInput(current, text, toYmd(new Date()), characterOf(current).style);
    let result: AskResult | null = null;
    try {
      const res = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      if (res.status === 503) {
        result = provisionalAsk(current, text);
      } else {
        const body = await res.json().catch(() => null);
        if (res.ok && body?.result) {
          result = verifyAsk(body.result, current, text);
          if (!result) setError("執事の答えをうまく受け取れませんでした。代わりに、書類の中を検索した仮の答えを出します。");
        } else {
          setError(`${body?.error ?? "答えを作れませんでした。"} 代わりに、書類の中を検索した仮の答えを出します。`);
        }
        // 上限・混み合い・つながらないときも、仮の道（検索）に戻る
        if (!result) result = provisionalAsk(current, text);
      }
    } catch {
      setError("通信できませんでした。代わりに、書類の中を検索した仮の答えを出します。");
      result = provisionalAsk(current, text);
    }
    if (result) {
      const saved = result;
      setLatest(saved);
      await update((cur) => ({ ...cur, asks: [saved, ...(cur.asks ?? [])].slice(0, 20) }));
    }
    setBusy(false);
  }

  const history = (h.asks ?? []).filter((a) => a !== latest && a.createdAt !== latest?.createdAt);

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>{name}に聞く</h1>
      <p className="lead">
        今年度の登録書類（確定済み {docs.length}件）からお答えします。
        {older > 0 && `前のものになった${older}件は使いません。`}
        答えには、どの書類のどこに書いてあるかを必ず添えます。書類に書いていないことは「書いていません」と言います。
      </p>

      <label className="label">
        聞きたいこと
        <textarea className="input" rows={2} value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} placeholder="例: 冬休みはいつからいつまで？" />
      </label>
      <button className="button" disabled={!question.trim() || busy || docs.length === 0} onClick={() => ask(question)}>
        {busy ? `${name}が書類を見ています…` : `${name}に聞く`}
      </button>
      <div className="chips" style={{ marginTop: 10 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" disabled={busy} onClick={() => { setQuestion(s); ask(s); }}>
            {s}
          </button>
        ))}
      </div>
      {docs.length === 0 && <p className="note">確定した書類がまだありません。書類を登録して、原本と見比べて確定すると聞けるようになります。</p>}
      <p className="note">
        聞くときだけ、確定した書類の中身（証券番号などの番号は伏せ、電話番号は送りません）と質問を Claude API に送ります。このアプリのサーバーには残しません。
      </p>

      {error && <p className="error">{error}</p>}
      {latest && <Answer result={latest} />}

      {history.length > 0 && (
        <>
          <h2>前に聞いたこと</h2>
          {history.map((a) => (
            <Answer key={a.createdAt} result={a} compact />
          ))}
        </>
      )}
    </main>
  );
}

function Answer({ result, compact = false }: { result: AskResult; compact?: boolean }) {
  const [open, setOpen] = useState(!compact);
  const when = new Date(result.createdAt);
  const stamp = `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  if (compact && !open) {
    return (
      <button className="card row-link" style={{ width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }} onClick={() => setOpen(true)}>
        <div className="meta">{stamp}</div>
        <div>{result.question}</div>
      </button>
    );
  }
  const unknown = !result.found;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="card">
        <div className="meta">{stamp}・聞いたこと</div>
        <div className="question-text">{result.question}</div>
      </div>
      <div className={`card ${unknown ? "unknown" : "briefing"}`}>
        {unknown && <div className="unknown-label">{result.withheld ? "？ 執事の答えを出していません" : "？ 登録されている書類には書いていません"}</div>}
        {result.withheld ? <div>{result.withheld}</div> : result.answer ? <div className="briefing-text">{result.answer}</div> : null}
        {result.citations.length > 0 && (
          <div style={{ marginTop: 8 }}>
            {result.citations.map((c, i) => (
              <div className="meta" key={`${c.documentId}-${i}`}>
                原本: <Link href={`/documents/${c.documentId}`}>{c.documentTitle}</Link>
                {c.location && `・${c.location}`}
                {c.quote && <span className="block">「{c.quote}」</span>}
              </div>
            ))}
          </div>
        )}
        {unknown && (
          <div style={{ marginTop: 8 }}>
            {result.contacts.length > 0 ? (
              <>
                <div className="meta">書類に載っている問い合わせ先（確かめるのはこちらへ）:</div>
                {result.contacts.map((c, i) => (
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
        <div className="meta provisional">
          {result.source === "provisional"
            ? "仮の答え: 執事（Claude）の準備中のため、質問の言葉を書類の中からコードで探して並べています。文章の答えは作っていません。"
            : "執事（Claude）が、確定した書類だけを根拠に答えました。引用はコードで原本と照らし合わせています。"}
          {result.dropped > 0 && ` 照らし合わせで合わなかった引用${result.dropped}件は出していません。`}
          {" "}保険・医療・法律の判断はしません。最終の確認は原本と窓口でお願いします。
        </div>
      </div>
    </div>
  );
}

export default function Ask() {
  return (
    <Suspense fallback={<main />}>
      <AskPage />
    </Suspense>
  );
}
