// 和暦表記と入力チェック（保健所の資料「催物等において食品を提供する方へ」等に基づく注意喚起）。
// ブラウザでは window.Hokenjo.wareki / window.Hokenjo.rules、Node では require() で使う。
// チェックは目安。最終的な可否は保健所に確認すること。
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) module.exports = mod;
  else { root.Hokenjo = root.Hokenjo || {}; Object.assign(root.Hokenjo, mod); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------------------------------------------------------------- 和暦

  const WEEKDAYS = "日月火水木金土";

  function parse(value) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? { y, m, d, wd: dt.getUTCDay(), t: dt.getTime() } : null;
  }

  const reiwaYear = (dt) => (dt.y - 2018 === 1 ? "令和元" : `令和${dt.y - 2018}`);
  const full = (dt, weekday) => `${reiwaYear(dt)}年${dt.m}月${dt.d}日${weekday ? `（${WEEKDAYS[dt.wd]}）` : ""}`;
  const short = (dt) => `${dt.m}月${dt.d}日（${WEEKDAYS[dt.wd]}）`;

  function period(start, end) {
    if (!start) return "";
    if (!end || end.t === start.t) return full(start, true);
    if (end.y !== start.y) return `${full(start, true)}～${full(end, true)}`;
    return `${full(start, true)}～${short(end)}`;
  }

  const zen = (v) => String(v).replace(/[0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
  const daysBetween = (a, b) => Math.round((b.t - a.t) / 86400000);

  const wareki = { parse, reiwaYear, full, short, period, zen, daysBetween };

  // ---------------------------------------------------------------- チェック

  // 「催物等において食品を提供する方へ」３【提供できない食品】の例示から
  const NG_FOOD_WORDS = [
    ["おにぎり", "米飯類"], ["カレー", "米飯類・前日調理（ウェルシュ菌）"], ["焼き飯", "米飯類"], ["焼飯", "米飯類"],
    ["チャーハン", "米飯類"], ["寿司", "米飯類"], ["すし", "米飯類"], ["いなり", "米飯類"], ["ちらし", "米飯類"],
    ["丼", "米飯類"], ["刺身", "加熱せずに提供するもの"], ["タタキ", "加熱せずに提供するもの"],
    ["たたき", "加熱せずに提供するもの"], ["生卵", "加熱せずに提供するもの"], ["生肉", "加熱せずに提供するもの"],
    ["サラダ", "加熱せずに提供するもの"], ["冷や奴", "加熱せずに提供するもの"], ["冷奴", "加熱せずに提供するもの"],
    ["果物", "加熱せずに提供するもの"], ["フルーツ", "加熱せずに提供するもの"], ["ミント", "加熱せずに提供するもの"],
    ["生クリーム", "加熱せずに提供するもの"], ["パフェ", "加熱せずに提供するもの"],
    ["チョコバナナ", "加熱せずに提供するもの"], ["冷麺", "現地で最終加熱しないもの"],
    ["ざるそば", "現地で最終加熱しないもの"], ["ざるうどん", "現地で最終加熱しないもの"],
    ["そうめん", "現地で最終加熱しないもの"], ["素麺", "現地で最終加熱しないもの"],
    ["サンドイッチ", "現地で最終加熱しないもの"], ["タピオカ", "市販品以外を加えた飲料"],
    ["自家製", "自家製の飲料・食品"], ["手作りジュース", "市販品以外を加えた飲料"],
  ];

  // 確認事項（提出用）の項目。key は data.checks のキー
  const CHECK_ITEMS = [
    ["supervisor", "催物における食品衛生の統括者を決めている"],
    ["cooking_only", "調理を伴う食品は「最終加熱食品」「かき氷・アイス・飲料の小分け」のみ"],
    ["packaged_licensed", "調理しない食品は営業許可業者の製造品で、食品表示がある"],
    ["water", "使用水（水道水／それ以外は水質検査成績書を添付）"],
    ["handwash", "手洗い設備（40L以上のコック付きポリタンク／水道・シンク）と液体石けん"],
    ["alcohol", "食品を扱う場所にアルコールを置き、手指を消毒させる"],
    ["no_prep", "現地で下処理（洗う・切る・練る・刺す・包む・丸める等）はしない"],
    ["simple_cook", "現地の調理は煮る・焼く・揚げる・蒸す等の簡易な調理と盛付のみ"],
    ["temperature", "食材はクーラーボックス等で温度管理する"],
    ["clothes", "調理従事者は清潔な服装（エプロン・帽子等）"],
    ["sick", "体調不良（下痢・おう吐・手指の傷等）の人には調理させない"],
    ["eat_soon", "お客さんに早めの喫食を呼びかける"],
    ["inform", "主催者は注意事項を出店者に周知・遵守させる"],
    ["report", "体調を崩した等の情報があれば速やかに保健所へ報告する"],
    ["meibo", "求められたら「調理従事者名簿及び調理方法」をすぐ提出する"],
  ].map(([key, label]) => ({ key, label }));

  const MAX_DAYS_PER_YEAR = 4;
  const DEADLINE_DAYS = 14;
  const blank = (v) => !String(v ?? "").trim();
  const toInt = (v) => { const n = parseInt(String(v ?? "").trim(), 10); return Number.isFinite(n) ? n : 0; };

  function eventDays(data) {
    const ev = data.event || {};
    const start = parse(ev.start_date);
    if (!start) return 0;
    const end = parse(ev.end_date) || start;
    return Math.max(daysBetween(start, end) + 1, 1);
  }

  function ngFoods(text) {
    const found = [];
    for (const [word, reason] of NG_FOOD_WORDS)
      if ((text || "").includes(word) && !found.some(([f]) => f.includes(word))) found.push([word, reason]);
    return found;
  }

  function todayISO() {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  // 注意事項のリストを返す。level: error（このままだと受理されにくい）/ warn / info
  function check(data, today) {
    const out = [];
    const add = (level, message, where = "") => out.push({ level, message, where });
    const org = data.organizer || {};
    const ev = data.event || {};
    const shops = data.shops || [];

    for (const [k, label] of [["name", "主催団体名"], ["representative", "代表者氏名"], ["address", "住所"], ["contact", "担当者氏名・連絡先"]])
      if (blank(org[k])) add("error", `主催者の「${label}」が未入力です`, "organizer");
    for (const [k, label] of [["name", "開催名称"], ["place", "開催場所"], ["start_date", "開催日"]])
      if (blank(ev[k])) add("error", `イベントの「${label}」が未入力です`, "event");

    const start = parse(ev.start_date);
    const submit = parse(data.submit_date) || parse(today || todayISO());
    if (start && submit) {
      const left = daysBetween(submit, start);
      if (left < 0) add("error", "開催日が提出日より前になっています", "event");
      else if (left < DEADLINE_DAYS)
        add("warn", `開催まで${left}日です。届出は開催日の概ね2週間前までに提出してください。急ぎの場合は先に保健所へ電話で相談しましょう`, "event");
    }
    const end = parse(ev.end_date);
    if (start && end && end.t < start.t) add("error", "開催期間の終了日が開始日より前です", "event");

    if (ev.water === "other") add("info", "水道水以外を使う場合は、水質検査成績書（1年以内・写し可）を添付してください", "event");
    if (ev.has_flyer) add("info", "イベントのチラシを添付してください（添付書類③）", "event");
    if (!shops.length) add("error", "出店者が1件も登録されていません", "shops");

    const nDays = eventDays(data);
    shops.forEach((s, idx) => {
      const i = idx + 1;
      const name = String(s.name || "").trim() || `出店者${i}`;
      const where = `shop-${idx}`;
      if (blank(s.name)) add("error", `${i}番目の出店者の氏名が未入力です`, where);
      if (blank(s.foods)) add("error", `${name}：提供する食品が未入力です`, where);
      if (s.has_permit && blank(s.permit_type)) add("warn", `${name}：営業許可の業種を記入してください（例：飲食店営業）`, where);
      if (!s.has_permit) {
        for (const [word, reason] of ngFoods(s.foods))
          add("warn", `${name}：「${word}」は臨時届では原則提供できない食品の例です（${reason}）。保健所に事前確認してください`, where);
        if (blank(s.prep_process)) add("warn", `${name}：調理工程「下処理」欄は現地調理だけの場合も記入が必要です`, where);
        if (blank(s.onsite_process)) add("warn", `${name}：調理工程「現地」欄（仕入れ先も）を記入してください`, where);
      }
      const past = s.other_events ? toInt(s.other_count) : 0;
      const future = toInt(s.future_days);
      if (nDays && past + nDays > MAX_DAYS_PER_YEAR)
        add("error", `${name}：今年度の出店が今回で${past + nDays}日になり、年度4日を超えます。営業許可（屋台・キッチンカー等）が必要です`, where);
      else if (nDays && past + nDays + future > MAX_DAYS_PER_YEAR)
        add("warn", `${name}：今後の予定を含めると年度${past + nDays + future}日になり、4日を超える分は営業許可が必要です`, where);
      const staff = s.staff || [];
      if (data.include_meibo && !staff.length) add("warn", `${name}：調理従事者名簿を出力する設定ですが、従事者が未登録です`, where);
      if (data.include_meibo && staff.length && !staff.some((p) => p.leader))
        add("info", `${name}：調理従事者名簿で調理責任者に印を付けてください`, where);
    });

    const checks = data.checks || {};
    const missing = CHECK_ITEMS.filter((c) => !checks[c.key]).map((c) => c.label);
    if (missing.length) add("warn", "確認事項で未チェックの項目があります：" + missing.join("／"), "checks");
    if (checks.supervisor && blank(org.supervisor)) add("warn", "食品衛生の統括者の氏名を入力してください", "organizer");
    return out;
  }

  return { wareki, rules: { check, CHECK_ITEMS, NG_FOOD_WORDS, eventDays, ngFoods, todayISO } };
});
