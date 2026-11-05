// 執事と大人それぞれの1対1（Telegram の private chat）。
// - /start で「あなたは家族のだれ？」→ その人の1対1にお知らせが、その人の言葉だけで届く
// - 家族に伝える・朝の通知・担当のボタン・カレンダーのボタンは1対1へ（家族のグループは通訳だけ）
// 🔴 1対1の会話の文は置かない。置くのは「だれが1対1を始めたか・読みたい言葉」と、担当を決めるためのお知らせの控え（題・送った先）だけ。

import { randomBytes } from "node:crypto";
import type { FamilySummary, RosterMember } from "@/lib/familyShare";
import type { LanguageCode } from "@/lib/languages";
import { CAL_BUTTON, calendarButtons, composeTellFor, TAKE_TEXT, type TellPayload } from "@/lib/tell";
import { familyOfUser, getChat, putIcsLink, store, updateChat, type ChatDoc, type DmNotice } from "./store";
import { sendMessage, tg, type InlineButton } from "./telegram";
import { translateLines } from "./interpret";
import { docsFor, morningText, shortDate, upcomingItems } from "./morning";

const nameIn = (m: RosterMember | undefined, lang: LanguageCode) => (m ? (m.names[lang] ?? m.names.ja ?? "") : "");

export const DM_SAY = {
  needGroup:
    "家族の Telegram グループで、まず /lang ja（ベトナム語なら /lang vi）を送ってから、ここでもう一度 /start を送ってください。\nTrước tiên hãy gửi /lang vi trong nhóm Telegram của gia đình, rồi gửi lại /start ở đây.",
  noRoster:
    "まだアプリと家族がつながっていません。書類を預かる人が、アプリの設定「家族の Telegram」でつないでください。\nỨng dụng chưa được kết nối với gia đình. Người giữ giấy tờ hãy kết nối trong phần cài đặt “家族の Telegram” của ứng dụng.",
  who: "あなたは家族のだれですか？\nBạn là ai trong gia đình?",
  taken: "その人は、もう別の Telegram とつながっています。\nNgười này đã được kết nối với một tài khoản Telegram khác.",
  notStarted: "まず /start を送ってください。\nHãy gửi /start trước.",
  /** やさしい日本語で読む人（子ども）が1対1で /start したとき。お知らせは大人にだけ届く */
  child: "おしらせは、おとなに とどくよ。みんなの かいわは、かぞくの グループで つうやく するね。",
};

export const WELCOME: Record<LanguageCode, (name: string) => string> = {
  ja: (n) =>
    `${n}さん、よろしくお願いします。これから家族のお知らせは、ここに日本語で届きます。\n・共有した書類のことを、ここで聞けます\n・書類の写真を送ると、読んでまとめます\n・「○○に伝えて」と書くと、その人の言葉で伝えます\n（言葉を変える: /lang vi ・ /lang easy）`,
  "ja-easy": (n) =>
    `${n}さん、よろしくね。これから かぞくの おしらせは、ここに やさしい にほんごで とどきます。\n・かぞくで みせあった かみの ことを、ここで きけます\n・かみの しゃしんを おくると、よんで まとめます\n・「○○に つたえて」と かくと、その ひとの ことばで つたえます`,
  vi: (n) =>
    `Chào ${n}. Từ giờ, thông báo của gia đình sẽ đến đây bằng tiếng Việt.\n・Có thể hỏi về các giấy tờ đã được chia sẻ ở đây\n・Gửi ảnh giấy tờ, quản gia sẽ đọc và tóm tắt\n・Viết “Nhắn cho … rằng …”, quản gia sẽ chuyển lời bằng ngôn ngữ của người đó\n(Đổi ngôn ngữ: /lang ja ・ /lang easy)`,
};

/** Telegram の人が、どの家族のだれか（1対1を始めていれば） */
export async function dmUser(userId: string): Promise<{ chatId: string; chat: ChatDoc; member?: RosterMember; lang: LanguageCode } | null> {
  const chatId = await familyOfUser(userId);
  if (!chatId) return null;
  const chat = await getChat(chatId);
  if (!chat) return null;
  const dm = chat.dms?.[userId];
  const member = dm ? (chat.roster ?? []).find((m) => m.id === dm.memberId) : undefined;
  return { chatId, chat, member, lang: dm?.lang ?? chat.users?.[userId]?.lang ?? "ja" };
}

