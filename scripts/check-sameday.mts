// 同じ日の気づきの照らし合わせの試験（キー無し・通信なし）。Claude の答えをまねした文を渡し、外すべきものが全部外れるかを確かめる。
//
// 使い方（リポジトリの直下で）:
//   npx tsx --tsconfig tsconfig.json scripts/check-sameday.mts
//
// 確かめること:
//   - 見本の家族（時計 11/7）で、授業参観 11/27 のぶつかりに対する「よい文」は通り、次のどれかがある文は外れる:
//     有給・有休・年休・欠勤・休暇を取／勤務の書類の期限が無い・違う日付／ほかの日付／月の無い「20日」／子ども・仕事の大人の名前が欠ける／
//     仕事でない大人の名前／「家族」「決め」が無い／誰が行くかを決める言い方／判断の言い方／長すぎる／知らない候補の id／同じ候補の2つめ
//   - 原本の場所が書類に無いものは、コードの原本の場所に置き換わる
//   - 候補日から選ぶ行事（個別懇談会の候補日①〜④）は1件にまとまり、Claude には渡さず、Claude の文が来ても使わない
//   - トップの1件は、町内会の当番が先の日にあっても子どもの行事
//   - 子どもが読む段（その言葉で読むのが子どもだけ）には、行事と持ち物だけ（同じ日の勤務・提出の締切・やることは入れない）
// 🔴 本物の Claude の文は毎回違う。ここで確かめるのは、コードの照らし合わせが決まりどおり動くことだけ

import { createDemoHousehold } from "@/data/demoHousehold";
import { preconfirmedDocuments } from "@/data/demoPreconfirmed";
import samples from "@/data/photoSamples.json";
import { buildCandidates } from "@/lib/butler";
import { conflictKey, findConflicts, optionText, topConflict, type Conflict } from "@/lib/conflicts";
import { buildConnectInput, verifyConnect } from "@/lib/connect";
import type { DemoSample, Household } from "@/lib/types";
import { provisionalLabel, provisionalTranslation } from "@/data/demoTranslations";
import { buildTell, childOnlyLanguage } from "@/lib/tellBuild";
import { claudeUseNext } from "@/lib/server/store";
import { afterTake, tellKeyboard, takerData, takerLang, takerNames } from "@/lib/tell";

const today = new Date(2026, 10, 7, 10);
const results: [boolean, string][] = [];
const check = (ok: boolean, name: string) => results.push([ok, name]);

/** Claude の答えをまねして、照らし合わせに通ったものだけ返す */
function verified(household: Household, notes: { conflictId: string; text: string; evidence?: { documentId: string; location: string }[] }[]) {
  const raw = { briefing: [], insights: [], sameDay: notes.map((n) => ({ evidence: [], ...n })) };
  const r = verifyConnect(raw, household, buildCandidates(household, today), { source: "claude", createdOn: "2026-11-07", basis: "" });
  return r?.sameDay ?? [];
}

const h = await createDemoHousehold(today);
const sankan = findConflicts(h, today).find((c) => /授業参観/.test(c.child.deadline.label)) as Conflict;
check(Boolean(sankan) && sankan.adults.length === 2, "見本の家族で、授業参観 11/27 のぶつかり（タオさん・翔太さんとも仕事）が見つかる");
const key = conflictKey(sankan);
const good =
  "11月27日（金）は、蓮さんの授業参観の日です。この日は、タオさんも翔太さんもお仕事のようです。どちらが行くか（行かないか）は、家族で決めてください。翔太さんのシフト表では、休みの希望は11月20日（金）までです。";
const passes = (text: string) => verified(h, [{ conflictId: key, text }]).length === 1;

