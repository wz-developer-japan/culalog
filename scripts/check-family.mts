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
  const heater = docs.find((d) => /給湯器の延長保証書/.test(d.title));
  const aircon = docs.find((d) => /エアコンの保証書/.test(d.title));
  check(Boolean(heater && aircon) && !docs.some((d) => /家賃保証|電気需給/.test(d.title)), "見本: 家電の保証書（エアコン・給湯器）だけ共有（家賃保証・電気の契約は共有しない）");
  check(Boolean(heater?.events.some((e) => e.date === "2035-01-16") && heater?.contacts.some((c) => c.phone === "000-0000-0056") && heater?.storageLocation) && !JSON.stringify(heater).includes("0000000456") && !heater!.fields.some((f) => /製造番号|登録番号/.test(f.label)), "見本: 給湯器の保証の終わり・修理の連絡先・しまい場所は置き、製造番号・登録番号は置かない");
  check(Boolean(aircon?.fields.some((f) => f.label === "お買い上げ日" && /空欄/.test(f.value))), "見本: エアコンのお買い上げ日は空欄のまま（決めつけない）");
  const garbage = docs.find((d) => /家庭ごみ 収集日程表/.test(d.title));
  check(Boolean(garbage?.fields.some((f) => /ペットボトル/.test(f.label) && /第2・第4 水/.test(f.value))), "見本: ごみの収集日程表（缶・ビン・ペットボトル＝第2・第4 水）が共有のまとめにある");
  // 動画の「ベトナム語で聞けば、書類から答える」の例（住まい・習い事・保険）。答えの根拠がまとめに載っているか
  const fire = docs.find((d) => /消防設備点検/.test(d.title));
  check(Boolean(fire?.events.some((e) => e.date === "2026-11-18" && e.time === "13:30〜16:30") && fire?.events.some((e) => e.date === "2026-11-13") && fire?.contacts.some((c) => c.phone === "000-0000-0110") && fire?.fields.some((f) => /予備/.test(f.label) && /11月19日/.test(f.value))), "見本: マンションの消防設備点検（11/18 13:30〜16:30・不在は 11/13 までに管理会社へ・予備の日）が共有のまとめにある");
  const swim = docs.find((d) => /スイミング/.test(d.title));
  check(Boolean(swim?.events.some((e) => e.date === "2026-11-16" && /休館/.test(e.label)) && swim?.events.some((e) => e.date === "2026-11-17" && e.endDate === "2026-12-12") && swim?.fields.some((f) => /前日の午後7時/.test(f.value)) && swim?.contacts.some((c) => c.phone === "000-0000-0103")), "見本: スイミングの休館（11/16）と振替（11/17〜12/12・前日19時まで）・受付の電話が共有のまとめにある");
  const kodomo = docs.find((d) => /こども総合保険/.test(d.title));
  check(Boolean(kodomo?.fields.some((f) => /控除証明書の場所/.test(f.label)) && kodomo?.storageLocation === "本棚の保険のファイル"), "見本: こども保険の控除証明書の場所と、原本のしまい場所が共有のまとめにある");
  check(!docs.some((d) => /家賃保証|電気需給|インターネット/.test(d.title)), "見本: 点検の掲示を共有にしても、住まいの契約は共有しない");
  const { calendarTable } = await import("@/lib/server/assistant");
  const cal = calendarTable("2026-11-04");
  check(cal.length === 31 && cal[0] === "2026-11-04（水・第1水曜）" && cal.includes("2026-11-11（水・第2水曜）") && cal.includes("2026-11-25（水・第4水曜）") && cal[30] === "2026-12-04（金・第1金曜）", "1対1: 31日分の日付・曜日・第何○曜日の表（11/11 が第2水曜）");
  // ベトナム語の日付は日/月（コードで作る日付と、Claude への指示文の両方）
  {
    const { VI_DATE_RULE } = await import("@/lib/languages");
    const { ASSISTANT_SYSTEM } = await import("@/lib/server/assistant");
    const { TRANSLATE_SYSTEM_PROMPT, formatDateIn } = await import("@/lib/translate");
    const { shortDate } = await import("@/lib/server/morning");
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(f, "utf8");
    check(VI_DATE_RULE.includes("9/11") && VI_DATE_RULE.includes("27/11") && ASSISTANT_SYSTEM.includes(VI_DATE_RULE) && TRANSLATE_SYSTEM_PROMPT.includes(VI_DATE_RULE) && !ASSISTANT_SYSTEM.includes("11/27 (thứ"), "日付: 1対1の答え・書類の訳の指示文に「ベトナム語は日/月」（例つき）");
    check(src("src/lib/server/dmPhoto.ts").includes("${VI_DATE_RULE}") && (src("src/lib/server/interpret.ts").match(/\$\{VI_DATE_RULE\}/g) ?? []).length >= 3, "日付: 写真の要約・グループの通訳と返信の答え・朝の通知の訳の指示文にも同じきまり");
    check(shortDate("2026-11-09", "vi") === "9/11 (thứ Hai)" && shortDate("2026-11-09", "ja") === "11/9（月）" && formatDateIn("2026-11-27", "vi").includes("27/11") && formatDateIn("2026-11-27", "ja") === "11月27日（金）", "日付: コードで作る日付はベトナム語が日/月・日本語は月/日");
    const today = new Date(2026, 10, 4);
    check(formatDateIn("2026-11-27", "vi", today) === shortDate("2026-11-27", "vi") && formatDateIn("2026-11-27", "vi", today) === "27/11 (thứ Sáu)" && formatDateIn("2035-01-16", "vi", today) === "16/1/2035 (thứ Ba)", "日付: お知らせのベトナム語の日付も朝の通知と同じ形（27/11 (thứ Sáu)）・半年より先だけ年を入れる");
  }
  // ベトナム語の執事の呼び方は tôi／bạn（よしふみの決め 11/05）
  {
    const { VI_VOICE_RULE } = await import("@/lib/languages");
    const { ASSISTANT_SYSTEM } = await import("@/lib/server/assistant");
    const { readFileSync } = await import("node:fs");
    const src = (f: string) => readFileSync(f, "utf8");
    check(/tôi/.test(VI_VOICE_RULE) && /bạn/.test(VI_VOICE_RULE) && ASSISTANT_SYSTEM.includes(VI_VOICE_RULE) && src("src/lib/server/dmPhoto.ts").includes("${VI_VOICE_RULE}") && src("src/lib/server/interpret.ts").includes("${VI_VOICE_RULE}"), "呼び方: 1対1の答え・写真の要約・お知らせへの返信の指示文に「自分は tôi・相手は bạn」");
    check(/頼み返さない/.test(ASSISTANT_SYSTEM) && !/Dạ, em/.test(ASSISTANT_SYSTEM), "呼び方: あいさつには執事として受けるだけ（頼み返さない）");
    // コードの決まった文（ベトナム語の行）に em・anh・chị・mình・con で自分や相手を呼ぶ言い方が無い
    const viLines = ["src/lib/server/dm.ts", "src/lib/server/morning.ts", "src/lib/tell.ts", "src/lib/tellBuild.ts", "src/app/api/telegram/route.ts", "src/lib/server/dmPhoto.ts"]
      .flatMap((f) => src(f).split("\n").filter((l) => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(l) && !/Hôm nay cũng nhờ anh/.test(l) && !/\.replace\(|DETAIL_WORD =/.test(l)));
    const slip = viLines.filter((l) => /(^|[^\p{L}])(em|anh|chị|mình|con)([^\p{L}]|$)/iu.test(l.replace(/tiếng Anh|con số/g, "")));
    check(viLines.length > 10 && slip.length === 0, `呼び方: コードの決まったベトナム語の文に em/anh/chị/mình で呼ぶ言い方が無い${slip.length ? `（${slip[0].trim().slice(0, 60)}）` : ""}`);
  }
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

  await msg(group, 444, "/lang easy");
  check(textOf(sent[sent.length - 1]).includes("✓") && !textOf(sent[sent.length - 1]).includes("/start") && textOf(sent[sent.length - 1]).includes("つうやく"), "グループ: /lang easy（子ども）の返事には /start の案内を出さない");

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
  await msg(dm(444), 444, "/start");
  const kid = since(i);
  check(kid.length === 1 && textOf(kid[0]).includes("おとなに とどくよ") && !/Tiếng|Người|その人は/.test(textOf(kid[0])) && !kid[0].body.reply_markup, "1対1: やさしい日本語の人（子ども）の /start には、やさしい日本語だけ（大人のボタンは出さない）");
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
  check(Boolean(toWife) && textOf(toWife!).startsWith("📄 CULALOG｜Thông báo cho gia đình") && !/家族へのお知らせ|端末の中|— 原本/.test(textOf(toWife!)) && textOf(toWife!).includes("— Bản gốc (tiếng Nhật; giấy tờ nằm trong điện thoại của Shōta)"), "伝える: 妻あての見出し・原本の見出しもベトナム語（引用は日本語のまま）");
  check(textOf(toHusband!).startsWith("📄 CULALOG｜家族へのお知らせ") && textOf(toHusband!).includes("— 原本（書類は翔太さんの端末の中）"), "伝える: 夫あての見出しは日本語");
  check(textOf(toHusband!).includes("授業参観 10:45〜11:30 ／ 学級懇談会 11:40〜12:10") && !textOf(toHusband!).includes("10:45〜12:10") && textOf(toWife!).includes("Dự giờ 10:45–11:30 ／ Họp phụ huynh lớp 11:40–12:10"), "伝える: 授業参観と学級懇談会の時刻を分ける（夫・妻）");
  check(textOf(toWife!).includes("27/11") && !/11\/27/.test(textOf(toWife!).split("— Bản gốc")[0]), "伝える: 妻あての日付は日/月（27/11）");
  check(!to(out, chatId).length, "伝える: 家族のグループには流さない");
  const kb = (x: (typeof sent)[number] | undefined) => ((x?.body.reply_markup as { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] }) ?? { inline_keyboard: [] }).inline_keyboard.flat();
  const wifeCal = kb(toWife).find((b) => b.url);
  const husbandCal = kb(toHusband).find((b) => b.url);
  check(Boolean(wifeCal?.url?.includes("/api/ics?t=")) && wifeCal?.text === "📅 Thêm vào lịch", "カレンダー: 妻（iPhone）には .ics のリンクのボタン（ベトナム語）");
  check(Boolean(husbandCal?.url?.startsWith("https://calendar.google.com/")) && husbandCal?.text === "📅 カレンダーに追加", "カレンダー: 夫（Google）には Google カレンダーのリンク");
  const icsRes = await icsRoute.GET(new NextRequest(wifeCal!.url!.replace(/^https?:\/\/[^/]+/, "http://localhost")));
  const ics = await icsRes.text();
  check(icsRes.status === 200 && (icsRes.headers.get("content-type") ?? "").startsWith("text/calendar") && ics.includes("BEGIN:VEVENT") && /SUMMARY:Dự giờ/.test(ics), "カレンダー: リンクを開くと text/calendar（予定の題はベトナム語）");
  check((ics.match(/BEGIN:VEVENT/g) ?? []).length === 2 && /SUMMARY:Dự giờ\r\n/.test(ics) && /SUMMARY:Họp phụ huynh lớp/.test(ics) && /T104500[\s\S]*T113000[\s\S]*T114000[\s\S]*T121000/.test(ics), "カレンダー: 授業参観 10:45〜11:30 と 学級懇談会 11:40〜12:10 を別の予定に");
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
  check(to(nt, 111).some((x) => textOf(x).startsWith("🔔")) && to(nt, 222).some((x) => textOf(x).startsWith("🔔")) && !to(nt, chatId).length, "朝の通知: 大人それぞれの1対1へ（グループには送らない）");

  // 朝の通知の中身: その人と共有した書類の7日以内の予定の名前と日付（上から3件＋ほかに○件）。済んだものは出さない
  {
    const { notifyDms } = await import("@/lib/server/dm");
    const { upcomingItems, docsFor } = await import("@/lib/server/morning");
    const chat = (await store.getChat(chatId))!;
    const { docs: all, roster: ros } = familyPayload(h);
    const wife = ros.find((m) => m.id === "m-spouse");
    const forWife = docsFor(all, wife);
    check(forWife.length > 0 && forWife.every((d) => d.sharedWith?.includes("m-spouse")) && docsFor(all, ros.find((m) => m.id === "m-self")).length === all.length, "朝の通知: 妻にはその人と共有した書類だけ（預かる人には置き場所の全部）");
    const items = upcomingItems(all, "2026-11-07");
    check(items.length >= 3 && items.every((x, k) => x.date >= "2026-11-07" && x.date <= "2026-11-13" && (k === 0 || items[k - 1].date <= x.date)), "朝の通知: 今日から7日以内を日付順に");
    const doneAll = all.map((d) => ({ ...d, events: d.events.map((e) => (e.label === items[0].label ? { ...e, done: true } : e)) }));
    check(!upcomingItems(doneAll, "2026-11-07").some((x) => x.label === items[0].label), "朝の通知: 済んだ予定は出さない");
    const many = [...all, { ...all[0], id: "doc-x", sharedWith: ["m-spouse"], events: [1, 2, 3].map((k) => ({ kind: "event", label: `予定${k}（伏せた）`, date: "2026-11-08" })) }];
    const fake = async (lines: string[]) => lines.map((l) => `VI:${l}`);
    i = sent.length;
    await notifyDms(chat, 0, 0, { docs: many, todayYmd: "2026-11-07", translate: fake });
    const m1 = since(i);
    const ja = to(m1, 111).map(textOf)[0] ?? "";
    const vi = to(m1, 222).map(textOf)[0] ?? "";
    check(ja.startsWith("🔔 7日以内の予定") && /・11\/8（日） 予定1/.test(ja) && (ja.match(/^・/gm) ?? []).length === 3 && /ほかに\d+件/.test(ja) && !ja.includes("VI:"), "朝の通知: 夫には日本語で、名前と日付を上から3件＋ほかに○件");
    check(vi.startsWith("🔔 Việc trong 7 ngày tới") && vi.includes("・8/11 (Chủ nhật) VI:予定1") && /Còn \d+ việc khác/.test(vi) && !/日）/.test(vi), "朝の通知: 妻にはベトナム語で（名前は訳す・日付と曜日もベトナム語）");
    i = sent.length;
    await notifyDms(chat, 0, 0, { docs: many, todayYmd: "2026-11-07", translate: async () => null });
    const m2 = since(i);
    check(to(m2, 222).some((x) => /^🔔 Có \d+ việc sắp tới/.test(textOf(x))) && to(m2, 111).some((x) => textOf(x).includes("予定1")), "朝の通知: 訳せなければ、妻には件数だけの文に戻す");
    i = sent.length;
    await notifyDms(chat, 0, 0, { docs: many, todayYmd: "2030-01-01", translate: fake });
    check(since(i).length === 0, "朝の通知: 7日以内に予定が無ければ送らない");

    // 通知のすぐあとの「詳しく」
    const { isDetailAsk, noticeTarget, NOTICE_PICK } = await import("@/lib/server/dm");
    check(["詳しく教えて", "くわしく おしえて", "もっと詳しく！", "Chi tiết", "Cho tôi biết chi tiết nhé", "Nói rõ hơn đi"].every(isDetailAsk) && !["ゴミの日を詳しく", "Ngày đổ rác chi tiết"].some(isDetailAsk), "詳しく: 「詳しく教えて」「Chi tiết」は何のことかを言っていない聞き方・「ゴミの日を詳しく」は違う");
    const one = { at: new Date().toISOString(), items: [{ date: "2026-11-06", label: "遠足（3年生）", shown: "遠足（3年生）" }] };
    const two = { at: new Date().toISOString(), items: [...one.items, { date: "2026-11-07", label: "運動会", shown: "Hội thao" }] };
    const old = { ...one, at: new Date(Date.now() - 25 * 3600 * 1000).toISOString() };
    const t1 = noticeTarget("詳しく教えて", one);
    check(typeof t1 === "object" && t1?.label === "遠足（3年生）" && noticeTarget("詳しく教えて", two) === "pick" && noticeTarget("Hội thao chi tiết", two) !== "pick" && (noticeTarget("Hội thao chi tiết", two) as { label: string })?.label === "運動会" && noticeTarget("詳しく教えて", old) === null && noticeTarget("ペットボトルの日は？", one) === null, "詳しく: 予定が1件ならその予定・2件以上なら選んでもらう・名前を言えばその予定・古い通知（20時間より前）とほかの質問には使わない");
    // 本当の流れ: 朝の通知（3件）→ 妻が「Chi tiết」→ 選ぶボタン（ベトナム語）→ 押すと答えに進む（キーが無いので準備中）
    i = sent.length;
    await notifyDms(chat, 0, 0, { docs: many, todayYmd: "2026-11-07", translate: fake, chatId });
    const saved = (await store.getChat(chatId))!.dms!;
    const wifeId = Object.keys(saved).find((u) => saved[u].memberId === "m-spouse")!;
    check(saved[wifeId].notice?.items.length === 3 && saved[wifeId].notice!.items[0].shown.startsWith("VI:"), "詳しく: 朝の通知で送った予定（上から3件の名前と日付）をその人の1対1の記録に");
    i = sent.length;
    await msg(dm(Number(wifeId)), Number(wifeId), "Chi tiết");
    const pick = to(since(i), wifeId)[0];
    check(textOf(pick) === NOTICE_PICK.vi && kb(pick).length === 3 && kb(pick)[0].callback_data === "n:0" && kb(pick)[0].text.startsWith("8/11"), "詳しく: 2件以上なら、通知の予定をボタンで並べて選んでもらう（その人の言葉・日/月）");
    i = sent.length;
    await hook({ update_id: ++n, callback_query: { id: "cbn", from: { id: Number(wifeId) }, data: "n:0", message: { message_id: 30, chat: dm(Number(wifeId)) } } });
    check(since(i).some((x) => textOf(x).includes("Quản gia đang được chuẩn bị")) && !(await store.getChat(chatId))!.dms![wifeId].notice, "詳しく: 選ぶと答えに進み、通知の控えは使い終わりで消える");
    i = sent.length;
    await msg(dm(Number(wifeId)), Number(wifeId), "Chi tiết");
    check(!to(since(i), wifeId).some((x) => textOf(x) === NOTICE_PICK.vi), "詳しく: 控えが消えたあとの「詳しく」は、ふつうの質問として執事へ");
  }

  // 1対1の質問（キーが無いとき）
  i = sent.length;
  await msg(dm(222), 222, "Ngày dự giờ là khi nào?");
  check(since(i).some((x) => textOf(x).includes("Quản gia đang được chuẩn bị")), "1対1: キーが無いときは、その人の言葉で「準備中」");
  i = sent.length;
  await hook({ update_id: ++n, message: { message_id: ++n, chat: dm(222), from: { id: 222 }, photo: [{ file_id: "f1", width: 10, height: 10 }] } });
  check(since(i).some((x) => textOf(x).includes("Quản gia đang được chuẩn bị")), "1対1の写真: キーが無いときは「準備中」（読まない）");
  // Telegram の送り直し（同じ update_id）と、同じ写真（同じ file_unique_id）は一度だけ
  i = sent.length;
  const again = { update_id: 777001, message: { message_id: 4001, chat: dm(222), from: { id: 222 }, text: "Hôm nay thế nào?" } };
  await hook(again);
  await hook(again);
  check(since(i).length === 1, "二重処理しない: 同じ update_id が2回来ても、答えは1回");
  i = sent.length;
  await hook({ update_id: ++n, message: { message_id: ++n, chat: dm(222), from: { id: 222 }, photo: [{ file_id: "fa", file_unique_id: "U1", width: 10, height: 10 }] } });
  await hook({ update_id: ++n, message: { message_id: ++n, chat: dm(222), from: { id: 222 }, photo: [{ file_id: "fb", file_unique_id: "U1", width: 10, height: 10 }] } });
  check(since(i).length === 1, "二重処理しない: 同じ写真（file_unique_id）は一度だけ読む");
  i = sent.length;
  await hook({ update_id: ++n, message: { message_id: ++n, chat: dm(999), from: { id: 999 }, photo: [{ file_id: "f1", width: 10, height: 10 }] } });
  check(since(i).length === 0, "1対1の写真: 家族の名簿とつながっていない人には何もしない");
}

