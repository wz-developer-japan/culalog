"use client";

// 家族の丸いアイコンを横に並べる（みんな・翔太・美咲…）。押すとその人のページへ。トップと家族ごとのページで使う。

import Link from "next/link";
import { faceBackground, MemberFace } from "@/components/MemberFace";
import type { FamilyMember } from "@/lib/types";
import { givenName, type Whose } from "@/lib/whose";

export function FamilyRow({ members, current }: { members: FamilyMember[]; current?: Whose }) {
  return (
    <div className="fam-wrap">
    <div className="fam" role="navigation" aria-label="家族ごとに見る">
      <Link href="/family/all" className={current === "all" ? "on" : undefined} aria-current={current === "all" ? "page" : undefined}>
        <b className="house">
          <svg className="l" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 11l8-6 8 6v8H4z" />
            <path d="M10 19v-5h4v5" />
          </svg>
        </b>
        みんな
      </Link>
      {members.map((m) => {
        return (
          <Link key={m.id} href={`/family/${m.id}`} className={current === m.id ? "on" : undefined} aria-current={current === m.id ? "page" : undefined}>
            <b style={{ background: faceBackground(members, m) }}>
              <MemberFace members={members} member={m} />
            </b>
            {givenName(m.name)}
          </Link>
        );
      })}
    </div>
    </div>
  );
}
