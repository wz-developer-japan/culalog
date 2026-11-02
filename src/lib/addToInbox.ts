"use client";

// 受け取り箱に入れる（ファイルの中身は端末の別の場所に置き、家のデータには目録だけを足す）

import { fingerprint, prepareFile, renderSampleImage } from "./files";
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

export async function addSamplesToInbox(samples: DemoSample[], update: (change: (h: Household) => Household) => Promise<void>): Promise<AddResult> {
  const entries: NewInboxEntry[] = [];
  for (const sample of samples) {
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
  return { ...(await commit(entries, update)), rejected: [] };
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
