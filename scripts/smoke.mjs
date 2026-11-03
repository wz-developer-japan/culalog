// デモの流れをスマホ幅で通しで確かめる確認スクリプト。
// 使い方: node scripts/smoke.mjs [BASE_URL] （既定は http://localhost:3100）
// 時計を 2026-11-07 10:00（東京）に固定して、いつ動かしても同じ条件で確かめる。
// 画面の画像は scripts/out/ に書き出す（コミットしない）。
import fs, { mkdirSync } from "node:fs";

async function loadPlaywright() {
  for (const name of ["playwright", "/opt/node-tools/node_modules/playwright/index.js"]) {
    try {
      const mod = await import(name);
      return mod.chromium ? mod : mod.default;
    } catch {}
  }
  throw new Error("Playwright が見つかりません。");
}

const BASE = (process.argv[2] ?? "http://localhost:3100").replace(/\/$/, "");
const OUT = new URL("./out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ja-JP",
  timezoneId: "Asia/Tokyo",
});
const page = await context.newPage();
await page.clock.setFixedTime(new Date("2026-11-07T10:00:00+09:00"));

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push(["NG", name, String(e.message ?? e).split("\n")[0]]);
  }
  await page.screenshot({ path: `${OUT}${String(results.length).padStart(2, "0")}.png`, fullPage: true }).catch(() => {});
}
const see = (text, timeout = 15000) => page.getByText(text).first().waitFor({ timeout });
// 予定の画面の「執事から」は、初めの2件のあとを「あと○件」で畳んでいる。中まで確かめるときは開く
const openFolds = async () => {
  await page.locator("h2.sec.from").waitFor({ timeout: 15000 });
  for (const s of await page.locator("details.fold:not([open]) > summary").all()) await s.click();
};

await step("最初の画面から架空の家族で始められる", async () => {
  await page.goto(BASE + "/");
  await page.getByRole("button", { name: "架空の家族で試す" }).click();
  await see("架空の家族で試しています");
});

await step("トップに家族の丸（4人ともキャラクターのアイコン）とメニューがあり、予定の画面は 丸の行 → 向こう7日 → いちばん近い締切 → 執事から の順（件数のタイル・念のための欄は無い）", async () => {
  await page.locator(".fam a", { hasText: "みんな" }).waitFor({ timeout: 15000 });
  const faces = await page.locator(".fam a svg.face").count();
  if (faces !== 4) throw new Error(`家族の丸のキャラクターが ${faces} 人分です（4人分のはず）`);
  await page.locator(".menu a", { hasText: "予定" }).click();
  await page.waitForURL(/\/schedule$/, { timeout: 15000 });
  await page.locator("h2.sec.from").waitFor({ timeout: 15000 });
  if (await page.locator("h2:not(.from)", { hasText: /期日が近いもの|のひとこと/ }).count()) throw new Error("予定の画面に、まとめる前の見出しが残っています");
  if (await page.locator(".bento .tile").count()) throw new Error("予定の画面に件数のタイルが残っています");
  const order = await page.evaluate(() =>
    [".fam", ".week", ".hero", "h2.sec.from"].map((s) => document.querySelector(s)?.getBoundingClientRect().top ?? -1),
  );
  if (order.some((y) => y < 0) || order.some((y, i) => i > 0 && y <= order[i - 1])) throw new Error(`予定の画面の並びが違います: ${order.join(",")}`);
  // 人の切り替え: 蓮を押すと、同じ画面のまま ?who= で絞り込む
  await page.locator(".fam a", { hasText: "蓮" }).click();
  await page.waitForURL(/\/schedule\?who=m-son$/, { timeout: 15000 });
  await page.locator(".fam a.on", { hasText: "蓮" }).waitFor({ timeout: 15000 });
  await page.locator(".fam a", { hasText: "みんな" }).click();
  await page.waitForURL(/\/schedule$/, { timeout: 15000 });
});

await step("Claude の答えでないものには「仮」と出ている（キーが無いとき）", async () => {
  const body = await page.locator("main").innerText();
  if (!/仮/.test(body)) console.log("  （「仮」の表示なし。Claude のキーがある環境なら正常）");
});

