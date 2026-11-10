"use client";

// 家族の名前・続柄・補足を直す／家族を足す・外す（「自分の書類で始める」は「わたし」1人から始まるため）。
// 読みたい言葉・カレンダー・ほかの言葉での呼び名は、この下の欄で選ぶ。

import type { FamilyMember, Household, Relation } from "@/lib/types";

const OTHER_RELATIONS: { value: Relation; label: string }[] = [
  { value: "spouse", label: "夫・妻" },
  { value: "child", label: "子ども" },
  { value: "parent", label: "親" },
  { value: "sibling", label: "きょうだい" },
  { value: "other", label: "その他" },
];

const opposite = (label: string | undefined) => (label === "夫" ? "妻" : label === "妻" ? "夫" : undefined);

export function FamilyEditor({ household, save }: { household: Household; save: (h: Household) => void | Promise<void> }) {
  const self = household.members.find((m) => m.relation === "self");
  const set = (members: FamilyMember[]) => save({ ...household, members });
  const change = (id: string, patch: Partial<FamilyMember>) => set(household.members.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  // わたしが夫か妻かを決めたら、配偶者の続柄の補足も合わせる（夫・妻の判断は roleOf が両方から見る）
  const setSelfRole = (label: string) =>
    set(
      household.members.map((m) =>
        m.relation === "self" ? { ...m, roleLabel: label || undefined } : m.relation === "spouse" ? { ...m, roleLabel: opposite(label) } : m,
      ),
    );

  const setRelation = (id: string, relation: Relation) =>
    change(id, { relation, roleLabel: relation === "spouse" ? opposite(self?.roleLabel) : undefined });

  const add = () => {
    const id = `m-${Date.now().toString(36)}`;
    set([...household.members, { id, name: "", relation: "child" }]);
  };

  const remove = (m: FamilyMember) => {
    const used = household.documents.filter((d) => d.memberIds?.includes(m.id)).length;
    if (used > 0) {
      alert(`${m.name || "この人"}の書類が${used}通あります。先に書類の「誰の」を変えるか、書類を消してから外してください。`);
      return;
    }
    const linked =
      household.timetable.some((t) => t.memberId === m.id) ||
      (household.rules ?? []).some((r) => r.memberId === m.id) ||
      household.expected.some((e) => (e as { memberId?: string }).memberId === m.id);
    if (linked) {
      alert(`${m.name || "この人"}の時間割・きまり・届くはずの書類があります。先にそちらを消してから外してください。`);
      return;
    }
    if (!confirm(`${m.name || "この人"}を家族から外しますか？`)) return;
    set(household.members.filter((x) => x.id !== m.id));
  };

  return (
    <>
      <h2 id="family">家族</h2>
      <p className="meta">
        名前と続柄は、書類が誰のものかを読み分けるのと、Telegram の執事との1対1で「あなたはだれ？」の名簿に使います（子どもは名簿に出ません）。
        補足には「小学3年」「保育園」などを書くと、書類の宛先を読み分けやすくなります。
      </p>
      {household.members.map((m) => (
        <div className="card" key={m.id}>
          <label className="label">
            <span>名前</span>
            <input className="input" value={m.name} placeholder={m.relation === "self" ? "例: 山田 太郎" : "例: 山田 花子"} onChange={(e) => change(m.id, { name: e.target.value })} />
          </label>
          {m.relation === "self" ? (
            <label className="label row-label">
              <span>わたしは</span>
              <select className="input" value={m.roleLabel ?? ""} onChange={(e) => setSelfRole(e.target.value)}>
                <option value="">（選ばない）</option>
                <option value="夫">夫</option>
                <option value="妻">妻</option>
              </select>
            </label>
          ) : (
            <label className="label row-label">
              <span>続柄</span>
              <select className="input" value={m.relation} onChange={(e) => setRelation(m.id, e.target.value as Relation)}>
                {OTHER_RELATIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="label">
            <span>補足（なくてもよい）</span>
            <input className="input" value={m.note ?? ""} placeholder="例: 小学3年・保育園・遠方に住む" onChange={(e) => change(m.id, { note: e.target.value || undefined })} />
          </label>
          {m.relation !== "self" && (
            <button className="link-button" onClick={() => remove(m)}>
              家族から外す
            </button>
          )}
        </div>
      ))}
      <button className="button secondary" onClick={add}>
        ＋ 家族を足す
      </button>
    </>
  );
}
