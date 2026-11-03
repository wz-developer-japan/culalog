"use client";

// 家族ごとのページ（例: 蓮のページ）。中は「締切・書類・大事な番号」の切り替え。「みんな」は全員分。
// 🔴 判断しない線: 誰のか書類から分からないものは勝手に誰かに入れず、「みんな」でだけ「家族みんな・誰のか分からない」と添えて出す。
// 二人に関係する書類は両方の人に出す。この家の書類ではないもの（記入例・見本）は誰の欄にも出さない。

import Link from "next/link";
import { now } from "@/lib/clock";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackToTop } from "@/components/BackToTop";
import { DeadlineCard } from "@/components/DeadlineCard";
import { AvatarPicker } from "@/components/AvatarPicker";
import { FamilyRow } from "@/components/FamilyRow";
import { faceBackground, MemberFace } from "@/components/MemberFace";
import { NumbersList } from "@/components/NumbersList";
import { Pic } from "@/components/Pics";
import { buildCandidates, toggleDone } from "@/lib/butler";
import { type ActionItem, allItems, formatYmd, isDone, itemIds } from "@/lib/deadlines";
import { CATEGORY_LABELS, RELATION_LABELS } from "@/lib/labels";
import { importantNumbers } from "@/lib/numbers";
import type { Household } from "@/lib/types";
import { useHousehold } from "@/lib/useHousehold";
import { givenName, isFor, ownersLabel, ownersOf, type Whose } from "@/lib/whose";

type Tab = "deadlines" | "documents" | "numbers";
const TABS: { id: Tab; label: string }[] = [
  { id: "deadlines", label: "締切" },
  { id: "documents", label: "書類" },
  { id: "numbers", label: "大事な番号" },
];