check(passes(good), "よい文は通る");
const bad: [string, string][] = [
  ["「有給」がある", good.replace("どちらが行くか", "有給を取るなら、どちらが行くか")],
  ["「有休」がある", good.replace("休みの希望は", "有休の申請は")],
  ["「年休」がある", good.replace("休みの希望は", "年休の申請は")],
  ["「欠勤」がある", good.replace("どちらが行くか", "欠勤にするか、どちらが行くか")],
  ["「休暇を取」がある", good.replace("どちらが行くか", "休暇を取るか、どちらが行くか")],
  ["勤務の書類の期限が無い", good.replace("翔太さんのシフト表では、休みの希望は11月20日（金）までです。", "")],
  ["期限の日付が違う", good.replace("11月20日（金）", "11月19日（木）")],
  ["ほかの日付がある", good.replace("お仕事のようです。", "お仕事のようです。11月26日（木）も同じです。")],
  ["月の無い「20日」", good.replace("11月20日（金）", "20日（金）")],
  ["仕事の大人の名前が欠ける（タオ）", good.replace("タオさんも翔太さんも", "翔太さんは")],
  ["仕事の大人の名前が欠ける（翔太）", good.replace("タオさんも翔太さんも", "タオさんは").replace("翔太さんのシフト表では", "シフト表では")],
  ["子どもの名前が欠ける", good.replace("蓮さんの授業参観", "授業参観")],
  ["「家族」「決め」が無い", good.replace("家族で決めてください", "ご相談ください")],
  ["誰が行くかを決める", good.replace("どちらが行くか（行かないか）は、家族で決めてください。", "タオさんが行くとよいでしょう。家族で決めてください。")],
  ["休みを勧める", good.replace("どちらが行くか", "休みを取ってください。どちらが行くか")],
  ["判断の言い方", good + "保険が使えるかもしれません。"],
  ["長すぎる（220字より長い）", good + "念のため、学校からのお知らせもよく読んで、持ち物や時間を確かめておくと安心です。".repeat(4)],
];
for (const [name, text] of bad) check(!passes(text), `外す: ${name}`);
check(verified(h, [{ conflictId: "sameday|dl-unknown", text: good }]).length === 0, "外す: 知らない候補の id");
check(verified(h, [{ conflictId: key, text: good }, { conflictId: key, text: good }]).length === 1, "外す: 同じ候補の2つめ");

// 原本の場所: 書類に無い場所はコードの場所に置き換わる
const [withFake] = verified(h, [{ conflictId: key, text: good, evidence: [{ documentId: sankan.child.doc.id, location: "3ページ目のうら（ありもしない所）" }] }]);
check(
  Boolean(withFake) && withFake.evidence.find((e) => e.documentId === sankan.child.doc.id)?.location === (sankan.child.deadline.source?.location ?? ""),
  "原本の場所が書類に無いものは、コードの原本の場所に置き換わる",
);
check(Boolean(withFake) && withFake.evidence.length === 3, "原本は、行事と勤務の書類の3つ（言われなかった書類はコードで足す）");

// 仕事でない大人の名前: タオさんだけが仕事の日（12月の町内会の当番。翔太さんの12月の勤務は書類に無い）
const h2 = await createDemoHousehold(today);
const community = h2.documents.find((d) => d.category === "community" && /町内会/.test(d.title))!;
community.deadlines.push({ id: "x-duty-dec", kind: "event", label: "集会所の清掃当番（4班）", date: "2026-12-03", time: "10:00〜11:00", leadDays: 7, memberIds: [], source: { location: "■ 集会所の清掃当番" } });
const duty = findConflicts(h2, today).find((c) => c.child.deadline.id === "x-duty-dec");
check(Boolean(duty) && duty!.community && duty!.adults.length === 1, "平日・時間つきの町内会の当番も同じ日の気づきになる（12/3 はタオさんだけ仕事）");
if (duty) {
  const k = conflictKey(duty);
  const ok = "12月3日（木）は、町内会の集会所の清掃当番の日です。この日は、タオさんはお仕事のようです。誰が出るか（出ないか）は、家族で決めてください。";
  check(verified(h2, [{ conflictId: k, text: ok }]).length === 1, "町内会の当番のよい文は通る");
  check(verified(h2, [{ conflictId: k, text: ok.replace("タオさんは", "タオさんも翔太さんも") }]).length === 0, "外す: 仕事でない大人（翔太さん）の名前");
}

