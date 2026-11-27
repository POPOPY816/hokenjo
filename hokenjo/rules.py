"""入力内容のチェック（保健所の資料「催物等において食品を提供する方へ」等に基づく注意喚起）。

ここでの判定はあくまで目安。最終的な可否は保健所に確認すること。
"""

from __future__ import annotations

from datetime import date

from . import wareki

# 「催物等において食品を提供する方へ」３【提供できない食品】の例示から
NG_FOOD_WORDS = {
    "おにぎり": "米飯類",
    "カレーライス": "米飯類",
    "カレー": "米飯類・前日調理（ウェルシュ菌）",
    "焼き飯": "米飯類",
    "焼飯": "米飯類",
    "チャーハン": "米飯類",
    "寿司": "米飯類",
    "すし": "米飯類",
    "いなり": "米飯類",
    "ちらし": "米飯類",
    "丼": "米飯類",
    "刺身": "加熱せずに提供するもの",
    "タタキ": "加熱せずに提供するもの",
    "たたき": "加熱せずに提供するもの",
    "生卵": "加熱せずに提供するもの",
    "生肉": "加熱せずに提供するもの",
    "サラダ": "加熱せずに提供するもの",
    "冷や奴": "加熱せずに提供するもの",
    "冷奴": "加熱せずに提供するもの",
    "果物": "加熱せずに提供するもの",
    "フルーツ": "加熱せずに提供するもの",
    "ミント": "加熱せずに提供するもの",
    "生クリーム": "加熱せずに提供するもの",
    "パフェ": "加熱せずに提供するもの",
    "チョコバナナ": "加熱せずに提供するもの",
    "冷麺": "現地で最終加熱しないもの",
    "ざるそば": "現地で最終加熱しないもの",
    "ざるうどん": "現地で最終加熱しないもの",
    "そうめん": "現地で最終加熱しないもの",
    "素麺": "現地で最終加熱しないもの",
    "サンドイッチ": "現地で最終加熱しないもの",
    "タピオカ": "市販品以外を加えた飲料",
    "自家製": "自家製の飲料・食品",
    "手作りジュース": "市販品以外を加えた飲料",
}

# 確認事項（提出用）の項目。key は data["checks"] のキー。
CHECK_ITEMS = [
    ("supervisor", "催物における食品衛生の統括者を決めている"),
    ("cooking_only", "調理を伴う食品は「最終加熱食品」「かき氷・アイス・飲料の小分け」のみ"),
    ("packaged_licensed", "調理しない食品は営業許可業者の製造品で、食品表示がある"),
    ("water", "使用水（水道水／それ以外は水質検査成績書を添付）"),
    ("handwash", "手洗い設備（40L以上のコック付きポリタンク／水道・シンク）と液体石けん"),
    ("alcohol", "食品を扱う場所にアルコールを置き、手指を消毒させる"),
    ("no_prep", "現地で下処理（洗う・切る・練る・刺す・包む・丸める等）はしない"),
    ("simple_cook", "現地の調理は煮る・焼く・揚げる・蒸す等の簡易な調理と盛付のみ"),
    ("temperature", "食材はクーラーボックス等で温度管理する"),
    ("clothes", "調理従事者は清潔な服装（エプロン・帽子等）"),
    ("sick", "体調不良（下痢・おう吐・手指の傷等）の人には調理させない"),
    ("eat_soon", "お客さんに早めの喫食を呼びかける"),
    ("inform", "主催者は注意事項を出店者に周知・遵守させる"),
    ("report", "体調を崩した等の情報があれば速やかに保健所へ報告する"),
    ("meibo", "求められたら「調理従事者名簿及び調理方法」をすぐ提出する"),
]

MAX_DAYS_PER_YEAR = 4
DEADLINE_DAYS = 14


def event_days(data: dict) -> int:
    ev = data.get("event") or {}
    start = wareki.parse(ev.get("start_date"))
    end = wareki.parse(ev.get("end_date")) or start
    if not start:
        return 0
    return max((end - start).days + 1, 1)


def _int(v, default=0) -> int:
    try:
        return int(str(v).strip() or default)
    except ValueError:
        return default


def ng_foods(text: str) -> list[tuple[str, str]]:
    found = []
    for word, reason in NG_FOOD_WORDS.items():
        if word in (text or "") and not any(word in f for f, _ in found):
            found.append((word, reason))
    return found


