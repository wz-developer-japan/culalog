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
// 🔴 本物の Claude の文は毎回違う。ここで確かめるのは、コードの照らし合わせが決まりどおり動くことだけ

import { createDemoHousehold } from "@/data/demoHousehold";
import { preconfirmedDocuments } from "@/data/demoPreconfirmed";
import samples from "@/data/photoSamples.json";
import { buildCandidates } from "@/lib/butler";
import { conflictKey, findConflicts, optionText, topConflict, type Conflict } from "@/lib/conflicts";
import { buildConnectInput, verifyConnect } from "@/lib/connect";
import type { DemoSample, Household } from "@/lib/types";

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

for (const [ok, name] of results) console.log(`${ok ? "ok" : "NG"}  ${name}`);
const ng = results.filter(([ok]) => !ok).length;
console.log(ng ? `NG が ${ng} 件` : `${results.length}項目 ok`);
process.exit(ng ? 1 : 0);
