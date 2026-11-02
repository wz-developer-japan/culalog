"use client";

// 写真・PDF からの登録。
// 選ぶ → Claude が下書きを作る → 「確認待ち」として保存 → 詳細画面で原本と見比べて確定、の流れ。
// 読み取りは登録の入口の一つ。手入力（/add）でも同じように登録できる。

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toYmd } from "@/lib/deadlines";
import { type Extraction, extractionToDocument } from "@/lib/extraction";
import { RELATION_LABELS } from "@/lib/labels";
import type { DocumentOrigin, Household } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";

/** API に送る本文の上限（サーバー側は 5MB。JSON の分の余裕をとる） */
const MAX_SEND_BYTES = 4.5 * 1024 * 1024;
/** 写真は長い辺をこの大きさまで縮めてから送る（読み取りには十分で、送る量と費用を抑える） */
const MAX_IMAGE_SIDE = 1600;

interface Picked {
  mediaType: string;
  dataUrl: string;
  origin: DocumentOrigin;
  name: string;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** デモの見本（架空のプリント）を、紙に印刷したような画像にする。日付が開いた日基準なので、その場で描く */
function renderSampleImage(text: string): string {
  const width = 1000;
  const fontSize = 28;
  const lineHeight = 46;
  const margin = 70;
  const font = `${fontSize}px "Hiragino Mincho ProN", "Noto Serif JP", "Noto Sans JP", serif`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  // 文字の幅を測って、紙の幅に収まるところで折り返す
  const lines = text.split("\n").flatMap((line) => {
    const parts: string[] = [];
    let current = "";
    for (const ch of line) {
      if (ctx.measureText(current + ch).width > width - margin * 2) {
        parts.push(current);
        current = ch;
      } else current += ch;
    }
    parts.push(current);
    return parts;
  });
  canvas.width = width;
  canvas.height = margin * 2 + lines.length * lineHeight;
  ctx.fillStyle = "#fffef9";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = font; // 大きさを変えると設定が消えるので、もう一度入れる
  ctx.textBaseline = "top";
  lines.forEach((line, i) => {
    const isTitle = /ご案内$/.test(line.trim()) && line.trim().length <= 24;
    const x = isTitle ? (width - ctx.measureText(line).width) / 2 : margin;
    ctx.fillText(line, x, margin + i * lineHeight);
  });
  return canvas.toDataURL("image/png");
}

const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

function ScanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { household, loaded, save } = useHousehold();
  const [sampleId, setSampleId] = useState<string | null>(params.get("sample"));
  const sample = household?.demoSamples?.find((x) => x.id === sampleId);
  const expected = household?.expected.find((e) => e.id === sample?.expectedId);

  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  // 見本を選んだら、それを紙に印刷したような画像にして選んだ状態にする
  useEffect(() => {
    if (sample) {
      setPicked({ mediaType: "image/png", dataUrl: renderSampleImage(sample.text), origin: "photo", name: sample.title });
      setError("");
      setUnavailable(false);
    }
  }, [sample]);

  if (!loaded || !household) return <main />;

  async function pick(file: File | undefined) {
    setError("");
    setUnavailable(false);
    setSampleId(null);
    if (!file) return;
    try {
      if (file.type === "application/pdf") {
        if (file.size > (MAX_SEND_BYTES * 3) / 4) {
          setError("PDF が大きすぎます。3MB 以下にするか、必要なページだけを写真で撮ってください。");
          return;
        }
        setPicked({ mediaType: file.type, dataUrl: await readAsDataUrl(file), origin: "pdf", name: file.name });
      } else if (file.type.startsWith("image/")) {
        setPicked({ mediaType: "image/jpeg", dataUrl: await shrinkImage(file), origin: "photo", name: file.name });
      } else {
        setError("写真（画像）か PDF を選んでください。");
      }
    } catch {
      setError("このファイルを開けませんでした。別の写真でお試しください。");
    }
  }

