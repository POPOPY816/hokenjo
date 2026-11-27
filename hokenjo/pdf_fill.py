"""県の公式様式（PDF）の上に入力内容を書き込んで、提出用PDFを作る。

座標は forms/original/*.pdf（幡多福祉保健所 2024年4月版）から実測した値。
様式が改訂されたら、ここの座標を測り直すこと（tools/measure.py 参照）。
"""

from __future__ import annotations

import base64
import html
import math
from pathlib import Path

import pymupdf

from . import wareki

FORMS = Path(__file__).resolve().parent.parent / "forms" / "original"
TODOKE_PDF = FORMS / "臨時食品調理販売届.pdf"
KAKUNIN_PDF = FORMS / "確認事項.pdf"
MEIBO_PDF = FORMS / "調理従事者名簿.pdf"

BLACK = (0, 0, 0)
GREEN = (0.8, 1.0, 0.8)
FONT_PT = 10.5


# ---------------------------------------------------------------- 描画ヘルパー

def _css(size: float, align: str) -> str:
    return (f"* {{ font-family: sans-serif; font-size: {size}pt; line-height: 1.25; "
            f"text-align: {align}; margin: 0; padding: 0; }}")


def _html(text: str) -> str:
    return "<br>".join(html.escape(line) for line in str(text).splitlines()) or "&nbsp;"


def put(page: pymupdf.Page, rect, text, size: float = FONT_PT, align: str = "left",
        valign: str = "middle", min_scale: float = 0.45) -> None:
    """rect 内に text を書く。はみ出す場合は自動で縮小、縦位置も揃える。"""
    if text is None or str(text).strip() == "":
        return
    rect = pymupdf.Rect(rect)
    body, css = _html(text), _css(size, align)
    if valign != "top":
        # 一度仮に描いて余白を測ってから、縦方向の位置を決める
        probe = pymupdf.Rect(0, 0, rect.width, rect.height)
        scratch = pymupdf.open()
        spare, scale = scratch.new_page(width=rect.width, height=rect.height).insert_htmlbox(
            probe, body, css=css, scale_low=min_scale)
        scratch.close()
        if scale >= 1 and spare > 0:
            shift = spare / 2 if valign == "middle" else spare
            rect = pymupdf.Rect(rect.x0, rect.y0 + shift, rect.x1, rect.y1)
    page.insert_htmlbox(rect, body, css=css, scale_low=min_scale)


def tick(page: pymupdf.Page, x: float, y: float, box: float = 10.5) -> None:
    """□（左上が x, y）の中にチェック印を描く。フォントに依存しないようベクターで描画。"""
    s = box
    pts = [(x + s * 0.18, y + s * 0.52), (x + s * 0.42, y + s * 0.80), (x + s * 0.88, y + s * 0.12)]
    page.draw_polyline(pts, color=BLACK, width=1.3, closePath=False)


def circle(page: pymupdf.Page, rect) -> None:
    page.draw_oval(pymupdf.Rect(rect), color=BLACK, width=0.8)


def _text_width(text: str, size: float) -> float:
    return sum(size if ord(ch) > 0xFF else size * 0.55 for ch in text)


# ---------------------------------------------------------------- 臨時食品調理販売届

# 出店者欄（2ページ目以降）。列ごとの x 範囲
SHOP_COLS = [(223.2, 374.8), (374.8, 529.4)]
# 行の y 範囲
ROW = {
    "number": (88.8, 108.4),
    "name": (108.4, 162.4),
    "permit": (162.4, 234.4),
    "other": (234.4, 288.4),
    "days": (288.4, 324.4),
    "foods": (324.4, 360.4),
    "quantity": (360.4, 396.4),
    "prep_facility": (415.8, 469.3),
    "transport": (469.3, 523.3),
    "prep_process": (542.8, 607.7),
    "prep_storage": (607.7, 672.7),
    "onsite_process": (672.7, 737.8),
    "onsite_storage": (737.8, 802.8),
}
SHOPS_PER_PAGE = 2
TEMPLATE_SHOP_PAGES = 3  # 原本は 2～4 ページ目に出店者 1～6


def _shop_text(s: dict) -> str:
    lines = [s.get("name", ""), s.get("address", ""), s.get("tel", "")]
    return "\n".join(x.strip() for x in lines if x and x.strip())


