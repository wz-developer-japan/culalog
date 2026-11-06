"use client";

// 書類の説明を、家族の読みたい言葉で読む。
// 原本に書いてあること（原本の場所つき・押すと原本の行が光る）と、理解を助ける一般的な説明（札つき）を分けて出す。
// 日付はアプリが元の予定から、その言葉で出す（訳さない）。

import { useState, type ReactNode } from "react";
import { ProvisionalTag } from "@/components/Info";
import { LANGUAGES, languageLabel, languageOf, type LanguageCode } from "@/lib/languages";
import { maskKnownNumbers } from "@/lib/numbers";
import { basisOf, changesSince, deadlineDateIn, type DocTranslation, translationRequestOf, UI_TEXT } from "@/lib/translate";
import type { DocumentRecord, Household, SourceRef } from "@/lib/types";

/** 書類の説明を、その言葉にする。キーが無いとき（準備中）は、見本の書類だけ用意しておいた仮の訳を使う */
export async function translateDocument(
  household: Household,
  doc: DocumentRecord,
  lang: LanguageCode,
): Promise<{ translation?: DocTranslation; error?: string }> {
  const base = { lang, basis: basisOf(doc), translatedAt: new Date().toISOString() };
  let res: Response | null = null;
  try {
    res = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang, doc: translationRequestOf(doc, (t) => maskKnownNumbers(doc, t)) }),
    });
  } catch {
    return { error: "通信できませんでした。電波のよい所でもう一度お試しください。" };
  }
  const json = await res.json().catch(() => ({}));
  if (res.ok && json.translation) return { translation: { ...json.translation, ...base, draftSource: "claude" } };
  if (res.status === 503 && household.isDemo) {
    const { provisionalTranslation } = await import("@/data/demoTranslations");
    const t = provisionalTranslation(doc, lang);
    if (t) return { translation: { ...t, ...base, draftSource: "provisional" } };
    return {
      error:
        lang === "ja-easy"
          ? "この書類のやさしい日本語の仮の訳は用意していません（見本のうち、子どもに関係する3件だけ用意しています）。執事（Claude）の準備ができると作れます。"
          : "訳す機能は準備中です（見本の書類のうち、いくつかだけ仮の訳を用意しています）。",
    };
  }
  return { error: json.error ?? "訳せませんでした。" };
}

/** 家族の中で使われている、日本語以外の読みたい言葉 */
export function familyLanguages(household: Household): LanguageCode[] {
  const used = new Set(household.members.map(languageOf));
  return LANGUAGES.map((l) => l.code).filter((c) => c !== "ja" && used.has(c));
}

export function TranslationView({
  household,
  doc,
  updateDoc,
  renderSource,
}: {
  household: Household;
  doc: DocumentRecord;
  updateDoc: (change: (current: DocumentRecord) => DocumentRecord) => Promise<void>;
  renderSource: (id: string, source?: SourceRef) => ReactNode;
}) {
  const langs = familyLanguages(household);
  const [lang, setLang] = useState<LanguageCode>("ja");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (langs.length === 0 || doc.notForFamily) return null;

  const t = lang === "ja" ? undefined : doc.translations?.[lang];
  const ui = UI_TEXT[lang];
  const readers = household.members.filter((m) => languageOf(m) === lang).map((m) => m.name.split(/\s+/).pop());

  async function run(target: LanguageCode) {
    setBusy(true);
    setError("");
    const { translation, error } = await translateDocument(household, doc, target);
    setBusy(false);
    if (translation) await updateDoc((d) => ({ ...d, translations: { ...d.translations, [target]: translation } }));
    else setError(error ?? "");
  }

  const changes = t ? changesSince(doc, t) : [];
  const deadlineOf = (ref: string) => (ref.startsWith("d:") ? doc.deadlines.find((d) => `d:${d.id}` === ref) : undefined);
  const fieldOf = (ref: string) => (ref.startsWith("f:") ? doc.fields.find((f) => `f:${f.key}` === ref) : undefined);

  return (
    <section className="translation">
      <div className="chips small" role="group" aria-label="読む言葉">
        {(["ja", ...langs] as LanguageCode[]).map((c) => (
          <button key={c} className={`chip${lang === c ? " selected" : ""}`} onClick={() => setLang(c)} lang={c === "vi" ? "vi" : "ja"}>
            {c === "ja" ? "日本語" : LANGUAGES.find((l) => l.code === c)!.native}
          </button>
        ))}
      </div>
      {lang !== "ja" && !t && (
        <div className="card">
          <div className="meta">
            {readers.join("・")}さんの読みたい言葉（{languageLabel(lang)}）で、この書類の説明・締切・持ち物を伝えます。日付と原本の場所は変えません。
          </div>
          <button className="button" disabled={busy} onClick={() => run(lang)}>
            {busy ? "訳しています…" : `${languageLabel(lang)}にする（執事が訳す）`}
          </button>
          {error && <p className="note">{error}</p>}
        </div>
      )}
      {t && (
        <div className="card translated" lang={lang === "vi" ? "vi" : "ja"}>
          <div className="translated-head">
            <strong>{t.title}</strong>
            {t.draftSource === "provisional" && <ProvisionalTag />}
          </div>
          {changes.length > 0 && (
            <div className="card warn" lang="ja">
              {ui.changed}（{changes.join("・")}）
              <button className="link-button" disabled={busy} onClick={() => run(lang)}>
                訳し直す
              </button>
            </div>
          )}
          <h3>{ui.written}</h3>
          <dl>
            {t.what && (
              <>
                <dt>{ui.what}</dt>
                <dd>{t.what}</dd>
              </>
            )}
            {t.todo && (
              <>
                <dt>{ui.todo}</dt>
                <dd>{t.todo}</dd>
              </>
            )}
          </dl>
          {t.items.map((item) => {
            const d = deadlineOf(item.ref);
            const f = fieldOf(item.ref);
            if (!d && !f) return null;
            return (
              <div className="titem" key={item.ref}>
                <div className="tl">
                  {d && <span className="tdate">{deadlineDateIn(d, lang)}</span>}
                  {item.label}
                </div>
                {item.text && <div>{item.text}</div>}
                <div lang="ja">{renderSource(d ? d.id : f!.key, d ? d.source : f!.source)}</div>
              </div>
            );
          })}
          {t.background.length > 0 && (
            <div className="background">
              <h3>
                {ui.background}
                <span className="tag mut" lang="ja">一般的な説明</span>
              </h3>
              <p className="meta">{ui.backgroundNote}</p>
              {t.background.map((b) => (
                <div key={b.title} className="titem">
                  <div className="tl">{b.title}</div>
                  <div>{b.text}</div>
                </div>
              ))}
            </div>
          )}
          {t.checks.length > 0 && (
            <>
              <h3>{ui.checks}</h3>
              <ul>
                {t.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
          <p className="meta" lang="ja">
            {t.draftSource === "provisional"
              ? "仮の訳です（執事の準備中のため、見本用に用意した訳）。日付と原本の場所はアプリが元の書類から出しています。"
              : "執事（Claude）が訳しました。日付と原本の場所はアプリが元の書類から出しています。大事なことは原本と窓口で確かめてください。"}
          </p>
        </div>
      )}
    </section>
  );
}
