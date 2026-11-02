// 執事のキャラ（口調）と名前。
// 変わるのは言い回しだけ。期日・原本の引用・原本の場所・迫った期限の注意は、どのキャラでも同じ内容を出す。
// 名前は Claude への指示に入れない（口調はキャラの種類だけで決め、名前は画面でコードが差し込む）。

import type { Household } from "./types";

export type CharacterId = "kurano" | "fusen" | "hako";

export interface ButlerSettings {
  character: CharacterId;
  /** 本人が付けた名前（10文字まで） */
  name: string;
}

export interface Character {
  id: CharacterId;
  /** 最初に付いている名前の案 */
  defaultName: string;
  /** 口調の説明（設定画面に出す） */
  style: string;
  /** 小さなアイコン（顔の代わりの1文字） */
  icon: string;
  /** あいさつ（呼びかける相手は「翔太さん、」の形か空。名前は画面で差し込む） */
  greeting: (time: "morning" | "day" | "evening", who: string) => string;
  /** 急いで動くことが無いとき */
  calm: string;
  /** 聞きたいことの前置き */
  asking: string;
}

const hello = { morning: "おはようございます", day: "こんにちは", evening: "こんばんは" } as const;

export const CHARACTERS: Character[] = [
  {
    id: "kurano",
    defaultName: "クラノ",
    style: "落ち着いた、ていねいな口調（男性的）",
    icon: "蔵",
    greeting: (t, who) => `${who}${hello[t]}。本日のことをお伝えいたします。`,
    calm: "今は、急いで動くことはございません。",
    asking: "お手すきのときに、お聞かせください。",
  },
  {
    id: "fusen",
    defaultName: "フセン",
    style: "明るく、やわらかい口調（女性的）",
    icon: "付",
    greeting: (t, who) => `${who}${hello[t]}！ 今日のこと、まとめておきましたよ。`,
    calm: "今は、急ぐことはありませんよ。",
    asking: "分かるときに、教えてくださいね。",
  },
  {
    id: "hako",
    defaultName: "ハコ",
    style: "短く、さっぱりした口調（中性的）",
    icon: "箱",
    greeting: (t, who) => `${who}${hello[t]}。今日のことです。`,
    calm: "今は、急ぐことはありません。",
    asking: "分かれば、選んでください。",
  },
];

export const NAME_MAX = 10;

/** 名前を整える（前後の空白・制御文字を除き、10文字まで）。空なら undefined */
export function cleanName(name: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  const cleaned = [...name.replace(/[\u0000-\u001f\u007f]/g, "").trim()].slice(0, NAME_MAX).join("");
  return cleaned || undefined;
}

export function characterOf(household: Household): Character {
  return CHARACTERS.find((c) => c.id === household.butler?.character) ?? CHARACTERS[0];
}

/** 執事の名前（付けていなければキャラの名前の案） */
export function butlerName(household: Household): string {
  return household.butler?.name || characterOf(household).defaultName;
}

export function timeOfDay(date: Date): "morning" | "day" | "evening" {
  const h = date.getHours();
  return h >= 4 && h < 11 ? "morning" : h >= 11 && h < 18 ? "day" : "evening";
}

/** 呼びかける相手（本人の下の名前＋「さん、」。名前が無ければ空） */
export function addressee(household: Household): string {
  const self = household.members.find((m) => m.relation === "self");
  if (!self || self.name === "わたし") return "";
  const parts = self.name.split(/\s+/);
  return `${parts[parts.length - 1]}さん、`;
}

/** どの執事でも、変わらないこと（設定画面とホームに出す） */
export const UNCHANGING = [
  "期日・原本の引用・注意は、どの執事でも同じ内容です",
  "書類に書いていないことは、推測しません",
  "採用するか・確定するかは、あなたが決めます",
];