def _fill_shop(page: pymupdf.Page, col: int, s: dict) -> None:
    x0, x1 = SHOP_COLS[col]
    pad = 3

    def cell(key, text, **kw):
        y0, y1 = ROW[key]
        put(page, (x0 + pad, y0 + 2, x1 - pad, y1 - 2), text, **kw)

    cell("name", _shop_text(s))

    # 食品衛生法での許可の有無（□有 y=164.3 / □無 y=218.8、□は x0+5.6）
    bx = x0 + 5.6
    if s.get("has_permit"):
        tick(page, bx, 164.3)
        kind = (s.get("permit_type") or "").strip()
        if kind:
            put(page, (x0 + pad, 177, x1 - pad, 216), f"業種：{kind}", size=10)
    else:
        tick(page, bx, 218.8)

    # 他の催物での出店（□有（ ○ 回目） y=242.7 / □無 y=269.9）
    if s.get("other_events"):
        tick(page, bx, 242.7)
        put(page, (x0 + 37.2, 240.5, x0 + 68.6, 255.5), str(s.get("other_count") or ""), align="center")
    else:
        tick(page, bx, 269.9)

    # 今後の出店予定日数（「日」は x0+70.8 付近に印字済み）
    days = str(s.get("future_days") if s.get("future_days") not in (None, "") else "0")
    put(page, (x0 + 10, 298.5, x0 + 69, 314.5), days, align="right")

    cell("foods", s.get("foods", ""))

    qty = str(s.get("quantity") or "").strip()
    if qty:
        put(page, (x0 + 10, 370.5, x0 + 69, 386.5), qty, align="right")
        if col == 1:  # 原本の2列目には「食」の印字がない
            put(page, (x0 + 70.8, 370.5, x0 + 90, 386.5), "食")

    for key in ("prep_facility", "transport", "prep_process", "prep_storage",
                "onsite_process", "onsite_storage"):
        cell(key, s.get(key, ""), size=10)


def _renumber(page: pymupdf.Page, first_no: int) -> None:
    for col, (x0, x1) in enumerate(SHOP_COLS):
        y0, y1 = ROW["number"]
        rect = pymupdf.Rect(x0 + 0.6, y0 + 0.7, x1 - 0.6, y1 - 0.3)
        page.draw_rect(rect, color=None, fill=GREEN, width=0)
        put(page, rect, wareki.zen(first_no + col), align="center")


