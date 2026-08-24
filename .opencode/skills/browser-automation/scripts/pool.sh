#!/usr/bin/env bash
# Docker Playwright MCP Browser Pool Manager
# Usage: ./pool.sh {start|stop|status|restart} [count]
#
# Manages Docker containers running Playwright MCP servers.
# Each container = isolated Chromium browser accessible via HTTP/SSE.
#
# Ports: 8931 (pool-1), 8932 (pool-2), 8933 (pool-3)
# Image: mcr.microsoft.com/playwright/mcp:latest

set -euo pipefail

IMAGE="mcr.microsoft.com/playwright/mcp"
BASE_PORT=8931
PREFIX="pw-pool"
DEFAULT_COUNT=3

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

usage() {
  echo "Usage: $0 {start|stop|status|restart} [count]"
  echo ""
  echo "Commands:"
  echo "  start   - Start browser pool containers (default: $DEFAULT_COUNT)"
  echo "  stop    - Stop and remove all pool containers"
  echo "  status  - Show status of all pool containers"
  echo "  restart - Stop then start all pool containers"
  echo ""
  echo "Options:"
  echo "  count   - Number of containers (1-5, default: $DEFAULT_COUNT)"
  exit 1
}

start_pool() {
  local count=${1:-$DEFAULT_COUNT}
  echo -e "${GREEN}Starting $count Playwright MCP containers...${NC}"

  for i in $(seq 1 "$count"); do
    local name="${PREFIX}-${i}"
    local port=$((BASE_PORT + i - 1))

    # Skip if already running
    if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
      echo -e "${YELLOW}  ⚡ ${name} already running on port ${port}${NC}"
      continue
    fi

    docker rm -f "$name" 2>/dev/null || true

    echo -n "  Starting ${name} on port ${port}... "
    docker run -d -i --rm --init \
      --entrypoint node \
      --name "$name" \
      -p "${port}:${port}" \
      --add-host=host.docker.internal:host-gateway \
      "$IMAGE" \
      cli.js --headless --browser chromium --no-sandbox --port "$port" --host 0.0.0.0 \
      > /dev/null 2>&1

    echo -e "${GREEN}✓${NC}"
  done

  echo ""
  echo -e "${GREEN}Pool started. Waiting 5s for containers to initialize...${NC}"
  sleep 5

  # Verify each container responds
  for i in $(seq 1 "$count"); do
    local port=$((BASE_PORT + i - 1))
    local name="${PREFIX}-${i}"
    local status_code
    status_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/mcp" 2>/dev/null || echo "000")

    if [ "$status_code" = "000" ]; then
      echo -e "  ${RED}✗ ${name} (port ${port}) — not responding${NC}"
    else
      echo -e "  ${GREEN}✓ ${name} (port ${port}) — HTTP ${status_code}${NC}"
    fi
  done

  echo ""
  echo "MCP endpoints:"
  for i in $(seq 1 "$count"); do
    local port=$((BASE_PORT + i - 1))
    echo "  browser-pool-${i}: http://localhost:${port}/mcp"
  done
}

stop_pool() {
  echo -e "${YELLOW}Stopping all Playwright MCP pool containers...${NC}"
  local found=0

  for i in $(seq 1 5); do
    local name="${PREFIX}-${i}"
    if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
      echo -n "  Stopping ${name}... "
      docker rm -f "$name" > /dev/null 2>&1
      echo -e "${GREEN}✓${NC}"
      found=$((found + 1))
    fi
  done

  if [ "$found" -eq 0 ]; then
    echo -e "  ${YELLOW}No pool containers found.${NC}"
  else
    echo -e "${GREEN}Stopped $found container(s).${NC}"
  fi
}

status_pool() {
  echo "Playwright MCP Browser Pool Status"
  echo "==================================="
  echo ""

  local running=0
  local total=0

  for i in $(seq 1 5); do
    local name="${PREFIX}-${i}"
    local port=$((BASE_PORT + i - 1))

    if docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
      total=$((total + 1))
      local status_code
      status_code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}/mcp" 2>/dev/null || echo "000")

      if [ "$status_code" != "000" ]; then
        echo -e "  ${GREEN}● ${name}${NC} — port ${port} — HTTP ${status_code} — READY"
        running=$((running + 1))
      else
        echo -e "  ${YELLOW}◐ ${name}${NC} — port ${port} — NOT RESPONDING"
      fi
    fi
  done

  if [ "$total" -eq 0 ]; then
    echo -e "  ${RED}No pool containers running.${NC}"
    echo ""
    echo "  Start with: $0 start [count]"
  else
    echo ""
    echo "  $running/$total containers ready"
  fi
}

# Main
case "${1:-}" in
  start)
    start_pool "${2:-$DEFAULT_COUNT}"
    ;;
  stop)
    stop_pool
    ;;
  status)
    status_pool
    ;;
  restart)
    stop_pool
    echo ""
    start_pool "${2:-$DEFAULT_COUNT}"
    ;;
  *)
    usage
    ;;
esac
