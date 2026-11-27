"""和暦（令和）の表記ヘルパー。"""

from __future__ import annotations

from datetime import date

WEEKDAYS = "月火水木金土日"
_ZEN = str.maketrans("0123456789", "０１２３４５６７８９")


def parse(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def reiwa_year(d: date) -> str:
    y = d.year - 2018
    return "令和元" if y == 1 else f"令和{y}"


def full(d: date, weekday: bool = False) -> str:
    """令和8年12月10日（木）"""
    s = f"{reiwa_year(d)}年{d.month}月{d.day}日"
    if weekday:
        s += f"（{WEEKDAYS[d.weekday()]}）"
    return s


def short(d: date, weekday: bool = True) -> str:
    """12月10日（木）"""
    s = f"{d.month}月{d.day}日"
    if weekday:
        s += f"（{WEEKDAYS[d.weekday()]}）"
    return s


def period(start: date | None, end: date | None) -> str:
    if not start:
        return ""
    if not end or end == start:
        return full(start, weekday=True)
    if end.year != start.year:
        return f"{full(start, True)}～{full(end, True)}"
    return f"{full(start, True)}～{short(end)}"


def zen(value) -> str:
    """数字を全角にする（様式の「１」「２」に合わせる）。"""
    return str(value).translate(_ZEN)


def fiscal_year(d: date) -> int:
    """年度（4月始まり）。"""
    return d.year if d.month >= 4 else d.year - 1
