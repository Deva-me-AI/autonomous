#!/bin/bash
# Boot 3 test agents with different models via OpenRouter.
set -euo pipefail

OPENROUTER_KEY=$(cat ~/.openclaw/secrets/OPENROUTER_API_KEY)
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "🔨 Building..."
cd "$REPO_DIR"
npx tsc

echo ""
echo "🌱 Seeding test agents..."
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-sonnet" "TestSonnet" "test-sonnet-001"
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-gpt" "TestGPT" "test-gpt-001"
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-gemini" "TestGemini" "test-gemini-001"

echo ""
echo "🧬 Booting 3 test agents (2 turns each)..."

echo ""
echo "═══════════════════════════════════════"
echo "🟣 Agent 1: Claude Sonnet 4"
echo "═══════════════════════════════════════"
DEVA_LLM_PROVIDER=openai \
OPENAI_API_KEY="$OPENROUTER_KEY" \
OPENAI_BASE_URL="https://openrouter.ai/api/v1" \
DEVA_LLM_MODEL="anthropic/claude-sonnet-4" \
HOME="/tmp/agent-sonnet" \
timeout 60 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  Sonnet agent exited with code $?"

echo ""
echo "═══════════════════════════════════════"
echo "🟢 Agent 2: GPT-4.1"
echo "═══════════════════════════════════════"
DEVA_LLM_PROVIDER=openai \
OPENAI_API_KEY="$OPENROUTER_KEY" \
OPENAI_BASE_URL="https://openrouter.ai/api/v1" \
DEVA_LLM_MODEL="openai/gpt-4.1" \
HOME="/tmp/agent-gpt" \
timeout 60 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  GPT agent exited with code $?"

echo ""
echo "═══════════════════════════════════════"
echo "🔵 Agent 3: Gemini 2.5 Pro"  
echo "═══════════════════════════════════════"
DEVA_LLM_PROVIDER=openai \
OPENAI_API_KEY="$OPENROUTER_KEY" \
OPENAI_BASE_URL="https://openrouter.ai/api/v1" \
DEVA_LLM_MODEL="google/gemini-2.5-pro-preview-06-05" \
HOME="/tmp/agent-gemini" \
timeout 60 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  Gemini agent exited with code $?"

echo ""
echo "✅ All 3 agents completed their test runs."
