"use client";

// 受け取り箱に入れる（ファイルの中身は端末の別の場所に置き、家のデータには目録だけを足す）

import { fingerprint, prepareFile, renderSampleImage, textToDataUrl } from "./files";
import { enqueue, type NewInboxEntry } from "./inbox";
import { putFile } from "./storage";
import type { DemoSample, Household } from "./types";
import { newId } from "./useHousehold";

export interface AddResult {
  added: number;
  duplicates: number;
  /** 渡せなかったファイル（名前と理由） */
  rejected: { name: string; error: string }[];
}

/** 1つの書類として一緒に読む写真の枚数の上限（API と同じ） */
export const MAX_PAGES = 6;

/**
 * 何枚かの写真を、1つの書類のページとして受け取り箱に入れる（何ページもある契約書・郵便一式など）。
 * PDF は1つで何ページもあるので、それぞれ別の書類として入れる
 */
export async function addPagesToInbox(files: File[], update: (change: (h: Household) => Household) => Promise<void>): Promise<AddResult> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  const others = files.filter((f) => !f.type.startsWith("image/"));
  if (images.length < 2) return addFilesToInbox(files, update);
  if (images.length > MAX_PAGES) {
    return { added: 0, duplicates: 0, rejected: [{ name: `${images.length}枚の写真`, error: `1つの書類にまとめられるのは${MAX_PAGES}ページまでです。分けて渡してください。` }] };
  }
  const ids: string[] = [];
  const hashes: string[] = [];
  const rejected: AddResult["rejected"] = [];
  for (const file of images) {
    const prepared = await prepareFile(file);
    if (!prepared.ok) {
      rejected.push({ name: file.name || "（名前なし）", error: prepared.error });
      continue;
    }
    const id = newId("in");
    await putFile(id, prepared.dataUrl);
    ids.push(id);
    hashes.push(await fingerprint(prepared.dataUrl));
  }
  const entries: NewInboxEntry[] = ids.length
    ? [
        {
          id: ids[0],
          name: `${images[0].name || "写真"} ほか（${ids.length}ページ）`,
          mediaType: "image/jpeg",
          origin: "photo",
          hash: await fingerprint(`data:,${hashes.join("")}`),
          pageIds: ids.length > 1 ? ids.slice(1) : undefined,
        },
      ]
    : [];
  const rest = others.length ? await addFilesToInbox(others, update) : { added: 0, duplicates: 0, rejected: [] };
  const mine = await commit(entries, update);
  return { added: mine.added + rest.added, duplicates: mine.duplicates + rest.duplicates, rejected: [...rejected, ...rest.rejected] };
}

export async function addFilesToInbox(files: File[], update: (change: (h: Household) => Household) => Promise<void>): Promise<AddResult> {
  const entries: NewInboxEntry[] = [];
  const rejected: AddResult["rejected"] = [];
  for (const file of files) {
    const prepared = await prepareFile(file);
    if (!prepared.ok) {
      rejected.push({ name: file.name || "（名前なし）", error: prepared.error });
      continue;
    }
    const id = newId("in");
    await putFile(id, prepared.dataUrl);
    entries.push({
      id,
      name: file.name || "貼り付けた画像",
      mediaType: prepared.mediaType,
      origin: prepared.origin,
      hash: await fingerprint(prepared.dataUrl),
    });
  }
  return { ...(await commit(entries, update)), rejected };
}

/** 文字で渡せる長さの上限（メール1通ぶん。API と同じ） */
export const MAX_TEXT = 20000;

/**
 * メールの本文などを、文字のまま1件の書類として受け取り箱に入れる。
 * 差出人・件名・受信日時が分かれば、本文の前に付けて一緒に読む（原本の文字にもそのまま残る）
 */