export default function FamilyPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const whose: Whose = params?.id ?? "all";
  const { household, loaded, save } = useHousehold();
  const [tab, setTab] = useState<Tab>("deadlines");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const h = household as Household;
  const member = whose === "all" ? undefined : h.members.find((m) => m.id === whose);
  if (whose !== "all" && !member) {
    return (
      <main>
        <BackToTop />
        <p className="meta">その家族は登録されていません。</p>
      </main>
    );
  }
  const today = now();

  // 書類（前のもの・この家の書類ではないものは、その人のページには出さない）
  const docs = h.documents.filter((d) => !d.supersededBy && isFor(whose, d.memberIds, d.notForFamily));
  const unconfirmed = docs.filter((d) => !d.confirmedAt);
  // 締切: いま知らせているもの（ホームの候補と同じ計算）と、そのあとに続く予定
  const near = buildCandidates(h, today).filter((c) => isFor(whose, c.memberIds));
  const nearIds = new Set(near.map((c) => c.id));
  const items = allItems(h, today).filter((i) => isFor(whose, ownersOf(i.deadline, i.document), i.document.notForFamily));
  const later = items.filter((i) => !nearIds.has(i.deadline.id) && i.daysLeft >= 0 && i.deadline.kind !== "after_event" && !isDone(h.done, i));
  const numbers = importantNumbers(h).filter((n) => isFor(whose, n.memberIds));
  const done = (id: string) => save(toggleDone(h, id));
  const sampleFor = (candidateId: string) =>
    candidateId.startsWith("missing:") ? h.demoSamples?.find((x) => x.expectedId === candidateId.slice("missing:".length)) : undefined;

  const Later = ({ item }: { item: ActionItem }) => {
    const d = item.deadline;
    return (
      <div className="lrow">
        <div className="when">{formatYmd(d.date)}{d.endDate && `〜${formatYmd(d.endDate)}`}</div>
        <div className="body">
          <div className="t">{d.label}</div>
          <div className="meta">
            {d.awareness && "知っておくだけ・"}
            原本: <Link href={`/documents/${item.document.id}`}>{item.document.title}</Link>
            {d.source?.location && `・${d.source.location}`}
          </div>
        </div>
        {d.kind !== "event" && (
          <button className="tag ok act" onClick={() => save(toggleDone(h, itemIds(item)))}>
            済んだにする
          </button>
        )}
      </div>
    );
  };

  return (
    <main className="family">
      <BackToTop />
      <FamilyRow members={h.members} current={whose} />
      <div className="who">
        {member ? (
          <button className="av-button" onClick={() => setPicking(!picking)} aria-label="アイコンを変える" aria-expanded={picking}>
            <b className="av" style={{ background: faceBackground(h.members, member) }}>
              <MemberFace members={h.members} member={member} />
            </b>
            <span className="pen" aria-hidden>
              <svg viewBox="0 0 24 24">
                <path d="M4 20l1-4L16 5l3 3L8 19z" />
              </svg>
            </span>
          </button>
        ) : (
          <b className="av house">
            <svg className="l" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 11l8-6 8 6v8H4z" />
              <path d="M10 19v-5h4v5" />
            </svg>
          </b>
        )}
        <div>
          <h1>{member ? givenName(member.name) : "みんな"}</h1>
          <div className="s">
            {member ? [member.roleLabel ?? RELATION_LABELS[member.relation], member.note].filter(Boolean).join("・") : "家族全員の分"}
            ・書類{docs.length}通
          </div>
        </div>
      </div>
      {member && picking && <AvatarPicker household={h} member={member} save={save} onClose={() => setPicking(false)} />}

      <div className="seg" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "deadlines" && (
        <>
          <h2 className="sec">
            近いもの <small>{near.length}件</small>
          </h2>
          {near.length === 0 ? (
            <div className="calm-line">いま知らせている締切はありません。</div>
          ) : (
            near.map((c) => <DeadlineCard key={c.id} c={c} hot={c.urgent} sample={sampleFor(c.id)} onDone={done} />)
          )}
          {unconfirmed.length > 0 && (
            <Link className="ask soft" href="/inbox">
              <svg className="l" viewBox="0 0 24 24" aria-hidden>
                <path d="M6 3h9l3 3v15H6z" />
                <path d="M9 11h6M9 15h6" />
              </svg>
              <div className="t">
                確認待ちの書類が{unconfirmed.length}件
                <span className="block meta">確定すると、その予定もここに入ります</span>
              </div>
              <span className="go">まとめて確認</span>
            </Link>
          )}
          {later.length > 0 && (
            <>
              <h2 className="sec">
                そのあと <small>{later.length}件</small>
              </h2>
              {later.map((i) => (
                <Later key={i.deadline.id} item={i} />
              ))}
            </>
          )}
          <p className="meta">
            <Link href="/schedule/all">すべての予定（済んだもの・何か起きたときの期限も）</Link>
          </p>
        </>
      )}

      {tab === "documents" && (
        <>
          <h2 className="sec">
            書類 <small>{docs.length}通</small>
          </h2>
          {docs.length === 0 ? (
            <div className="calm-line">まだありません。</div>
          ) : (
            docs.map((d) => (
              <Link className="dcard row-link" key={d.id} href={`/documents/${d.id}`}>
                <div className="pic">
                  <Pic kind={d.category} />
                </div>
                <div className="body">
                  <div className="t wrap">{d.title}</div>
                  <div className="sub">
                    {d.docType ?? CATEGORY_LABELS[d.category]}
                    {d.periodLabel && `・${d.periodLabel}`}
                  </div>
                  {d.notForFamily && <div className="sub">この家の書類ではないもの（記入例・見本など）。家族の情報にしていません</div>}
                  <div className="m">
                    {!d.confirmedAt && <span className="tag warn">確認待ち</span>}
                    {whose === "all" && !d.notForFamily && <span className="tag mut">{ownersLabel(h.members, d)}</span>}
                    {d.notForFamily && <span className="tag mut">この家の書類ではない</span>}
                  </div>
                </div>
              </Link>
            ))
          )}
          {whose === "all" && (
            <p className="meta">住まい・光熱・保険など家全体のものは「家全体」。誰のものか書類から分からないものは、勝手に誰かに入れず「誰のか分からない」として執事が聞きます。</p>
          )}
        </>
      )}

      {tab === "numbers" && (
        <>
          <h2 className="sec">
            大事な番号 <small>{numbers.length}件</small>
          </h2>
          <NumbersList numbers={numbers} members={h.members} />
        </>
      )}
    </main>
  );
}
