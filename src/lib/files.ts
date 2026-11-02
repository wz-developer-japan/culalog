// 写真・PDF をブラウザの中で扱うための道具（縮める・読む・見本を画像にする・指紋を取る）

/** 写真は長い辺をこの大きさまで縮めてから送る（読み取りには十分で、送る量と費用を抑える） */
export const MAX_IMAGE_SIDE = 1600;
/** API に送る本文の上限（サーバー側は 5MB。JSON の分の余裕をとる） */
export const MAX_SEND_BYTES = 4.5 * 1024 * 1024;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function shrinkImage(file: Blob): Promise<string> {
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
export function renderSampleImage(text: string): string {
  const width = 1000;
  const fontSize = 28;
  const lineHeight = 46;
  const margin = 70;
  // 端末にある字体だけを使う（ウェブフォントは読み込みの前後で描かれ方が変わり、同じ見本が別のファイルになるため）
  const font = `${fontSize}px "Hiragino Mincho ProN", "Noto Serif JP", serif`;
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

export const base64Of = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

/** 文字（メールの本文など）を、写真と同じように端末に置ける形にする（UTF-8 の base64） */
export function textToDataUrl(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:text/plain;charset=utf-8;base64,${btoa(bin)}`;
}

/** textToDataUrl の逆 */
export function textOfDataUrl(dataUrl: string): string {
  const bin = atob(base64Of(dataUrl));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** ファイルの指紋（SHA-256 の先頭16文字）。同じ写真を2回渡したときに気づくため */
export async function fingerprint(dataUrl: string): Promise<string> {
  const bytes = new TextEncoder().encode(base64Of(dataUrl));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** 選ばれたファイルを、送れる形（写真は縮めた JPEG、PDF はそのまま）にする。送れないものは理由を返す */
export async function prepareFile(
  file: File,
): Promise<{ ok: true; mediaType: string; dataUrl: string; origin: "photo" | "pdf" } | { ok: false; error: string }> {
  try {
    if (file.type === "application/pdf") {
      if (file.size > (MAX_SEND_BYTES * 3) / 4) return { ok: false, error: "PDF が大きすぎます（3MB まで）。必要なページだけを写真で撮ってください。" };
      return { ok: true, mediaType: file.type, dataUrl: await readAsDataUrl(file), origin: "pdf" };
    }
    if (file.type.startsWith("image/")) {
      return { ok: true, mediaType: "image/jpeg", dataUrl: await shrinkImage(file), origin: "photo" };
    }
    return { ok: false, error: "写真（画像）か PDF ではありません。" };
  } catch {
    return { ok: false, error: "このファイルを開けませんでした。" };
  }
}
