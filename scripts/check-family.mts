// 家族の置き場所と Telegram の1対1の流れを、手元の偽の置き場所・偽の Telegram で確かめる（本物には届かない）。
// 使い方: npx tsx --tsconfig tsconfig.json scripts/check-family.mts

process.env.CULALOG_FAKE_STORE = "1";
process.env.CULALOG_FAKE_TELEGRAM = "1";
process.env.TELEGRAM_BOT_TOKEN = "fake";
process.env.TELEGRAM_WEBHOOK_SECRET = "fake-secret";
delete process.env.ANTHROPIC_API_KEY;

const { NextRequest } = await import("next/server");
const { createDemoHousehold } = await import("@/data/demoHousehold");
const { sanitizeSummary, summaryOf, rosterOf, maskNumberLike } = await import("@/lib/familyShare");
const { familyPayload } = await import("@/lib/familySync");
const store = await import("@/lib/server/store");
const family = await import("@/app/api/family/route");

const results: [boolean, string][] = [];
const check = (ok: boolean, name: string) => results.push([ok, name]);
const post = (handler: (r: InstanceType<typeof NextRequest>) => Promise<Response>, url: string, body: unknown, headers: Record<string, string> = {}) =>
  handler(new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } }));

// ---- 置かない線 ----
{
  const s = sanitizeSummary({
    id: "doc-1",
    title: "テストの書類",
    fields: [
      { label: "口座番号", value: "1234567" },
      { label: "被保険者証の記号", value: "12-345" },
      { label: "持ち物", value: "上履き" },
      { label: "メモ", value: "カード 4980 1234 5678 9012 で払う。電話 03-1234-5678。2026-11-27 10:45" },
    ],
    contacts: [{ name: "学校", phone: "03-1234-5678" }, { name: "誰か", phone: "123456789012" }],
    events: [{ kind: "event", label: "授業参観", date: "2026-11-27", time: "10:45〜11:30" }],
    originalText: "原本の全文",
    originalFile: { dataUrl: "data:image/png;base64,xxx" },
    langs: { vi: { title: "t", what: "w", todo: "d", items: [{ label: "Số tài khoản", text: "x" }, { label: "口座", text: "1" }], checks: [] } },
  })!;
  const json = JSON.stringify(s);
  check(!s.fields.some((f) => /口座|記号/.test(f.label)), "線: 番号の類の項目（口座番号・保険証の記号）は置かない");
  check(s.fields.some((f) => f.label === "持ち物"), "線: ふつうの項目（持ち物）は置く");
  check(!json.includes("4980") && json.includes("（伏せた）"), "線: 値の中のカードの番号の形は伏せる");
  check(json.includes("03-1234-5678") && json.includes("2026-11-27") && json.includes("10:45"), "線: 電話・日付・時刻は残す");
  check(!json.includes("原本の全文") && !json.includes("base64"), "線: 原本の全文・写真は受け取っても置かない");
  check(s.contacts.length === 2 && s.contacts[1].phone === undefined, "線: 問い合わせ先の電話の形でない番号は置かない");
  check(!(s.langs.vi?.items ?? []).some((i) => i.label === "口座"), "線: 訳の項目でも番号の類は置かない");
  check(maskNumberLike("マイナンバー 1234 5678 9012") === "マイナンバー （伏せた）", "線: 12桁の番号は伏せる");
  check(sanitizeSummary({ id: "../x", title: "a" }) === null, "線: 書類の ID の形が違えば受け取らない");
}

// ---- 見本の家族で、共有した書類のまとめ ----
const h = await createDemoHousehold(new Date("2026-11-07T10:00:00+09:00"));
{
  const { docs, roster } = familyPayload(h);
  check(docs.length > 0 && docs.length === h.documents.filter((d) => (d.sharedWith ?? []).length > 0 && !d.supersededBy).length, `見本: 共有した書類だけをまとめにする（${docs.length}件）`);
  const json = JSON.stringify(docs);
  const { importantNumbers } = await import("@/lib/numbers");
  const secrets = importantNumbers(h).map((n) => n.value);
  check(secrets.length > 0 && secrets.every((v) => !json.includes(v)), `見本: 大事な番号（${secrets.length}件）がまとめに入らない`);
  check(roster.some((m) => m.lang === "vi" && m.adult) && roster.some((m) => !m.adult), "見本: 名簿に大人（ベトナム語）と子どもがいる");
  check(!JSON.stringify(roster).includes("photo"), "見本: 名簿には呼び名と言葉だけ");
  void summaryOf;
  void rosterOf;
}