/** 1対1の /start */
export async function onDmStart(userId: string) {
  const who = await dmUser(userId);
  if (!who) return sendMessage(userId, DM_SAY.needGroup);
  if (who.member) return sendMessage(userId, WELCOME[who.lang](nameIn(who.member, who.lang)));
  // やさしい日本語で読む人（子ども）には、大人の名簿を出さない
  if (who.lang === "ja-easy") return sendMessage(userId, DM_SAY.child);
  const adults = (who.chat.roster ?? []).filter((m) => m.adult);
  if (!adults.length) return sendMessage(userId, DM_SAY.noRoster);
  const claimed = new Set(Object.entries(who.chat.dms ?? {}).filter(([uid]) => uid !== userId).map(([, d]) => d.memberId));
  const rows: InlineButton[][] = adults
    .filter((m) => !claimed.has(m.id))
    .map((m) => [{ text: m.names.vi && m.names.vi !== m.names.ja ? `${m.names.ja} / ${m.names.vi}` : (m.names.ja ?? ""), callback_data: `w:${m.id}`.slice(0, 64) }]);
  if (!rows.length) return sendMessage(userId, DM_SAY.taken);
  return sendMessage(userId, DM_SAY.who, { buttons: rows });
}

/** 「あなたは家族のだれ？」のボタン */
export async function onWhoCallback(q: { id: string; from: { id: number }; data: string; message?: { message_id: number; chat: { id: number } } }) {
  const userId = String(q.from.id);
  const memberId = q.data.slice(2);
  const who = await dmUser(userId);
  const member = who?.chat.roster?.find((m) => m.id === memberId && m.adult);
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  if (!who || !member) return sendMessage(userId, DM_SAY.needGroup);
  if (who.chat.users?.[userId]?.lang === "ja-easy") return sendMessage(userId, DM_SAY.child);
  const taken = Object.entries(who.chat.dms ?? {}).some(([uid, d]) => uid !== userId && d.memberId === memberId);
  if (taken) return sendMessage(userId, DM_SAY.taken);
  const lang = who.chat.users?.[userId]?.lang ?? member.lang;
  await updateChat(who.chatId, { dms: { [userId]: { memberId, lang, startedAt: new Date().toISOString() } } });
  if (q.message) await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: `✓ ${nameIn(member, lang)}`, callback_data: "noop" }]] } });
  return sendMessage(userId, WELCOME[lang](nameIn(member, lang)));
}

/** 1対1の /lang（自分の読みたい言葉を変える） */
export async function setDmLang(userId: string, lang: LanguageCode) {
  const who = await dmUser(userId);
  const dm = who?.chat.dms?.[userId];
  if (!who || !dm) return sendMessage(userId, DM_SAY.notStarted);
  await updateChat(who.chatId, { dms: { [userId]: { ...dm, lang } } });
  return sendMessage(userId, WELCOME[lang](nameIn(who.member, lang)));
}

/** 家族のだれ（memberId）→ その人の1対1（Telegram の人の番号）と言葉 */
export function dmOf(chat: ChatDoc, memberId: string): { userId: string; lang: LanguageCode } | null {
  const hit = Object.entries(chat.dms ?? {}).find(([, d]) => d.memberId === memberId);
  return hit ? { userId: hit[0], lang: hit[1].lang } : null;
}

// ---- 家族に伝える（1対1へ） ----

interface TellRecord {
  titles: Partial<Record<LanguageCode, string>>;
  takers: Partial<Record<LanguageCode, string>>[];
  sent: { userId: string; messageId: number; lang: LanguageCode; calUrl?: string }[];
  calendar?: Partial<Record<LanguageCode, string>>;
  takenBy?: number;
  createdAt: string;
}

const tellsRef = (chatId: string) => store()!.collection("chats").doc(chatId).collection("tells");

const takerButtonIn = (names: Partial<Record<LanguageCode, string>>, lang: LanguageCode) => {
  const n = names[lang] ?? names.ja ?? "";
  return lang === "vi" ? `${n} sẽ lo việc này` : lang === "ja-easy" ? `${n}が する` : `${n}がやる`;
};

/**
 * お知らせを、送る相手（あなたと共有した大人）それぞれの1対1へ、その人の言葉の段だけで送る。
 * 1対1を始めていない人は notStarted に返す（アプリでその人の分は文のコピーで渡す）
 */