// 候補日から選ぶ行事（個別懇談会の候補日①〜④）
const h3 = await createDemoHousehold(today);
h3.documents.push(...preconfirmedDocuments(samples as unknown as DemoSample[], h3.members, today, new Set(["photo-k5-kondankai"])).documents);
const all3 = findConflicts(h3, today);
const options = all3.filter((c) => c.options);
check(options.length === 1 && options[0].options!.length === 4, "個別懇談会の候補日①〜④は1件にまとまる（候補日は4日）");
check(!all3.some((c) => !c.options && /候補/.test(c.child.deadline.label)), "候補日ごとのカードは出ない");
if (options[0]) {
  const t = optionText(options[0], h3);
  const text = [t.head, ...t.rest].join("");
  check(text.includes("12月1日（火）〜12月4日（金）の4日"), "候補日の期間と日数を書く");
  check(text.includes("12月1日（火）・12月3日（木）・12月4日（金）は、タオさんがお仕事のようです"), "候補日のうち、タオさんがお仕事の日を書く");
  check(text.includes("12月2日（水）は、タオさんの勤務カレンダーでは休日（創立記念日）です"), "勤務カレンダーで休日の候補日を書く");
  check(text.includes("翔太さんの12月の勤務は、預かっている書類にはまだありません"), "勤務の書類が無い月は「まだありません」と書く（休みとは言わない）");
  check(text.includes("希望用紙の提出は11月13日（金）まで") && text.includes("家族で決めて"), "希望の提出の締切と「家族で決める」を書く");
  check(!/有給|有休|年休|欠勤/.test(text), "候補日の文にも「有給」などは無い");
  const input = buildConnectInput(h3, buildCandidates(h3, today), "2026-11-07", "");
  check(input.sameDay.length === all3.length - 1 && !input.sameDay.some((x) => x.id.startsWith("options")), "候補日の行事は Claude に渡さない");
  check(verified(h3, [{ conflictId: conflictKey(options[0]), text: good }]).length === 0, "候補日の行事に Claude の文が来ても使わない");
  // 希望用紙を出した（済んだ）ら出さない
  const reply = options[0].reply!;
  check(!findConflicts({ ...h3, done: { ...(h3.done ?? {}), [reply.id]: "2026-11-10" } }, today).some((c) => c.options), "希望用紙の提出を済んだにすると、候補日のカードは出ない");
}

// トップの1件: 町内会の当番が先の日（11/18）にあっても、子どもの行事を先に
const h4 = await createDemoHousehold(today);
h4.documents.find((d) => d.category === "community" && /町内会/.test(d.title))!.deadlines.push({ id: "x-duty-nov", kind: "event", label: "集会所の清掃当番（4班）", date: "2026-11-18", time: "10:00〜11:00", leadDays: 7, memberIds: [], source: { location: "■ 集会所の清掃当番" } });
const list4 = findConflicts(h4, today);
check(list4.length === 2 && list4[0].community, "町内会の当番 11/18 と授業参観 11/27 の2件（日付順）");
check(/授業参観/.test(topConflict(list4)?.child.deadline.label ?? ""), "トップの1件は授業参観");
check(!list4.find((c) => c.community)!.adults.some((a) => a.notice), "11/18 には「27（金）の分」の申し出の期限を添えない");

// 子どもが読む段（その言葉で読むのが子どもだけ）: 行事と持ち物だけ。同じ日の勤務・提出の締切・やることは入れない
{
  const h5 = await createDemoHousehold(today);
  h5.members = h5.members.map((m) => (m.id === "m-son" ? { ...m, language: "ja-easy" as const } : m));
  const doc = h5.documents.find((d) => /授業参観.*ご案内/.test(d.title))!;
  const vi = provisionalTranslation(doc, "vi")!;
  const base = { basis: [], translatedAt: "", draftSource: "provisional" as const };
  // やさしい日本語の訳は仮の訳が無いので、ベトナム語の仮の訳の形を借りる（中身の言葉は試験に関係ない）
  const payload = buildTell(h5, doc, { vi: { ...vi, ...base, lang: "vi" }, "ja-easy": { ...vi, ...base, lang: "ja-easy" } }, () => undefined, ["ja", "vi", "ja-easy"]);
  const easy = payload.blocks.find((b) => b.lang === "ja-easy")!;
  const viBlock = payload.blocks.find((b) => b.lang === "vi")!;
  check(childOnlyLanguage(h5, "ja-easy") && !childOnlyLanguage(h5, "vi"), "やさしい日本語で読むのが蓮さんだけなら、その段は子どもが読む段");
  check(!easy.lines.some((l) => l.startsWith("⚠")) && viBlock.lines.some((l) => l.startsWith("⚠")), "子どもが読む段に、同じ日の勤務の行が無い（タオさんの段にはある）");
  check(easy.lines.length >= 1 && /11がつ 27にち/.test(easy.lines[0]), "子どもが読む段にも、行事（日付つき）は入る");
  check(!easy.lines.some((l) => /11がつ 25にち/.test(l)) && viBlock.lines.some((l) => /25\/11/.test(l)), "子どもが読む段に、出欠票の提出の締切が無い（タオさんの段にはある）");
  check(!easy.lines.some((l) => l.startsWith("すること")), "子どもが読む段に、やること（大人の手続き）が無い");
  // やさしい日本語の仮の訳（子どもに関係する書類）で: 項目の見分けは元の名前で。お願い（車で来ない・撮影しない）は大人の段だけ
  const easyT = provisionalTranslation(doc, "ja-easy")!;
  check(Boolean(easyT) && easyT.items.length >= 5, "授業参観の案内に、やさしい日本語の仮の訳がある");
  const p2 = buildTell(h5, doc, { vi: { ...vi, ...base, lang: "vi" }, "ja-easy": { ...easyT, ...base, lang: "ja-easy" } }, () => undefined, ["ja", "vi", "ja-easy"]);
  const easy2 = p2.blocks.find((b) => b.lang === "ja-easy")!;
  const vi2 = p2.blocks.find((b) => b.lang === "vi")!;
  check(/じゅぎょうさんかん/.test(easy2.lines[0] ?? "") && !easy2.lines.some((l) => l.startsWith("おねがい")), "子どもが読む段に、お願い（大人への頼み）の項目が無い（訳した名前でも）");
  check(vi2.lines.some((l) => l.startsWith("Lưu ý")), "お願いの項目は、タオさんの段にはある");
  const letter = h5.documents.find((d) => /3学年だより/.test(d.title))!;
  check(Boolean(provisionalTranslation(letter, "ja-easy")), "3学年だよりにも、やさしい日本語の仮の訳がある");
}

