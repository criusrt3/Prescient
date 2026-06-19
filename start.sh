#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
VENV="$ROOT/.venv"

if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
fi
# shellcheck disable=SC1091
source "$VENV/bin/activate"

echo "==> 安装 Python 依赖"
pip install -q -r server/requirements.txt

echo "==> 启动 Odaily 代理 API (5181)"
python server/main.py &
API_PID=$!

sleep 1

echo "==> 启动前端 (5180)"
if command -v npm >/dev/null 2>&1; then
  npm install --silent 2>/dev/null || true
  npm run dev &
  FE_PID=$!
  trap "kill $API_PID $FE_PID 2>/dev/null" EXIT
  echo ""
  echo "  前端  http://localhost:5180"
  echo "  API   http://localhost:5181/api/health"
  wait
else
  NODE="/Applications/Cursor.app/Contents/Resources/app/resources/helpers/node"
  if [[ -x "$NODE" ]]; then
    "$NODE" ./node_modules/vite/bin/vite.js --config vite.config.ts &
    FE_PID=$!
    trap "kill $API_PID $FE_PID 2>/dev/null" EXIT
    echo ""
    echo "  前端  http://localhost:5180"
    echo "  API   http://localhost:5181/api/health"
    wait
  else
    trap "kill $API_PID 2>/dev/null" EXIT
    echo ""
    echo "  npm 未找到 · 仅 API: http://localhost:5181"
    echo "  手动运行前端: npm run dev"
    wait $API_PID
  fi
fi
