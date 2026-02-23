#!/bin/bash
# Boot 3 test agents using the Deva API (api.deva.me/v1/chat/completions).
# Each agent has its own deva_ API key and gets LLM access through the platform.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Agent API keys (registered on Deva, claimed by truejaian)
SONNET_KEY="deva_VR8n6vweIbBTaJ87npMIp0SztbRdLfg11jj7VgM0dLU"
GPT_KEY="deva_3cOHu3qk9ZKYqXIE8-jhRF6a-EVkuXxyqhoHH7WCsG0"
GEMINI_KEY="deva_sxtCmQAlsFEsR2bCUCXQJ8z62hiSwPAyGqG_gsO7HkM"

echo "🔨 Building..."
cd "$REPO_DIR"
npx tsc

echo ""
echo "🌱 Seeding test agents..."
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-sonnet" "AutonomousTestSonnet" "0b59fc88-3d4a-40bf-be5c-5f526bfe9fb8" "$SONNET_KEY"
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-gpt" "AutonomousTestGPT" "8d0a92a5-b706-41d7-8a82-a61bf944e05f" "$GPT_KEY"
node "$REPO_DIR/scripts/seed-test-agent.cjs" "/tmp/agent-gemini" "AutonomousTestGemini" "c7ad5792-7b9a-45dd-a7f8-f8d78817532b" "$GEMINI_KEY"

echo ""
echo "🧬 Booting 3 test agents (2 turns each) via Deva API..."

# Unset BYOK env vars so agents route through Deva API (not direct OpenAI/OpenRouter)
unset DEVA_LLM_PROVIDER OPENAI_API_KEY OPENAI_BASE_URL OPENROUTER_API_KEY ANTHROPIC_API_KEY GOOGLE_API_KEY DEVA_LLM_MODEL

echo ""
echo "═══════════════════════════════════════"
echo "🟣 Agent 1: Claude Sonnet (AutonomousTestSonnet.agent)"
echo "═══════════════════════════════════════"
HOME="/tmp/agent-sonnet" \
timeout 90 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  Sonnet agent exited with code $?"

echo ""
echo "═══════════════════════════════════════"
echo "🟢 Agent 2: GPT-4o (AutonomousTestGPT.agent)"
echo "═══════════════════════════════════════"
HOME="/tmp/agent-gpt" \
timeout 90 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  GPT agent exited with code $?"

echo ""
echo "═══════════════════════════════════════"
echo "🔵 Agent 3: Gemini / GPT-4o-mini (AutonomousTestGemini.agent)"
echo "═══════════════════════════════════════"
HOME="/tmp/agent-gemini" \
timeout 90 node "$REPO_DIR/dist/index.js" run --max-turns 2 2>&1 || echo "⚠️  Gemini agent exited with code $?"

echo ""
echo "✅ All 3 agents completed their test runs."
