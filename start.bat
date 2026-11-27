@echo off
chcp 65001 > nul
cd /d %~dp0
echo 臨時食品調理販売届メーカーを準備しています...
python -m pip install -q -r requirements.txt
if errorlevel 1 (
  echo Python が見つからないか、インストールに失敗しました。README.md を確認してください。
  pause
  exit /b 1
)
echo ブラウザが開きます。終了するときはこの画面を閉じてください。
python app.py
pause
