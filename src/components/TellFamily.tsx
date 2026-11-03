"use client";

// 「家族に伝える」: 共有した書類のまとめを、家族それぞれの言葉で Telegram のグループへ。
// 🔴 押したときだけ送る。送る前に、何がどこへ出るかを全部見せる。Telegram とつないでいなければ、コピーして自分で貼れる。

import { useState } from "react";
import { translateDocument } from "@/components/TranslationView";
import { languageLabel } from "@/lib/languages";
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
  if (!doc.confirmedAt || !doc.sharedWith?.length) return null;

  async function prepare() {
    setBusy(true);
    setStatus("");
    // 共有した人の言葉の訳が無ければ、先に訳す
    const translations: Partial<Record<string, DocTranslation>> = { ...doc.translations };
    for (const lang of tellLanguages(household, doc)) {
      if (lang === "ja" || translations[lang]) continue;
      const { translation, error } = await translateDocument(household, doc, lang);
      if (!translation) {
        setBusy(false);
        setStatus(`${languageLabel(lang)}にできませんでした（${error}）`);
        return;
      }
      translations[lang] = translation;
    }
    if (JSON.stringify(translations) !== JSON.stringify(doc.translations ?? {})) await save({ ...doc, translations });
    const demo = household.isDemo ? await import("@/data/demoTranslations") : undefined;
    const p = buildTell(household, doc, translations, (other, d, lang) =>
      other.translations?.[lang]?.items.find((i) => i.ref === `d:${d.id}`)?.label ?? demo?.provisionalLabel(d.label, lang),
    );
    setPayload(p);
    setText(composeTell(p));
    setBusy(false);
    setOpen(true);
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
    <div className="tell">
      {!open ? (
        <button className="button" disabled={busy} onClick={prepare}>
          {busy ? "用意しています…" : "家族に伝える（それぞれの言葉で）"}
        </button>
      ) : (
        <div className="card tell-preview">
          <div className="meta">
            {household.telegram
              ? "下の文を、家族の Telegram グループに送ります。Telegram と通訳（Claude）を通ります。書類の写真・ほかの書類・大事な番号は送りません。"
              : "家族の Telegram とまだつないでいません（設定でつなげます）。下の文をコピーして、いつものアプリに貼ることもできます。"}
          </div>
          <pre className="tell-text">{text}</pre>
          {household.telegram && (
            <button className="button" disabled={busy || status.startsWith("家族の")} onClick={send}>
              {busy ? "送っています…" : "Telegram のグループに送る"}
            </button>
          )}
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
      {status && (
        <p className="note" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
