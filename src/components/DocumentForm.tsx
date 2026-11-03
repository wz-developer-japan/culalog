"use client";

// 書類の入力フォーム。手入力の登録（/add）と、登録済みの書類の編集（/documents/[id]/edit）で共通に使う。
// 読み取りの下書きを直すときも、原本のどこに書いてあったか（場所と抜き書き）はそのまま残す。

import { type ReactNode, useState } from "react";
import { CATEGORY_GROUPS, CATEGORY_LABELS, DEADLINE_KIND_LABELS, DEFAULT_LEAD_DAYS, RANGE_KINDS } from "@/lib/labels";
import type {
  Contact,
  Deadline,
  DeadlineKind,
  DocumentCategory,
  DocumentRecord,
  FamilyMember,
  Field,
  SourceRef,
} from "@/lib/types";
import { newId } from "@/lib/useHousehold";

const emptyField = (): Field => ({ key: newId("f"), label: "", value: "", status: "draft" });

const emptyDeadline = (): Deadline => ({
  id: newId("dl"),
  kind: "expiry",
  label: "",
  date: "",
  leadDays: DEFAULT_LEAD_DAYS.expiry,
  memberIds: [],
});

const emptyContact = (): Contact => ({ label: "問い合わせ先", name: "" });

/** 場所を書き換えても、読み取りで付いた抜き書き（quote）は残す */
function withLocation<T extends { source?: SourceRef }>(item: T, location: string): T {
  const quote = item.source?.quote;
  return { ...item, source: location || quote ? { location: location || "（場所の記載なし）", quote } : undefined };
}

const locationOf = (source?: SourceRef) => (source?.location === "（場所の記載なし）" ? "" : (source?.location ?? ""));