export async function deliverTell(chatId: string, chat: ChatDoc, p: TellPayload, base: string): Promise<{ sent: string[]; notStarted: string[]; failed: string[] }> {
  const ids = p.takerIds ?? [];
  const tellId = randomBytes(6).toString("base64url");
  const record: TellRecord = { titles: Object.fromEntries(p.blocks.map((b) => [b.lang, b.title])), takers: p.takers, sent: [], calendar: p.calendar, createdAt: new Date().toISOString() };
  const out = { sent: [] as string[], notStarted: [] as string[], failed: [] as string[] };
  for (const memberId of ids) {
    const dm = dmOf(chat, memberId);
    if (!dm) {
      out.notStarted.push(memberId);
      continue;
    }
    const { text, lang } = composeTellFor(p, dm.lang);
    const takerRows: InlineButton[][] = p.takers.map((t, i) => [{ text: takerButtonIn(t, lang), callback_data: `k:${tellId}:${i}` }]);
    // カレンダーのボタン: iPhone のカレンダーの人には .ics のリンク（合言葉つき・30日）、ほかは Google カレンダーの予定作成リンク
    const member = (chat.roster ?? []).find((m) => m.id === memberId);
    let cal = calendarButtons(p.calendar, [lang]);
    if (member?.calendarApp === "apple") {
      const ics = p.ics?.[lang];
      const token = ics ? await putIcsLink(chatId, ics) : null;
      cal = token ? [{ text: CAL_BUTTON[lang], url: `${base}/api/ics?t=${token}` }] : [];
    }
    let res = await tg<{ message_id: number }>("sendMessage", {
      chat_id: dm.userId,
      text: text.slice(0, 4000),
      reply_markup: { inline_keyboard: [...takerRows, ...(cal.length ? [cal] : [])] },
      link_preview_options: { is_disabled: true },
    });
    // カレンダーのボタンで断られたときは、ボタン無しでお知らせだけは届ける
    if (!res && cal.length) res = await tg<{ message_id: number }>("sendMessage", { chat_id: dm.userId, text: text.slice(0, 4000), reply_markup: { inline_keyboard: takerRows }, link_preview_options: { is_disabled: true } });
    if (res?.message_id) {
      record.sent.push({ userId: dm.userId, messageId: res.message_id, lang, calUrl: cal[0]?.url });
      out.sent.push(memberId);
      const ja = p.blocks.find((b) => b.lang === "ja")?.title ?? "";
      const shown = p.blocks.find((b) => b.lang === lang)?.title ?? ja;
      await rememberNotice(chatId, chat, dm.userId, [{ label: ja, shown }]);
    } else out.failed.push(memberId);
  }
  if (record.sent.length) await tellsRef(chatId).doc(tellId).set(JSON.parse(JSON.stringify(record)));
  return out;
}

/** 1対1のお知らせの「○○がやる」（k:お知らせの控え:何番目）。どの家族かは押した人の家族 */
export async function takeTell(chatId: string, tellId: string, index: number, callbackId: string) {
  const ref = tellsRef(chatId).doc(tellId);
  const snap = await ref.get();
  const rec = snap.exists ? (snap.data() as TellRecord) : null;
  const names = rec?.takers[index];
  if (!rec || !names) return tg("answerCallbackQuery", { callback_query_id: callbackId });
  await tg("answerCallbackQuery", { callback_query_id: callbackId, text: "OK" });
  await ref.set({ takenBy: index }, { merge: true });
  for (const s of rec.sent) {
    const name = names[s.lang] ?? names.ja ?? "";
    const cal = s.calUrl ? [{ text: CAL_BUTTON[s.lang], url: s.calUrl }] : [];
    await tg("editMessageReplyMarkup", {
      chat_id: s.userId,
      message_id: s.messageId,
      reply_markup: { inline_keyboard: [[{ text: `✓ ${name}`, callback_data: "noop" }], ...(cal.length ? [cal] : [])] },
    });
    const title = rec.titles[s.lang] ?? rec.titles.ja ?? "";
    await sendMessage(s.userId, `✅ ${TAKE_TEXT[s.lang](name, title)}`, { replyTo: s.messageId });
  }
}

// ---- 朝の通知（1対1へ） ----