def check(data: dict, today: date | None = None) -> list[dict]:
    """注意事項のリストを返す。level: error（このままだと受理されにくい）/ warn / info"""
    today = today or date.today()
    out: list[dict] = []

    def add(level, msg, where=""):
        out.append({"level": level, "message": msg, "where": where})

    org = data.get("organizer") or {}
    ev = data.get("event") or {}
    shops = data.get("shops") or []

    for key, label in [("name", "主催団体名"), ("representative", "代表者氏名"),
                       ("address", "住所"), ("contact", "担当者氏名・連絡先")]:
        if not (org.get(key) or "").strip():
            add("error", f"主催者の「{label}」が未入力です", "organizer")
    for key, label in [("name", "開催名称"), ("place", "開催場所"), ("start_date", "開催日")]:
        if not (ev.get(key) or "").strip():
            add("error", f"イベントの「{label}」が未入力です", "event")

    start = wareki.parse(ev.get("start_date"))
    submit = wareki.parse(data.get("submit_date")) or today
    if start:
        days_left = (start - submit).days
        if days_left < 0:
            add("error", "開催日が提出日より前になっています", "event")
        elif days_left < DEADLINE_DAYS:
            add("warn", f"開催まで{days_left}日です。届出は開催日の概ね2週間前までに提出してください。"
                        "急ぎの場合は先に保健所へ電話で相談しましょう", "event")
    end = wareki.parse(ev.get("end_date"))
    if start and end and end < start:
        add("error", "開催期間の終了日が開始日より前です", "event")

    if ev.get("water") == "other":
        add("info", "水道水以外を使う場合は、水質検査成績書（1年以内・写し可）を添付してください", "event")
    if ev.get("has_flyer"):
        add("info", "イベントのチラシを添付してください（添付書類③）", "event")

    if not shops:
        add("error", "出店者が1件も登録されていません", "shops")

    n_days = event_days(data)
    for i, s in enumerate(shops, 1):
        name = (s.get("name") or "").strip() or f"出店者{i}"
        where = f"shop-{i - 1}"
        if not (s.get("name") or "").strip():
            add("error", f"{i}番目の出店者の氏名が未入力です", where)
        if not (s.get("foods") or "").strip():
            add("error", f"{name}：提供する食品が未入力です", where)
        has_permit = bool(s.get("has_permit"))
        if has_permit and not (s.get("permit_type") or "").strip():
            add("warn", f"{name}：営業許可の業種を記入してください（例：飲食店営業）", where)
        if not has_permit:
            for word, reason in ng_foods(s.get("foods", "")):
                add("warn", f"{name}：「{word}」は臨時届では原則提供できない食品の例です（{reason}）。"
                            "保健所に事前確認してください", where)
            if not (s.get("prep_process") or "").strip():
                add("warn", f"{name}：調理工程「下処理」欄は現地調理だけの場合も記入が必要です", where)
            if not (s.get("onsite_process") or "").strip():
                add("warn", f"{name}：調理工程「現地」欄（仕入れ先も）を記入してください", where)
        past = _int(s.get("other_count")) if s.get("other_events") else 0
        future = _int(s.get("future_days"))
        if n_days and past + n_days > MAX_DAYS_PER_YEAR:
            add("error", f"{name}：今年度の出店が今回で{past + n_days}日になり、年度4日を超えます。"
                         "営業許可（屋台・キッチンカー等）が必要です", where)
        elif n_days and past + n_days + future > MAX_DAYS_PER_YEAR:
            add("warn", f"{name}：今後の予定を含めると年度{past + n_days + future}日になり、"
                        "4日を超える分は営業許可が必要です", where)
        if data.get("include_meibo") and not s.get("staff"):
            add("warn", f"{name}：調理従事者名簿を出力する設定ですが、従事者が未登録です", where)
        if data.get("include_meibo") and s.get("staff") and not any(p.get("leader") for p in s["staff"]):
            add("info", f"{name}：調理従事者名簿で調理責任者に印を付けてください", where)

    checks = data.get("checks") or {}
    missing = [label for key, label in CHECK_ITEMS if not checks.get(key, False)]
    if missing:
        add("warn", "確認事項で未チェックの項目があります：" + "／".join(missing), "checks")
    if checks.get("supervisor") and not (org.get("supervisor") or "").strip():
        add("warn", "食品衛生の統括者の氏名を入力してください", "organizer")

    return out
