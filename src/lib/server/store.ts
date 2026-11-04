// サーバー側の小さな置き場所（Google の Firebase・Firestore）。
// 🔴 置くのは、Telegram のグループと人の「読みたい言葉」・つなぐための合言葉の指紋・通知の「日付と件数」・Telegram で Claude を呼んだその日の回数、
//    家族の名簿（呼び名と言葉）・1対1を始めた大人・**家族と共有した書類のまとめ**（置かない線は src/lib/familyShare.ts）。
// 写真・原本の全文・大事な番号・会話の文は置かない。家族（つないだグループ）ごとに分け、合言葉が合うときだけ読み書きする。

import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { LanguageCode } from "@/lib/languages";
import { fakeFirestore } from "./fakeFirestore";
import type { FamilySummary, RosterMember } from "@/lib/familyShare";

let db: Firestore | null | undefined;

export function store(): Firestore | null {
  // 試験のときだけ: メモリの中の置き場所（本番では使わない）
  if (process.env.CULALOG_FAKE_STORE === "1" && process.env.VERCEL_ENV !== "production") return fakeFirestore() as unknown as Firestore;
  if (db !== undefined) return db;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return (db = null);
  try {
    const app = getApps()[0] ?? initializeApp({ credential: cert(JSON.parse(raw)) });
    db = getFirestore(app);
  } catch (e) {
    console.error("store: init failed", e instanceof Error ? e.message : "");
    db = null;
  }
  return db;
}

export interface ChatUser {
  lang: LanguageCode;
  /** Telegram の表示名（担当のお知らせに使う） */
  name: string;
}

