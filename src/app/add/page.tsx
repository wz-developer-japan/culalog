"use client";

// 手入力の登録。ここで保存した書類は「確認待ち」になり、
// 原本と見比べて確定するまでホームの知らせには使わない。

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CATEGORY_LABELS, DEADLINE_KIND_LABELS, DEFAULT_LEAD_DAYS, RANGE_KINDS } from "@/lib/labels";
import type { Deadline, DeadlineKind, DocumentCategory, DocumentRecord, Field, Household } from "@/lib/types";
import { newId, useHousehold } from "@/lib/useHousehold";

const emptyField = (): Field => ({ key: newId("f"), label: "", value: "", status: "draft" });

const emptyDeadline = (): Deadline => ({
  id: newId("dl"),
  kind: "expiry",
  label: "",
  date: "",
  leadDays: DEFAULT_LEAD_DAYS.expiry,
  memberIds: [],
});

export default function AddDocument() {
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [storageLocation, setStorageLocation] = useState("");
  const [fields, setFields] = useState<Field[]>([emptyField()]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([emptyDeadline()]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;

  const updateField = (i: number, patch: Partial<Field>) =>
    setFields(fields.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const updateDeadline = (i: number, patch: Partial<Deadline>) =>
    setDeadlines(deadlines.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const updateSource = <T extends { source?: { location: string } }>(item: T, location: string): T => ({
    ...item,
    source: location ? { location } : undefined,
  });

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
    const doc: DocumentRecord = {
      id: newId("doc"),
      title: title.trim(),
      category,
      memberIds,
      origin: "manual",
      storageLocation: storageLocation.trim() || undefined,
      fields: fields.filter((f) => f.label.trim() && f.value.trim()),
      contacts: [],
      deadlines: usedDeadlines.map((d) => ({ ...d, memberIds: d.memberIds.length ? d.memberIds : memberIds })),
      createdAt: new Date().toISOString(),
    };
    const current = household as Household;
    await save({ ...current, documents: [...current.documents, doc] });
    router.push(`/documents/${doc.id}`);
  }

  return (
    <main>
      <h1>書類を登録</h1>
      <p className="lead">手元の書類を見ながら入れてください。保存したあと、原本と見比べて確定します。</p>

      <label className="label">
        書類の名前
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 火災保険 保険証券" />
      </label>

      <label className="label">
        種類
        <select className="input" value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="label">誰の書類？</div>
      <div className="chips">
        {household.members.map((m) => (
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
            種類
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
              placeholder="例: 有給の申請は1週間前まで"
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
              value={d.source?.location ?? ""}
              onChange={(e) => setDeadlines(deadlines.map((x, j) => (j === i ? updateSource(x, e.target.value) : x)))}
              placeholder="例: 第2条"
            />
          </label>
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
            <input className="input" value={f.value} onChange={(e) => updateField(i, { value: e.target.value })} placeholder="例: 新賃料の1か月分" />
          </label>
          <label className="label">
            原本のどこに書いてあるか（任意）
            <input
              className="input"
              value={f.source?.location ?? ""}
              onChange={(e) => setFields(fields.map((x, j) => (j === i ? updateSource(x, e.target.value) : x)))}
              placeholder="例: 第4条"
            />
          </label>
        </div>
      ))}
      <button className="button secondary" onClick={() => setFields([...fields, emptyField()])}>
        項目を足す
      </button>

      {error && <p className="error">{error}</p>}
      <div className="spacer" />
      <button className="button" onClick={submit}>
        保存して確認へ
      </button>
      <button className="button secondary" onClick={() => router.push("/")}>
        やめる
      </button>
    </main>
  );
}
