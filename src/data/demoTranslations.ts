// 執事の準備中（Claude API のキーが無いとき）に使う、見本の書類の仮の訳（ベトナム語・やさしい日本語）。
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
    titleIncludes: "授業参観・学級懇談会のご案内",
    lang: "vi",
    title: "Thông báo buổi dự giờ và họp phụ huynh lớp (học kỳ 2)",
    what: "Thông báo của trường tiểu học Kuroudo Daiichi (trường của bé Ren) về buổi dự giờ (jugyō sankan) và họp phụ huynh lớp học kỳ 2: giờ, phòng học, đồ cần mang.",
    todo: "Điền phiếu có đi / không đi (phần dưới đường cắt) và nộp cho giáo viên chủ nhiệm trước hạn. Hôm đó mang dép đi trong nhà và thẻ tên dành cho khách.",
    items: [
      { match: "授業参観・学級懇談会", label: "Dự giờ học kỳ 2 (phụ huynh đến xem lớp học) và họp phụ huynh lớp", text: "Phòng học của lớp 3-2 (tầng 2, phía đông). Mang: dép đi trong nhà, thẻ tên dành cho khách." },
      { match: "出欠票", label: "Nộp phiếu có đi / không đi (cho giáo viên chủ nhiệm)", text: "Phiếu ở phần dưới đường cắt của tờ thông báo." },
      { match: "日時", label: "Giờ", text: "Dự giờ: tiết 3, 10:45–11:30. Họp phụ huynh lớp: 11:40–12:10." },
      { match: "場所", label: "Nơi", text: "Phòng học của từng lớp (lớp 3-2 ở tầng 2, phía đông)." },
      { match: "持ち物", label: "Mang theo", text: "Dép đi trong nhà, thẻ tên dành cho khách." },
      { match: "お願い", label: "Lưu ý", text: "Không đến trường bằng ô tô. Không chụp ảnh, quay phim trong giờ học." },
    ],
    background: [
      {
        title: "Dự giờ (jugyō sankan) là gì?",
        text: "Ở Nhật, phụ huynh được mời đến trường xem con học trong lớp vài lần mỗi năm. Thường tổ chức vào ngày thường, nên nhiều phụ huynh đi làm xin nghỉ để đến. Không bắt buộc cả bố và mẹ cùng đi.",
      },
      {
        title: "Họp phụ huynh lớp (gakkyū kondankai) là gì?",
        text: "Sau buổi dự giờ, giáo viên chủ nhiệm và phụ huynh trong lớp nói chuyện về tình hình lớp. Thường không cần chuẩn bị gì đặc biệt.",
      },
    ],
    checks: ["Thông báo không ghi có cần đi cả hai buổi (dự giờ và họp) hay không. Phiếu cho phép trả lời riêng từng buổi."],
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
        text: "Ở Nhật, phụ huynh được mời đến trường xem con học trong lớp vài lần mỗi năm. Thường tổ chức vào ngày thường, nên nhiều phụ huynh đi làm xin nghỉ để đến.",
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
      { match: "クリスマス会", label: "Tiệc Giáng sinh lớp Risu", text: "Đưa bé đến lớp trước 9:15 (giờ đã sửa tay); tiệc từ 10:00 đến 10:45. Mang: một bộ quần áo thay, khăn." },
      { match: "訂正前", label: "Giờ đến lớp in trên giấy (trước khi sửa)", text: "Trước 9:30 (đã bị gạch hai đường)." },
      { match: "訂正の日", label: "Ai sửa và khi nào", text: "Giáo viên chủ nhiệm lớp Risu sửa (ghi chú tay ở góc trên bên phải, có ghi ngày sửa)." },
      { match: "帽子", label: "Mũ", text: "Nhà trẻ chuẩn bị (không cần mang)." },
      { match: "来られない", label: "Nếu phụ huynh không đến được", text: "Bé vẫn tham gia. Không cần báo." },
      { match: "お迎え", label: "Đón bé", text: "Như mọi ngày." },
    ],
    background: [],
    checks: [],
  },
  {
    titleIncludes: "親子ふれあいデー（保育参加）",
    lang: "vi",
    title: "Lớp Risu — Thông báo Ngày phụ huynh cùng con ở nhà trẻ",
    what: "Thông báo trên ứng dụng liên lạc của nhà trẻ Koguma: ngày phụ huynh cùng bé lớp Risu (lớp của bé Yui) tham gia một phần sinh hoạt ở nhà trẻ.",
    todo: "Hôm đó, phụ huynh và bé cùng đến nhà trẻ lúc 9:30 (khác giờ thường ngày). Thời khóa biểu và đồ mang theo có trong file đính kèm — hãy lưu file trước khi hết hạn đăng.",
    items: [
      { match: "親子ふれあいデー", label: "Ngày phụ huynh cùng con — lớp Risu", text: "Phụ huynh và bé cùng đến lớp (khác giờ thường ngày)." },
      { match: "添付ファイル", label: "Lưu file đính kèm (thời khóa biểu cho phụ huynh)", text: "Sau ngày này, file không còn trên ứng dụng." },
      { match: "集合の時刻", label: "Giờ đến", text: "9:30, phụ huynh và bé cùng đến (khác giờ thường ngày)." },
      { match: "晴れか雨か", label: "Trời nắng hay mưa", text: "Khoảng 7 giờ sáng hôm đó, nhà trẻ báo trên ứng dụng là theo kế hoạch ngày nắng hay ngày mưa." },
      { match: "添付ファイル", label: "File đính kèm", text: "Thời khóa biểu cho phụ huynh (PDF)." },
    ],
    background: [
      {
        title: "\"Hoiku sanka\" (phụ huynh tham gia sinh hoạt ở nhà trẻ) là gì?",
        text: "Ở nhiều nhà trẻ Nhật, phụ huynh được mời vào lớp cùng con trong một buổi để xem và cùng tham gia sinh hoạt hằng ngày.",
      },
    ],
    checks: ["Thông báo không ghi đồ mang theo. Hãy xem file đính kèm (thời khóa biểu)."],
  },
  {
    titleIncludes: "一斉清掃",
    lang: "vi",
    title: "Hội khu phố Kuroudodai 1-chōme — Tổng vệ sinh mùa thu và trực điểm tập kết rác",
    what: "Giấy thông báo luân phiên (kairanban) của hội khu phố: tổng vệ sinh mùa thu, và phiên trực điểm tập kết rác của tổ 4 (tổ 4 là tòa Kuroudodai Heights và 1-chōme số 2).",
    todo: "Mỗi hộ cử ít nhất 1 người tham gia tổng vệ sinh. Nếu không tham gia được, báo cho tổ trưởng trước 1 ngày (có thể dùng phiếu báo vắng ở cuối giấy). Nhà mình (cùng nhà Ubayashi) có phiên trực dọn nhà sinh hoạt cộng đồng của tổ 4 — ngày giờ xem ở mục bên dưới.",
    items: [
      { match: "一斉清掃", label: "Tổng vệ sinh mùa thu", text: "Tập trung ở công viên Kuroudodai 1-chōme trước 7:55. Mang: găng tay, chổi (túi rác và kẹp gắp do hội chuẩn bị)." },
      { match: "参加できない", label: "Báo nếu không tham gia được (cho tổ trưởng)", text: "Trước 1 ngày. Có thể dùng phiếu báo vắng ở cuối giấy." },
      { match: "ごみ集積所の当番", label: "Trực điểm tập kết rác (tổ 4)", text: "Sáng các ngày thu gom (thứ Hai, thứ Năm): dọn lưới và quét điểm tập kết. Thứ tự trực do tổ trưởng quyết định và sẽ báo sau." },
      { match: "雨天", label: "Nếu trời mưa", text: "Làm vào Chủ nhật tuần sau, cùng giờ." },
      { match: "4班の担当", label: "Chỗ tổ 4 phụ trách (hôm tổng vệ sinh)", text: "Điểm tập kết rác và rãnh thoát nước." },
      { match: "集会所の清掃当番", label: "Trực dọn vệ sinh nhà sinh hoạt cộng đồng (tổ 4)", text: "Mỗi lần 2 hộ: nhà Hinata (nhà mình) và nhà Ubayashi. Làm ở nhà sinh hoạt cộng đồng (shūkaisho)." },
    ],
    background: [
      {
        title: "Hội khu phố (chōnaikai) và giấy luân phiên (kairanban) là gì?",
        text: "Ở Nhật, nhiều khu dân cư có hội khu phố. Thông báo thường được chuyền từ nhà này sang nhà khác bằng tấm bảng kẹp giấy (kairanban); đọc xong thì đóng dấu hoặc ký vào ô xác nhận rồi chuyển cho nhà tiếp theo.",
      },
    ],
    checks: ["Giấy không ghi ngày cụ thể nhà mình trực rác. Thứ tự trực do tổ trưởng quyết định và sẽ báo sau."],
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
  // ---- やさしい日本語（子どもにも読める形。ひらがな・分かち書き）。蓮に関係する書類だけ ----
  {
    titleIncludes: "授業参観・学級懇談会のご案内",
    lang: "ja-easy",
    title: "2がっき じゅぎょうさんかん・がっきゅうこんだんかい の おしらせ",
    what: "れんさんの がっこう（くろうど だいいち しょうがっこう）からの おしらせです。2がっきの じゅぎょうさんかん と がっきゅうこんだんかい の、じかん・ばしょ・もちもの が かいて あります。",
    todo: "きりとりせんの したの「しゅっけつひょう」に、いく か いかない か を かいて、しめきりまでに たんにんの せんせいに だします。その日は、うわばき（スリッパ）と なふだ（きた ひと よう）を もって いきます。",
    items: [
      { match: "授業参観・学級懇談会", label: "じゅぎょうさんかん（2がっき）・がっきゅうこんだんかい", text: "3ねん2くみの きょうしつ（2かい の ひがしがわ）。もちもの: うわばき（スリッパ）、なふだ（きた ひと よう）。" },
      { match: "出欠票", label: "しゅっけつひょう（いく・いかない の かみ）を だす（たんにんの せんせいへ）", text: "かみは、おしらせの きりとりせんの したに あります。" },
      { match: "日時", label: "じかん", text: "じゅぎょうさんかん: 3じかんめ 10:45〜11:30。がっきゅうこんだんかい: 11:40〜12:10。" },
      { match: "場所", label: "ばしょ", text: "それぞれの クラスの きょうしつ（3ねん2くみは 2かい の ひがしがわ）。" },
      { match: "持ち物", label: "もちもの", text: "うわばき（スリッパ）、なふだ（きた ひと よう）。" },
      { match: "お願い", label: "おねがい", text: "くるまで こないで ください。じゅぎょうの あいだ、しゃしんや どうがを とらないで ください。" },
    ],
    background: [
      {
        title: "じゅぎょうさんかん って なに？",
        text: "にほんの がっこうでは、1ねんに なんかいか、おうちの ひとが きょうしつに きて、こどもが べんきょうする ようすを みます。へいじつに することが おおいです。おとうさんと おかあさんの ふたりで いかなくても だいじょうぶです。",
      },
      {
        title: "がっきゅうこんだんかい って なに？",
        text: "じゅぎょうさんかんの あとに、たんにんの せんせいと クラスの おうちの ひとが、クラスの ようすを はなします。ふつうは、とくべつな じゅんびは いりません。",
      },
    ],
    checks: ["じゅぎょうさんかん と がっきゅうこんだんかい の りょうほうに いく ひつようが あるかは、かいて ありません。しゅっけつひょうでは、べつべつに こたえられます。"],
  },
  {
    titleIncludes: "3年生だより なかよし",
    lang: "ja-easy",
    title: "3ねんせい だより「なかよし」（11がつ）",
    what: "れんさんの がっこう（くろうど だいいち しょうがっこう）の、3ねんせいの おたより（11がつ）です。クラスの ようす・11がつの おもな よてい・じゅぎょうさんかん と がっきゅうこんだんかい・おしらせと おねがい が かいて あります。",
    todo: "えんそくの 日は、おべんとう・すいとう・しきもの・あまぐ を もって いきます。まいにち、ハンカチ・ティッシュ・れんらくちょう を もって いきます。がっこうを やすむ・おくれる ときは、あさ 8:00 までに れんらくの アプリで つたえます。",
    items: [
      { match: "遠足", label: "えんそく（しみんの もり）", text: "もちもの: おべんとう、すいとう、しきもの、あまぐ。かえるのは 15:00 ごろ。" },
      { match: "運動会の予備日", label: "うんどうかいの よびび", text: "あめで うんどうかいが できない ときは、この 日に します。" },
      { match: "運動会", label: "うんどうかい", text: "8:10 までに がっこうへ。かえるのは 14:30 ごろ。" },
      { match: "振替休業日", label: "ふりかえ きゅうぎょうび（がっこうは おやすみ）", text: "うんどうかいの ぶんの おやすみです。" },
      { match: "授業参観（2学期）", label: "じゅぎょうさんかん（2がっき）・がっきゅうこんだんかい", text: "じゅぎょうさんかん 3じかんめ 10:45〜11:30、がっきゅうこんだんかい 11:40〜12:10。おうちの ひとの もちもの: うわばき（スリッパ）、なふだ（きた ひと よう）。" },
      { match: "出欠票", label: "じゅぎょうさんかんの しゅっけつひょうを だす（たんにんの せんせいへ）", text: "しゅっけつひょうは、あとで くばる おしらせに あります。" },
      { match: "個別懇談会", label: "こべつ こんだんかい", text: "じゅぎょうが みじかい 日（たんしゅく にっか）です。" },
      { match: "学習発表会", label: "がくしゅう はっぴょうかい", text: "13:30 から、たいいくかんで。3ねんせいは「くろうどし たんけんたい」（げきと うた）。" },
      { match: "毎日の持ち物", label: "まいにちの もちもの", text: "ハンカチ、ティッシュ、れんらくちょう。" },
      { match: "欠席・遅刻", label: "やすむ・おくれる ときの れんらく", text: "あさ 8:00 までに、れんらくの アプリで。" },
      { match: "日課", label: "まいにちの じかんわり（3ねんせい）", text: "げつ・すい・きんは 6じかんめまで（15:40 ごろ かえる）、か・もくは 5じかんめまで（14:50 ごろ かえる）。" },
      { match: "3年生の発表", label: "3ねんせいの はっぴょう", text: "「くろうどし たんけんたい」（げきと うた）。せりふの カードを もって かえります。" },
      { match: "授業参観の内容", label: "じゅぎょうさんかんで する べんきょう", text: "さんすう「しょうすう」。" },
      { match: "授業参観のお願い", label: "じゅぎょうさんかんの おねがい", text: "くるまで こないで ください。じゅぎょうの あいだ、しゃしんや どうがを とらないで ください。" },
    ],
    background: [
      {
        title: "えんそく って なに？",
        text: "クラスや がくねんの みんなで、こうえんや もりなどへ でかけて、そとで まなぶ 日です。おべんとうを もって いく ことが おおいです。",
      },
      { title: "よびび って なに？", text: "あめなどで できない ときに、かわりに する 日です。" },
    ],
    checks: ["えんそくの 日が あめの ときに どう なるかは、かいて ありません（もちものに あまぐ が あります）。"],
  },
  {
    titleIncludes: "3学年だより",
    lang: "ja-easy",
    title: "3ねんせいの おたより",
    what: "れんさんの がっこう（くろうど だいいち しょうがっこう）の、3ねんせいの おたよりです。2がっきの じゅぎょうさんかんの 日が かいて あります。",
    todo: "じゅぎょうさんかんの じかんと きょうしつは、あとで くばる おしらせで わかります。うわぎに なまえを かきます。がっこうを やすむ ときは、あさ 8:00 までに れんらくの アプリで つたえます。",
    items: [
      { match: "授業参観（2学期）", label: "じゅぎょうさんかん（2がっき）", text: "じかんと きょうしつは、あとで くばる おしらせで つたえます。" },
      { match: "授業参観の時間", label: "じゅぎょうさんかんの じかん・きょうしつ", text: "あとで くばる おしらせで つたえます。" },
    ],
    background: [
      {
        title: "じゅぎょうさんかん って なに？",
        text: "にほんの がっこうでは、1ねんに なんかいか、おうちの ひとが きょうしつに きて、こどもが べんきょうする ようすを みます。へいじつに することが おおいです。",
      },
    ],
    checks: ["じゅぎょうさんかんの じかんと きょうしつは、まだ かいて ありません。あとで くばる おしらせを みて ください（れんさんの ランドセルの なかに あるかも しれません）。"],
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
  // 勤務の予定（出勤日（平日）・出勤（日勤 8:30〜17:30）など）は、ここで訳さずコードで言い換える（tellBuild の WORK_WORDS。早番・遅番も正しく出る）
  { lang: "vi", match: "授業参観", text: "Dự giờ (phụ huynh đến xem lớp học)" },
  { lang: "vi", match: "運動会", text: "Hội thể thao của trường tiểu học" },
  { lang: "vi", match: "うんどうかい", text: "Hội thể thao của nhà trẻ" },
  { lang: "vi", match: "一斉清掃", text: "Tổng vệ sinh khu phố" },
  { lang: "vi", match: "集会所の清掃当番", text: "Trực dọn nhà sinh hoạt cộng đồng (tổ 4)" },
  { lang: "vi", match: "親子ふれあいデー", text: "Ngày phụ huynh cùng con ở nhà trẻ" },
  { lang: "ja-easy", match: "授業参観", text: "じゅぎょうさんかん（おうちの ひとが きょうしつに いく 日）" },
  { lang: "ja-easy", match: "運動会", text: "しょうがっこうの うんどうかい" },
  { lang: "ja-easy", match: "うんどうかい", text: "ほいくえんの うんどうかい" },
  { lang: "ja-easy", match: "一斉清掃", text: "まちの おおそうじ" },
  { lang: "ja-easy", match: "集会所の清掃当番", text: "しゅうかいじょの そうじ とうばん（4はん）" },
  { lang: "ja-easy", match: "親子ふれあいデー", text: "ほいくえんの おやこ ふれあいデー" },
];

export function provisionalLabel(label: string, lang: LanguageCode): string | undefined {
  return LABELS.find((l) => l.lang === lang && label.includes(l.match))?.text;
}