export async function addTextToInbox(
  input: { body: string; from?: string; subject?: string; receivedAt?: string },
  update: (change: (h: Household) => Household) => Promise<void>,
): Promise<AddResult> {
  const body = input.body.replace(/\r\n?/g, "\n").trim();
  const head = [
    input.from?.trim() && `差出人: ${input.from.trim()}`,
    input.subject?.trim() && `件名: ${input.subject.trim()}`,
    input.receivedAt?.trim() && `受信日時: ${input.receivedAt.trim()}`,
  ].filter(Boolean);
  const text = head.length ? `${head.join("\n")}\n\n${body}` : body;
  const name = input.subject?.trim() || body.split("\n").find((l) => l.trim())?.trim().slice(0, 30) || "貼り付けた文字";
  if (!body) return { added: 0, duplicates: 0, rejected: [{ name, error: "本文が空です。" }] };
  if (text.length > MAX_TEXT) return { added: 0, duplicates: 0, rejected: [{ name, error: `長すぎます（${MAX_TEXT.toLocaleString()}文字まで）。PDF に保存して渡してください。` }] };
  const dataUrl = textToDataUrl(text);
  const id = newId("in");
  await putFile(id, dataUrl);
  return { ...(await commit([{ id, name, mediaType: "text/plain", origin: "text", hash: await fingerprint(dataUrl) }], update)), rejected: [] };
}

export async function addSamplesToInbox(samples: DemoSample[], update: (change: (h: Household) => Household) => Promise<void>): Promise<AddResult> {
  const entries: NewInboxEntry[] = [];
  const rejected: AddResult["rejected"] = [];
  for (const sample of samples) {
    if (sample.origin === "text") {
      // メールの見本: 本文を貼り付けて渡したのと同じ形（文字のまま1件の書類）で受け取り箱へ
      const dataUrl = textToDataUrl(sample.text);
      const id = newId("in");
      await putFile(id, dataUrl);
      entries.push({ id, name: sample.title, mediaType: "text/plain", origin: "text", hash: await fingerprint(dataUrl), sampleId: sample.id, expectedId: sample.expectedId });
      continue;
    }
    if (sample.images?.length) {
      // 写真の見本: 置いてある画像を、渡された写真と同じように縮めて受け取り箱へ（何枚かなら1つの書類のページ）
      const ids: string[] = [];
      const hashes: string[] = [];
      for (const url of sample.images) {
        const res = await fetch(url).catch(() => null);
        const blob = res && res.ok ? await res.blob() : null;
        const prepared = blob ? await prepareFile(new File([blob], url.split("/").pop() ?? "sample", { type: blob.type })) : null;
        if (!prepared?.ok) break;
        const id = newId("in");
        await putFile(id, prepared.dataUrl);
        ids.push(id);
        hashes.push(await fingerprint(prepared.dataUrl));
      }
      if (ids.length !== sample.images.length) {
        rejected.push({ name: sample.title, error: "見本の画像を読み込めませんでした。" });
        continue;
      }
      entries.push({
        id: ids[0],
        name: sample.title,
        mediaType: "image/jpeg",
        origin: "photo",
        hash: hashes.length > 1 ? await fingerprint(`data:,${hashes.join("")}`) : hashes[0],
        sampleId: sample.id,
        expectedId: sample.expectedId,
        pageIds: ids.length > 1 ? ids.slice(1) : undefined,
      });
      continue;
    }
    const dataUrl = renderSampleImage(sample.text);
    const id = newId("in");
    await putFile(id, dataUrl);
    entries.push({
      id,
      name: sample.title,
      mediaType: "image/png",
      origin: "photo",
      hash: await fingerprint(dataUrl),
      sampleId: sample.id,
      expectedId: sample.expectedId,
    });
  }
  return { ...(await commit(entries, update)), rejected };
}

async function commit(entries: NewInboxEntry[], update: (change: (h: Household) => Household) => Promise<void>) {
  let added = 0;
  let duplicates = 0;
  if (entries.length) {
    await update((h) => {
      const r = enqueue(h, entries);
      added = r.added;
      duplicates = r.duplicates;
      return r.household;
    });
  }
  return { added, duplicates };
}
