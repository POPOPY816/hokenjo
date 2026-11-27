"""臨時食品調理販売届 作成アプリ（幡多福祉保健所管内向け）

起動:
    pip install -r requirements.txt
    python app.py
ブラウザで http://127.0.0.1:5000 を開く。
"""

from __future__ import annotations

import os
import re
import threading
import webbrowser
from datetime import date
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_from_directory

from hokenjo import pdf_fill, rules

app = Flask(__name__, static_folder="static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024  # 図面画像を含むため


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.get("/forms/<path:name>")
def original_forms(name: str):
    """県の原本PDF（注意事項の資料など）をそのまま見られるようにする。"""
    return send_from_directory(pdf_fill.FORMS, name)


@app.get("/api/check-items")
def check_items():
    return jsonify([{"key": k, "label": v} for k, v in rules.CHECK_ITEMS])


@app.post("/api/check")
def check():
    data = request.get_json(force=True) or {}
    return jsonify(rules.check(data.get("data") or data))


def _filename(data: dict) -> str:
    ev = data.get("event") or {}
    name = re.sub(r'[\\/:*?"<>|\s]+', "_", (ev.get("name") or "").strip())[:40]
    day = (ev.get("start_date") or date.today().isoformat()).replace("-", "")
    return "_".join(x for x in ("臨時食品調理販売届", day, name) if x) + ".pdf"


@app.post("/api/generate")
def generate():
    payload = request.get_json(force=True) or {}
    data = payload.get("data") or {}
    images = payload.get("images") or {}
    pdf = pdf_fill.build_all(data, images)
    fname = _filename(data)
    disposition = "inline" if payload.get("inline") else "attachment"
    return Response(
        pdf,
        mimetype="application/pdf",
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(fname)}"},
    )


def main() -> None:
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "5000"))
    if host == "127.0.0.1" and not os.environ.get("NO_BROWSER"):
        threading.Timer(1.0, lambda: webbrowser.open(f"http://{host}:{port}")).start()
    app.run(host=host, port=port, debug=bool(os.environ.get("DEBUG")))


if __name__ == "__main__":
    main()
