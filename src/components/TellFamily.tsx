"use client";

// 「家族に伝える」: 共有した書類のまとめを、家族それぞれの言葉で Telegram のグループへ。
// 🔴 押したときだけ送る。送る前に、何がどこへ出るかを全部見せる。Telegram とつないでいなければ、コピーして自分で貼れる。

import { useState } from "react";
import { translateDocument } from "@/components/TranslationView";
import { LANGUAGES, languageLabel, type LanguageCode } from "@/lib/languages";
import { composeTell } from "@/lib/tell";
import { buildTell, tellLanguages } from "@/lib/tellBuild";
import type { DocTranslation } from "@/lib/translate";
import type { DocumentRecord, Household } from "@/lib/types";

export function TellFamily({ household, doc, save }: { household: Household; doc: DocumentRecord; save: (next: DocumentRecord) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [payload, setPayload] = useState<ReturnType<typeof buildTell> | null>(null);
  const [status, setStatus] = useState("");
  const [groupCount, setGroupCount] = useState(0);
  if (!doc.confirmedAt || !doc.sharedWith?.length) return null;
  const missing = tellLanguages(household, doc)
    .filter((l) => l !== "ja" && !doc.translations?.[l])
    .map(languageLabel);

  async function prepare() {
    setBusy(true);
    setStatus("");
    // グループに送ると、グループの全員が読む。つないでいれば、グループの人の読みたい言葉も入れる
    let groupLangs: LanguageCode[] = [];
    if (household.telegram) {
      const res = await fetch("/api/chat-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(household.telegram) }).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => ({})) : {};
      groupLangs = Array.isArray(json.langs) ? json.langs : [];
      setGroupCount(typeof json.count === "number" ? json.count : 0);
    }
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
    setStatus(res?.ok ? "家族の Telegram に送りました。" : (json.error ?? "送れませんでした。"));
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
              ? `下の文を、家族の Telegram グループに送ります${groupCount ? `（グループの${groupCount}人が読めます）` : ""}。Telegram と通訳（Claude）を通ります。書類の写真・ほかの書類・大事な番号は送りません。`
              : "家族の Telegram とまだつないでいません（設定でつなげます）。下の文をコピーして、いつものアプリに貼ることもできます。"}
          </div>
          {(() => {
            // 夫も妻も、相手に何が届くかを自分の言葉で確かめられるように: ほかの言葉の段が、日本語の段と同じ中身だと一言
            const others = LANGUAGES.filter((l) => l.code !== "ja" && text.includes(`【${l.native}】`)).map((l) => l.label);
            return others.length > 0 && text.includes("【日本語】") ? (
              <div className="meta">
                {others.join("・")}の段は、日本語の段と同じ予定・やることを訳したものです（ℹ の行は、その言葉で読む人への一般的な説明）。
              </div>
            ) : null;
          })()}
          {household.telegram && (
            <button className="button" disabled={busy || status.startsWith("家族の")} onClick={send}>
              {busy ? "送っています…" : "Telegram のグループに送る"}
            </button>
          )}
          {status && (
            <p className="note" role="status">
              {status}
            </p>
          )}
          <pre className="tell-text">{text}</pre>
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
