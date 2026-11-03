"use client";

// 同じ日のぶつかり（保護者が行く子どもの行事や、町内会の清掃・当番の日に、家族の大人が仕事）を、執事の気づきとして1枚ずつ出す。
// 中心は「その日は仕事」だけ。誰が行くかも、どう休むか（有給・欠勤・交代・行かない）も決めない。
// 休みの申し出の期限は、勤務の書類そのものに書いてあるときだけ、その書類の名前つきで1行添える（わが家のきまりから作らない）。
// 細かい根拠はカードに出さず、書類の画面に回す（スマホの1画面に、太字からボタンまで入るように）。

import Link from "next/link";
import { conflictDate, findConflicts, noticeShort, workNotices, type Conflict } from "@/lib/conflicts";
import { sameDayNoteFor } from "@/lib/connect";
import { formatYmd } from "@/lib/deadlines";
import { shortDocName } from "@/lib/docName";
import { languageLabel, languageOf } from "@/lib/languages";
import type { Household } from "@/lib/types";


export function ConflictCards({ household, today, memberId }: { household: Household; today: Date; memberId?: string }) {
  const nameOf = (id: string) => household.members.find((m) => m.id === id)?.name.split(/\s+/).pop() ?? "";
  const names = (ids: string[]) => ids.map(nameOf).join("・");
  const list = findConflicts(household, today).filter(
    (c) => !memberId || c.child.deadline.memberIds.includes(memberId) || c.adults.some((a) => a.deadline.memberIds.includes(memberId)),
  );
  if (list.length === 0) return null;
  return (
    <>
      {list.map((c) => {
        const shared = household.members.filter((m) => c.child.doc.sharedWith?.includes(m.id) && languageOf(m) !== "ja");
        const adultNames = c.adults.map((a) => names(a.deadline.memberIds));
        const notices = workNotices(c);
        // キーがあるとき: Claude が書類の行から書いた文（コードが日付・名前・期限を照らし合わせて合ったものだけ）。無ければコードの文
        const note = sameDayNoteFor(household, c);
        if (note) {
          // 太字は「何の日か」「誰が仕事か」の2文。そのあと（家族で決める・書類に書いてある期限）は小さく
          const parts = note.text.split(/(?<=。)/);
          const head = parts.slice(0, 2).join("");
          const rest = parts.slice(2);
          // 原本の場所（括弧の中の括弧は「・」に）
          const where = (id: string) => note.evidence.find((e) => e.documentId === id)?.location.replace(/[（(]([^（）()]*)[）)]/g, "・$1");
          return (
            <div className="card insight conflict" key={note.key}>
              <div className="t">{head}</div>
              {rest.length > 0 && <div className="meta">{rest.join("")}</div>}
              <div className="meta">
                原本:{" "}
                {[c.child.doc, ...c.adults.map((a) => a.doc)].map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && " ／ "}
                    <Link href={`/documents/${d.id}`}>{shortDocName(d, household.members)}</Link>
                    {where(d.id) ? `（${where(d.id)}）` : ""}
                  </span>
                ))}
              </div>
              <div className="meta small-note">Claude が照らし合わせました</div>
              <Link className="button small" href={`/documents/${c.child.doc.id}#tell`}>
                家族に伝える{shared.length ? `（${shared.map((m) => `${nameOf(m.id)}さんには${languageLabel(languageOf(m)).replace(/（.*）/, "")}で`).join("・")}）` : ""}
              </Link>
            </div>
          );
        }
        return (
          <div className="card insight conflict" key={`${c.child.deadline.id}-${c.adults.map((a) => a.deadline.id).join("-")}`}>
            <div className="t">
              {conflictDate(c)}は、{eventOf(c, names)}の日です。
              {adultNames.length > 1 ? `この日は、${adultNames.map((n) => `${n}さんも`).join("")}お仕事のようです。` : `この日は、${adultNames[0]}さんはお仕事のようです。`}
            </div>
            <div className="meta">{decideLine(c)}</div>
            {notices.map((n) => (
              <div className="meta" key={n.doc.id}>
                {shortDocName(n.doc, household.members)}: {noticeShort(n.label)}は{formatYmd(n.date)}まで{n.location ? `（${n.location.replace(/[（(].*$/, "")}）` : ""}
              </div>
            ))}
            <div className="meta">
              原本:{" "}
              {[c.child.doc, ...c.adults.map((a) => a.doc)].map((d, i) => (
                <span key={d.id}>
                  {i > 0 && " ／ "}
                  <Link href={`/documents/${d.id}`}>{shortDocName(d, household.members)}</Link>
                </span>
              ))}
            </div>
            <Link className="button small" href={`/documents/${c.child.doc.id}#tell`}>
              家族に伝える{shared.length ? `（${shared.map((m) => `${nameOf(m.id)}さんには${languageLabel(languageOf(m)).replace(/（.*）/, "")}で`).join("・")}）` : ""}
            </Link>
          </div>
        );
      })}
    </>
  );
}

/** 行事の呼び方: 子どもの行事は「蓮さんの授業参観」、町内会の行事は「町内会の一斉清掃」 */
function eventOf(c: Conflict, names: (ids: string[]) => string): string {
  const event = c.child.deadline.label.replace(/[（(].*$/, "");
  if (!c.community) return `${names(c.child.deadline.memberIds)}さんの${event}`;
  const group = /町内会/.test(c.child.doc.title) ? "町内会" : /自治会/.test(c.child.doc.title) ? "自治会" : "";
  return group && !event.includes(group) ? `${group}の${event}` : event;
}

/** 決めるのは家族（行かない・出ないも答えのひとつ）。行く・出ると決まったら勤務先への連絡を */
function decideLine(c: Conflict): string {
  const go = c.community ? "出る" : "行く";
  const who = !c.community && c.adults.length > 1 ? "どちら" : "誰";
  return `${who}が${go}か（${go === "出る" ? "出ない" : "行かない"}か）は、家族で決めてください。${go}と決まったら、勤務先への連絡も忘れずに。`;
}
