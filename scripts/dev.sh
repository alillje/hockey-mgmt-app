#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/toolchain.sh"
cd "$HOCKEY_ROOT"
export ASPNETCORE_ENVIRONMENT=Development

if ! command -v dotnet >/dev/null || ! dotnet --version | grep -q '^10\.'; then
  echo "Install the .NET 10 SDK before starting the app. See README.md." >&2
  exit 1
fi
if ! command -v node >/dev/null || ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo "Install Node.js 22.12+ before starting the app. See README.md." >&2
  exit 1
fi
if [ ! -d frontend/node_modules ]; then
  echo "Run npm ci in frontend before starting the app. See README.md." >&2
  exit 1
fi

if [ -f backend/HockeyTrainer.Api/appsettings.Local.json ] && [ "${HOCKEY_LOCAL_AUTH:-1}" = "1" ]; then
  export Auth__Mode=Supabase
  echo "Local Supabase sign-in enabled. Set HOCKEY_LOCAL_AUTH=0 to use the unauthenticated POC."
fi

api_pid=""
ui_pid=""
cleanup() {
  trap - EXIT INT TERM
  if [ -n "$api_pid" ]; then kill "$api_pid" 2>/dev/null || true; fi
  if [ -n "$ui_pid" ]; then kill "$ui_pid" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

dotnet run --project backend/HockeyTrainer.Api --no-launch-profile -- --urls http://127.0.0.1:5180 &
api_pid=$!
npm --prefix frontend run dev &
ui_pid=$!

echo "Hockey Trainer: http://localhost:5173 (API: http://127.0.0.1:5180)"
echo "Press Ctrl+C to stop both processes."
while kill -0 "$api_pid" 2>/dev/null && kill -0 "$ui_pid" 2>/dev/null; do
  sleep 1
done

echo "A development process exited; stopping the other process." >&2
exit 1