export interface ChatDoc {
  users: Record<string, ChatUser>;
  paused?: boolean;
  /** アプリとつないだときの合言葉の指紋（合言葉そのものは置かない） */
  tokenHash?: string;
  /** 通知: 近い予定の日付と件数だけ（予定の名前は置かない） */
  upcoming?: Record<string, number>;
  /** 通知を送った日（同じ日に二度送らない） */
  notifiedOn?: string;
  /** Telegram で Claude を呼んだ回数（日本時間の日ごと。上限のため。会話の文は置かない） */
  claudeUse?: { day: string; count: number; overNoticed?: boolean };
  /** 家族の名簿（呼び名と読みたい言葉だけ。アプリが送る） */
  roster?: RosterMember[];
  /** 執事と1対1を始めた大人（Telegram の人の番号 → 家族のだれか・読みたい言葉） */
  dms?: Record<string, { memberId: string; lang: LanguageCode; startedAt: string }>;
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex");

export async function getChat(chatId: string): Promise<ChatDoc | null> {
  const s = store();
  if (!s) return null;
  const snap = await s.collection("chats").doc(chatId).get();
  return snap.exists ? (snap.data() as ChatDoc) : { users: {} };
}

export async function updateChat(chatId: string, change: Partial<ChatDoc>) {
  const s = store();
  if (!s) return;
  await s.collection("chats").doc(chatId).set(change, { merge: true });
}

export async function setUserLang(chatId: string, userId: string, user: ChatUser) {
  // merge は入れ子のマップも混ぜるので、ほかの人の設定は消えない
  await updateChat(chatId, { users: { [userId]: user } });
}

/** グループで /link を打ったときの、アプリに入れる6文字の合言葉（10分だけ有効） */
export async function createLinkCode(chatId: string): Promise<string | null> {
  const s = store();
  if (!s) return null;
  const code = randomBytes(4).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase().padEnd(6, "X");
  await s.collection("links").doc(code).set({ chatId, expiresAt: Date.now() + 10 * 60 * 1000 });
  return code;
}

/** アプリが合言葉を出したら、グループの ID と、これから使う合言葉（長い）を返す */
export async function consumeLinkCode(code: string): Promise<{ chatId: string; token: string } | null> {
  const s = store();
  if (!s) return null;
  const ref = s.collection("links").doc(code.toUpperCase());
  const snap = await ref.get();
  await ref.delete().catch(() => undefined);
  const data = snap.data() as { chatId: string; expiresAt: number } | undefined;
  if (!data || data.expiresAt < Date.now()) return null;
  const token = randomBytes(24).toString("base64url");
  await updateChat(data.chatId, { tokenHash: hash(token) });
  return { chatId: data.chatId, token };
}

export async function verifyChatToken(chatId: string, token: string): Promise<ChatDoc | null> {
  if (!/^-?\d+$/.test(chatId) || !token) return null;
  const chat = await getChat(chatId);
  return chat?.tokenHash && chat.tokenHash === hash(token) ? chat : null;
}

export async function chatsToNotify(): Promise<{ id: string; chat: ChatDoc }[]> {
  const s = store();
  if (!s) return [];
  const snap = await s.collection("chats").where("tokenHash", ">", "").get();
  return snap.docs.map((d) => ({ id: d.id, chat: d.data() as ChatDoc }));
}

function readLimit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Telegram の通訳・返信の答えで Claude を呼ぶ前に数える（1つのグループで1日に何回まで・Telegram 全体で1日に何回まで）。
 * 数はサーバーの置き場所（Firestore）に置くので、サーバーが入れ替わっても数え直しにならない。
 * "ok" なら呼んでよい。"over-first" はその日はじめて上限に当たった（グループに1回だけ知らせる）。"over" は黙る
 */
export async function useClaudeInChat(chatId: string): Promise<"ok" | "over-first" | "over"> {
  const s = store();
  if (!s) return "over";
  const perChat = readLimit("TELEGRAM_CLAUDE_PER_CHAT_PER_DAY", 100);
  const perAll = readLimit("TELEGRAM_CLAUDE_GLOBAL_PER_DAY", 300);
  const day = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const chatRef = s.collection("chats").doc(chatId);
  const allRef = s.collection("meta").doc("telegramClaudeUse");
  return s.runTransaction(async (tx) => {
    const [chatSnap, allSnap] = await Promise.all([tx.get(chatRef), tx.get(allRef)]);
    const next = claudeUseNext((chatSnap.data() as ChatDoc | undefined)?.claudeUse, allSnap.data() as { day: string; count: number } | undefined, day, perChat, perAll);
    if (next.mine) tx.set(chatRef, { claudeUse: next.mine }, { merge: true });
    if (next.all) tx.set(allRef, next.all);
    return next.result;
  });
}

/** 回数の数え方（置き場所を使わない部分。試験用に分けてある） */
export function claudeUseNext(
  mine: ChatDoc["claudeUse"],
  all: { day: string; count: number } | undefined,
  day: string,
  perChat: number,
  perAll: number,
): { result: "ok" | "over-first" | "over"; mine?: NonNullable<ChatDoc["claudeUse"]>; all?: { day: string; count: number } } {
  const mineCount = mine?.day === day ? mine.count : 0;
  const allCount = all?.day === day ? all.count : 0;
  if (mineCount >= perChat || allCount >= perAll) {
    if (mine?.day === day && mine.overNoticed) return { result: "over" };
    return { result: "over-first", mine: { day, count: mineCount, overNoticed: true } };
  }
  return { result: "ok", mine: { day, count: mineCount + 1, overNoticed: false }, all: { day, count: allCount + 1 } };
}

// ---- 家族と共有した書類のまとめ（chats/{グループ}/docs/{書類}） ----

const familyDocsRef = (s: Firestore, chatId: string) => s.collection("chats").doc(chatId).collection("docs");

/** 共有したまとめを、アプリから来た一覧に置き換える（一覧に無いものは消す＝共有をやめた書類は残らない） */
export async function replaceFamilyDocs(chatId: string, docs: FamilySummary[], roster: RosterMember[]) {
  const s = store();
  if (!s) return;
  const ref = familyDocsRef(s, chatId);
  const now = await ref.get();
  const keep = new Set(docs.map((d) => d.id));
  const batch = s.batch();
  // tg- で始まるもの（1対1に届いた写真の読み取り）は、預かる人が「預かる・預からない」を決めるまで残す
  for (const d of now.docs) if (!keep.has(d.id) && !d.id.startsWith("tg-")) batch.delete(ref.doc(d.id));
  for (const d of docs) batch.set(ref.doc(d.id), JSON.parse(JSON.stringify(d)));
  batch.set(s.collection("chats").doc(chatId), { roster }, { merge: true });
  await batch.commit();
}

export async function familyDocs(chatId: string): Promise<FamilySummary[]> {
  const s = store();
  if (!s) return [];
  const snap = await familyDocsRef(s, chatId).get();
  return snap.docs.map((d) => d.data() as FamilySummary);
}

/** 家族のまとめ・名簿・預かる？を全部消す（つながり・読みたい言葉は残す） */
export async function clearFamilyData(chatId: string) {
  const s = store();
  if (!s) return;
  const batch = s.batch();
  for (const name of ["docs", "inbox", "tells"]) {
    const snap = await s.collection("chats").doc(chatId).collection(name).get();
    for (const d of snap.docs) batch.delete(s.collection("chats").doc(chatId).collection(name).doc(d.id));
  }
  batch.set(s.collection("chats").doc(chatId), { roster: [] }, { merge: true });
  const links = await s.collection("icsLinks").where("chatId", "==", chatId).get();
  for (const d of links.docs) batch.delete(s.collection("icsLinks").doc(d.id));
  await batch.commit();
}

// ---- Telegram の人 → 家族（1対1で、どの家族の人かを知るため） ----

export async function indexUser(userId: string, chatId: string) {
  const s = store();
  if (!s) return;
  await s.collection("tgUsers").doc(userId).set({ chatId }, { merge: true });
}

export async function familyOfUser(userId: string): Promise<string | null> {
  const s = store();
  if (!s) return null;
  const snap = await s.collection("tgUsers").doc(userId).get();
  return snap.exists ? ((snap.data() as { chatId?: string }).chatId ?? null) : null;
}

// ---- iPhone のカレンダーに入れるリンク（.ics を一時的に置く。推測できない合言葉・30日で切れる） ----

export async function putIcsLink(chatId: string, ics: string): Promise<string | null> {
  const s = store();
  if (!s) return null;
  const token = randomBytes(18).toString("base64url");
  await s.collection("icsLinks").doc(token).set({ chatId, ics, expiresAt: Date.now() + 30 * 24 * 3600 * 1000 });
  return token;
}

export async function getIcsLink(token: string): Promise<string | null> {
  const s = store();
  if (!s || !/^[\w-]{20,40}$/.test(token)) return null;
  const snap = await s.collection("icsLinks").doc(token).get();
  const data = snap.data() as { ics: string; expiresAt: number } | undefined;
  return data && data.expiresAt > Date.now() ? data.ics : null;
}

// ---- 1対1に届いた写真の「預かる？」（chats/{グループ}/inbox/{id}） ----

export async function familyInbox(chatId: string): Promise<{ id: string; from: string; receivedAt: string; extraction: unknown }[]> {
  const s = store();
  if (!s) return [];
  const snap = await s.collection("chats").doc(chatId).collection("inbox").get();
  return snap.docs.map((d) => d.data() as { id: string; from: string; receivedAt: string; extraction: unknown });
}

/** 預かった・預からなかった: 受け取り箱から消す。預からなかったものは、共有したまとめからも消す（預かったものは、アプリが共有すれば置き直す） */
export async function familyInboxDone(chatId: string, ids: string[]) {
  const s = store();
  if (!s) return;
  const batch = s.batch();
  const family = s.collection("chats").doc(chatId);
  for (const id of ids.filter((x) => /^tg-[0-9a-f]{12}$/.test(x))) {
    batch.delete(family.collection("inbox").doc(id));
    batch.delete(family.collection("docs").doc(id));
  }
  await batch.commit();
}

// ---- 同じものを二度処理しない（Telegram の再送・同じ写真） ----

/** key をはじめて見たときだけ true（2日で消してよい印を置く）。置き場所が無いときは true */
export async function firstTime(key: string): Promise<boolean> {
  const s = store();
  if (!s) return true;
  const ref = s.collection("seen").doc(key.replace(/[^\w-]/g, "_").slice(0, 120));
  return s.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return false;
    tx.set(ref, { at: Date.now(), expiresAt: Date.now() + 2 * 24 * 3600 * 1000 });
    return true;
  });
}
