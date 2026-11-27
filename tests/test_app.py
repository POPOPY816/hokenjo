import base64
import json
from datetime import date
from pathlib import Path

import pymupdf

from app import app
from hokenjo import pdf_fill, rules, wareki

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = json.loads((ROOT / "examples" / "sample.json").read_text(encoding="utf-8"))

# 1x1 の白い PNG
PNG = "data:image/png;base64," + base64.b64encode(
    pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, 4, 4), False).tobytes("png")).decode()


def text_of(pdf_bytes: bytes) -> list[str]:
    return [p.get_text() for p in pymupdf.open(stream=pdf_bytes, filetype="pdf")]


def test_wareki():
    d = date(2026, 12, 19)
    assert wareki.full(d) == "令和8年12月19日"
    assert wareki.period(d, date(2026, 12, 20)) == "令和8年12月19日（土）～12月20日（日）"
    assert wareki.reiwa_year(date(2019, 5, 1)) == "令和元"
    assert wareki.fiscal_year(date(2027, 3, 31)) == 2026


def test_build_all_contains_inputs():
    pages = text_of(pdf_fill.build_all(SAMPLE))
    # 届 1枚目 + 出店者3件 → 2ページ + 確認事項 + 名簿
    assert len(pages) == 5
    assert "中村本町商店街振興会" in pages[0]
    assert "第10回 本町ふれあい冬まつり" in pages[0]
    assert "令和8年12月19日（土）～12月20日（日）" in pages[0]
    assert "焼きそば" in pages[1] and "業種：菓子製造業" in pages[1]
    assert "かき氷屋 さくら" in pages[2]
    assert "幡多 花子" in pages[3]  # 確認事項（統括者）
    assert "山田 春代" in pages[4]  # 名簿


def test_many_shops_adds_renumbered_pages():
    data = dict(SAMPLE, include_meibo=False)
    data["shops"] = [dict(SAMPLE["shops"][0], name=f"出店者{i}") for i in range(1, 10)]
    pages = text_of(pdf_fill.build_all(data))
    # 届1 + 出店者9件で5ページ + 確認事項
    assert len(pages) == 7
    assert "出店者9" in pages[5]
    assert "９" in pages[5] and "１０" in pages[5]  # 原本にない5ページ目以降は番号を振り直す


def test_maps_pages():
    images = {"venue": PNG, "booths": [{"label": "1. 焼きそば", "png": PNG}, {"label": "2. 菓子", "png": PNG},
                                        {"label": "3. かき氷", "png": PNG}]}
    pages = text_of(pdf_fill.build_all(dict(SAMPLE, include_meibo=False), images))
    joined = "\n".join(pages)
    assert "催事全体がわかる平面図" in joined
    assert joined.count("各ブースレイアウト図") >= 2 + 1  # 2ページ（2件ずつ）＋届の添付書類欄


def test_rules():
    msgs = [w["message"] for w in rules.check(SAMPLE, today=date(2026, 11, 27))]
    assert any("フルーツ" in m for m in msgs)
    assert not any("年度4日を超え" in m for m in msgs)

    late = dict(SAMPLE, submit_date="2026-12-15")
    assert any("2週間前" in w["message"] for w in rules.check(late))

    over = json.loads(json.dumps(SAMPLE))
    over["shops"][0]["other_count"] = 3
    assert any(w["level"] == "error" and "年度4日を超え" in w["message"] for w in rules.check(over))


def test_api():
    c = app.test_client()
    assert c.get("/").status_code == 200
    r = c.post("/api/check", json={"data": SAMPLE})
    assert r.status_code == 200 and isinstance(r.get_json(), list)
    r = c.post("/api/generate", json={"data": SAMPLE, "images": {"venue": PNG}})
    assert r.status_code == 200 and r.data[:4] == b"%PDF"
    assert "filename*=UTF-8''" in r.headers["Content-Disposition"]
    assert c.get("/api/check-items").get_json()[0]["key"] == "supervisor"
