// アプリから家族の置き場所へ、共有した書類のまとめと名簿を送る（中身が変わったときだけ）。
// 🔴 送るのは summaryOf で作ったまとめだけ（写真・原本の全文・大事な番号は入れない。サーバーでも線を引く）

import { isShared, rosterOf, summaryOf } from "./familyShare";
import type { Household } from "./types";

const KEY = "culalog-family-sync";
let timer: ReturnType<typeof setTimeout> | undefined;

function fingerprint(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${h >>> 0}`;
}

/** 家族の置き場所に送る中身（updatedAt は比べるときに外す） */
export function familyPayload(household: Household) {
  const docs = household.documents.filter(isShared).map((d) => summaryOf(household, d)).filter((d) => d !== null);
  return { roster: rosterOf(household), docs };
}

/** 保存のたびに呼ぶ。少し待ってから、前に送ったものと違うときだけ送る */
export function scheduleFamilySync(household: Household | null) {
  if (typeof window === "undefined" || !household?.telegram) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncFamily(household), 1500);
}

export async function syncFamily(household: Household, force = false): Promise<{ ok: boolean; count?: number; error?: string }> {
  if (!household.telegram) return { ok: false };
  const payload = familyPayload(household);
  const fp = fingerprint(JSON.stringify({ c: household.telegram.chatId, r: payload.roster, d: payload.docs.map((d) => ({ ...d, updatedAt: "" })) }));
  try {
    if (!force && localStorage.getItem(KEY) === fp) return { ok: true };
  } catch {
    /* 端末に覚えられないときは毎回送る */
  }
  const res = await fetch("/api/family", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...household.telegram, action: "sync", ...payload }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  if (!res?.ok) return { ok: false, error: json.error ?? "送れませんでした。" };
  try {
    localStorage.setItem(KEY, fp);
  } catch {
    /* 無視 */
  }
  return { ok: true, count: json.count };
}

export async function clearFamily(household: Household): Promise<{ ok: boolean; error?: string }> {
  if (!household.telegram) return { ok: false };
  const res = await fetch("/api/family", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...household.telegram, action: "clear" }),
  }).catch(() => null);
  const json = res ? await res.json().catch(() => ({})) : {};
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 無視 */
  }
  return res?.ok ? { ok: true } : { ok: false, error: json.error ?? "消せませんでした。" };
}