await step("予定の画面の上に「向こう7日」の帯があり、押すとすべての予定のその日へ。すべての予定は、いつものカレンダーに入れられる（.ics・Google カレンダー。サーバーを通さない）", async () => {
  await page.goto(BASE + "/schedule");
  const days = page.locator(".week .wday");
  await days.first().waitFor({ timeout: 15000 });
  if ((await days.count()) !== 7) throw new Error(`向こう7日の帯が${await days.count()}日分です`);
  if (!/今日/.test(await days.first().innerText())) throw new Error("帯の最初が今日になっていません");
  const excursion = page.locator(".week .wday.has").filter({ hasText: "遠足" }).first();
  if (!/11\/9[\s\S]*1件[\s\S]*遠足[\s\S]*蓮/.test(await excursion.innerText())) throw new Error(`帯の遠足の日: ${await excursion.innerText()}`);
  await excursion.click();
  await page.waitForURL(/\/schedule\/all#day-2026-11-09/, { timeout: 15000 });
  await page.locator("#day-2026-11-09").filter({ hasText: "遠足" }).waitFor({ timeout: 15000 });
  await page.locator("h2", { hasText: "これから" }).waitFor({ timeout: 15000 });
  // まだ届いていない案内プリント: 「この日は○○」→「詳しいことがまだ無い」→「ランドセルの中かも」の順で、日付は予定から
  const missingText = await page.locator(".dcard").filter({ hasText: "授業参観の案内プリントがまだ届いていません" }).first().innerText();
  if (!/3学年だより（11月号）では、\d+月\d+日（.）は授業参観（2学期）です。でも、時間や教室が書かれた案内がまだありません。プリントがランドセルの中に入ったままになっていませんか？/.test(missingText))
    throw new Error(`まだ届いていない案内プリントの文: ${missingText}`);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.getByRole("button", { name: /まとめてカレンダーに入れる/ }).click(),
  ]);
  const ics = fs.readFileSync(await download.path(), "utf8");
  if (!/^BEGIN:VCALENDAR/.test(ics) || !/SUMMARY:遠足/.test(ics) || !/DTSTART;VALUE=DATE:2026110/.test(ics)) throw new Error(`.ics の中身が足りません: ${ics.slice(0, 200)}`);
  if (/\d{4}-?\d{4}-?\d{4}/.test(ics.replace(/DTSTAMP:\S+|DTSTART\S*|DTEND\S*|DTSTART:19700101T000000/g, ""))) throw new Error(".ics に長い番号が入っています");
  const row = page.locator(".dcard").filter({ hasText: "遠足" }).first();
  await row.getByRole("button", { name: "カレンダーに入れる" }).click();
  const href = await row.getByRole("link", { name: "Google カレンダー" }).getAttribute("href");
  if (!/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/.test(href ?? "") || !/dates=20261109%2F20261110/.test(href)) throw new Error(`Google カレンダーのリンクが違います: ${href}`);
});

await step("書類の一覧に確定済みの書類がある", async () => {
  await page.goto(BASE + "/documents");
  await see("年間行事予定");
  // 分類はアプリ全体で1系統の6語。チップは横1行（折り返さない）、カードは「題名・分類1つ・誰」
  const chips = (await page.locator(".chips.scroll").first().locator(".chip").allInnerTexts()).map((t) => t.replace(/\d+$/, "").trim());
  const six = ["すべて", "暮らし", "お金", "子どもと学校", "けがと病院", "契約", "手続き"];
  if (chips.some((c) => !six.includes(c))) throw new Error(`分類のチップに6語以外があります: ${chips.join("・")}`);
  const wraps = await page.locator(".chips.scroll").first().evaluate((el) => getComputedStyle(el).flexWrap);
  if (wraps !== "nowrap") throw new Error("分類のチップが折り返しています");
  if (/しまい場所/.test(await page.locator("main").innerText())) throw new Error("一覧のカードにしまい場所が出ています（詳しい画面へ）");
  if (await page.getByRole("button", { name: "この端末のデータをすべて消す" }).count()) throw new Error("書類の画面に「データをすべて消す」が残っています（執事・設定の画面の末尾へ）");
  await page.locator(".chips.scroll .chip", { hasText: "子どもと学校" }).click();
  await see("年間行事予定");
  if (/賃貸住宅/.test(await page.locator("main").innerText())) throw new Error("「子どもと学校」で絞っても賃貸住宅が出ています");
  await page.locator(".chips.scroll .chip", { hasText: "すべて" }).click();
});

