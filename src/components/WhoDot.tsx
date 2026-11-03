"use client";

// 誰のものかの小さな丸（1人ならその人の顔、2人以上・家全体は みんなの家の印）。色はその人の色

import { faceStyle, MemberFace } from "@/components/MemberFace";
import { FAMILY_COLOR } from "@/lib/personColor";
import type { FamilyMember } from "@/lib/types";

export function WhoDot({ members, ids }: { members: FamilyMember[]; ids: string[] }) {
  const member = ids.length === 1 ? members.find((m) => m.id === ids[0]) : undefined;
  if (member)
    return (
      <span className="who-dot" style={faceStyle(members, member)} aria-hidden>
        <MemberFace members={members} member={member} />
      </span>
    );
  return (
    <span className="who-dot house" style={{ background: FAMILY_COLOR }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11l8-6 8 6v8H4z" />
        <path d="M10 19v-5h4v5" />
      </svg>
    </span>
  );
}
