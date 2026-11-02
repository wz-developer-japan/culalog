"use client";

// 写真・PDF からの登録。
// 選ぶ → Claude が下書きを作る → 「確認待ち」として保存 → 詳細画面で原本と見比べて確定、の流れ。
// 読み取りは登録の入口の一つ。手入力（/add）でも同じように登録できる。

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toYmd } from "@/lib/deadlines";
import { type Extraction, extractionToDocument } from "@/lib/extraction";
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
    const isTitle = line.trim() === "運動会のご案内";
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
  const expected = household?.expected.find((e) => e.id === params.get("expected"));
  const sample = expected?.sample;

  const [picked, setPicked] = useState<Picked | null>(null);
  const [memberIds, setMemberIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  // 見本があれば、最初からそれを選んだ状態にする
  useEffect(() => {
    if (sample && !picked) {
      setPicked({ mediaType: "image/png", dataUrl: renderSampleImage(sample.text), origin: "photo", name: sample.title });
    }
  }, [sample, picked]);

  if (!loaded || !household) return <main />;

  const relatedMembers = household.documents
    .flatMap((d) => d.deadlines)
    .find((d) => d.id === expected?.relatedDeadlineId)?.memberIds;
  const selectedMembers = memberIds ?? relatedMembers ?? ["m-self"];

  async function pick(file: File | undefined) {
    setError("");
    setUnavailable(false);
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
    const doc = extractionToDocument(extraction, {
      id: newId("doc"),
      origin: picked!.origin,
      draftSource,
      memberIds: selectedMembers,
      expectedId: expected?.id,
      originalText: sample?.text,
      originalFile: { mediaType: picked!.mediaType, dataUrl: picked!.dataUrl },
      newId,
    });
    await save({ ...current, documents: [...current.documents, doc] });
    router.push(`/documents/${doc.id}`);
  }

  async function read() {
    if (!picked) return;
    const body = JSON.stringify({ mediaType: picked.mediaType, data: base64Of(picked.dataUrl), today: toYmd(new Date()) });
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

  return (
    <main>
      <p className="meta">
        <Link href="/">← ホーム</Link>
      </p>
      <h1>写真・PDF から登録</h1>
      <p className="lead">
        書類を読み取って下書きを作ります。下書きは、原本と見比べて確定するまでお知らせに使いません。
      </p>

      {sample ? (
        <div className="card warn">
          {expected!.label}の見本（架空）です。実際に届いたプリントを撮った、という想定で読み取りを試せます。
        </div>
      ) : (
        <label className="label">
          写真を撮る・ファイルを選ぶ
          <input className="input" type="file" accept="image/*,application/pdf" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
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

      <div className="label">誰の書類？</div>
      <div className="chips">
        {household.members.map((m) => (
          <label key={m.id} className="chip">
            <input
              type="checkbox"
              checked={selectedMembers.includes(m.id)}
              onChange={(e) =>
                setMemberIds(e.target.checked ? [...selectedMembers, m.id] : selectedMembers.filter((id) => id !== m.id))
              }
            />
            {m.name}
          </label>
        ))}
      </div>

      <p className="note">
        読み取りのときだけ、この書類の画像・PDF を読み取りのために送ります（Claude API）。読み取った内容はサーバーに残さず、この端末の中にだけ保存します。
      </p>

      {error && <p className="error">{error}</p>}

      {unavailable && sample?.provisionalDraft && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            読み取り機能の準備ができるまで、この見本だけは用意しておいた<strong>仮の結果</strong>で、確定までの流れを試せます。
            仮の結果は Claude の読み取りではありません。
          </p>
          <button className="button secondary" onClick={() => saveDraft(sample.provisionalDraft!, "provisional")}>
            仮の結果で流れを試す
          </button>
        </div>
      )}

      <div className="spacer" />
      <button className="button" disabled={!picked || busy} onClick={read}>
        {busy ? "読み取り中…（数十秒かかることがあります）" : "読み取って下書きを作る"}
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
