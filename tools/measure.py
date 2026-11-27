"""様式PDFの文字・罫線の座標を表示する（様式改訂時に pdf_fill.py の座標を測り直す用）。

    python tools/measure.py forms/original/臨時食品調理販売届.pdf [ページ番号(0始まり)]
"""

import sys

import pymupdf


def main() -> None:
    path = sys.argv[1]
    pages = [int(sys.argv[2])] if len(sys.argv) > 2 else None
    doc = pymupdf.open(path)
    for pn, page in enumerate(doc):
        if pages is not None and pn not in pages:
            continue
        print(f"===== page {pn}  {page.rect}")
        for w in page.get_text("words"):
            print(f"  文字 x={w[0]:.1f}-{w[2]:.1f} y={w[1]:.1f}-{w[3]:.1f}  {w[4]}")
        xs, ys = set(), set()
        for d in page.get_drawings():
            for it in d["items"]:
                if it[0] == "re":
                    r = it[1]
                    if r.width < 2:
                        xs.add(round(r.x0, 1))
                    elif r.height < 2:
                        ys.add(round(r.y0, 1))
                elif it[0] == "l":
                    a, b = it[1], it[2]
                    if abs(a.x - b.x) < 1:
                        xs.add(round(a.x, 1))
                    if abs(a.y - b.y) < 1:
                        ys.add(round(a.y, 1))
        print("  縦罫線 x:", sorted(xs))
        print("  横罫線 y:", sorted(ys))


if __name__ == "__main__":
    main()
