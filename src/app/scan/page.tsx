"use client";

// 執事に書類を渡す。写真・スクショ・PDF を何枚でも一度に渡せる（選ぶ・ドラッグ・貼り付け）。
// 渡した分は受け取り箱に入り、執事が1枚ずつ順番に読んで「確認待ち」にする。待たなくてよい。
// 読み取りは登録の入口の一つ。手入力（/add）でも同じように登録できる。

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type AddResult, addFilesToInbox, addSamplesToInbox } from "@/lib/addToInbox";
import { renderSampleImage } from "@/lib/files";
import { inboxProgress } from "@/lib/inbox";
import { useHousehold } from "@/lib/useHousehold";
import { useInboxQueue } from "@/lib/useInbox";

function ScanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { household, loaded, update } = useHousehold();
  useInboxQueue(household, update);
  const [sampleId, setSampleId] = useState<string | null>(params.get("sample"));
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const sample = household?.demoSamples?.find((x) => x.id === sampleId);
  const expected = household?.expected.find((e) => e.id === sample?.expectedId);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  useEffect(() => {
    setPreview(sample ? renderSampleImage(sample.text) : null);
  }, [sample]);

  // スクショを貼り付けて渡す（パソコンでの Ctrl+V・スマホの「ペースト」）
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.length) {
        e.preventDefault();
        give(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  if (!loaded || !household) return <main />;
  const progress = inboxProgress(household);
  const samples = household.demoSamples ?? [];

  async function give(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResult(await addFilesToInbox(files, update));
    setBusy(false);
  }

  async function giveSamples(list: typeof samples) {
    if (busy) return;
    setBusy(true);
    const r = await addSamplesToInbox(list, update);
    setBusy(false);
    setSampleId(null);
    // 何枚か渡したら、まとめて確認へ（そこで読む進み具合も見える）
    if (r.added > 0) router.push("/inbox");
    else setResult(r);
  }

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>執事に書類を渡す</h1>
      <p className="lead">
        写真・スクショ・PDF を、何枚でもまとめて渡してください。執事が1枚ずつ順番に読んで、何の書類か・誰の書類かを考えて下書きにします。
        読み終わるのを待たなくて大丈夫です。分からないことは、あとで「聞きたいこと」にまとめて聞きます。
      </p>

      <label
        className={`dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          give([...e.dataTransfer.files]);
        }}
      >
        <span className="dropzone-title">{busy ? "受け取っています…" : "写真を撮る・まとめて選ぶ"}</span>
        <span className="meta">ここにドラッグ、またはスクショを貼り付けても渡せます</span>
        <input
          type="file"
          accept="image/*,application/pdf"
          multiple
          disabled={busy}
          onChange={(e) => {
            give([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </label>

      {result && (
        <div className="card calm">
          {result.added > 0 && <div>{result.added}枚を受け取りました。執事が順番に読みます。</div>}
          {result.duplicates > 0 && <div>{result.duplicates}枚は、前に渡したものと同じファイルだったので読みません。</div>}
          {result.rejected.map((r, i) => (
            <div key={i} className="meta">
              {r.name}: {r.error}
            </div>
          ))}
          {(result.added > 0 || result.duplicates > 0) && (
            <Link className="button small" href="/inbox" style={{ textAlign: "center", textDecoration: "none" }}>
              読む進み具合と、まとめて確認へ
            </Link>
          )}
        </div>
      )}

      {progress.total > 0 && !result && (
        <Link className="card row-link" href="/inbox">
          受け取り箱: {progress.total}枚（読んだ {progress.done}・待っている {progress.waiting + progress.needsKey}）
          <span className="badge">まとめて確認</span>
        </Link>
      )}

      {samples.length > 0 && (
        <>
          <h2>架空の書類の見本で試す</h2>
          <button className="button secondary" disabled={busy} onClick={() => giveSamples(samples)}>
            見本を{samples.length}枚まとめて渡す
          </button>
          <div className="chips">
            {samples.map((x) => (
              <button key={x.id} className={`chip${x.id === sampleId ? " selected" : ""}`} onClick={() => setSampleId(x.id)}>
                {x.title}
              </button>
            ))}
          </div>
        </>
      )}

      {sample && (
        <>
          <div className="card warn">
            {expected
              ? `${expected.label}の見本（架空）です。実際に届いたプリントを撮った、という想定で試せます。`
              : "架空の書類の見本です。実際に届いた書類を撮った、という想定で試せます。"}
          </div>
          {preview && (
            <div className="preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt={`渡す書類: ${sample.title}`} />
            </div>
          )}
          <button className="button" disabled={busy} onClick={() => giveSamples([sample])}>
            この見本を執事に渡す
          </button>
        </>
      )}

      <p className="note">
        読み取るときだけ、その書類の画像・PDF と家族の呼び名・続柄・メモ（誰の書類かを考えるため）を Claude API に送ります。このアプリのサーバーには残さず、渡した写真と読み取った内容はこの端末の中にだけ保存します。
        使いすぎを防ぐため、読み取りには1時間あたりの回数の上限があります。上限に当たったら、執事は時間をおいて続きを読みます。
        執事（Claude）の準備中は、見本だけ、用意しておいた「仮の結果」で流れを試せます（画面に「仮」と出ます）。
      </p>

      <div className="spacer" />
      <Link className="button secondary" href="/add" style={{ textAlign: "center", textDecoration: "none" }}>
        手入力で登録する
      </Link>
    </main>
  );
}

export default function Scan() {
  return (
    <Suspense fallback={<main />}>
      <ScanPage />
    </Suspense>
  );
}
