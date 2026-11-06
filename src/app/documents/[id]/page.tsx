"use client";

// 書類の詳細と確定。
// 確定前は、項目ごとに「原本と見比べた」を本人が付ける。すべて付けたら確定でき、
// 確定した書類の期限だけがホームの知らせに使われる。

import Link from "next/link";
import { BackToTop } from "@/components/BackToTop";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { confirmDocument, openQuestions } from "@/lib/butler";
import { ShareWith } from "@/components/ShareWith";
import { TranslationView } from "@/components/TranslationView";
import { TellFamily } from "@/components/TellFamily";
import { answerAndLearn } from "@/lib/inbox";
import { formatYmd, readableDates, ruleDeadlines, untilOf } from "@/lib/deadlines";
import { DEADLINE_KIND_LABELS, groupsOf } from "@/lib/labels";
import { findQuote, type Mark, segments } from "@/lib/highlight";
import type { DocumentRecord, SourceRef } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";
import { DocumentList } from "@/components/DocumentList";
import { givenName, ownersLabel } from "@/lib/whose";

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  // 期限は確定前の見比べだけに使う印（保存しない）
  const [checkedDeadlines, setCheckedDeadlines] = useState<string[]>([]);
  // 蛍光ペン: 原本の文字を開いているか・いま光らせている印
  const [textOpen, setTextOpen] = useState<boolean | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // 「家族に伝える」「家族と共有して伝える」から来たとき（#tell・#share）: 書類を読み終わってから、その欄へ（読む前は欄がまだ無い）
  const docReady = loaded && Boolean(household?.documents.some((d) => d.id === id));
  useEffect(() => {
    if (!docReady) return;
    const hash = window.location.hash.slice(1);
    if (!/^(tell|share)$/.test(hash)) return;
    requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }));
  }, [docReady, id]);

  useEffect(() => {
    if (!flashId) return;
    textRef.current?.querySelector(`[data-marks~="${flashId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(timer);
  }, [flashId]);

  if (!loaded) return <main />;
  const doc = household?.documents.find((d) => d.id === id);
  if (!household || !doc) {
    return (
      <main>
        <p>書類が見つかりません。</p>
        <Link href="/">トップへ</Link>
      </main>
    );
  }

  const nameOf = (mid: string) => household.members.find((m) => m.id === mid)?.name ?? "";
  const confirmed = Boolean(doc.confirmedAt);
  const allChecked =
    doc.fields.every((f) => f.status === "confirmed") &&
    doc.deadlines.every((d) => checkedDeadlines.includes(d.id));

  async function update(next: DocumentRecord) {
    await save({ ...household!, documents: household!.documents.map((d) => (d.id === next.id ? next : d)) });
  }

  const rules = household.rules ?? [];
  const questions = openQuestions(household).filter((q) => q.documentId === doc.id);
  const expected = household.expected.find((e) => e.id === doc.expectedId);
  const until = untilOf(doc);

  // 蛍光ペン: 項目・予定・「放置すると？」の抜き書きを、原本の文字の中から探す（コードで照らし合わせる）
  const text = doc.originalText;
  const quoted: { id: string; quote?: string }[] = [
    ...doc.fields.map((f) => ({ id: f.key, quote: f.source?.quote })),
    ...doc.deadlines.map((d) => ({ id: d.id, quote: d.source?.quote })),
    ...doc.deadlines.map((d) => ({ id: `${d.id}-reserve`, quote: d.reserve?.source?.quote })),
    { id: "if-ignored", quote: doc.summary?.ifIgnored?.source.quote },
  ];
  const marks: Mark[] = [];
  for (const q of quoted) {
    const range = text && q.quote ? findQuote(text, q.quote) : undefined;
    if (range) marks.push({ id: q.id, ...range });
  }
  const found = new Set(marks.map((m) => m.id));
  const showText = textOpen ?? !confirmed;

  /** 原本のどこか。押すと原本の文字の、蛍光ペンの場所へ寄る */
  const SourceLine = ({ id, source }: { id: string; source?: SourceRef }) => {
    if (!source) return null;
    if (found.has(id)) {
      return (
        <button
          className="source-jump"
          onClick={() => {
            setTextOpen(true);
            setFlashId(id);
          }}
        >
          🖍 原本: {source.location}（押すと原本のその場所へ）
        </button>
      );
    }
    return (
      <div className="meta">
        原本: {source.location}
        {text && source.quote && <span className="block not-found">※ 抜き書きが原本の文字の中に見つかりませんでした。原本で確かめてください</span>}
      </div>
    );
  };

  /** 予定に「わが家のきまり」を当てはめる／外す（締切は毎回きまりから計算する） */
  async function toggleRule(deadlineId: string, ruleId: string, reserve = false) {
    await update({
      ...doc!,
      deadlines: doc!.deadlines.map((d) => {
        if (d.id !== deadlineId) return d;
        if (reserve && d.reserve) {
          const ids = d.reserve.applyRuleIds ?? [];
          const next = ids.includes(ruleId) ? ids.filter((x) => x !== ruleId) : [...ids, ruleId];
          return { ...d, reserve: { ...d.reserve, applyRuleIds: next.length ? next : undefined } };
        }
        const ids = d.applyRuleIds ?? [];
        const next = ids.includes(ruleId) ? ids.filter((x) => x !== ruleId) : [...ids, ruleId];
        return { ...d, applyRuleIds: next.length ? next : undefined };
      }),
    });
  }

  async function toggleField(key: string) {
    await update({
      ...doc!,
      fields: doc!.fields.map((f) =>
        f.key === key ? { ...f, status: f.status === "confirmed" ? "draft" : "confirmed" } : f,
      ),
    });
  }

  async function remove() {
    if (!confirm("この書類を削除しますか？")) return;
    await save({ ...household!, documents: household!.documents.filter((d) => d.id !== doc!.id) });
    router.push("/");
  }

  return (
    <div className="docs-split">
    {/* パソコンの幅（1024px 以上）だけ、左に書類の一覧を並べる（スマホでは出さない） */}
    <aside className="docs-pane" aria-label="書類の一覧">
      <DocumentList household={household} selectedId={doc.id} />
    </aside>
    <main className="docs-detail">
      <BackToTop />
      <h1>{doc.title}</h1>
      <p className="lead">
        {doc.docType ?? groupsOf(doc)[0]}
        {doc.periodLabel && `・${doc.periodLabel}`}
        ・{doc.notForFamily ? "この家の書類ではない" : ownersLabel(household.members, doc)}
        {confirmed ? "・確定済み" : "・確認待ち"}
      </p>
      {doc.onlyInLink?.length ? (
        <div className="card unknown">
          <div className="unknown-label">？ {doc.onlyInLink.join("・")}は、リンク先にしか書いてありません</div>
          本文には書いていないため、執事は推測で埋めていません。元のメールのリンクを開いて確かめてください（このアプリはリンクを開きません）。
        </div>
      ) : null}
      {doc.completions?.length ? (
        <div className="card calm">
          済んだことのお知らせです:
          {doc.completions.map((c, i) => (
            <div key={i}>
              ・{c.what}
              <span className="meta">（原本: {c.source.location}）</span>
            </div>
          ))}
          <div className="meta">つながりそうな予定があれば、「聞きたいこと」で済んだにするか確かめます。</div>
        </div>
      ) : null}
      {doc.notForFamily && (
        <div className="card calm">
          家族の情報にしていません（{doc.notForFamily}）。名前・住所などは家族の誰のものにもせず、予定・ひとこと・執事に聞くの根拠にも使いません。書き方の見本として残しています。
        </div>
      )}

      {(doc.summary || until) && (
        <div className="card four-lines">
          <dl>
            <dt>これは何？</dt>
            <dd>{doc.summary?.what || <span className="meta">—</span>}</dd>
            <dt>いつまで？</dt>
            <dd>
              {until ? until.text : <span className="meta">日付の書いてある予定はありません</span>}
              {until?.location && <span className="meta">（原本: {until.location}）</span>}
            </dd>
            <dt>何をする？</dt>
            <dd>{doc.summary?.todo ? readableDates(doc.summary.todo) : <span className="meta">—</span>}</dd>
            {doc.summary?.ifIgnored && (
              <>
                <dt>放置すると？</dt>
                <dd>
                  {doc.summary.ifIgnored.text}
                  <span className="meta block">「{doc.summary.ifIgnored.source.quote}」</span>
                  <SourceLine id="if-ignored" source={doc.summary.ifIgnored.source} />
                </dd>
              </>
            )}
          </dl>
        </div>
      )}

      {confirmed && (
        <TranslationView household={household} doc={doc} save={update} renderSource={(id, source) => <SourceLine id={id} source={source} />} />
      )}

      {!confirmed && (
        <div className="card warn">
          原本と見比べて、合っている項目に印を付けてください。すべて付けると確定できます。
          確定するまで、この書類の期限ではお知らせしません。
        </div>
      )}

      {doc.supersededBy && (
        <div className="card warn">
          これは<strong>前のもの</strong>です。ひとこと・予定の根拠には使っていません。
          {household.documents.some((d) => d.id === doc.supersededBy) && (
            <div>
              新しい方: <Link href={`/documents/${doc.supersededBy}`}>{household.documents.find((d) => d.id === doc.supersededBy)!.title}</Link>
            </div>
          )}
          <button className="link-button" onClick={() => update({ ...doc, supersededBy: undefined })}>
            前のものにしたのを取り消す
          </button>
        </div>
      )}

      {questions.length > 0 && (
        <>
          <h2>執事から聞きたいこと</h2>
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              showDocument={false}
              members={household.members}
              onAnswer={(values) => save(answerAndLearn(household, q.id, values, newId).household)}
            />
          ))}
        </>
      )}

      {doc.learnedNotes && doc.learnedNotes.length > 0 && (
        <div className="card meta">
          {doc.learnedNotes.map((n, i) => (
            <div key={i}>✓ {n}</div>
          ))}
          <Link href="/questions">覚えたことを見る・忘れさせる</Link>
        </div>
      )}

      {confirmed && expected && (
        <div className="card">
          「{expected.label}」が届いたので、来ていないものから外しました。
        </div>
      )}

      {doc.draftSource === "provisional" && (
        <p className="note">仮の読み取り結果です（Claude の準備中に用意した見本）。</p>
      )}
      {doc.draftSource === "saved" && (
        <p className="note">
          {doc.savedReading ? `${Number(doc.savedReading.readAt.slice(5, 7))}/${Number(doc.savedReading.readAt.slice(8, 10))}` : "前"}に本物の Claude
          {doc.savedReading ? `（${doc.savedReading.model}）` : ""}が原本の写真から読んだ結果を、見本の家族のために保存したものです（開くたびに読み直してはいません）。正解と違う所も直していません。
        </p>
      )}
      {doc.draftSource === "claude" && !confirmed && (
        <div className="card meta">
          この下書きは Claude が原本から読み取ったものです。読み違いがあり得るので、必ず原本と見比べてください。
        </div>
      )}

      {doc.unclear && doc.unclear.length > 0 && !confirmed && (
        <>
          <h2>読み取れなかったところ</h2>
          <div className="card warn">
            {doc.unclear.map((u, i) => (
              <div key={i}>・{u}</div>
            ))}
            <div className="meta">原本で確かめ、必要なら手入力で足してください。</div>
          </div>
        </>
      )}

      {text && (
        <details
          className="original"
          open={showText}
          onToggle={(e) => setTextOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary>
            {doc.origin === "text" ? "原本（貼り付けた文字）" : doc.origin === "conversation" ? "原本（あなたが話したこと）" : "原本の文字"}
            {doc.origin === "demo" && "（架空の書類）"}
            {marks.length > 0 && "・黄色は読み取った場所"}
          </summary>
          <div className="original-text" ref={textRef}>
            {segments(text, marks).map((seg, i) =>
              seg.markIds.length ? (
                <mark
                  key={i}
                  data-marks={seg.markIds.join(" ")}
                  className={flashId && seg.markIds.includes(flashId) ? "flash" : undefined}
                >
                  {seg.text}
                </mark>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )}
          </div>
          {doc.draftSource === "claude" && doc.origin === "text" && (
            <div className="meta">貼り付けた文字をそのまま残しています。メールの元の画面とも見比べてください。</div>
          )}
          {doc.draftSource === "claude" && doc.origin !== "text" && (
            <div className="meta">文字は Claude が原本から書き写したものです。写真・PDF の原本と見比べてください。</div>
          )}
        </details>
      )}

      {doc.originalFile && (
        <details className="original" open={!confirmed && !text}>
          <summary>原本（読み取った{doc.originalFile.mediaType === "application/pdf" ? " PDF" : "写真"}）</summary>
          {doc.originalFile.mediaType === "application/pdf" ? (
            <a href={doc.originalFile.dataUrl} target="_blank" rel="noreferrer">
              PDF を開く
            </a>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="original-image" src={doc.originalFile.dataUrl} alt={doc.originalPages?.length ? "読み取った書類の写真（1ページ目）" : "読み取った書類の写真"} />
              {doc.originalPages?.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} className="original-image" src={p.dataUrl} alt={`読み取った書類の写真（${i + 2}ページ目）`} />
              ))}
            </>
          )}
        </details>
      )}

      {!doc.notForFamily && (
        <>
          <h2 id="share">家族と共有</h2>
          <ShareWith members={household.members} doc={doc} onChange={(sharedWith) => update({ ...doc, sharedWith })} />
          <TellFamily household={household} doc={doc} save={update} />
        </>
      )}

      {doc.storageLocation && (
        <>
          <h2>しまい場所</h2>
          <div className="card">{doc.storageLocation}</div>
        </>
      )}

      <h2>期限・予定</h2>
      {doc.deadlines.length === 0 ? (
        <div className="card meta">登録されていません。</div>
      ) : (
        doc.deadlines.map((d) => (
          <div className="card" key={d.id}>
            {d.label}: {formatYmd(d.date)}
            {d.endDate && ` 〜 ${formatYmd(d.endDate)}`}
            {d.time && `・${d.time}`}
            {d.place && <div>場所: {d.place}</div>}
            {d.needs?.length ? <div>必要なもの: {d.needs.join("、")}</div> : null}
            {d.reserve && (
              <div className="reserve">
                予備日: {formatYmd(d.reserve.date)}
                {d.reserve.condition && `（${d.reserve.condition}）`}
                <SourceLine id={`${d.id}-reserve`} source={d.reserve.source} />
              </div>
            )}
            <div className="meta">
              {DEADLINE_KIND_LABELS[d.kind]}・{d.awareness ? "知っておくだけ（自動で進むもの。トップ・予定では知らせません）" : `${d.leadDays}日前からお知らせ`}
            </div>
            <SourceLine id={d.id} source={d.source} />
            {d.leadReason && <div className="meta">{d.leadReason}</div>}
            {d.intent && <div className="meta">そのときしたいこと: {d.intent}</div>}
            {!confirmed && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={checkedDeadlines.includes(d.id)}
                  onChange={(e) =>
                    setCheckedDeadlines(
                      e.target.checked ? [...checkedDeadlines, d.id] : checkedDeadlines.filter((x) => x !== d.id),
                    )
                  }
                />
                原本と見比べた
              </label>
            )}
            {d.kind === "event" &&
              ruleDeadlines(d, rules).map((r) => (
                <div className="derived" key={r.id}>
                  {r.label}: {formatYmd(r.date)}まで
                  <div className="meta">わが家のきまりから計算・{r.leadReason}</div>
                </div>
              ))}
            {d.kind === "event" &&
              rules
                .filter((rule) => d.applyRuleIds?.includes(rule.id))
                .map((rule) => (
                  <button key={rule.id} className="link-button" onClick={() => toggleRule(d.id, rule.id)}>
                    「{rule.label}」の締切を外す
                  </button>
                ))}
            {d.kind === "event" &&
              d.reserve &&
              rules
                .filter((rule) => d.reserve!.applyRuleIds?.includes(rule.id))
                .map((rule) => (
                  <button key={`r-${rule.id}`} className="link-button" onClick={() => toggleRule(d.id, rule.id, true)}>
                    予備日の「{rule.label}」の締切を外す
                  </button>
                ))}
            {d.kind === "event" &&
              (() => {
                // わが家のきまり（休みの申請など）を手で使うボタン。ふだんは1行に畳む（使うかどうかは本人が決める）
                const unused = rules.filter((rule) => !d.applyRuleIds?.includes(rule.id));
                const unusedReserve = d.reserve ? rules.filter((rule) => !d.reserve!.applyRuleIds?.includes(rule.id)) : [];
                if (unused.length + unusedReserve.length === 0) return null;
                const whose = (memberId: string) => {
                  const m = household.members.find((x) => x.id === memberId);
                  return m ? `${givenName(m.name)}さん・` : "";
                };
                return (
                  <details className="rule-use">
                    <summary>わが家のきまりを、この予定に使う</summary>
                    {unused.map((rule) => (
                      <button key={rule.id} className="button secondary small" onClick={() => toggleRule(d.id, rule.id)}>
                        「{rule.label}」の締切を出す（{whose(rule.memberId)}{rule.daysBefore}日前まで）
                      </button>
                    ))}
                    {unusedReserve.map((rule) => (
                      <button key={`r-${rule.id}`} className="button secondary small" onClick={() => toggleRule(d.id, rule.id, true)}>
                        予備日（{formatYmd(d.reserve!.date)}）にも「{rule.label}」の締切を出す（{whose(rule.memberId)}{rule.daysBefore}日前まで）
                      </button>
                    ))}
                  </details>
                );
              })()}
          </div>
        ))
      )}

      <h2>書いてあること</h2>
      {doc.fields.length === 0 ? (
        <div className="card meta">登録されていません。</div>
      ) : (
        doc.fields.map((f) => (
          <div className="card" key={f.key}>
            <div className="meta">{f.label}</div>
            {f.value}
            <SourceLine id={f.key} source={f.source} />
            {!confirmed && (
              <label className="check">
                <input type="checkbox" checked={f.status === "confirmed"} onChange={() => toggleField(f.key)} />
                原本と見比べた
              </label>
            )}
          </div>
        ))
      )}

      {doc.contacts.length > 0 && (
        <>
          <h2>問い合わせ先</h2>
          {doc.contacts.map((c, i) => (
            <div className="card" key={i}>
              <div className="meta">{c.label}</div>
              {c.name}
              {c.phone && (
                <div>
                  <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`}>{c.phone}</a>
                </div>
              )}
              {c.hours && <div className="meta">{c.hours}</div>}
              {c.source && <div className="meta">原本: {c.source.location}</div>}
            </div>
          ))}
        </>
      )}


      <div className="spacer" />
      {!confirmed && (
        <button
          className="button"
          disabled={!allChecked}
          onClick={() => save(confirmDocument(household, doc.id, newId))}
        >
          原本と見比べて確定する
        </button>
      )}
      {confirmed && (
        <button
          className="button secondary"
          onClick={() => {
            setCheckedDeadlines([]);
            update({
              ...doc,
              confirmedAt: undefined,
              fields: doc.fields.map((f) => ({ ...f, status: "draft" })),
            });
          }}
        >
          確定を取り消す
        </button>
      )}
      <Link className="button secondary" href={`/documents/${doc.id}/edit`} style={{ textAlign: "center", textDecoration: "none" }}>
        書類を直す
      </Link>
      <button className="button secondary" onClick={remove}>
        この書類を削除する
      </button>
    </main>
    </div>
  );
}