// 勤務カレンダーの「出勤日（土曜）」は、ほかの言葉の段ではコードで言い換える（日本語のまま「」で出さない）
{
  // やさしい日本語を読む大人がいるとき（見本の蓮はやさしい日本語なので、ここでは蓮を日本語に戻し、やさしい日本語の段を子どもだけの段にしない）
  const h6 = await createDemoHousehold(today);
  h6.members = h6.members.map((m) => (m.id === "m-son" ? { ...m, language: undefined } : m));
  const doc = h6.documents.find((d) => /うんどうかいのお知らせ/.test(d.title))!;
  const vi = provisionalTranslation(doc, "vi")!;
  const base = { basis: [], translatedAt: "", draftSource: "provisional" as const };
  const labelIn = (o: Parameters<typeof provisionalTranslation>[0], x: { id: string; label: string }, l: Parameters<typeof provisionalLabel>[1]) =>
    provisionalTranslation(o, l)?.items.find((i) => i.ref === `d:${x.id}`)?.label ?? provisionalLabel(x.label, l);
  const p6 = buildTell(h6, doc, { vi: { ...vi, ...base, lang: "vi" } }, labelIn, ["ja", "vi", "ja-easy"]);
  const warn = (lang: string) => p6.blocks.find((b) => b.lang === lang)!.lines.filter((l) => l.startsWith("⚠")).join(" ");
  check(/Thảo đi làm \(thứ Bảy\)/.test(warn("vi")) && !/「/.test(warn("vi")), "ベトナム語の段: タオさんの土曜の出勤日は「Thảo đi làm (thứ Bảy)」");
  check(/タオ しごと（どようび）/.test(warn("ja-easy")), "やさしい日本語の段: 「タオ しごと（どようび）」");
}

