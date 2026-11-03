// サーバー側の小さな置き場所（Google の Firebase・Firestore）。
// 🔴 置くのは、Telegram のグループと人の「読みたい言葉」・つなぐための合言葉の指紋・通知の「日付と件数」だけ。
// 書類の中身・予定の名前・会話の文は置かない。

import { createHash, randomBytes } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import type { LanguageCode } from "@/lib/languages";

let db: Firestore | null | undefined;

export function store(): Firestore | null {
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
