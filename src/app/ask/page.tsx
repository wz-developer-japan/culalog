"use client";

// 執事に聞く（頼んで、あとで報告）。
// 根拠は「今年度の確定した書類」だけ（前のものは使わない）。答えには必ず「どの書類のどこか」を添え、
// 引用はコードで原本と照らし合わせる。書いていないことは色の違うカードで「書いていません」と出し、問い合わせ先だけを添える。
// 判断（補償される・解約してよい等）は、執事の答えに入っていてもコードが出さない。
// 頼んだことは端末にすぐ保存し、答えはあとから付く。画面を閉じても、次に開いたときに調べてホームの報告に残る。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AskAnswer } from "@/components/AskAnswer";
import { MicButton } from "@/components/MicButton";
import { NumberAnswerCard } from "@/components/NumberAnswerCard";
import { askRecords, documentsForAsk } from "@/lib/ask";
import { butlerName } from "@/lib/character";
import type { Household } from "@/lib/types";
import { addAsk } from "@/lib/useAsk";
import { useHousehold } from "@/lib/useHousehold";

const SUGGESTIONS = [
  "冬休みはいつからいつまで？",
  "遠足の持ち物は？",
  "賃貸の更新料はいくら？",
  "蓮が学校でけがをした。保険の条件と連絡先を調べておいて",
  "病院に持っていくものは？",
  "火災保険の証券番号は？",
  "写真編集ソフトのサブスク、年に1回しか解約できない。次は来年の3月。その前に教えて",
];

function AskPage() {
  const router = useRouter();
  const { household, loaded, update } = useHousehold();
  const [question, setQuestion] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const h = household as Household;
  const name = butlerName(h);
  const docs = documentsForAsk(h);
  const older = h.documents.filter((d) => d.confirmedAt && d.supersededBy).length;
  const records = askRecords(h);
  const busy = records.some((a) => !a.result && !a.numberAnswer);

  async function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setQuestion("");
    await update((current) => addAsk(current, text).household);
  }

  return (
    <main>
      <BackToTop />
      <h1 className="pt">{name}に聞く</h1>
      <p className="lead">
        今年度の登録書類（確定済み {docs.length}件）からお答えします。
        {older > 0 && `前のものになった${older}件は使いません。`}
        答えには、どの書類のどこに書いてあるかを必ず添えます。書類に書いていないことは「書いていません」と言います。
        頼んだら画面を閉じても大丈夫です。答えは「予定」の「{name}からの報告」に残ります。
      </p>
      <p className="lead">
        書類が無いことも、話すだけで覚えます（例: 「○○のサブスク、次に解約できるのは3月。その前に教えて」）。{name}が予定の案を作り、あなたが確定したら、締切の前からお知らせします。
      </p>

      <label className="label">
        聞きたいこと・調べておいてほしいこと・覚えておいてほしいこと
        <textarea
          className="input"
          rows={2}
          value={question}
          maxLength={200}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="例: 冬休みはいつからいつまで？"
        />
      </label>
      <MicButton value={question} onChange={setQuestion} />
      <button className="button" disabled={!question.trim()} onClick={() => ask(question)}>
        {name}に頼む
      </button>
      <div className="chips" style={{ marginTop: 10 }}>
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>
      <p className="meta" style={{ marginTop: 8 }}>
        困ったときは <Link href="/cases">こんなときは？</Link>（子どもがけがをした・引っ越すことになった など。書類をつないで、原本の場所と連絡先を並べます）
      </p>
      {docs.length === 0 && <p className="note">確定した書類がまだありません。書類について聞けるのは、書類を登録して原本と見比べて確定してからです（覚えておいてほしいことは、今でも話せます）。</p>}
      <p className="note">
        聞くときだけ、確定した書類の中身（証券番号などの番号は伏せ、電話番号は送りません）と質問を Claude API に送ります。このアプリのサーバーには残しません。
        「○○の番号は？」「○○持ってる？」は Claude に送らず、この端末の中で確定した書類から探してすぐ答えます。
      </p>
      {busy && <p className="meta thinking">{name}が書類を見ています…</p>}

      {records.length > 0 && (
        <>
          <h2>頼んだことと報告</h2>
          {records.map((a) => (
            a.numberAnswer ? (
              <NumberAnswerCard key={a.id} record={a} household={h} />
            ) : (
              <AskAnswer key={a.id} record={a} butler={name} />
            )
          ))}
        </>
      )}
    </main>
  );
}

export default function Ask() {
  return (
    <Suspense fallback={<main />}>
      <AskPage />
    </Suspense>
  );
}