export function DocumentForm({
  initial,
  members,
  submitLabel,
  onSubmit,
  onCancel,
  children,
}: {
  initial: DocumentRecord;
  members: FamilyMember[];
  submitLabel: string;
  onSubmit: (doc: DocumentRecord) => Promise<void>;
  onCancel: () => void;
  /** フォームの上に出すもの（原本の写真など） */
  children?: ReactNode;
}) {
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState<DocumentCategory>(initial.category);
  const [docType, setDocType] = useState(initial.docType ?? "");
  const [periodLabel, setPeriodLabel] = useState(initial.periodLabel ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(initial.memberIds);
  const [storageLocation, setStorageLocation] = useState(initial.storageLocation ?? "");
  const [fields, setFields] = useState<Field[]>(initial.fields.length ? initial.fields : [emptyField()]);
  const [deadlines, setDeadlines] = useState<Deadline[]>(initial.deadlines.length ? initial.deadlines : [emptyDeadline()]);
  const [contacts, setContacts] = useState<Contact[]>(initial.contacts);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const updateField = (i: number, patch: Partial<Field>) =>
    setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const updateDeadline = (i: number, patch: Partial<Deadline>) =>
    setDeadlines(deadlines.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const updateContact = (i: number, patch: Partial<Contact>) =>
    setContacts(contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function submit() {
    if (!title.trim()) {
      setError("書類の名前を入れてください。");
      return;
    }
    const usedDeadlines = deadlines.filter((d) => d.label.trim() || d.date);
    if (usedDeadlines.some((d) => !d.label.trim() || !d.date)) {
      setError("期限は「何の期限か」と「日付」の両方を入れてください。");
      return;
    }
    if (usedDeadlines.some((d) => d.endDate && d.endDate < d.date)) {
      setError("終わる日が始まる日より前になっている期限があります。");
      return;
    }
    // 確定済みの書類を本人が直したときは、直した内容もそのまま確定として扱う
    const status = initial.confirmedAt ? "confirmed" : "draft";
    setBusy(true);
    await onSubmit({
      ...initial,
      title: title.trim(),
      category,
      docType: docType.trim() || undefined,
      periodLabel: periodLabel.trim() || undefined,
      memberIds,
      storageLocation: storageLocation.trim() || undefined,
      fields: fields
        .filter((f) => f.label.trim() && f.value.trim())
        .map((f) => ({ ...f, label: f.label.trim(), value: f.value.trim(), status: f.status === "confirmed" ? "confirmed" : status })),
      deadlines: usedDeadlines.map((d) => ({
        ...d,
        label: d.label.trim(),
        endDate: RANGE_KINDS.includes(d.kind) ? d.endDate : undefined,
        time: d.time?.trim() || undefined,
        place: d.place?.trim() || undefined,
        needs: d.needs?.map((n) => n.trim()).filter(Boolean).length
          ? d.needs.map((n) => n.trim()).filter(Boolean)
          : undefined,
        intent: d.kind === "cancel_window" ? d.intent : undefined,
        memberIds: d.memberIds.length ? d.memberIds : memberIds,
      })),
      contacts: contacts
        .filter((c) => c.name.trim())
        .map((c) => ({
          ...c,
          label: c.label.trim() || "問い合わせ先",
          name: c.name.trim(),
          phone: c.phone?.trim() || undefined,
          hours: c.hours?.trim() || undefined,
        })),
    });
    setBusy(false);
  }

  return (
    <>
      {children}

      <label className="label">
        書類の名前
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 火災保険 保険証券" />
      </label>

      <label className="label">
        分類（かっこの中は、書類の一覧で並ぶ所）
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}（{CATEGORY_GROUPS[value as DocumentCategory].join("・")}）
            </option>
          ))}
        </select>
      </label>

      <label className="label">
        書類の名前の種類（任意）
        <input className="input" value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="例: 歯科健診のお知らせ" />
      </label>

      <label className="label">
        いつの分か（任意）
        <input className="input" value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="例: 2026年度" />
      </label>

      <div className="label">誰の書類？</div>
      <div className="chips">
        {members.map((m) => (
          <label key={m.id} className="chip">
            <input
              type="checkbox"
              checked={memberIds.includes(m.id)}
              onChange={(e) =>
                setMemberIds(e.target.checked ? [...memberIds, m.id] : memberIds.filter((id) => id !== m.id))
              }
            />
            {m.name}
          </label>
        ))}
      </div>

      <label className="label">
        現物のしまい場所
        <input
          className="input"
          value={storageLocation}
          onChange={(e) => setStorageLocation(e.target.value)}
          placeholder="例: 書類棚 2段目の青いファイル"
        />
      </label>

      <h2>期限・予定</h2>
      {deadlines.map((d, i) => (
        <div className="card" key={d.id}>
          <label className="label">
            予定の種類
            <select
              className="input"
              value={d.kind}
              onChange={(e) => {
                const kind = e.target.value as DeadlineKind;
                updateDeadline(i, { kind, leadDays: DEFAULT_LEAD_DAYS[kind] });
              }}
            >
              {Object.entries(DEADLINE_KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            何の期限か
            <input className="input" value={d.label} onChange={(e) => updateDeadline(i, { label: e.target.value })} placeholder="例: 保険期間の満了" />
          </label>
          <label className="label">
            {RANGE_KINDS.includes(d.kind) ? "始まる日" : "日付"}
            <input className="input" type="date" value={d.date} onChange={(e) => updateDeadline(i, { date: e.target.value })} />
          </label>
          {RANGE_KINDS.includes(d.kind) && (
            <label className="label">
              終わる日
              <input
                className="input"
                type="date"
                value={d.endDate ?? ""}
                onChange={(e) => updateDeadline(i, { endDate: e.target.value || undefined })}
              />
            </label>
          )}
          <label className="label">
            時刻（任意）
            <input className="input" value={d.time ?? ""} onChange={(e) => updateDeadline(i, { time: e.target.value })} placeholder="例: 13:00〜13:30" />
          </label>
          <label className="label">
            どこで（任意）
            <input className="input" value={d.place ?? ""} onChange={(e) => updateDeadline(i, { place: e.target.value })} placeholder="例: 市の保健センター" />
          </label>
          <label className="label">
            必要なもの（任意・1行に1つ）
            <textarea
              className="input"
              rows={2}
              value={(d.needs ?? []).join("\n")}
              onChange={(e) => updateDeadline(i, { needs: e.target.value ? e.target.value.split("\n") : undefined })}
              placeholder={"例: 母子健康手帳\n問診票"}
            />
          </label>
          {d.kind === "event" && (
            <label className="label">
              予備日（雨天・延期のとき。無ければ空）
              <input
                className="input"
                type="date"
                value={d.reserve?.date ?? ""}
                onChange={(e) =>
                  updateDeadline(i, {
                    reserve: e.target.value
                      ? { ...(d.reserve ?? { condition: "雨天・延期の場合" }), date: e.target.value }
                      : undefined,
                  })
                }
              />
            </label>
          )}
          {(d.kind === "expiry" || d.kind === "cancel_window" || d.kind === "window" || d.kind === "due") && (
            <label className="label">
              くり返し
              <select
                className="input"
                value={d.repeatMonths ?? 0}
                onChange={(e) => updateDeadline(i, { repeatMonths: Number(e.target.value) || undefined })}
              >
                <option value={0}>くり返さない</option>
                <option value={1}>毎月</option>
                <option value={12}>毎年</option>
                <option value={24}>2年ごと</option>
                <option value={36}>3年ごと</option>
              </select>
            </label>
          )}
          <label className="label">
            何日前から知らせるか
            <input
              className="input"
              type="number"
              min={0}
              value={d.leadDays}
              onChange={(e) => updateDeadline(i, { leadDays: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="label">
            早めに動く理由（任意）
            <input
              className="input"
              value={d.leadReason ?? ""}
              onChange={(e) => updateDeadline(i, { leadReason: e.target.value || undefined })}
              placeholder="例: 休みの申請は1週間前まで"
            />
          </label>
          {d.kind === "cancel_window" && (
            <label className="label">
              そのときどうしたいか（任意）
              <input
                className="input"
                value={d.intent ?? ""}
                onChange={(e) => updateDeadline(i, { intent: e.target.value || undefined })}
                placeholder="例: 次は解約して乗り換えたい"
              />
            </label>
          )}
          <label className="label">
            原本のどこに書いてあるか（任意）
            <input
              className="input"
              value={locationOf(d.source)}
              onChange={(e) => setDeadlines(deadlines.map((x, j) => (j === i ? withLocation(x, e.target.value) : x)))}
              placeholder="例: 第2条"
            />
          </label>
          {d.source?.quote && <div className="meta">原文: {d.source.quote}</div>}
          <button className="link-button" onClick={() => setDeadlines(deadlines.filter((_, j) => j !== i))}>
            この期限を消す
          </button>
        </div>
      ))}
      <button className="button secondary" onClick={() => setDeadlines([...deadlines, emptyDeadline()])}>
        期限を足す
      </button>

      <h2>書いてあること</h2>
      {fields.map((f, i) => (
        <div className="card" key={f.key}>
          <label className="label">
            項目
            <input className="input" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} placeholder="例: 更新料" />
          </label>
          <label className="label">
            内容
            <textarea
              className="input"
              rows={2}
              value={f.value}
              onChange={(e) => updateField(i, { value: e.target.value, status: "draft" })}
              placeholder="例: 新賃料の1か月分"
            />
          </label>
          <label className="label">
            原本のどこに書いてあるか（任意）
            <input
              className="input"
              value={locationOf(f.source)}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? withLocation(x, e.target.value) : x)))}
              placeholder="例: 第4条"
            />
          </label>
          {f.source?.quote && <div className="meta">原文: {f.source.quote}</div>}
          <button className="link-button" onClick={() => setFields(fields.filter((_, j) => j !== i))}>
            この項目を消す
          </button>
        </div>
      ))}
      <button className="button secondary" onClick={() => setFields([...fields, emptyField()])}>
        項目を足す
      </button>

      <h2>問い合わせ先</h2>
      {contacts.map((c, i) => (
        <div className="card" key={i}>
          <label className="label">
            どんな窓口か
            <input className="input" value={c.label} onChange={(e) => updateContact(i, { label: e.target.value })} placeholder="例: 事故の受付" />
          </label>
          <label className="label">
            名前
            <input className="input" value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} placeholder="例: みなと住まい管理（架空）" />
          </label>
          <label className="label">
            電話番号（任意）
            <input className="input" type="tel" value={c.phone ?? ""} onChange={(e) => updateContact(i, { phone: e.target.value })} />
          </label>
          <label className="label">
            受付時間（任意）
            <input className="input" value={c.hours ?? ""} onChange={(e) => updateContact(i, { hours: e.target.value })} placeholder="例: 平日 9:00〜17:00" />
          </label>
          <button className="link-button" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}>
            この問い合わせ先を消す
          </button>
        </div>
      ))}
      <button className="button secondary" onClick={() => setContacts([...contacts, emptyContact()])}>
        問い合わせ先を足す
      </button>

      {error && <p className="error">{error}</p>}
      <div className="spacer" />
      <button className="button" disabled={busy} onClick={submit}>
        {submitLabel}
      </button>
      <button className="button secondary" onClick={onCancel}>
        やめる
      </button>
    </>
  );
}
