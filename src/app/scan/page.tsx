"use client";

// 執事に書類を渡す。写真・スクショ・PDF を何枚でも一度に渡せる（選ぶ・ドラッグ・貼り付け）。
// 渡した分は受け取り箱に入り、執事が1枚ずつ順番に読んで「確認待ち」にする。待たなくてよい。
// 読み取りは登録の入口の一つ。手入力（/add）でも同じように登録できる。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { type AddResult, addFilesToInbox, addPagesToInbox, addSamplesToInbox, addTextToInbox, MAX_PAGES, MAX_TEXT } from "@/lib/addToInbox";
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
  // 次に渡す写真を、1つの書類のページとしてまとめるか
  const [asPages, setAsPages] = useState(false);
  // メールの本文などを文字のまま渡す
  const [mail, setMail] = useState({ body: "", from: "", subject: "", receivedAt: "" });
  const sample = household?.demoSamples?.find((x) => x.id === sampleId);
  const expected = household?.expected.find((e) => e.id === sample?.expectedId);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  useEffect(() => {
    setPreview(sample && sample.origin !== "text" ? (sample.images?.[0] ?? renderSampleImage(sample.text)) : null);
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
  const mails = samples.filter((x) => x.origin === "text");
  const printed = samples.filter((x) => !x.images?.length && x.origin !== "text");
  const photos = samples.filter((x) => x.images?.length);
  const photoDay = photos[0]?.baseDate?.replace(/^(\d{4})-0?(\d+)-0?(\d+)$/, "$1年$2月$3日");

  async function give(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setResult(await (asPages ? addPagesToInbox(files, update) : addFilesToInbox(files, update)));
    setBusy(false);
  }

  async function giveText() {
    if (!mail.body.trim() || busy) return;
    setBusy(true);
    const r = await addTextToInbox(mail, update);
    setResult(r);
    if (r.added > 0) setMail({ body: "", from: "", subject: "", receivedAt: "" });
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
      <BackToTop />
      <h1 className="pt">執事に書類を渡す</h1>
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
        <span className="dropzone-title">{busy ? "受け取っています…" : asPages ? "1つの書類のページを選ぶ" : "写真を撮る・まとめて選ぶ"}</span>
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

      <label className="toggle-row">
        <input type="checkbox" checked={asPages} onChange={(e) => setAsPages(e.target.checked)} />
        <span>
          次に選ぶ写真は、1つの書類のページ（{MAX_PAGES}枚まで）
          <span className="block meta">何ページもある契約書や、同じ封筒に入っていた郵便一式を、1つの書類として読みます。オフなら1枚ずつ別の書類です。</span>
        </span>
      </label>

      <details className="card mail-paste">
        <summary>
          メールを貼り付けて渡す
          <span className="block meta">更新のご案内・解約の受付・注文の確認など、メールで届いた書類は本文をコピーして貼り付けてください</span>
        </summary>
        <label className="label">
          本文
          <textarea
            className="input"
            rows={6}
            maxLength={MAX_TEXT}
            value={mail.body}
            onChange={(e) => setMail({ ...mail, body: e.target.value })}
            placeholder="メールの本文を貼り付け"
          />
        </label>
        <div className="mail-meta">
          <label className="label">
            件名（あれば）
            <input className="input" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} />
          </label>
          <label className="label">
            差出人（あれば）
            <input className="input" value={mail.from} onChange={(e) => setMail({ ...mail, from: e.target.value })} />
          </label>
          <label className="label">
            受信日時（あれば）
            <input className="input" value={mail.receivedAt} onChange={(e) => setMail({ ...mail, receivedAt: e.target.value })} placeholder="例: 2026年11月7日 9:12" />
          </label>
        </div>
        <button className="button" disabled={busy || !mail.body.trim()} onClick={giveText}>
          この文字を1件の書類として渡す
        </button>
        <p className="meta">
          原本の場所は、本文の行や段落で示します。スクショや「PDF に保存」したメールは、上からそのまま渡せます。メールのアカウントにはつなぎません（貼り付けた分だけを読みます）。
        </p>
      </details>

      {result && (
        <div className="card calm">
          {result.added > 0 && <div>{result.added}件を受け取りました。執事が順番に読みます。トップに戻っても、閉じても大丈夫です（次に開いたときに続きから読みます）。</div>}
          {result.duplicates > 0 && <div>{result.duplicates}件は、前に渡したものと同じファイルだったので読みません。</div>}
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
          受け取り箱: {progress.total}件（読んだ {progress.done}・待っている {progress.waiting + progress.needsKey}）
          <span className="badge">まとめて確認</span>
        </Link>
      )}

      {photos.length > 0 && (
        <>
          <h2 id="photo-samples">写真の見本で「まとめて渡す」を試す</h2>
          <p className="meta">
            保育園の連絡アプリのスクショ・横向きのスキャン・何ページもある契約書・壁に貼った勤務カレンダーなど、架空の書類 {photos.length}件です。
            {photoDay}に撮った想定の日付なので、開いた日によっては過ぎた予定もあります。
          </p>
          <button className="button secondary" disabled={busy} onClick={() => giveSamples(photos)}>
            写真の見本を{photos.length}件まとめて渡す
          </button>
          <details className="others">
            <summary>1件ずつ選ぶ</summary>
            <div className="chips">
              {photos.map((x) => (
                <button key={x.id} className={`chip${x.id === sampleId ? " selected" : ""}`} onClick={() => setSampleId(x.id)}>
                  {x.title}
                </button>
              ))}
            </div>
          </details>
        </>
      )}

      {mails.length > 0 && (
        <>
          <h2>メールの見本で「貼り付けて渡す」を試す</h2>
          <p className="meta">
            請求と督促、継続のご案内、納付完了のお知らせ、期限の訂正、転送されたメールなど、架空のメール {mails.length}通です。本文を貼り付けて渡したのと同じ形で受け取り箱に入ります。
            同じ予定を知らせるメールは1件に束ね、「納付完了」などは、つながる予定を済んだにするか聞きます。
          </p>
          <button className="button secondary" disabled={busy} onClick={() => giveSamples(mails)}>
            メールの見本を{mails.length}件まとめて渡す
          </button>
          <details className="others">
            <summary>1件ずつ選ぶ</summary>
            <div className="chips">
              {mails.map((x) => (
                <button key={x.id} className={`chip${x.id === sampleId ? " selected" : ""}`} onClick={() => setSampleId(x.id)}>
                  {x.title}
                </button>
              ))}
            </div>
          </details>
        </>
      )}

      {printed.length > 0 && (
        <>
          <h2>架空の書類の見本で試す</h2>
          <button className="button secondary" disabled={busy} onClick={() => giveSamples(printed)}>
            見本を{printed.length}件まとめて渡す
          </button>
          <div className="chips">
            {printed.map((x) => (
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
              : sample.origin === "text"
                ? "架空のメールの見本です。届いたメールの本文を貼り付けた、という想定で試せます。"
                : "架空の書類の見本です。実際に届いた書類を撮った、という想定で試せます。"}
          </div>
          {sample.origin === "text" && (
            <div className="original">
              <pre>{sample.text}</pre>
            </div>
          )}
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
        読み取るときだけ、その書類の画像・PDF（貼り付けたメールなら、その文字）と家族の呼び名・続柄・メモ（誰の書類かを考えるため）を Claude API に送ります。このアプリのサーバーには残さず、渡した写真と読み取った内容はこの端末の中にだけ保存します。
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
