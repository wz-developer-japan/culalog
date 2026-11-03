// 執事の準備中（Claude API のキーが無いとき）に使う、見本の書類の仮の訳（ベトナム語）。
// 🔴 本物の訳ではなく、見本のために用意したもの。画面には「仮」の札を付ける。日付・曜日はここに書かず、アプリが元の予定から出す。
// 項目・予定は、元の書類の名前（日本語）で結び付ける。

import type { LanguageCode } from "@/lib/languages";
import type { DocTranslation, TranslatedItem } from "@/lib/translate";
import type { DocumentRecord } from "@/lib/types";

interface Prepared {
  /** 元の書類の題名に、この言葉が入っていれば当てはめる */
  titleIncludes: string;
  lang: LanguageCode;
  title: string;
  what: string;
  todo: string;
  /** match: 元の書類の項目・予定の名前（日本語）に含まれる言葉 */
  items: { match: string; label: string; text: string }[];
  background: { title: string; text: string }[];
  checks: string[];
}

const PREPARED: Prepared[] = [
  {
    titleIncludes: "うんどうかい",
    lang: "vi",
    title: "Thông báo Hội thể thao của nhà trẻ Koguma",
    what: "Đây là thông báo về hội thể thao (undōkai) của nhà trẻ nơi bé Yui đang theo học: thời gian, địa điểm và đồ cần mang. Hôm đó nhà trẻ không giữ trẻ ngày thứ Bảy.",
    todo: "Báo có tham gia hay không qua ứng dụng liên lạc của nhà trẻ trước hạn. Hôm đó phụ huynh đi cùng bé, và 1 phụ huynh tham gia trò chơi bố mẹ – con của lớp Risu.",
    items: [
      { match: "うんどうかい（", label: "Hội thể thao của nhà trẻ (không có giữ trẻ thứ Bảy)", text: "Sân nhà trẻ Koguma (nếu mưa thì tổ chức trong phòng chơi). Mang: bình nước (trà hoặc nước lọc), mũ, khăn lau mồ hôi." },
      { match: "出欠", label: "Báo tham gia / không tham gia (qua ứng dụng liên lạc)", text: "" },
      { match: "土曜保育", label: "Giữ trẻ thứ Bảy", text: "Hôm đó không có giữ trẻ thứ Bảy. Bé tham gia cùng với phụ huynh." },
      { match: "雨の場合", label: "Nếu trời mưa", text: "Tổ chức trong phòng chơi của nhà trẻ (giờ giữ nguyên)." },
      { match: "親子競技", label: "Trò chơi bố mẹ – con", text: "Lớp Risu có trò chơi “Cùng về đích!”. 1 phụ huynh tham gia." },
      { match: "お弁当", label: "Cơm hộp", text: "Không cần. Giải tán khoảng 11:30." },
      { match: "服装", label: "Trang phục", text: "Quần áo dễ vận động, giày thể thao." },
      { match: "駐車場", label: "Chỗ đậu xe", text: "Không có chỗ đậu ô tô. Xe đạp để ở chỗ để xe phía đông của nhà trẻ." },
    ],
    background: [
      {
        title: "Hội thể thao (undōkai) ở Nhật là gì?",
        text: "Ở Nhật, trường học và nhà trẻ thường tổ chức hội thể thao mỗi năm. Trẻ em biểu diễn chạy, nhảy, trò chơi tập thể; gia đình đến xem và cổ vũ. Nhiều nơi tổ chức vào thứ Bảy hoặc Chủ nhật để bố mẹ có thể đến.",
      },
      {
        title: "Giữ trẻ thứ Bảy (doyō hoiku) là gì?",
        text: "Nhiều nhà trẻ ở Nhật nhận giữ trẻ vào thứ Bảy cho gia đình mà bố mẹ phải đi làm. Vào ngày có sự kiện, có khi nhà trẻ không giữ trẻ thứ Bảy, nên gia đình cần sắp xếp người đi cùng bé.",
      },
    ],
    checks: ["Thông báo không ghi nếu không ai trong gia đình đi được thì phải làm sao. Hãy hỏi nhà trẻ."],
  },
  {
    titleIncludes: "3学年だより",
    lang: "vi",
    title: "Bản tin khối lớp 3",
    what: "Bản tin của khối lớp 3 trường tiểu học Kuroudo Daiichi (trường của bé Ren). Có ngày dự giờ (jugyō sankan) học kỳ 2.",
    todo: "Giờ và phòng học của buổi dự giờ sẽ được báo bằng tờ thông báo phát sau. Áo khoác cần ghi tên. Báo nghỉ học trước 8:00 qua ứng dụng liên lạc.",
    items: [
      { match: "授業参観（2学期）", label: "Dự giờ học kỳ 2 (phụ huynh đến xem lớp học)", text: "Giờ và phòng học sẽ báo bằng tờ thông báo phát sau." },
      { match: "授業参観の時間", label: "Giờ và phòng học của buổi dự giờ", text: "Sẽ báo bằng tờ thông báo phát sau." },
    ],
    background: [
      {
        title: "Dự giờ (jugyō sankan) là gì?",
        text: "Ở Nhật, phụ huynh được mời đến trường xem con học trong lớp vài lần mỗi năm. Thường tổ chức vào ngày thường, nên nhiều phụ huynh đi làm xin nghỉ phép để đến.",
      },
    ],
    checks: ["Giờ và phòng học chưa có. Hãy xem tờ thông báo phát sau (có thể nằm trong cặp của Ren)."],
  },
  {
    titleIncludes: "りす組だより",
    lang: "vi",
    title: "Bản tin lớp Risu — Thông báo tiệc Giáng sinh",
    what: "Thông báo tiệc Giáng sinh của lớp Risu (lớp của bé Yui). Giờ đến lớp in trên giấy (9:30) đã bị gạch và sửa tay thành 9:15.",
    todo: "Hôm đó đưa bé đến lớp trước 9:15 (giờ đã sửa tay). Mang quần áo thay và khăn. Mũ thì nhà trẻ chuẩn bị.",
    items: [
      { match: "クリスマス会", label: "Tiệc Giáng sinh lớp Risu (đến lớp trước 9:15 – giờ sửa tay)", text: "Mang: một bộ quần áo thay, khăn." },
      { match: "訂正前", label: "Giờ đến lớp in trên giấy (trước khi sửa)", text: "Trước 9:30 (đã bị gạch hai đường)." },
      { match: "帽子", label: "Mũ", text: "Nhà trẻ chuẩn bị (không cần mang)." },
      { match: "来られない", label: "Nếu phụ huynh không đến được", text: "Bé vẫn tham gia. Không cần báo." },
      { match: "お迎え", label: "Đón bé", text: "Như mọi ngày." },
    ],
    background: [],
    checks: [],
  },
  {
    titleIncludes: "ごみ",
    lang: "vi",
    title: "Lịch thu gom rác gia đình – khu Kuroudodai 1-chōme",
    what: "Lịch các ngày thu gom rác của khu nhà mình. Mỗi loại rác có ngày riêng.",
    todo: "Mang rác ra điểm tập kết trước 8:30 sáng của ngày thu gom. Dịp Tết (cuối năm – đầu năm) không thu gom.",
    items: [
      { match: "燃やすごみ", label: "Rác cháy được", text: "Thứ Hai và thứ Năm hằng tuần." },
      { match: "プラスチック", label: "Bao bì, hộp đựng bằng nhựa", text: "Thứ Ba hằng tuần." },
      { match: "缶・ビン", label: "Lon, chai thủy tinh, chai nhựa PET", text: "Thứ Tư tuần thứ 2 và thứ 4 của tháng." },
      { match: "燃やさないごみ", label: "Rác không cháy được", text: "Thứ Tư tuần thứ 1 và thứ 3 của tháng." },
      { match: "古紙", label: "Giấy cũ, vải cũ", text: "Thứ Sáu tuần thứ 1 và thứ 3 của tháng." },
      { match: "出す時間", label: "Giờ mang rác ra", text: "Trước 8:30 sáng ngày thu gom." },
      { match: "祝日", label: "Ngày lễ", text: "Ngày lễ vẫn thu gom." },
      { match: "第5", label: "Thứ Tư, thứ Sáu tuần thứ 5", text: "Không thu gom." },
      { match: "集積所", label: "Điểm tập kết rác", text: "Điểm số 4 khu Kuroudodai 1-chōme (trước tòa nhà Kuroudodai Heights)." },
      { match: "手書き", label: "Ghi chú tay của gia đình", text: "Rác cỡ lớn phải gọi điện đặt trước (trước 2 tuần). Chai thủy tinh: thứ Tư tuần 2 và 4." },
      { match: "年末年始", label: "Nghỉ thu gom dịp cuối năm – đầu năm", text: "" },
    ],
    background: [
      {
        title: "Phân loại rác ở Nhật",
        text: "Ở Nhật, rác phải phân loại và mang ra đúng ngày, đúng giờ theo quy định của từng khu. Rác bỏ sai ngày có thể không được thu gom và bị dán giấy nhắc. Cách phân loại khác nhau tùy thành phố.",
      },
    ],
    checks: ["Lịch không ghi cách phân loại chi tiết từng món (ví dụ pin, bình xịt). Hãy xem tờ hướng dẫn phân loại của thành phố."],
  },
];

