"use client";

// 家族が執事との1対1（Telegram）に送った書類の写真の「預かる？」。
// 執事が読んだ結果（原本の全文・番号の類は落としてある）を受け取り、預かると「確認待ち」の書類になる（原本と見比べて確定するのは今までどおり）。

import { useEffect, useState } from "react";
import { extractionToDocument, parseExtraction } from "@/lib/extraction";
import type { Household } from "@/lib/types";
import { newId } from "@/lib/useHousehold";

interface Item {
  id: string;
  from: string;
  receivedAt: string;
  extraction: unknown;
}

async function call(household: Household, body: Record<string, unknown>) {
  const res = await fetch("/api/family", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...household.telegram, ...body }) }).catch(() => null);
  return res?.ok ? await res.json().catch(() => ({})) : null;
}

export function FamilyInbox({ household, save }: { household: Household; save: (h: Household) => Promise<void> }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const chatId = household.telegram?.chatId;
  useEffect(() => {
    if (!chatId) return;
    call(household, { action: "inbox" }).then((json) => setItems(Array.isArray(json?.items) ? json.items : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);
  if (!items.length) return null;

  const nameOf = (id: string) => {
    const m = household.members.find((x) => x.id === id);
    return m ? `${m.name.split(/\s+/).pop()}さん` : "家族";
  };

  async function decide(item: Item, keep: boolean) {
    setBusy(true);
    if (keep) {
      const extraction = parseExtraction(item.extraction, household.members.map((m) => m.id));
      if (extraction) {
        const made = extractionToDocument(extraction, {
          id: newId("doc"),
          origin: "photo",
          draftSource: "claude",
          members: household.members,
          originalText: `（原本は、${nameOf(item.from)}が執事との1対1に送った写真です。写真は CULALOG に残していないので、原本の紙と見比べて確かめてください）`,
          newId,
        });
        await save({ ...household, documents: [...household.documents, made.document], questions: [...(household.questions ?? []), ...made.questions] });
      }
    }
    await call(household, { action: "inboxDone", ids: [item.id] });
    setItems((list) => list.filter((x) => x.id !== item.id));
    setBusy(false);
  }

  return (
    <div className="card" style={{ marginTop: 10 }}>
      <div className="t">Telegram で家族が送った書類（{items.length}件）</div>
      {items.map((item) => {
        const title = (item.extraction as { title?: string })?.title ?? "書類";
        return (
          <div key={item.id} className="meta" style={{ marginTop: 8 }}>
            {nameOf(item.from)}から：{title}
            <div>
              <button className="button small" disabled={busy} onClick={() => decide(item, true)}>
                預かる（確認待ちに）
              </button>{" "}
              <button className="link-button" disabled={busy} onClick={() => decide(item, false)}>
                預からない
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
