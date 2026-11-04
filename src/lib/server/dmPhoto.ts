// 1対1に届いた書類の写真（決定版 5）。あとで作る
import type { RosterMember } from "@/lib/familyShare";
import type { LanguageCode } from "@/lib/languages";
import type { ChatDoc } from "./store";
import { sendMessage } from "./telegram";

export async function onDmPhoto(x: { userId: string; chatId: string; chat: ChatDoc; member: RosterMember; lang: LanguageCode; fileId: string; mediaType: string; replyTo: number; caption?: string }) {
  return sendMessage(x.userId, "（写真の読み取りは準備中です）", { replyTo: x.replyTo });
}
