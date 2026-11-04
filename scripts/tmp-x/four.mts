import { createDemoHousehold } from "@/data/demoHousehold";
import { familyPayload } from "@/lib/familySync";
const h = await createDemoHousehold(new Date("2026-11-07T10:00:00+09:00"));
const { docs } = familyPayload(h);
for (const re of [/消防設備/, /スイミング/, /図書館/, /こども総合保険/]) {
  const d = h.documents.find((x) => re.test(x.title));
  const s = docs.find((x) => re.test(x.title));
  console.log("=====", re, "doc:", Boolean(d), d?.category, "shared:", JSON.stringify(d?.sharedWith), "summary:", Boolean(s));
  if (s) console.log(JSON.stringify({ ...s, langs: Object.keys(s.langs) }, null, 0).slice(0, 2500));
}