export const NOTICE_DM: Record<LanguageCode, (today: number, week: number) => string> = {
  ja: (a, b) => (b ? `近い予定が${b}件あります（今日 ${a}件・7日以内 ${b}件）。くわしくは、ここで聞いてね` : "7日以内に、共有している予定はありません。"),
  "ja-easy": (a, b) => (b ? `ちかい よていが ${b}こ あります（きょう ${a}・7にち いない ${b}）。きに なったら、ここで きいてね` : "7にち いない に よていは ありません。"),
  vi: (a, b) => (b ? `Có ${b} việc sắp tới (hôm nay ${a}, trong 7 ngày ${b}). Muốn biết thêm thì hỏi ở đây nhé.` : "Trong 7 ngày tới không có việc nào được chia sẻ."),
};

type Translate = (lines: string[], lang: LanguageCode) => Promise<string[] | null>;

/**
 * 朝の通知を、1対1を始めた大人それぞれへ（その人の言葉だけ）。送れた人数。
 * 共有したまとめがあれば、その人と共有した書類の7日以内の予定の名前と日付（上から3件＋ほかに○件）。
 * 日本語以外は名前を朝に1回だけ訳し、訳せなければ件数だけの文。まとめが無い（前の形）ときは、アプリが預けた件数だけの文
 */
export async function notifyDms(
  chat: ChatDoc,
  today: number,
  week: number,
  opts: { docs?: FamilySummary[]; todayYmd?: string; force?: boolean; translate?: Translate; chatId?: string } = {},
): Promise<number> {
  const translate = opts.translate ?? translateLines;
  const cache = new Map<string, string[] | null>();
  let n = 0;
  for (const [userId, dm] of Object.entries(chat.dms ?? {})) {
    let text: string | null = null;
    let notice: DmNotice["items"] = [];
    if (opts.docs?.length && opts.todayYmd) {
      const member = (chat.roster ?? []).find((m) => m.id === dm.memberId);
      const items = upcomingItems(docsFor(opts.docs, member), opts.todayYmd);
      if (items.length) {
        const shown = items.slice(0, 3).map((x) => x.label);
        let labels: string[] | null = shown;
        if (dm.lang !== "ja") {
          const key = `${dm.lang}|${shown.join("\n")}`;
          if (!cache.has(key)) cache.set(key, await translate(shown, dm.lang).catch(() => null));
          labels = cache.get(key) ?? null;
        }
        const todayCount = items.filter((x) => x.date === opts.todayYmd).length;
        text = labels ? morningText(items, labels, dm.lang) : `🔔 ${NOTICE_DM[dm.lang](todayCount, items.length)}`;
        notice = items.slice(0, 3).map((x, k) => ({ date: x.date, label: x.label, shown: labels?.[k] ?? x.label }));
      } else if (opts.force) text = `🔔 ${NOTICE_DM[dm.lang](0, 0)}`;
    } else if (week || opts.force) text = `🔔 ${NOTICE_DM[dm.lang](today, week)}`;
    if (text && (await sendMessage(userId, text))) {
      n++;
      if (opts.chatId) await rememberNotice(opts.chatId, chat, userId, notice);
    }
  }
  return n;
}

// ---- 通知のすぐあとの「詳しく」 ----

/** 最後に送った通知の予定を、その人の1対1の記録に（予定が無い通知なら消す） */
async function rememberNotice(chatId: string, chat: ChatDoc, userId: string, items: DmNotice["items"]) {
  const dm = chat.dms?.[userId];
  if (!dm) return;
  const notice: DmNotice | null = items.length ? { at: new Date().toISOString(), items } : null;
  dm.notice = notice;
  await updateChat(chatId, { dms: { [userId]: { ...dm, notice } } }).catch(() => undefined);
}

/** 通知から20時間以内なら使う（次の朝の通知までに） */
const freshNotice = (n: DmNotice | null | undefined) => (n && n.items.length && Date.now() - Date.parse(n.at) < 20 * 3600 * 1000 ? n : null);

