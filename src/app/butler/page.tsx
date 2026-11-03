"use client";

// 執事のキャラと名前を選ぶ。変わるのは口調だけで、知らせる中身はどのキャラでも同じ。

import { ButlerFace } from "@/components/ButlerFace";
import Link from "next/link";
import { now } from "@/lib/clock";
import { BackToTop } from "@/components/BackToTop";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { addressee, butlerName, CHARACTERS, characterOf, cleanName, NAME_MAX, timeOfDay, UNCHANGING } from "@/lib/character";
import type { CharacterId } from "@/lib/character";
import { useHousehold } from "@/lib/useHousehold";
import { VoiceSettings } from "@/components/VoiceSettings";

export default function ButlerSettingsPage() {
  const router = useRouter();
  const { household, loaded, save } = useHousehold();
  const [character, setCharacter] = useState<CharacterId | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (loaded && !household) router.replace("/");
  }, [loaded, household, router]);

  if (!loaded || !household) return <main />;
  const current = character ?? characterOf(household).id;
  const currentName = name ?? butlerName(household);
  const chosen = CHARACTERS.find((c) => c.id === current)!;

  function pick(id: CharacterId) {
    // 名前を案のままにしていたら、キャラに合わせて案の名前に変える
    const wasDefault = CHARACTERS.some((c) => c.defaultName === currentName);
    setCharacter(id);
    if (wasDefault) setName(CHARACTERS.find((c) => c.id === id)!.defaultName);
    setSaved(false);
  }

  async function submit() {
    await save({ ...household!, butler: { character: current, name: cleanName(currentName) ?? chosen.defaultName } });
    setSaved(true);
  }

  return (
    <main>
      <BackToTop />
      <h1 className="pt">執事を選ぶ</h1>
      <p className="lead">話し方と名前を選べます。いつでも変えられます。</p>

      <div className="card unchanging">
        <div className="unchanging-title">どの執事でも、変わらないこと</div>
        <ul>
          {UNCHANGING.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
        <div className="meta">中身は正確に、話し方は柔らかく。変わるのは話し方だけです。</div>
      </div>

      <h2>話し方</h2>
      {CHARACTERS.map((c) => (
        <button
          key={c.id}
          className={`card character${c.id === current ? " selected" : ""}`}
          aria-pressed={c.id === current}
          onClick={() => pick(c.id)}
        >
          <span className="face butler">
            <ButlerFace id={c.id} />
          </span>
          <span>
            <span className="character-name">{c.defaultName}</span>
            <span className="block meta">{c.style}</span>
            <span className="block">「{c.greeting(timeOfDay(now()), addressee(household))}」</span>
          </span>
        </button>
      ))}

      <h2>名前</h2>
      <label className="label">
        <span className="meta">好きな名前を付けられます（{NAME_MAX}文字まで）</span>
        <input
          className="input"
          value={currentName}
          maxLength={NAME_MAX}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </label>

      <div className="spacer" />
      <button className="button" onClick={submit}>
        この執事にする
      </button>
      {saved && (
        <p className="note" role="status">
          {cleanName(currentName) ?? chosen.defaultName}にしました。トップ・予定の呼び名にも反映されます。
        </p>
      )}

      <VoiceSettings />
    </main>
  );
}