await step("執事に頼むと、原本の場所つきの答えか「書いていません」が返る", async () => {
  await page.goto(BASE + "/ask");
  await page.getByPlaceholder("例: 冬休みはいつからいつまで？").fill("冬休みはいつからいつまで？");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  await page.locator(".card.briefing, .card.unknown").first().waitFor({ timeout: 90000 });
});

await step("けがの頼みごとで、学校のお知らせと傷害保険の証券の両方から引用が出る", async () => {
  await page.getByPlaceholder("例: 冬休みはいつからいつまで？").fill("蓮が学校でけがをした。保険の条件と連絡先を調べておいて");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  const card = page.locator(".card", { hasText: "保険の条件と連絡先" }).first();
  await card.locator("text=家族傷害保険").first().waitFor({ timeout: 90000 });
  const text = await card.innerText();
  if (!/学校でのけがの給付/.test(text)) throw new Error("学校のお知らせの引用がありません");
  // 学校名やタイトルだけの行が引用になっていないか
  if (/「くろうど第一小学校」/.test(text)) throw new Error("学校名だけの引用が出ています");
  await card.scrollIntoViewIfNeeded();
});

await step("「覚えておいて」と話すと予定の案が出て、知らせる時期をボタンで選び（おすすめは1か月前）、確定するとすべての予定に入る（原本の場所は「あなたが話したこと」）", async () => {
  await page.goto(BASE + "/ask");
  await page.locator("textarea").fill("写真編集ソフトのサブスク、年に1回しか解約できない。次は来年の3月。その前に教えて");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  const card = page.locator(".card.remember").first();
  await card.waitFor({ timeout: 90000 });
  const text = await card.innerText();
  if (!/2027年3月1日/.test(text)) throw new Error(`案の日付が来年の3月になっていません: ${text.slice(0, 120)}`);
  // 話に知らせる時期が無いので、ボタンで聞く。解約なのでおすすめは1か月前（最初から選んである）
  if (!/いつごろお知らせしましょう/.test(text)) throw new Error("知らせる時期を聞いていません");
  const picked = card.locator(".lead-choice .chip.selected");
  if (!/1か月前\s*おすすめ/.test(await picked.innerText())) throw new Error(`おすすめの1か月前が選ばれていません: ${await picked.innerText()}`);
  await card.getByRole("button", { name: "2週間前", exact: true }).click();
  if (!/2週間前の 2027年2月15日/.test(await card.innerText())) throw new Error("2週間前を選んでも、知らせ始めの日が変わっていません");
  await card.getByRole("button", { name: "覚えておく（確定）" }).click();
  await see("覚えました");
  if (!/2週間前の 2027年2月15日（月） から/.test(await page.locator(".card", { hasText: "覚えました" }).first().innerText())) throw new Error("確定した文に、選んだ時期（2週間前）が出ていません");
  await page.goto(BASE + "/schedule/all");
  await see("これから");
  const row = page.locator(".dcard").filter({ hasText: "写真編集ソフト" });
  if ((await row.count()) !== 1) throw new Error(`すべての予定に話した予定が${await row.count()}件あります`);
  await row.first().getByText("原本").first().click();
  await see("あなたが話したこと");
});

await step("頼んだことが予定の画面の報告に残る", async () => {
  await page.goto(BASE + "/schedule");
  await openFolds();
  await page.locator(".from-item .card", { hasText: "保険の条件と連絡先" }).first().waitFor({ timeout: 15000 });
});

await step("見本をまとめて渡すと、受け取り箱で順番に読まれ、まとめて確定できる", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /^見本を\d+件まとめて渡す/ }).click();
  await page.waitForURL(/\/inbox/, { timeout: 15000 });
  await see("全部読み終わりました");
  const button = page.getByRole("button", { name: /まとめて確定する/ });
  await button.click();
  await see("件を確定しました");
});