// ---- /api/family ----
const chatId = "-100123";
const token = "tok-123";
{
  const { createHash } = await import("node:crypto");
  await store.updateChat(chatId, { users: {}, tokenHash: createHash("sha256").update(token).digest("hex") });
  const bad = await post(family.POST, "/api/family", { chatId, token: "wrong", action: "sync", docs: [] });
  check(bad.status === 403, "置き場所: 合言葉が違えば断る");
  const { docs, roster } = familyPayload(h);
  const ok = await post(family.POST, "/api/family", { chatId, token, action: "sync", docs, roster });
  const okJson = await ok.json();
  const saved = await store.familyDocs(chatId);
  check(ok.status === 200 && saved.length === docs.length && okJson.count === docs.length, `置き場所: 共有したまとめを置く（${saved.length}件）`);
  const chat = await store.getChat(chatId);
  check((chat?.roster ?? []).length === roster.length, "置き場所: 名簿を置く");
  await post(family.POST, "/api/family", { chatId, token, action: "sync", docs: docs.slice(1), roster });
  check((await store.familyDocs(chatId)).length === docs.length - 1, "置き場所: 共有をやめた書類は消える");
  await post(family.POST, "/api/family", { chatId, token, action: "clear" });
  check((await store.familyDocs(chatId)).length === 0 && ((await store.getChat(chatId))?.roster ?? []).length === 0, "置き場所: 全部消す");
  await post(family.POST, "/api/family", { chatId, token, action: "sync", docs, roster });
}

