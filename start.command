#!/bin/bash
cd "$(dirname "$0")"
echo "臨時食品調理販売届メーカーを準備しています..."
python3 -m pip install -q -r requirements.txt || { echo "Python 3 が見つからないか、インストールに失敗しました。README.md を確認してください。"; read -r; exit 1; }
echo "ブラウザが開きます。終了するときはこのウィンドウを閉じてください。"
python3 app.py