export function provisionalTranslation(
  doc: DocumentRecord,
  lang: LanguageCode,
): Omit<DocTranslation, "lang" | "draftSource" | "basis" | "translatedAt"> | undefined {
  const p = PREPARED.find((x) => x.lang === lang && doc.title.includes(x.titleIncludes));
  if (!p) return undefined;
  const items: TranslatedItem[] = [];
  const used = new Set<string>();
  for (const it of p.items) {
    const d = doc.deadlines.find((x) => x.label.includes(it.match) && !used.has(`d:${x.id}`));
    const f = d ? undefined : doc.fields.find((x) => x.label.includes(it.match) && !used.has(`f:${x.key}`));
    const ref = d ? `d:${d.id}` : f ? `f:${f.key}` : undefined;
    if (!ref) continue;
    used.add(ref);
    items.push({ ref, label: it.label, text: it.text });
  }
  return { title: p.title, what: p.what, todo: p.todo, items, background: p.background, checks: p.checks };
}

/** ほかの書類の予定の名前の、仮の訳（「家族に伝える」の「同じ日の家族の予定」に使う） */
const LABELS: { lang: LanguageCode; match: string; text: string }[] = [
  { lang: "vi", match: "出勤日", text: "Ngày đi làm (theo lịch làm việc của công ty)" },
  { lang: "vi", match: "運動会", text: "Hội thể thao của trường tiểu học" },
  { lang: "vi", match: "うんどうかい", text: "Hội thể thao của nhà trẻ" },
];

export function provisionalLabel(label: string, lang: LanguageCode): string | undefined {
  return LABELS.find((l) => l.lang === lang && label.includes(l.match))?.text;
}
