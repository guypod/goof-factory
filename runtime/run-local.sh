#!/usr/bin/env bash
set -eo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
PORT=${PORT:-3007}
MONGO_PORT=${MONGO_PORT:-27019}
RUN_ID=${GOOF_FACTORY_RUN_ID:-$$}
MONGO_CONTAINER="goof-factory-mongo-${RUN_ID}"
APP_LOG=${APP_LOG:-$ROOT/runtime/app.log}
MONGO_LOG=${MONGO_LOG:-$ROOT/runtime/mongo.log}
CREATED_CONTAINER=0
MONGO_CONTAINER_ID=

cleanup() {
  if [ -n "${APP_PID:-}" ] && kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
  if [ "$CREATED_CONTAINER" = "1" ]; then
    if [ -n "$MONGO_CONTAINER_ID" ]; then
      docker rm -f "$MONGO_CONTAINER_ID" >/dev/null 2>&1 || true
    else
      docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
    fi
  fi
}
trap cleanup EXIT

if docker ps -a --format '{{.Names}}' | grep -Fx "$MONGO_CONTAINER" >/dev/null; then
  echo "Refusing to reuse existing container $MONGO_CONTAINER" >&2
  exit 1
fi

echo "[goof runtime] starting MongoDB 4.0.28 on 127.0.0.1:$MONGO_PORT"
MONGO_CONTAINER_ID=$(docker run --name "$MONGO_CONTAINER" \
  --publish "127.0.0.1:$MONGO_PORT:27017" \
  --detach mongo:4.0.28)
CREATED_CONTAINER=1
echo "[goof runtime] MongoDB container id $MONGO_CONTAINER_ID"

echo "[goof runtime] waiting for MongoDB"
for _ in $(seq 1 60); do
  if docker exec "$MONGO_CONTAINER" mongo --quiet --eval 'db.runCommand({ ping: 1 }).ok' > "$MONGO_LOG" 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$MONGO_CONTAINER" mongo --quiet --eval 'db.runCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
  echo "MongoDB did not become ready; last log follows" >&2
  cat "$MONGO_LOG" >&2 || true
  exit 1
fi

echo "[goof runtime] starting app on loopback port $PORT"
(
  cd "$ROOT"
  PORT="$PORT" \
  MONGODB_URI="mongodb://127.0.0.1:$MONGO_PORT/express-todo" \
  NODE_OPTIONS="--openssl-legacy-provider --require ./runtime/loopback-listen.js" \
  exec node app.js
) > "$APP_LOG" 2>&1 &
APP_PID=$!

echo "[goof runtime] waiting for app"
APP_READY=0
for _ in $(seq 1 60); do
  if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
    echo "App process exited before readiness; app log follows" >&2
    cat "$APP_LOG" >&2 || true
    exit 1
  fi
  if PORT="$PORT" node -e "const http=require('http'); const req=http.get('http://127.0.0.1:' + process.env.PORT + '/', r => process.exit(r.statusCode === 200 ? 0 : 1)); req.setTimeout(5000, () => req.destroy(new Error('readiness timed out'))); req.on('error', () => process.exit(1));"; then
    APP_READY=1
    break
  fi
  sleep 1
done
if [ "$APP_READY" != "1" ]; then
  echo "App did not become ready; app log follows" >&2
  cat "$APP_LOG" >&2 || true
  exit 1
fi
if ! kill -0 "$APP_PID" >/dev/null 2>&1; then
  echo "App process exited after readiness; app log follows" >&2
  cat "$APP_LOG" >&2 || true
  exit 1
fi

echo "[goof runtime] checking core todo behavior"
PORT="$PORT" node "$ROOT/runtime/check-core-todo.js"

echo "[goof runtime] core todo check passed; optional MySQL users subsystem not covered by this harness"
