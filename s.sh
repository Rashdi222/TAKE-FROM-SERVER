#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK_DIR="$ROOT_DIR/back"
NEXT_DIR="$ROOT_DIR/next"
AI_DIR="$ROOT_DIR/ai_engine"
SCRAPER_DIR="$ROOT_DIR/scraper"

if [[ ! -d "$BACK_DIR" ]]; then
  echo "[s.sh] Missing backend dir: $BACK_DIR" >&2
  exit 1
fi

if [[ ! -d "$NEXT_DIR" ]]; then
  echo "[s.sh] Missing frontend dir: $NEXT_DIR" >&2
  exit 1
fi

if [[ ! -d "$AI_DIR" ]]; then
  echo "[s.sh] Missing ai engine dir: $AI_DIR" >&2
  exit 1
fi

PREFIX_RESET=$'\033[0m'
PREFIX_BACK=$'\033[1;34m[back]\033[0m '
PREFIX_NEXT=$'\033[1;35m[next]\033[0m '
PREFIX_AI=$'\033[1;36m[ai]\033[0m '
PREFIX_REDIS=$'\033[1;31m[redis]\033[0m '
PREFIX_SCRAPER=$'\033[1;33m[scraper]\033[0m '
PREFIX_SSH=$'\033[1;32m[s.sh]\033[0m '

log() {
  printf '%s%s\n' "$PREFIX_SSH" "$*"
}

process_args() {
  local pid="$1"
  ps -p "$pid" -o args= 2>/dev/null || true
}

is_expected_listener() {
  local port="$1"
  local args="$2"

  case "$port" in
    3000)
      [[ "$args" == *"next dev"* ]] && return 0
      ;;
    4000)
      [[ "$args" == *"mix phx.server"* ]] && return 0
      ;;
    8001)
      [[ "$args" == *"uvicorn main:app"* ]] && return 0
      ;;
  esac

  return 1
}

wait_for_port_release() {
  local port="$1"
  local retries=20

  while (( retries > 0 )); do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.2
    retries=$((retries - 1))
  done

  return 1
}

ensure_port_available() {
  local port="$1"
  local service="$2"
  local pids pid args

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | sort -u || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  log "Port $port already in use; checking existing listener(s) for $service"
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    args="$(process_args "$pid")"

    if is_expected_listener "$port" "$args"; then
      log "Stopping stale $service listener PID=$pid ($args)"
      kill "$pid" >/dev/null 2>&1 || true
    else
      log "Port $port used by PID=$pid ($args)"
      log "Refusing to kill unknown process. Stop it manually, then rerun s.sh."
      exit 1
    fi
  done <<< "$pids"

  if ! wait_for_port_release "$port"; then
    log "Port $port is still busy after stopping stale $service process."
    exit 1
  fi
}

prefix_stream() {
  local prefix="$1"
  sed -u "s/^/${prefix}/"
}

cleanup() {
  for pid_var in SCRAPER_PID REDIS_PID AI_PID BACK_PID NEXT_PID; do
    local pid="${!pid_var:-}"
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}

trap cleanup EXIT INT TERM

AI_UVICORN="$AI_DIR/.venv/bin/uvicorn"

if [[ ! -x "$AI_UVICORN" ]]; then
  log "Missing uvicorn in ai_engine venv: $AI_UVICORN"
  exit 1
fi