const DETAIL_WORD = /詳しく|くわしく|詳細|詳しい|くわしい|しょうさい|chi tiết|rõ hơn|biết thêm|nói thêm|kể thêm|thông tin thêm/i;
/** 「詳しく教えて」「Chi tiết」など、何のことかを言っていない「詳しく」の言い方なら true */
export function isDetailAsk(text: string): boolean {
  const t = text.toLowerCase();
  if (!DETAIL_WORD.test(t) || t.length > 40) return false;
  const rest = t
    .replace(/もっと|詳しく|くわしく|詳細|詳しい|くわしい|しょうさい|教えて|おしえて|ください|下さい|ちょうだい|お願い|おねがい|知りたい|しりたい|聞きたい|ききたい|して|それ|その|この|予定|よてい|について|のこと|こと|です|ます|を|は|が|に|の|ね|よ|な|か/g, "")
    .replace(/chi tiết|rõ hơn|biết thêm|nói thêm|kể thêm|thông tin thêm|thông tin|cho|tôi|em|anh|chị|mình|biết|thêm|nói|được|không|với|nhé|nha|ạ|đi|xem|kể|về|việc|này|đó|đấy|hơn|muốn|hãy|giúp|please|more|details?/g, "")
    .replace(/[\s\p{P}\p{S}]/gu, "");
  return rest.length === 0;
}

/** そのメッセージが通知のどの予定のことか。「詳しく」だけなら、予定が1件のときはその予定・2件以上なら "pick"。違えば null */
export function noticeTarget(text: string, notice: DmNotice | null | undefined): DmNotice["items"][number] | "pick" | null {
  const n = freshNotice(notice);
  if (!n || !DETAIL_WORD.test(text)) return null;
  const named = n.items.filter((x) => (x.label && text.includes(x.label)) || (x.shown && text.toLowerCase().includes(x.shown.toLowerCase())));
  if (named.length === 1) return named[0];
  if (!isDetailAsk(text)) return null;
  return n.items.length === 1 ? n.items[0] : "pick";
}

export const NOTICE_PICK: Record<LanguageCode, string> = {
  ja: "どの予定のことですか？（さっきの通知から）",
  "ja-easy": "どの よてい？（さっきの おしらせ から）",
  vi: "Bạn muốn biết về việc nào? (trong thông báo vừa rồi)",
};
const DETAIL_ASK: Record<LanguageCode, string> = {
  ja: "この予定をくわしく教えて",
  "ja-easy": "この よていを くわしく おしえて",
  vi: "Chi tiết về việc này.",
};