// 段の言葉ごとの「カレンダーに追加」（Google カレンダーの予定を作る画面）と、担当のボタンの印に入れる言葉
{
  const h7 = await createDemoHousehold(today);
  h7.members = h7.members.map((m) => (m.id === "m-son" ? { ...m, language: "ja-easy" as const } : m));
  const doc = h7.documents.find((d) => /授業参観.*ご案内/.test(d.title))!;
  const base = { basis: [], translatedAt: "", draftSource: "provisional" as const };
  const tr = (l: "vi" | "ja-easy") => ({ ...provisionalTranslation(doc, l)!, ...base, lang: l });
  const p7 = buildTell(h7, doc, { vi: tr("vi"), "ja-easy": tr("ja-easy") }, () => undefined, ["ja", "vi", "ja-easy"]);
  const q = (l: "ja" | "vi") => new URL(p7.calendar?.[l] ?? "https://x.invalid/").searchParams;
  // 看板の書類は 11/6 に本物の Claude が読んだ結果（savedReadings.json）なので、予定の名前は読み取りのまま
  check(q("ja").get("text") === "2学期 授業参観・学級懇談会" && q("ja").get("dates") === "20261127T104500/20261127T121000" && q("ja").get("ctz") === "Asia/Tokyo", "カレンダーに追加（日本語）: 授業参観 11/27 10:45〜12:10");
  check(/^Dự giờ/.test(q("vi").get("text") ?? "") && !/[\u3040-\u30ff]/.test(q("vi").get("text") ?? "") && /Bản gốc/.test(q("vi").get("details") ?? ""), "カレンダーに追加（ベトナム語）: 題はベトナム語・メモに原本へ戻る行");
  check(!p7.calendar?.["ja-easy"], "子どもだけが読む言葉（蓮さんのやさしい日本語）には、カレンダーに追加を作らない");
  const yearly = h7.documents.find((d) => /年間行事予定/.test(d.title) && d.confirmedAt && !d.supersededBy)!;
  check(!buildTell(h7, yearly, {}, () => undefined, ["ja"]).calendar, "行事がいくつもある書類（年間行事予定）には、カレンダーに追加を付けない");
  check(Object.values(p7.calendar ?? {}).every((u) => (u ?? "").length <= 1800), "カレンダーのリンクはボタンにできる長さ");
  check(JSON.stringify(p7.takerLangs) === JSON.stringify(["ja", "vi"]), "担当の候補の読みたい言葉（翔太さん ja・タオさん vi）");
  const d1 = takerData({ ja: "タオ", vi: "Thảo", "ja-easy": "タオ" }, "vi");
  const long = takerData({ ja: "ながいながいなまえのひと", vi: "Nguyễn Thị Thanh Hương Long", "ja-easy": "ながいながい なまえの ひと" }, "vi");
  check(takerLang(d1) === "vi" && takerNames(d1).vi === "Thảo" && takerLang("t:翔太|Shōta|しょうた") === undefined, "担当のボタンの印に言葉が入り、前の形の印も読める");
  check(new TextEncoder().encode(long).length <= 64 && takerLang(long) === "vi" && Object.keys(takerNames(long)).length === 3, "長い呼び名でも 64 バイトに収まり、言葉の並びがずれない");
  // Telegram に付けるボタン: 担当の候補ごとに1行＋カレンダーの1行（日本語・ベトナム語。子どもだけのやさしい日本語は無し）
  const kb = tellKeyboard(p7);
  check(kb.takerRows.length === 2 && kb.calendarRow.map((b) => b.text).join(" ") === "📅 カレンダーに追加 📅 Thêm vào lịch", "お知らせのボタン: 担当2行＋「カレンダーに追加」「Thêm vào lịch」");
  // タオさんが担当になったら、タオさんの言葉（ベトナム語）のボタンを返す。カレンダーの行は残す
  const sent = [...kb.takerRows, kb.calendarRow];
  const taoData = kb.takerRows[1][0].callback_data;
  const after = afterTake(sent, taoData);
  check(after.mine?.text === "📅 Thêm vào lịch" && after.mine.url === p7.calendar?.vi && after.calendarRow.length === 2, "タオさんが担当 → ベトナム語の「Thêm vào lịch」を返す（カレンダーの行は残す）");
  check(afterTake(sent, kb.takerRows[0][0].callback_data).mine?.text === "📅 カレンダーに追加", "翔太さんが担当 → 日本語の「カレンダーに追加」");
  check(!afterTake(sent, "t:タオ|Thảo|タオ").mine && !afterTake([[{ text: "📅 Thêm vào lịch", url: "https://example.com/" }]], taoData).mine, "前の形の印・Google カレンダー以外のリンクには返さない");
}

// ---- Telegram で Claude を呼ぶ回数（1グループ・全体の1日の上限） ----
{
  const day = "2026-11-04";
  const a = claudeUseNext(undefined, undefined, day, 3, 10);
  check(a.result === "ok" && a.mine?.count === 1 && a.all?.count === 1, "上限: はじめての1回は通り、グループと全体を1つずつ数える");
  const b = claudeUseNext({ day, count: 3 }, { day, count: 3 }, day, 3, 10);
  check(b.result === "over-first" && b.mine?.overNoticed === true && !b.all, "上限: グループの上限に当たった最初の1回だけ知らせる（全体の数は増やさない）");
  check(claudeUseNext({ day, count: 3, overNoticed: true }, { day, count: 3 }, day, 3, 10).result === "over", "上限: 知らせたあとは黙る");
  check(claudeUseNext({ day, count: 1 }, { day, count: 10 }, day, 3, 10).result === "over-first", "上限: 全体の上限でも止まる");
  const c = claudeUseNext({ day: "2026-11-03", count: 3, overNoticed: true }, { day: "2026-11-03", count: 10 }, day, 3, 10);
  check(c.result === "ok" && c.mine?.count === 1 && c.all?.count === 1, "上限: 日が変わると数え直す");
}

for (const [ok, name] of results) console.log(`${ok ? "ok" : "NG"}  ${name}`);
const ng = results.filter(([ok]) => !ok).length;
console.log(ng ? `NG が ${ng} 件` : `${results.length}項目 ok`);
process.exit(ng ? 1 : 0);