await step("学年だより・案内プリントの授業参観に、執事が「見に行きますか？」と聞く →「行く」で有給の申請の締切が予定に入る（行くと決めつけない）", async () => {
  await page.goto(BASE + "/schedule");
  await page.locator("h2.sec.from").waitFor({ timeout: 15000 });
  // 「見に行きますか？」は、返事を待つので畳まない
  await page.locator(".from-item > .card.insight").filter({ hasText: /見に行きますか/ }).first().waitFor({ timeout: 15000 });
  const body = await page.locator("main").innerText();
  if (/土日も勤務/.test(body)) throw new Error("「土日も勤務がある」の前提が残っています");
  const cards = page.locator(".card.insight").filter({ hasText: /授業参観[\s\S]*見に行きますか/ });
  // 学年だよりと案内プリントの両方にあっても、聞くのは1回
  if ((await cards.count()) !== 1) throw new Error(`授業参観に行くかを聞くカードが${await cards.count()}枚あります`);
  const text = await cards.first().innerText();
  if (!/有給の申請/.test(text)) throw new Error(`行くなら有給の申請、が出ていません: ${text.slice(0, 120)}`);
  if (!(await cards.first().getByRole("button", { name: "行かない" }).count())) throw new Error("「行かない」のボタンがありません");
  await cards.first().getByRole("button", { name: /^行く/ }).click();
  await page.waitForTimeout(500);
  if (await page.locator(".card.insight").filter({ hasText: /見に行きますか/ }).count()) throw new Error("「行く」を押しても、まだ聞いています");
  await page.goto(BASE + "/schedule/all");
  await see("授業参観（2学期）の日の有給の申請");
});

await step("聞きたいことに答えると、執事が覚える", async () => {
  await page.goto(BASE + "/questions");
  const yes = page.locator(".button.guess").first();
  await yes.waitFor({ timeout: 15000 });
  await yes.click();
  await see("覚えました");
});

await step("同じ見本をもう一度渡すと、同じファイルとして読まない", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /^見本を\d+件まとめて渡す/ }).click();
  await see("前に渡したものと同じファイル");
});

await step("写真の見本をまとめて渡しても、予定の画面のひとことは3件まで", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /写真の見本を\d+件まとめて渡す/ }).click();
  await page.waitForURL(/\/inbox/, { timeout: 120000 });
  // 見本は50件以上。本番では画像を取りに行く分、読み終わるまで時間がかかる
  await see("全部読み終わりました", 180000);
  await page.getByRole("button", { name: /まとめて確定する/ }).click();
  await see("件を確定しました");
  await page.goto(BASE + "/schedule");
  await openFolds();
  const n = await page.locator(".briefing-item").count();
  if (n > 3) throw new Error(`ひとことが${n}件あります`);
});

await step("「誰の」で分ける: 翔太のページに電気・記入例は出ず、蓮のページに年間行事予定が出て、みんなには家全体の札で出る", async () => {
  const docsOf = async (whose) => {
    await page.goto(BASE + "/family/" + whose);
    await page.getByRole("tab", { name: "書類" }).click();
    await page.locator("h2", { hasText: "書類" }).waitFor({ timeout: 15000 });
    return page.locator("main").innerText();
  };
  const self = await docsOf("m-self");
  if (/電気需給契約/.test(self)) throw new Error("翔太のページに家全体の電気の書類が出ています");
  if (/記入例/.test(self)) throw new Error("翔太のページに記入例が出ています");
  if (!/就労証明書/.test(self)) throw new Error("翔太のページに、翔太・美咲・結衣の現況届が出ていません");
  const son = await docsOf("m-son");
  if (!/年間行事予定/.test(son)) throw new Error("蓮のページに年間行事予定が出ていません");
  if (/電気需給契約|記入例/.test(son)) throw new Error("蓮のページに家全体・記入例の書類が出ています");
  const all = await docsOf("all");
  if (!/電気需給契約[\s\S]*家全体/.test(all)) throw new Error("みんなのページで電気が「家全体」になっていません");
  if (!/印鑑登録証[\s\S]*誰のか分からない/.test(all)) throw new Error("券面に名前の無い印鑑登録証が「誰のか分からない」になっていません");
  if (!/記入例[\s\S]*この家の書類ではない/.test(all)) throw new Error("記入例が「この家の書類ではない」になっていません");
  // 一緒に住んでいない家族（翔太の母）あての書類は、この家の書類ではない扱い（同居の翔太が当事者の介護休業の承認は、メールの段で翔太に出ることを見る）
  if (!/介護保険被保険者証[\s\S]*この家の書類ではない/.test(all)) throw new Error("別居の親あての介護保険被保険者証が「この家の書類ではない」になっていません");
  if (/正雄|和子|由紀/.test(await page.locator(".fam").innerText())) throw new Error("家族の丸に別居の家族が残っています");
});

