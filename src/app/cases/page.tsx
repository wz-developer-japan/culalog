"use client";

// こんなとき、こうしてくれる（3つの場面）。何と何が関係するかは lib/cases.ts のコードの決まりで集める。
// 🔴 判断しない線: 「お金が出ます」「解約しましょう」とは言わない。書類のどこに何と書いてあるかと、問い合わせ先まで。

import { Info } from "@/components/Info";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BackToTop } from "@/components/BackToTop";
import { faceBackground, MemberFace } from "@/components/MemberFace";
import { type CaseDoc, defaultInjuryMember, runCase, SCENES, type SceneId } from "@/lib/cases";
import { useHousehold } from "@/lib/useHousehold";
import { givenName } from "@/lib/whose";

const isScene = (x: string | null): x is SceneId => SCENES.some((s) => s.id === x);

function DocCard({ item }: { item: CaseDoc }) {
  return (
    <div className="card case-doc">
      <Link className="t" href={`/documents/${item.doc.id}`}>
        {item.doc.title}
      </Link>
      {item.lines.length === 0 ? (
        <div className="meta">住所の行は見つかりませんでした（住まい・車・免許などに結びつく書類なので並べています）。</div>
      ) : (
        item.lines.map((l, i) => (
          <div className="meta" key={i}>
            原本: {l.location}
            <span className="block">「{l.text}」</span>
          </div>
        ))
      )}
      {item.contacts.length > 0 && (
        <div className="contacts">
          {item.contacts.map((c, i) => (
            <div className="meta" key={i}>
              {c.label}: {c.name}
              {c.phone && ` ${c.phone}`}
              {c.hours && `（${c.hours}）`}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Cases() {
  const router = useRouter();
  const { household, loaded } = useHousehold();
  const [scene, setScene] = useState<SceneId | null>(null);
  const [member, setMember] = useState("");

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);
  // トップから「?s=move」などで来たら、その場面を開く
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (isScene(s)) setScene(s);
  }, []);

  if (!loaded || !household) return <main />;
  const memberId = member || defaultInjuryMember(household.members);
  const result = scene ? runCase(household, scene, memberId) : null;
  const choose = (id: SceneId) => {
    setScene(id);
    window.history.replaceState(null, "", `/cases?s=${id}`);
  };

  return (
    <main className="cases">
      <BackToTop />
      <h1 className="pt">
        こんなとき
        <Info label="この画面について">
          家じゅうの書類をつないで、執事がこうします。何と何が関係するかは決まった計算で集め、書類のどこに何と書いてあるかを並べます。
        </Info>
      </h1>

      <div className="scenes" role="tablist" aria-label="場面を選ぶ">
        {SCENES.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={scene === s.id} className={`scene${scene === s.id ? " on" : ""}`} onClick={() => choose(s.id)}>
            <span className="n">{i + 1}</span>
            <span className="lead-s">{s.lead}</span>
            <b>{s.title}</b>
            <span className="does">{s.does}</span>
          </button>
        ))}
      </div>

      {scene === "injury" && (
        <div className="chips" role="group" aria-label="誰のけが？">
          {household.members.map((m) => (
            <button key={m.id} className={`chip${memberId === m.id ? " selected" : ""}`} aria-pressed={memberId === m.id} onClick={() => setMember(m.id)}>
              <span className="member-dot" style={{ background: faceBackground(household.members, m) }} aria-hidden>
                <MemberFace members={household.members} member={m} />
              </span>
              {givenName(m.name)}
            </button>
          ))}
        </div>
      )}

      {result && (
        <section className="case-result" aria-live="polite">
          <div className="calm-line">{result.summary}</div>
          {result.groups.map((g) => (
            <div key={g.title}>
              <h2 className="sec">
                {g.title} <small>{g.docs.length}通</small>
              </h2>
              {g.note && <p className="meta">{g.note}</p>}
              {g.docs.map((d) => (
                <DocCard key={d.doc.id} item={d} />
              ))}
            </div>
          ))}
          <p className="meta provisional">
            保険・医療・法律の判断はしません（お金が出るか・どれを続けるかは言いません）。最終の確認は原本と窓口でお願いします。
            何と何が関係するかは、書類の種類と言葉の決まりでコードが集めています（執事（Claude）は使っていません）。
          </p>
        </section>
      )}
    </main>
  );
}