if [[ -f "$SCRAPER_DIR/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$SCRAPER_DIR/.env"
  set +a
fi

export MULTI_SOURCE_ARBITER_ENABLED="${MULTI_SOURCE_ARBITER_ENABLED:-true}"
export MULTI_SOURCE_REDIS_URL="${MULTI_SOURCE_REDIS_URL:-redis://127.0.0.1:6379}"
export ENABLE_CANONICAL_LIVE_TRADING="${ENABLE_CANONICAL_LIVE_TRADING:-false}"
export NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING="${NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING:-$ENABLE_CANONICAL_LIVE_TRADING}"

scraper_status() {
  local transport="${SCRAPER_TRANSPORT:-websocket}"
  if [[ "$transport" == "polling" ]]; then
    if [[ -z "${SCRAPER_POLL_URL:-}" ]]; then
      printf 'standby (waiting for cached/UI control config; SCRAPER_POLL_URL missing in .env)'
    else
      printf 'configured (polling)'
    fi
    return
  fi

  if [[ -z "${SCRAPER_WS_URL:-}" ]]; then
    printf 'standby (waiting for control:scrapers update)'
    return
  fi

  if [[ -z "${SCRAPER_BOOTSTRAP_URL:-}" ]]; then
    printf 'partial (SCRAPER_BOOTSTRAP_URL missing, derived at runtime)'
    return
  fi

  printf 'configured'
}

print_banner() {
  log "Startup configuration"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  MULTI_SOURCE_ARBITER_ENABLED" "$PREFIX_RESET" "$MULTI_SOURCE_ARBITER_ENABLED"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  ENABLE_CANONICAL_LIVE_TRADING" "$PREFIX_RESET" "$ENABLE_CANONICAL_LIVE_TRADING"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING" "$PREFIX_RESET" "$NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  MULTI_SOURCE_REDIS_URL" "$PREFIX_RESET" "$MULTI_SOURCE_REDIS_URL"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_STATUS" "$PREFIX_RESET" "$(scraper_status)"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_TRANSPORT" "$PREFIX_RESET" "${SCRAPER_TRANSPORT:-websocket}"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_WS_URL" "$PREFIX_RESET" "${SCRAPER_WS_URL:-<not set>}"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_POLL_URL" "$PREFIX_RESET" "${SCRAPER_POLL_URL:-<not set>}"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_PARSER" "$PREFIX_RESET" "${SCRAPER_PARSER:-generic_json}"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_NAME" "$PREFIX_RESET" "${SCRAPER_NAME:-provider_a_worker}"
  printf '%b%-34s%b %s\n' "$PREFIX_SSH" "  SCRAPER_CONTROL_SOURCE" "$PREFIX_RESET" "Redis cached control + live UI PubSub can override blank .env values"
}

start_redis() {
  if command -v redis-cli >/dev/null 2>&1 && redis-cli -u "$MULTI_SOURCE_REDIS_URL" ping >/dev/null 2>&1; then
    log "Redis already reachable at $MULTI_SOURCE_REDIS_URL"
    return
  fi

  if ! command -v redis-server >/dev/null 2>&1; then
    log "redis-server not found. Skipping managed Redis startup."
    return
  fi

  log "Starting Redis for multi-source ingress"
  stdbuf -oL -eL redis-server --save "" --appendonly no 2>&1 | prefix_stream "$PREFIX_REDIS" &
  REDIS_PID=$!
}

start_scraper() {
  if [[ ! -d "$SCRAPER_DIR" ]]; then
    log "Scraper dir missing. Skipping scraper startup."
    return
  fi

  export SCRAPER_REDIS_URL="${SCRAPER_REDIS_URL:-$MULTI_SOURCE_REDIS_URL}"
  export SCRAPER_PARSER="${SCRAPER_PARSER:-generic_json}"
  export SCRAPER_NAME="${SCRAPER_NAME:-provider_a_worker}"

  log "Starting Rust scraper: cargo run (${SCRAPER_NAME}, parser=${SCRAPER_PARSER}, transport=${SCRAPER_TRANSPORT:-websocket})"
  (
    cd "$SCRAPER_DIR" &&
      stdbuf -oL -eL cargo run 2>&1 | prefix_stream "$PREFIX_SCRAPER"
  ) &
  SCRAPER_PID=$!
}

start_redis

print_banner

ensure_port_available 8001 "ai engine"
ensure_port_available 4000 "backend"
ensure_port_available 3000 "frontend"

log "Starting AI engine: uvicorn main:app --host 127.0.0.1 --port 8001"
(cd "$AI_DIR" && stdbuf -oL -eL "$AI_UVICORN" main:app --host 127.0.0.1 --port 8001 2>&1 | prefix_stream "$PREFIX_AI") &
AI_PID=$!

log "Starting backend: mix phx.server"
(
  cd "$BACK_DIR" &&
    stdbuf -oL -eL env \
      MULTI_SOURCE_ARBITER_ENABLED="$MULTI_SOURCE_ARBITER_ENABLED" \
      MULTI_SOURCE_REDIS_URL="$MULTI_SOURCE_REDIS_URL" \
      ENABLE_CANONICAL_LIVE_TRADING="$ENABLE_CANONICAL_LIVE_TRADING" \
      mix phx.server 2>&1 | prefix_stream "$PREFIX_BACK"
) &
BACK_PID=$!

log "Starting frontend: npm run dev"
(
  cd "$NEXT_DIR" &&
    stdbuf -oL -eL env \
      NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING="$NEXT_PUBLIC_ENABLE_CANONICAL_LIVE_TRADING" \
      npm run dev 2>&1 | prefix_stream "$PREFIX_NEXT"
) &
NEXT_PID=$!

start_scraper

log "Running. Press Ctrl+C to stop."
wait "$BACK_PID" "$NEXT_PID"