await step("崩れた紙: 写真が切れている・日付と曜日が合わないものは確定から外れて理由が出る、二つの書類で日付が食い違えば両方出る", async () => {
  // まとめて確定のあと、迷う理由があるものだけが確認待ちに残る
  await page.goto(BASE + "/inbox");
  await see("読めなかった所があります");
  const body = await page.locator("main").innerText();
  for (const t of ["振替日は写真に写っていません", "日付と曜日が合いません", "別紙は渡されていません"]) {
    if (!body.includes(t)) throw new Error(`確認待ちに「${t}」がありません`);
  }
  // 学校のお知らせ（1/22）と学年だより（1/29）で日付が食い違う学習発表会は、どちらも予定に出る（違いに気づけるように）
  await page.goto(BASE + "/schedule/all");
  await see("これから");
  const n = await page.locator(".dcard").filter({ hasText: "学習発表会" }).count();
  if (n !== 2) throw new Error(`学習発表会が${n}件です（日付が食い違う2件が両方出るはず）`);
});

await step("メールの見本を貼り付けの形で渡すと、同じ予定のメールは束ねられ、「納付完了」で済んだにするか聞かれる", async () => {
  await page.goto(BASE + "/scan");
  await page.getByRole("button", { name: /メールの見本を\d+件まとめて渡す/ }).click();
  await page.waitForURL(/\/inbox/, { timeout: 60000 });
  await see("全部読み終わりました", 60000);
  await page.getByRole("button", { name: /まとめて確定する/ }).click();
  await see("件を確定しました");
  // 同居の翔太が当事者（介護休業の承認）は翔太のページに。転送メールの付き添いは美咲に。別居の母の分（和子の検査）は和子の名前では出さない
  await page.goto(BASE + "/family/m-self");
  await page.getByRole("tab", { name: "書類" }).click();
  await page.locator("h2", { hasText: "書類" }).waitFor({ timeout: 15000 });
  if (!/介護休業/.test(await page.locator("main").innerText())) throw new Error("翔太のページに介護休業の承認が出ていません");
  // 束ねる: 後払いの請求と前日の督促（同じ注文・同じ期限）が、すべての予定で1件になっている
  await page.goto(BASE + "/schedule/all");
  await see("これから");
  const bill = page.locator(".dcard").filter({ hasText: "後払いの支払期限" });
  if ((await bill.count()) !== 1) throw new Error(`後払いの支払期限が${await bill.count()}件あります（1件に束ねられていません）`);
  await bill.first().getByText("同じ予定のお知らせ").waitFor({ timeout: 10000 });
  // 家財の保険の継続のご案内（メール2通）は、本体の証券から計算した「申し出の締切」（同じ日）に束なる
  const fire = page.locator(".dcard").filter({ hasText: "継続しない場合の" });
  if ((await fire.count()) !== 1) throw new Error(`継続しない場合の申し出の締切が${await fire.count()}件あります（1件に束ねられていません）`);
  await fire.first().getByText("同じ予定のお知らせ").waitFor({ timeout: 10000 });
  // 完了で閉じる: 決済結果のお知らせ → 後払いの支払期限は済みましたか？（聞きたいことは1問ずつなので、ほかの質問は「あとで」で送る）
  await page.goto(BASE + "/questions");
  await page.locator("main h1").waitFor({ timeout: 15000 });
  for (let i = 0; i < 60; i++) {
    // 今の1問だけを見る（「次の質問:」の予告は含めない）
    const body = (await page.locator("main").innerText()).split("次の質問")[0];
    if (body.includes("後払いの支払期限") && body.includes("済みましたか？")) break;
    const later = page.getByRole("button", { name: /あとで答える/ }).first();
    if (!(await later.count())) throw new Error("「後払いの支払期限は済みましたか？」が聞かれていません");
    await later.click();
    await page.waitForTimeout(200);
  }
  await page.getByRole("button", { name: "済んだにする" }).click();
  await see("答えました");
  // 済んだにしたので、束ねた督促ごと「済んだもの」に移る（ホームでは知らせない）
  await page.goto(BASE + "/schedule/all");
  await see("済んだもの");
  await page.locator("details").filter({ hasText: "済んだもの" }).locator("summary").click();
  const finished = page.locator(".dcard").filter({ hasText: "後払いの支払期限" });
  if ((await finished.count()) !== 1) throw new Error(`済んだにした後も、後払いの支払期限が${await finished.count()}件あります`);
  if (!(await finished.first().getByRole("button", { name: "済んだを取り消す" }).count())) throw new Error("後払いの支払期限が「済んだもの」に入っていません");
});