// ---- 1対1に届いた写真の「預かる？」 ----
{
  const { sanitizeExtraction } = await import("@/lib/familyShare");
  const ex = sanitizeExtraction({ title: "t", transcript: "原本の全文", fields: [{ label: "口座番号", value: "1234567", quote: "q" }, { label: "持ち物", value: "上履き", quote: "上履きを持参" }], contacts: [{ phone: "03-1234-5678" }], deadlines: [{ date: "2026-11-27", quote: "x" }] });
  check(ex.transcript === "" && ex.fields.length === 1 && ex.fields[0].quote === "" && ex.contacts[0].phone === "03-1234-5678" && ex.deadlines[0].date === "2026-11-27", "写真の読み取り: 原本の全文・引用・番号の類を落としてから置く");
  const { store: st } = await import("@/lib/server/store");
  const fam = st()!.collection("chats").doc(chatId);
  await fam.collection("inbox").doc("tg-0123456789ab").set({ id: "tg-0123456789ab", from: "m-spouse", receivedAt: "", extraction: { title: "写真の書類" } });
  await fam.collection("docs").doc("tg-0123456789ab").set({ id: "tg-0123456789ab", title: "写真の書類" });
  const { docs, roster } = familyPayload(h);
  await post(family.POST, "/api/family", { chatId, token, action: "sync", docs, roster });
  check((await store.familyDocs(chatId)).some((d) => d.id === "tg-0123456789ab"), "預かる？: アプリの同期では、1対1に届いた写真のまとめを消さない");
  const list = await (await post(family.POST, "/api/family", { chatId, token, action: "inbox" })).json();
  check(list.items?.length === 1 && list.items[0].from === "m-spouse", "預かる？: アプリが取りに行くと並ぶ");
  await post(family.POST, "/api/family", { chatId, token, action: "inboxDone", ids: ["tg-0123456789ab"] });
  const after = await (await post(family.POST, "/api/family", { chatId, token, action: "inbox" })).json();
  check(after.items?.length === 0 && !(await store.familyDocs(chatId)).some((d) => d.id === "tg-0123456789ab"), "預かる？: 決めたら受け取り箱とまとめから消える");
}

for (const [ok, name] of results) console.log(`${ok ? "ok" : "NG"}  ${name}`);
const ng = results.filter(([ok]) => !ok).length;
console.log(ng ? `NG が ${ng} 件` : `${results.length}項目 ok`);
process.exit(ng ? 1 : 0);
