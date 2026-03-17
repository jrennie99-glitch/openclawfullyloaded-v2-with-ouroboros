#!/usr/bin/env bash
set -euo pipefail

# Pull all Ollama models needed for the fully loaded setup
# Run this once on your Mac Mini M4 to download everything

echo "=========================================="
echo "  Ollama Model Setup"
echo "  Pulling all models for OpenClaw"
echo "=========================================="
echo ""

MODELS=(
  "qwen3.5:latest"       # Primary - best all-rounder 9B
  "qwen2.5-coder:7b"     # Code specialist
  "deepseek-r1:8b"       # Reasoning/math/logic
  "gemma3:12b"           # Creative writing (Google)
  "phi4:latest"          # Analysis (Microsoft)
  "llama3.1:8b"          # General purpose (Meta)
  "mistral:7b"           # Fast responses
)

for model in "${MODELS[@]}"; do
  echo ""
  echo ">>> Pulling $model ..."
  ollama pull "$model"
  echo "<<< $model ready"
done

echo ""
echo "=========================================="
echo "  All models downloaded!"
echo "=========================================="
echo ""
echo "  Total models: ${#MODELS[@]}"
echo "  Disk usage:"
ollama list 2>/dev/null || echo "  (run 'ollama list' to check)"
echo ""
echo "  You can now run: ./start-all.sh"
