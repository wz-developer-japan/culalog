"use client";

// 「家族に伝える」: 共有した書類のまとめを、大人それぞれと執事の1対1（Telegram）へ、その人の言葉の段だけで。
// 🔴 押したときだけ送る。送る前に、何がだれへ出るかを全部見せる。1対1を始めていない人・Telegram とつないでいなければ、コピーして自分で貼れる。

import { useState } from "react";
import { translateDocument } from "@/components/TranslationView";
import { LANGUAGES, languageLabel, type LanguageCode } from "@/lib/languages";
import { calendarButtons, composeTell } from "@/lib/tell";
import { buildTell, tellLanguages } from "@/lib/tellBuild";
import type { DocTranslation } from "@/lib/translate";
import type { DocumentRecord, Household } from "@/lib/types";

export function TellFamily({ household, doc, save }: { household: Household; doc: DocumentRecord; save: (next: DocumentRecord) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [payload, setPayload] = useState<ReturnType<typeof buildTell> | null>(null);
  const [status, setStatus] = useState("");
  if (!doc.confirmedAt || !doc.sharedWith?.length) return null;
  const missing = tellLanguages(household, doc)
    .filter((l) => l !== "ja" && !doc.translations?.[l])
    .map(languageLabel);

  async function prepare() {
    setBusy(true);
    setStatus("");
    const groupLangs: LanguageCode[] = [];
    // 送る言葉の訳が無ければ、先に訳す。訳せなかった言葉は外して、そう書く
    const translations: Partial<Record<string, DocTranslation>> = { ...doc.translations };
    const langs: LanguageCode[] = [];
    const skipped: string[] = [];
    for (const lang of tellLanguages(household, doc, groupLangs)) {
      if (lang !== "ja" && !translations[lang]) {
        const { translation } = await translateDocument(household, doc, lang);
        if (!translation) {
          skipped.push(languageLabel(lang));
          continue;
        }
        translations[lang] = translation;
      }
      langs.push(lang);
    }
    if (JSON.stringify(translations) !== JSON.stringify(doc.translations ?? {})) await save({ ...doc, translations });
    const demo = household.isDemo ? await import("@/data/demoTranslations") : undefined;
    const p = buildTell(
      household,
      doc,
      translations,
      (other, d, lang) => other.translations?.[lang]?.items.find((i) => i.ref === `d:${d.id}`)?.label ?? demo?.provisionalLabel(d.label, lang),
      langs,
    );
    setPayload(p);
    setText(composeTell(p));
    setStatus(skipped.length ? `${skipped.join("・")}は、執事の準備中のため入れていません。` : "");
    setBusy(false);
    setOpen(true);
    // 開いたら、どこへ・何人が読むか と「送る」が最初の画面に入るように上へ寄せる
    requestAnimationFrame(() => document.getElementById("tell")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function send() {
    if (!household.telegram || !payload) return;
    setBusy(true);
    const res = await fetch("/api/tell", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: household.telegram.chatId, token: household.telegram.token, payload }),
    }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : {};
    setBusy(false);
    if (!res?.ok) return setStatus(json.error ?? "送れませんでした。");
    const names = (ids: unknown) => (Array.isArray(ids) ? ids : []).map((id) => household.members.find((m) => m.id === id)).filter(Boolean).map((m) => `${m!.name.split(/\s+/).pop()}さん`);
    const sent = names(json.sent);
    const notStarted = names(json.notStarted);
    setStatus(
      [
        sent.length ? `${sent.join("・")}の執事との1対1に送りました。` : "",
        notStarted.length ? `${notStarted.join("・")}は、まだ執事と1対1を始めていません（Telegram で執事に /start）。その人には、下の文をコピーして渡してください。` : "",
      ]
        .filter(Boolean)
        .join(""),
    );
  }

  return (
    <div className="tell" id="tell">
      {!open ? (
        <>
          <button className="button" disabled={busy} onClick={prepare}>
            {busy ? "用意しています…" : "家族に伝える（それぞれの言葉で）"}
          </button>
          {missing.length > 0 && (
            <p className="meta">
              {missing.join("・")}の訳がまだありません。押すと先に執事が訳します（執事の準備中は、日本語だけのお知らせになります）。
            </p>
          )}
        </>
      ) : (
        <div className="card tell-preview">
          <div className="meta">
            {household.telegram
              ? `${recipients(household, payload)}、それぞれの1対1（Telegram）に送ります。写真・ほかの書類・番号は送りません。`
              : "家族の Telegram とまだつないでいません（設定でつなげます）。下の文をコピーして、いつものアプリに貼ることもできます。"}
          </div>
          {(() => {
            // 夫も妻も、相手に何が届くかを自分の言葉で確かめられるように: ほかの言葉の段が、日本語の段と同じ中身だと一言
            const others = LANGUAGES.filter((l) => l.code !== "ja" && text.includes(`【${l.native}】`)).map((l) => l.label);
            return others.length > 0 && text.includes("【日本語】") ? (
              <div className="meta">
                {others.join("・")}の段は日本語の段と同じ中身です（ℹ は一般的な説明）。
              </div>
            ) : null;
          })()}
          {household.telegram && (
            <button className="button" disabled={busy || status.includes("1対1に送りました")} onClick={send}>
              {busy ? "送っています…" : "それぞれの1対1に送る"}
            </button>
          )}
          {status && (
            <p className="note" role="status">
              {status}
            </p>
          )}
          <pre className="tell-text">{text}</pre>
          {(() => {
            // Telegram に送るときだけ: お知らせの下に付く「カレンダーに追加」（言葉ごと）
            const cal = household.telegram && payload ? calendarButtons(payload.calendar, payload.blocks.map((b) => b.lang)) : [];
            return cal.length > 0 ? (
              <div className="meta">
                「{cal.map((b) => b.text).join("」「")}」のボタンも付けます（iPhone の人には30日で切れるリンク）。
              </div>
            ) : null;
          })()}
          <button
            className="button secondary"
            onClick={async () => {
              await navigator.clipboard?.writeText(text).catch(() => undefined);
              setStatus("コピーしました。");
            }}
          >
            文をコピーする
          </button>
          <button className="link-button" onClick={() => setOpen(false)}>
            閉じる
          </button>
        </div>
      )}
      {status && !open && (
        <p className="note" role="status">
          {status}
        </p>
      )}
    </div>
  );
}

/** 送る相手（あなたと、共有した大人）の呼び名と言葉 */
function recipients(household: Household, p: ReturnType<typeof buildTell> | null): string {
  return (p?.takerIds ?? [])
    .map((id) => household.members.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => `${m!.name.split(/\s+/).pop()}さんには${languageLabel(m!.language ?? "ja").replace(/（.*）/, "")}で`)
    .join("・");
}