def build_todoke(data: dict) -> pymupdf.Document:
    org = data.get("organizer") or {}
    ev = data.get("event") or {}
    shops = data.get("shops") or []

    src = pymupdf.open(TODOKE_PDF)
    doc = pymupdf.open()
    doc.insert_pdf(src, from_page=0, to_page=0)
    n_pages = max(1, math.ceil(len(shops) / SHOPS_PER_PAGE))
    for i in range(n_pages):
        # 原本の 2～4 ページを順に使い、足りなければ 4 ページ目を複製して番号を振り直す
        doc.insert_pdf(src, from_page=1 + min(i, TEMPLATE_SHOP_PAGES - 1),
                       to_page=1 + min(i, TEMPLATE_SHOP_PAGES - 1))
        if i >= TEMPLATE_SHOP_PAGES:
            _renumber(doc[-1], i * SHOPS_PER_PAGE + 1)

    p = doc[0]
    d = wareki.parse(data.get("submit_date"))
    if d:
        put(p, (370, 111, 428, 125.5), wareki.reiwa_year(d), align="right")
        put(p, (441, 111, 471, 125.5), str(d.month), align="center")
        put(p, (483, 111, 513, 125.5), str(d.day), align="center")

    x = 352
    put(p, (x, 245.5, 560, 261), org.get("name", ""))
    put(p, (x, 267.5, 560, 283), org.get("representative", ""))
    put(p, (x, 289.5, 560, 305), org.get("address", ""))
    put(p, (x, 311.5, 560, 327), org.get("contact", ""))

    start, end = wareki.parse(ev.get("start_date")), wareki.parse(ev.get("end_date"))
    period = wareki.period(start, end)
    if (ev.get("time") or "").strip():
        period += "\n" + ev["time"].strip()
    put(p, (156, 417, 516, 457), period)
    put(p, (156, 461, 516, 499), ev.get("name", ""))
    put(p, (156, 502.5, 516, 541), ev.get("place", ""))

    for i, s in enumerate(shops):
        _fill_shop(doc[1 + i // SHOPS_PER_PAGE], i % SHOPS_PER_PAGE, s)
    return doc


# ---------------------------------------------------------------- 確認事項

# (チェックのキー, 「主催団体確認欄」の□の左上 x, y)
KAKUNIN_BOXES = {
    "supervisor": (85.1, 151.5),
    "cooking_only": (85.1, 167.4),
    "packaged_licensed": (85.1, 199.4),
    "water_tap": (85.1, 231.3),
    "water_other": (84.1, 247.2),
    "handwash_tank": (85.1, 279.2),
    "handwash_sink": (84.1, 311.1),
    "alcohol": (85.1, 343.0),
    "no_prep": (85.1, 358.8),
    "simple_cook": (85.1, 374.8),
    "temperature": (85.1, 406.7),
    "clothes": (85.1, 422.7),
    "sick": (85.1, 438.6),
    "eat_soon": (85.1, 454.6),
    "inform": (85.1, 470.6),
    "report": (85.1, 486.5),
    "meibo": (85.1, 518.4),
}


def build_kakunin(data: dict) -> pymupdf.Document:
    org = data.get("organizer") or {}
    ev = data.get("event") or {}
    checks = dict(data.get("checks") or {})

    # 水・手洗いは選んだ方の行にだけチェック
    water_ok = checks.pop("water", False)
    hand_ok = checks.pop("handwash", False)
    if water_ok:
        checks["water_other" if ev.get("water") == "other" else "water_tap"] = True
    if hand_ok:
        checks["handwash_sink" if ev.get("handwash") == "sink" else "handwash_tank"] = True

    doc = pymupdf.open(KAKUNIN_PDF)
    p = doc[0]
    for key, (x, y) in KAKUNIN_BOXES.items():
        if checks.get(key):
            tick(p, x, y)

    put(p, (317, 149.5, 399, 164), org.get("supervisor", ""), align="center")

    d = wareki.parse(data.get("submit_date"))
    if d:
        put(p, (82, 584, 126.5, 598.5), wareki.reiwa_year(d), align="right", size=10)
        put(p, (138, 584, 158.5, 598.5), str(d.month), align="center")
        put(p, (169.5, 584, 190, 598.5), str(d.day), align="center")
    put(p, (334, 583, 523, 596), org.get("name", ""))
    put(p, (334, 607, 523, 620), org.get("representative", ""))
    put(p, (366, 631, 523, 644), org.get("checker", ""))
    return doc


# ---------------------------------------------------------------- 調理従事者名簿

MEIBO_COLS = {
    "item": (52.6, 157.6),
    "name": (157.6, 252.1),
    "address": (252.1, 399.1),
    "tel": (399.1, 504.1),
    "age": (504.1, 535.7),
    "role": (535.7, 787.7),
}
MEIBO_TOP, MEIBO_BOTTOM = 210.5, 528.5
MEIBO_LINE = 15.0


def _meibo_blocks(shops: list[dict]) -> list[dict]:
    blocks = []
    for s in shops:
        staff = [p for p in (s.get("staff") or []) if (p.get("name") or "").strip()]
        if not staff:
            continue
        role = (s.get("meibo_role") or "").strip()
        if not role:
            parts = []
            if (s.get("prep_process") or "").strip():
                parts.append(f"（下処理）{s['prep_process'].strip()}")
            if (s.get("onsite_process") or "").strip():
                parts.append(f"（現地）{s['onsite_process'].strip()}")
            role = "\n".join(parts)
        role_w = MEIBO_COLS["role"][1] - MEIBO_COLS["role"][0] - 8
        item_w = MEIBO_COLS["item"][1] - MEIBO_COLS["item"][0] - 6
        role_lines = sum(max(1, math.ceil(_text_width(t, 10) / role_w)) for t in role.splitlines()) if role else 1
        item_lines = max(1, math.ceil(_text_width(s.get("foods", ""), 10) / item_w))
        lines = max(len(staff), role_lines, item_lines)
        blocks.append({"item": s.get("foods", ""), "staff": staff, "role": role,
                       "height": lines * MEIBO_LINE + 6})
    return blocks


def build_meibo(data: dict) -> pymupdf.Document | None:
    blocks = _meibo_blocks(data.get("shops") or [])
    if not blocks:
        return None
    src = pymupdf.open(MEIBO_PDF)
    doc = pymupdf.open()
    page, y = None, MEIBO_BOTTOM + 1
    for b in blocks:
        h = min(b["height"], MEIBO_BOTTOM - MEIBO_TOP)
        if y + h > MEIBO_BOTTOM:
            doc.insert_pdf(src)
            page, y = doc[-1], MEIBO_TOP
        x0, x1 = MEIBO_COLS["item"]
        put(page, (x0 + 3, y + 2, x1 - 3, y + h - 2), b["item"], size=10)
        x0, x1 = MEIBO_COLS["role"]
        put(page, (x0 + 4, y + 2, x1 - 4, y + h - 2), b["role"], size=10)
        rows = b["staff"]
        line = min(MEIBO_LINE, (h - 6) / max(len(rows), 1))
        for j, person in enumerate(rows):
            ly = y + 3 + j * line
            for key in ("name", "address", "tel", "age"):
                x0, x1 = MEIBO_COLS[key]
                align = "center" if key == "age" else "left"
                put(page, (x0 + 5, ly, x1 - 3, ly + line), str(person.get(key, "") or ""),
                    size=min(10, line * 0.68), align=align, min_scale=0.3)
            if person.get("leader"):
                x0, _ = MEIBO_COLS["name"]
                w = _text_width(person.get("name", ""), min(10, line * 0.68))
                circle(page, (x0 + 1.5, ly + 0.5, x0 + 5 + w + 4, ly + line - 0.5))
        y += h
        page.draw_line((52.6, y), (787.7, y), color=BLACK, width=0.5)
    return doc


# ---------------------------------------------------------------- 平面図・ブースレイアウト図

def _image_bytes(data_url: str) -> bytes:
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    return base64.b64decode(data_url)


A4_LANDSCAPE = (841.89, 595.28)


def build_maps(data: dict, images: dict) -> pymupdf.Document | None:
    venue = images.get("venue")
    booths = [b for b in (images.get("booths") or []) if b.get("png")]
    if not venue and not booths:
        return None
    ev = data.get("event") or {}
    doc = pymupdf.open()
    W, H = A4_LANDSCAPE
    margin = 36

    if venue:
        p = doc.new_page(width=W, height=H)
        put(p, (margin, 24, W - margin, 46), "催事全体がわかる平面図（全ての出店店舗の配置が分かるもの）",
            size=14, valign="top")
        put(p, (margin, 48, W - margin, 64), f"開催名称：{ev.get('name', '')}　　開催場所：{ev.get('place', '')}",
            size=10, valign="top")
        p.insert_image(pymupdf.Rect(margin, 70, W - margin, H - margin), stream=_image_bytes(venue),
                       keep_proportion=True)

    per_page = 2
    for i in range(0, len(booths), per_page):
        p = doc.new_page(width=W, height=H)
        put(p, (margin, 24, W - margin, 46), "各ブースレイアウト図", size=14, valign="top")
        cell_w = (W - margin * 2 - 20) / per_page
        for j, b in enumerate(booths[i:i + per_page]):
            x = margin + j * (cell_w + 20)
            put(p, (x, 56, x + cell_w, 74), b.get("label", ""), size=11, valign="top")
            frame = pymupdf.Rect(x, 78, x + cell_w, H - margin)
            p.draw_rect(frame, color=(0.6, 0.6, 0.6), width=0.5)
            p.insert_image(frame + (4, 4, -4, -4), stream=_image_bytes(b["png"]), keep_proportion=True)
    return doc


# ---------------------------------------------------------------- まとめ

def build_all(data: dict, images: dict | None = None) -> bytes:
    """提出書類一式を1つのPDFにまとめる。
    順番：届 → ②平面図・ブース図 → ④確認事項 → ⑤調理従事者名簿（出力する場合）"""
    images = images or {}
    out = build_todoke(data)
    for part in (build_maps(data, images), build_kakunin(data),
                 build_meibo(data) if data.get("include_meibo") else None):
        if part is not None:
            out.insert_pdf(part)
    out.set_metadata({"title": "臨時食品調理販売届", "creator": "hokenjo"})
    # 文字を書くたびに日本語フォントが丸ごと埋め込まれるので、使った文字だけに絞って重複も除く
    out.subset_fonts()
    return out.tobytes(garbage=4, deflate=True)
