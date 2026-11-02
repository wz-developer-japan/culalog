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