  async function saveDraft(extraction: Extraction, draftSource: "claude" | "provisional") {
    const current = household as Household;
    const { document, questions } = extractionToDocument(extraction, {
      id: newId("doc"),
      origin: picked!.origin,
      draftSource,
      members: current.members,
      expectedId: expected?.id,
      // 見本は本文そのもの。写真・PDF は Claude の文字起こし（蛍光ペンの印を付けるため）
      originalText: sample?.text ?? (extraction.transcript || undefined),
      originalFile: { mediaType: picked!.mediaType, dataUrl: picked!.dataUrl },
      newId,
    });
    await save({
      ...current,
      documents: [...current.documents, document],
      questions: [...(current.questions ?? []), ...questions],
    });
    router.push(`/documents/${document.id}`);
  }

  async function read() {
    if (!picked) return;
    const family = household!.members.map((m) => ({
      id: m.id,
      name: m.name,
      relation: RELATION_LABELS[m.relation],
      note: m.note ?? "",
    }));
    const body = JSON.stringify({
      mediaType: picked.mediaType,
      data: base64Of(picked.dataUrl),
      today: toYmd(new Date()),
      family,
    });
    if (body.length > MAX_SEND_BYTES) {
      setError("ファイルが大きすぎます。写真を撮り直すか、手入力で登録してください。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.extraction) {
        await saveDraft(json.extraction as Extraction, "claude");
        return;
      }
      if (res.status === 503) setUnavailable(true);
      setError(json.error ?? "読み取りに失敗しました。");
    } catch {
      setError("通信できませんでした。電波の良いところでお試しください。");
    } finally {
      setBusy(false);
    }
  }

  const samples = household.demoSamples ?? [];

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>執事に書類を渡す</h1>
      <p className="lead">
        写真か PDF を渡すと、執事が中身を読んで、何の書類か・誰の書類かを考えて下書きを作ります。分からないところは執事から聞きます。
      </p>

      <label className="label">
        写真を撮る・ファイルを選ぶ
        <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0])} />
      </label>

      {samples.length > 0 && (
        <>
          <div className="label">架空の書類の見本で試す</div>
          <div className="chips">
            {samples.map((x) => (
              <button
                key={x.id}
                className={`chip${x.id === sampleId ? " selected" : ""}`}
                onClick={() => setSampleId(x.id)}
              >
                {x.title}
              </button>
            ))}
          </div>
        </>
      )}

      {sample && (
        <div className="card warn">
          {expected
            ? `${expected.label}の見本（架空）です。実際に届いたプリントを撮った、という想定で試せます。`
            : "架空の書類の見本です。実際に届いた書類を撮った、という想定で試せます。"}
        </div>
      )}

      {picked && (
        <div className="preview">
          {picked.mediaType === "application/pdf" ? (
            <div className="card">PDF: {picked.name}</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={picked.dataUrl} alt={`読み取る書類: ${picked.name}`} />
          )}
        </div>
      )}

      <p className="note">
        読み取るときだけ、この書類の画像・PDF と家族の呼び名・続柄・メモ（誰の書類かを考えるため）を Claude API に送ります。このアプリのサーバーには残さず、読み取った内容はこの端末の中にだけ保存します。
      </p>

      {error && <p className="error">{error}</p>}

      {unavailable && sample && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            読み取り機能の準備ができるまで、見本だけは用意しておいた<strong>仮の結果</strong>で、確定までの流れを試せます。
            仮の結果は Claude の読み取りではありません。
          </p>
          <button className="button secondary" onClick={() => saveDraft(sample.provisionalDraft, "provisional")}>
            仮の結果で流れを試す
          </button>
        </div>
      )}

      <div className="spacer" />
      <button className="button" disabled={!picked || busy} onClick={read}>
        {busy ? "読み取り中…（数十秒かかることがあります）" : "執事に読んでもらう"}
      </button>
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