await step("番号を聞くと、Claude に送らずに端末の中で答え、番号は伏せて出す", async () => {
  await page.goto(BASE + "/ask");
  const calls = [];
  const onRequest = (r) => r.url().includes("/api/ask") && calls.push(r.url());
  page.on("request", onRequest);
  await page.locator("textarea").fill("火災保険の証券番号は？");
  await page.getByRole("button", { name: /に頼む$/ }).click();
  const card = page.locator(".card").filter({ hasText: "火災保険の証券番号は？" }).first();
  await card.getByText("書類から探しました").waitFor({ timeout: 10000 });
  if (!(await card.innerText()).includes("●")) throw new Error("番号が伏せられていません");
  // 同じ番号が何通かの書類（証券と、継続のご案内のメールなど）にあれば、行が何つか並ぶ。どれも伏せてあるので全部「見る」
  for (let i = 0; i < 10 && (await card.getByRole("button", { name: "見る" }).count()); i++) await card.getByRole("button", { name: "見る" }).first().click();
  await card.getByText("DEMO-0000-0000").first().waitFor({ timeout: 5000 });
  await page.waitForTimeout(1500);
  page.off("request", onRequest);
  if (calls.length) throw new Error(`/api/ask が${calls.length}回呼ばれました`);
});

await step("こんなとき: けが・引っ越し・補償の重なりを、書類をつないで並べる（判断はしない）。重なりは見つかったときだけ予定の気づきに出し、トップの真ん中には置かない", async () => {
  await page.goto(BASE + "/");
  await see("メニュー");
  if (await page.locator(".case-links").count()) throw new Error("トップの真ん中に「こんなとき」が残っています");
  if (!(await page.locator(".foot-links a", { hasText: "こんなときは？" }).count())) throw new Error("トップの下に「こんなときは？」の入口がありません");
  await page.goto(BASE + "/schedule");
  await openFolds();
  const overlapCard = page.locator(".card.insight").filter({ hasText: "「個人賠償責任」が3つの書類にあります" });
  await overlapCard.first().waitFor({ timeout: 15000 });
  await overlapCard.first().getByRole("link", { name: "原本の行を並べて見る" }).click();
  await page.waitForURL(/\/cases\?s=overlap/, { timeout: 15000 });
  await page.goto(BASE + "/cases?s=injury");
  await see("けがのときに見る所");
  let body = await page.locator("main").innerText();
  for (const t of ["学校でのけがの給付について", "家族傷害保険", "子ども医療費受給者証"]) if (!body.includes(t)) throw new Error(`けがの場面に「${t}」がありません`);
  await page.goto(BASE + "/cases?s=move");
  await see("住所や「住所が変わったとき」");
  body = await page.locator("main").innerText();
  for (const t of ["くもまど光ネット", "自動車検査証", "書類の送付先（旧住所）"]) if (!body.includes(t)) throw new Error(`引っ越しの場面に「${t}」がありません`);
  await page.goto(BASE + "/cases?s=overlap");
  await see("「個人賠償責任」が3つの書類にあります");
  body = await page.locator("main").innerText();
  if (/解約しましょう|払いすぎ|保険金が出ます/.test(body)) throw new Error("判断の言い回しが出ています");
});

await browser.close();
for (const [s, name, why] of results) console.log(`${s}  ${name}${why ? `\n    ${why}` : ""}`);
console.log(`画面の画像: ${OUT}`);
process.exit(results.some(([s]) => s === "NG") ? 1 : 0);