// ---- Telegram: グループは通訳だけ・大人それぞれの1対1 ----
{
  const tgRoute = await import("@/app/api/telegram/route");
  const tellRoute = await import("@/app/api/tell/route");
  const notifyRoute = await import("@/app/api/notify/route");
  const icsRoute = await import("@/app/api/ics/route");
  const { fakeTelegramSent } = await import("@/lib/server/telegram");
  const { buildTell } = await import("@/lib/tellBuild");
  const { provisionalTranslation } = await import("@/data/demoTranslations");
  const sent = fakeTelegramSent();
  const hook = (update: unknown) => post(tgRoute.POST, "/api/telegram", update, { "x-telegram-bot-api-secret-token": "fake-secret" });
  let n = 0;
  const msg = (chat: { id: number; type: string }, from: number, text: string) => hook({ update_id: ++n, message: { message_id: n, chat, from: { id: from, first_name: "X" }, text } });
  const group = { id: Number(chatId), type: "supergroup" };
  const dm = (uid: number) => ({ id: uid, type: "private" });
  const since = (i: number) => sent.slice(i);
  const to = (list: typeof sent, id: number | string) => list.filter((x) => String(x.body.chat_id) === String(id));
  const textOf = (x: (typeof sent)[number]) => String(x.body.text ?? "");

  await msg(group, 111, "/lang ja");
  await msg(group, 222, "/lang vi");
  check(textOf(sent[sent.length - 1]).includes("✓ Tiếng Việt") && textOf(sent[sent.length - 1]).includes("/start"), "グループ: /lang の返事に、1対1で /start を送る案内（その人の言葉）");

  let i = sent.length;
  await msg(dm(999), 999, "/start");
  await msg(dm(999), 999, "こんにちは");
  check(since(i).length === 0, "1対1: 家族の名簿とつながっていない人には何もしない");

  i = sent.length;
  await msg(dm(222), 222, "/start");
  const who = since(i)[0];
  const rows = (who?.body.reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] } | undefined)?.inline_keyboard ?? [];
  check(rows.length === 2 && rows.some((r) => r[0].callback_data === "w:m-spouse") && !rows.some((r) => /m-son|m-daughter/.test(r[0].callback_data)), "1対1: /start で「あなたはだれ？」（大人だけのボタン）");
  i = sent.length;
  await hook({ update_id: ++n, callback_query: { id: "cb1", from: { id: 222 }, data: "w:m-spouse", message: { message_id: 5, chat: dm(222) } } });
  check(since(i).some((x) => textOf(x).startsWith("Chào Thảo")), "1対1: 名乗ると、その人の言葉であいさつ");
  await msg(dm(111), 111, "/start");
  await hook({ update_id: ++n, callback_query: { id: "cb2", from: { id: 111 }, data: "w:m-self", message: { message_id: 6, chat: dm(111) } } });
  i = sent.length;
  await msg(dm(333), 333, "/start");
  check(since(i).length === 0, "1対1: グループで言葉を決めていない人（息子など）にも何もしない");

  // 家族に伝える → それぞれの1対1へ、その人の言葉の段だけ
  const doc = h.documents.find((d) => /授業参観・学級懇談会のご案内/.test(d.title))!;
  const vi = provisionalTranslation(doc, "vi")!;
  const payload = buildTell({ ...h, telegram: { chatId, token, linkedAt: "" } }, { ...doc, sharedWith: ["m-spouse"] }, { vi: { ...vi, lang: "vi", basis: [], translatedAt: "", draftSource: "provisional" } }, () => undefined, ["ja", "vi"]);
  i = sent.length;
  const tellRes = await post(tellRoute.POST, "/api/tell", { chatId, token, payload });
  const tellJson = await tellRes.json();
  const out = since(i);
  const toWife = to(out, 222).find((x) => x.method === "sendMessage");
  const toHusband = to(out, 111).find((x) => x.method === "sendMessage");
  check(tellRes.status === 200 && tellJson.sent?.length === 2 && !tellJson.notStarted?.length, "伝える: あなたと共有した大人の2人に送れた");
  check(Boolean(toWife) && textOf(toWife!).includes("【Tiếng Việt】") && !textOf(toWife!).includes("【日本語】"), "伝える: 妻にはベトナム語の段だけ");
  check(Boolean(toHusband) && textOf(toHusband!).includes("【日本語】") && !textOf(toHusband!).includes("Tiếng Việt】"), "伝える: 夫には日本語の段だけ");
  check(!to(out, chatId).length, "伝える: 家族のグループには流さない");
  const kb = (x: (typeof sent)[number] | undefined) => ((x?.body.reply_markup as { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] }) ?? { inline_keyboard: [] }).inline_keyboard.flat();
  const wifeCal = kb(toWife).find((b) => b.url);
  const husbandCal = kb(toHusband).find((b) => b.url);
  check(Boolean(wifeCal?.url?.includes("/api/ics?t=")) && wifeCal?.text === "📅 Thêm vào lịch", "カレンダー: 妻（iPhone）には .ics のリンクのボタン（ベトナム語）");
  check(Boolean(husbandCal?.url?.startsWith("https://calendar.google.com/")) && husbandCal?.text === "📅 カレンダーに追加", "カレンダー: 夫（Google）には Google カレンダーのリンク");
  const icsRes = await icsRoute.GET(new NextRequest(wifeCal!.url!.replace(/^https?:\/\/[^/]+/, "http://localhost")));
  const ics = await icsRes.text();
  check(icsRes.status === 200 && (icsRes.headers.get("content-type") ?? "").startsWith("text/calendar") && ics.includes("BEGIN:VEVENT") && /SUMMARY:Dự giờ/.test(ics), "カレンダー: リンクを開くと text/calendar（予定の題はベトナム語）");
  const bad = await icsRoute.GET(new NextRequest("http://localhost/api/ics?t=aaaaaaaaaaaaaaaaaaaaaaaa"));
  check(bad.status === 404, "カレンダー: 合言葉が違えば開けない");

  // 担当: 妻の1対1で「Thảo sẽ lo」→ 二人の1対1に、それぞれの言葉で
  const take = kb(toWife).find((b) => b.callback_data?.startsWith("k:") && b.text.includes("Thảo"));
  i = sent.length;
  await hook({ update_id: ++n, callback_query: { id: "cb3", from: { id: 222 }, data: take?.callback_data, message: { message_id: 9, chat: dm(222) } } });
  const tk = since(i);
  check(to(tk, 111).some((x) => textOf(x).includes("タオさんが担当します")) && to(tk, 222).some((x) => textOf(x).includes("Thảo sẽ phụ trách")), "担当: 二人の1対1に、それぞれの言葉で「タオさんが担当」");
  check(to(tk, 222).some((x) => x.method === "editMessageReplyMarkup" && kb(x).some((b) => b.url?.includes("/api/ics"))), "担当: 決まったあとも、その人のカレンダーのボタンは残る");

  // 朝の通知 → 1対1へ（グループには送らない）
  i = sent.length;
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  await post(notifyRoute.POST, "/api/notify", { chatId, token, upcoming: { [today]: 2 }, sendNow: true });
  const nt = since(i);
  check(to(nt, 111).some((x) => textOf(x).includes("近い予定が2件")) && to(nt, 222).some((x) => textOf(x).includes("Có 2 việc")) && !to(nt, chatId).length, "朝の通知: 大人それぞれの1対1へ、その人の言葉だけ");

  // 1対1の質問（キーが無いとき）
  i = sent.length;
  await msg(dm(222), 222, "Ngày dự giờ là khi nào?");
  check(since(i).some((x) => textOf(x).includes("Quản gia đang được chuẩn bị")), "1対1: キーが無いときは、その人の言葉で「準備中」");
}

for (const [ok, name] of results) console.log(`${ok ? "ok" : "NG"}  ${name}`);
const ng = results.filter(([ok]) => !ok).length;
console.log(ng ? `NG が ${ng} 件` : `${results.length}項目 ok`);
process.exit(ng ? 1 : 0);
