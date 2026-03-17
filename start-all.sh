#!/usr/bin/env bash
set -euo pipefail

# Unified launcher for OpenClaw + Paperclip + Ouroboros
# Starts everything with one command

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "  OpenClaw + Paperclip + Ouroboros"
echo "  Fully Loaded Launch Script"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down all services...${NC}"
  kill $OPENCLAW_PID 2>/dev/null || true
  kill $PAPERCLIP_PID 2>/dev/null || true
  wait 2>/dev/null
  echo -e "${GREEN}All services stopped.${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

# Check Ollama is running
if curl -s http://localhost:11434/api/tags >/dev/null 2>&1; then
  echo -e "${GREEN}[OK]${NC} Ollama is running on localhost:11434"
else
  echo -e "${YELLOW}[WARN]${NC} Ollama not detected on localhost:11434"
  echo "  Start it with: OLLAMA_ORIGINS='*' OLLAMA_HOST='0.0.0.0' ollama serve"
  echo ""
fi

# Start OpenClaw gateway in background
echo -e "${CYAN}[1/2]${NC} Starting OpenClaw gateway on port 18789..."
cd "$ROOT_DIR"
pnpm openclaw gateway run --bind lan --port 18789 --force > /tmp/openclaw-gateway.log 2>&1 &
OPENCLAW_PID=$!
echo "  PID: $OPENCLAW_PID | Log: /tmp/openclaw-gateway.log"

# Start Paperclip server in background
echo -e "${CYAN}[2/2]${NC} Starting Paperclip dashboard on port 3100..."
cd "$ROOT_DIR/paperclip"
pnpm dev > /tmp/paperclip-server.log 2>&1 &
PAPERCLIP_PID=$!
echo "  PID: $PAPERCLIP_PID | Log: /tmp/paperclip-server.log"

echo ""
echo -e "${GREEN}=========================================="
echo "  All services launched!"
echo "=========================================="
echo ""
echo -e "  OpenClaw Gateway:  ${CYAN}http://localhost:18789${NC}"
echo -e "  Paperclip Dashboard: ${CYAN}http://localhost:3100${NC}"
echo ""
echo -e "  Logs:"
echo -e "    tail -f /tmp/openclaw-gateway.log"
echo -e "    tail -f /tmp/paperclip-server.log"
echo ""
echo -e "  Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for either process to exit
wait -n $OPENCLAW_PID $PAPERCLIP_PID 2>/dev/null || true
cleanup
