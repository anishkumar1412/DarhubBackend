#!/usr/bin/env bash
# Restarts ONLY the local test server (processes whose ENV_FILE is tests/e2e/.env.test).
S=$(cd "$(dirname "$0")" && pwd)
for p in $(pgrep -f "node server.js"); do
  tr '\0' '\n' < /proc/$p/environ 2>/dev/null | grep -qx "ENV_FILE=$S/.env.test" && kill "$p"
done
for i in $(seq 1 20); do ss -ltn | grep -q ':5799 ' || break; sleep 0.5; done
# The subshell itself is redirected (not just node) and `exec` replaces it: otherwise it keeps the caller's pipe open
# and `run.sh | tail` never returns.
( cd "$S/../.." && ENV_FILE=$S/.env.test exec setsid node server.js ) > "$S/server.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -s localhost:5799/health | grep -q ok && { echo "test server up (pid $(pgrep -f 'node server.js' | tail -1))"; exit 0; }; sleep 1; done
echo "server did not start"; tail -20 "$S/server.log"; exit 1