/** 「どの予定？」のボタン（n:何番目） */
export async function onNoticePick(q: { id: string; from: { id: number }; data: string; message?: { message_id: number; chat: { id: number } } }) {
  const userId = String(q.from.id);
  await tg("answerCallbackQuery", { callback_query_id: q.id });
  const who = await dmUser(userId);
  const item = freshNotice(who?.chat.dms?.[userId]?.notice)?.items[Number(q.data.slice(2))];
  if (!who?.member || !item) return;
  if (q.message) await tg("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: `✓ ${item.shown}`.slice(0, 60), callback_data: "noop" }]] } });
  return answerDm(userId, who, DETAIL_ASK[who.lang], q.message?.message_id, item);
}

// ---- 1対1のふつうのメッセージ（質問・伝言・写真） ----

export const DM_TEXT = {
  preparing: {
    ja: "（執事の準備中です。もう少し待ってください）",
    "ja-easy": "（しつじ は じゅんびちゅう です。すこし まってね）",
    vi: "(Quản gia đang được chuẩn bị, hãy chờ một chút.)",
  } as Record<LanguageCode, string>,
  over: {
    ja: "今日の執事の回数の上限に達しました。日本時間の0時に戻ります。",
    "ja-easy": "きょうは もう つかえません。よる 0じ に もどります。",
    vi: "Hôm nay đã dùng hết số lần. Sẽ dùng lại được từ 0 giờ (giờ Nhật Bản).",
  } as Record<LanguageCode, string>,
  relayNotStarted: {
    ja: (n: string) => `${n}さんは、まだ執事と1対1を始めていないので伝えられませんでした。`,
    "ja-easy": (n: string) => `${n}さんは まだ しつじ と はなして いないので、つたえられません でした。`,
    vi: (n: string) => `${n} chưa bắt đầu trò chuyện riêng với quản gia nên chưa thể chuyển lời.`,
  } as Record<LanguageCode, (n: string) => string>,
  relayFrom: {
    ja: (n: string) => `💬 ${n}さんから`,
    "ja-easy": (n: string) => `💬 ${n}さん から`,
    vi: (n: string) => `💬 Lời nhắn từ ${n}`,
  } as Record<LanguageCode, (n: string) => string>,
};

const jstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export async function onDmMessage(userId: string, m: { message_id: number; text?: string; caption?: string; photo?: { file_id: string; file_unique_id?: string; file_size?: number }[]; document?: { file_id: string; file_unique_id?: string; mime_type?: string; file_size?: number } }) {
  const who = await dmUser(userId);
  if (!who) return;
  if (!who.member) return sendMessage(userId, DM_SAY.notStarted);
  const lang = who.lang;
  const photo = m.photo?.length ? m.photo[m.photo.length - 1] : m.document && /^image\/|^application\/pdf$/.test(m.document.mime_type ?? "") ? m.document : undefined;
  if (photo) {
    // 同じ写真（送り直し・転送）は一度だけ読む
    const { firstTime } = await import("./store");
    if (photo.file_unique_id && !(await firstTime(`p${who.chatId}_${photo.file_unique_id}`).catch(() => true))) return;
    const { onDmPhoto } = await import("./dmPhoto");
    return onDmPhoto({ userId, chatId: who.chatId, chat: who.chat, member: who.member, lang, fileId: photo.file_id, mediaType: (m.document?.mime_type ?? "image/jpeg") as string, replyTo: m.message_id, caption: m.caption });
  }
  const text = (m.text ?? "").trim();
  if (!text) return;
  // 通知のすぐあとの「詳しく」: 予定が1件ならその予定のことで答え、2件以上なら選んでもらう
  const notice = who.chat.dms?.[userId]?.notice;
  const target = noticeTarget(text, notice);
  if (target === "pick") {
    const items = freshNotice(notice)!.items;
    return sendMessage(userId, NOTICE_PICK[lang], {
      replyTo: m.message_id,
      buttons: items.map((x, k) => [{ text: `${x.date ? `${shortDate(x.date, lang)} ` : ""}${x.shown}`.slice(0, 60), callback_data: `n:${k}` }]),
    });
  }
  return answerDm(userId, who, text, m.message_id, target ?? undefined);
}

/**
 * 1対1の答え・伝言の根拠: 聞いた人と共有している書類のまとめだけ（書類を預かる人には置き場所の全部。朝の通知と同じ線）。
 * 共有していない書類は渡さない（あることも言わない。聞かれたら「書いていない」の返し方になる）
 */
export async function answerDocs(chatId: string, member: RosterMember | undefined): Promise<FamilySummary[]> {
  const { familyDocs } = await import("./store");
  return docsFor(await familyDocs(chatId), member);
}

async function answerDm(
  userId: string,
  who: NonNullable<Awaited<ReturnType<typeof dmUser>>>,
  text: string,
  replyTo: number | undefined,
  about?: DmNotice["items"][number],
) {
  if (!who.member) return;
  const lang = who.lang;
  // 通知の控えは、次のメッセージで使い終わり（「直前の通知」だけに効かせる）
  if (who.chat.dms?.[userId]?.notice) await rememberNotice(who.chatId, who.chat, userId, []);
  const m = { message_id: replyTo };
  const { useClaudeInChat } = await import("./store");
  const use = await useClaudeInChat(who.chatId).catch(() => "over" as const);
  if (use !== "ok") return use === "over-first" ? sendMessage(userId, DM_TEXT.over[lang], { replyTo: m.message_id }) : undefined;
  const { askAssistant } = await import("./assistant");
  const out = await askAssistant({
    message: text,
    asker: who.member,
    lang,
    roster: who.chat.roster ?? [],
    docs: await answerDocs(who.chatId, who.member),
    today: jstToday(),
    about: about ? { label: about.label, date: about.date } : undefined,
  });
  if (!out) return sendMessage(userId, DM_TEXT.preparing[lang], { replyTo: m.message_id });
  if (out.kind === "relay" && out.relayTo) {
    const target = (who.chat.roster ?? []).find((x) => x.id === out.relayTo && x.adult);
    const dm = target ? dmOf(who.chat, target.id) : null;
    if (!target || !dm) return sendMessage(userId, DM_TEXT.relayNotStarted[lang](nameIn(target, lang) || "?"), { replyTo: m.message_id });
    await sendMessage(dm.userId, `${DM_TEXT.relayFrom[dm.lang](nameIn(who.member, dm.lang))}\n${out.relayText}`);
    return sendMessage(userId, `✓ ${out.answer}`, { replyTo: m.message_id });
  }
  return sendMessage(userId, out.answer, { replyTo: m.message_id });
}
